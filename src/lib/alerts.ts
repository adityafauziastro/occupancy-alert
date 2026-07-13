// ============================================================
// Mesin alert + siklus hidup
// - OCCUPANCY  : per SLOC ketika okupansi >= ambang
// - MISMATCH   : per SLOC ketika ada kategori yang butuh suhu lebih dingin
// - DATA_CAPACITY : teragregasi per gudang+handling (menghindari banjir alert)
// Alert lama yang masih terpicu mempertahankan status & firstSeen;
// yang tidak lagi terpicu otomatis menjadi "resolved".
// ============================================================

import { getDb } from "./db";
import type { AlertRow, AppConfig, OccRow } from "./config";
import { HANDLING_LABEL, isDimOver } from "./config";
import { fmtCbm, fmtInt, fmtPct } from "./format";

export async function runAlertEngine(
  cfg: AppConfig,
  occRows: OccRow[]
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const triggered = new Map<string, Omit<AlertRow, "status" | "firstSeen" | "lastSeen">>();

  const dataCapAgg = new Map<string, { count: number; wh: string; handling: string }>();

  for (const r of occRows) {
    if (r.status !== "NORMAL") {
      const sev =
        r.status === "OVERLOAD"
          ? "overload"
          : r.status === "CRITICAL"
            ? "critical"
            : "warning";
      triggered.set(`OCC|${r.rack_name}`, {
        key: `OCC|${r.rack_name}`,
        type: "OCCUPANCY",
        severity: sev,
        rack_name: r.rack_name,
        wh: r.wh,
        message: `Okupansi ${fmtPct(r.pct)} dari kapasitas efektif (${r.status.toLowerCase()}).`,
        value: r.pct,
      });
    }
    if (r.mismatch) {
      triggered.set(`MIS|${r.rack_name}`, {
        key: `MIS|${r.rack_name}`,
        type: "MISMATCH",
        severity: "critical",
        rack_name: r.rack_name,
        wh: r.wh,
        message: `Kategori ${r.mismatch_cats.join(", ")} membutuhkan suhu lebih dingin dari rak ${HANDLING_LABEL[r.handling]}.`,
        value: r.mismatch_cats.length,
      });
    }
    if (
      cfg.dimAlert.enabled &&
      isDimOver(r.dim_cbm, r.capacity_cbm, cfg.dimAlert.tolerancePct)
    ) {
      const ratio = (r.dim_cbm / r.capacity_cbm) * 100;
      triggered.set(`DIM|${r.rack_name}`, {
        key: `DIM|${r.rack_name}`,
        type: "DIMENSION",
        severity: "critical",
        rack_name: r.rack_name,
        wh: r.wh,
        message: `Volume dimensi SKU ${fmtCbm(r.dim_cbm)} melebihi kapasitas lokasi ${fmtCbm(r.capacity_cbm)} (${fmtPct(ratio)}). Cek data dimensi produk / putaway.`,
        value: ratio,
      });
    }
    if (r.cap_source !== "master") {
      const k = `${r.wh}|${r.handling}`;
      const a = dataCapAgg.get(k) || { count: 0, wh: r.wh, handling: r.handling };
      a.count++;
      dataCapAgg.set(k, a);
    }
  }

  for (const [k, a] of dataCapAgg) {
    triggered.set(`CAP|${k}`, {
      key: `CAP|${k}`,
      type: "DATA_CAPACITY",
      severity: "info",
      rack_name: "",
      wh: a.wh,
      message: `${fmtInt(a.count)} SLOC ${a.handling} di ${a.wh} memakai kapasitas fallback (max_volume master kosong/placeholder). Kalibrasi di Master Data.`,
      value: a.count,
    });
  }

  const existing = await db.alerts.toArray();
  const existingMap = new Map(existing.map((a) => [a.key, a]));
  const out: AlertRow[] = [];

  for (const [key, t] of triggered) {
    const prev = existingMap.get(key);
    if (prev && prev.status !== "resolved") {
      out.push({
        ...prev,
        severity: t.severity,
        message: t.message,
        value: t.value,
        lastSeen: now,
        resolvedAt: undefined,
      });
    } else if (prev && prev.status === "resolved") {
      // muncul lagi setelah pernah selesai -> buka ulang
      out.push({ ...prev, ...t, status: "open", lastSeen: now, resolvedAt: undefined });
    } else {
      out.push({ ...t, status: "open", firstSeen: now, lastSeen: now });
    }
    existingMap.delete(key);
  }

  // yang tersisa tidak lagi terpicu -> resolved otomatis (riwayat dipertahankan)
  for (const prev of existingMap.values()) {
    if (prev.status !== "resolved") {
      out.push({ ...prev, status: "resolved", resolvedAt: now });
    } else {
      out.push(prev);
    }
  }

  await db.alerts.clear();
  for (let i = 0; i < out.length; i += 5000) {
    await db.alerts.bulkPut(out.slice(i, i + 5000));
  }
}

export async function setAlertStatus(
  key: string,
  status: "open" | "acknowledged" | "resolved"
): Promise<void> {
  const db = getDb();
  const a = await db.alerts.get(key);
  if (!a) return;
  await db.alerts.put({
    ...a,
    status,
    resolvedAt: status === "resolved" ? Date.now() : undefined,
  });
}
