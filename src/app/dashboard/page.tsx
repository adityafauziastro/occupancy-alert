"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getDb, getMeta } from "@/lib/db";
import { useApp, useDbQuery } from "@/lib/store";
import type { Kpis } from "@/lib/compute";
import type { OccRow, SnapshotRow } from "@/lib/config";
import { HANDLING_LABEL, STATUS_META, isDimOver } from "@/lib/config";
import { fmtCbm, fmtInt, fmtPct } from "@/lib/format";
import { DoughnutChart, ParetoChart, SparkLine, StackedBarChart } from "@/components/charts";
import { Btn, Card, CardHeader, EmptyState, FillMeter, Modal, StatusBadge } from "@/components/ui";

export default function DashboardPage() {
  const { cfg } = useApp();
  const [wh, setWh] = useState("ALL");
  const [heatSel, setHeatSel] = useState<{ zone: string; wh: string } | null>(null);

  const { data: kpis } = useDbQuery(() => getMeta<Kpis>("kpis"), []);
  const { data: catByWh } = useDbQuery(
    () => getMeta<Record<string, [string, number][]>>("catAggByWh"),
    []
  );
  const { data: occRows } = useDbQuery(async () => getDb().occupancy.toArray(), []);
  const { data: snaps } = useDbQuery(async () => getDb().snapshots.orderBy("date").toArray(), []);
  const { data: openAlerts } = useDbQuery(
    async () => getDb().alerts.where("status").anyOf("open", "acknowledged").count(),
    []
  );

  const rows = useMemo(
    () => (occRows || []).filter((r) => wh === "ALL" || r.wh === wh),
    [occRows, wh]
  );

  // ---- Deret snapshot (sparkline) untuk gudang terpilih ----
  const spark = useMemo(() => {
    const s = (snaps || []).filter((r) => r.wh === wh);
    return {
      avg: s.map((r) => r.avg_pct),
      problem: s.map((r) => r.critical + r.overload),
      occ: s.map((r) => r.occupied_cbm),
    };
  }, [snaps, wh]);

  // ---- Agregat lokal (mengikuti filter gudang) ----
  const agg = useMemo(() => {
    const sc = { NORMAL: 0, WARNING: 0, CRITICAL: 0, OVERLOAD: 0 } as Record<string, number>;
    let occ = 0, cap = 0, pctSum = 0, mismatch = 0, dimOver = 0;
    const byHandling = new Map<string, number>();
    for (const r of rows) {
      sc[r.status]++;
      occ += r.occupied_cbm;
      cap += r.capacity_cbm;
      pctSum += r.pct;
      if (r.mismatch) mismatch++;
      if (cfg.dimAlert.enabled && isDimOver(r.dim_cbm, r.capacity_cbm, cfg.dimAlert.tolerancePct)) dimOver++;
      byHandling.set(r.handling, (byHandling.get(r.handling) || 0) + r.occupied_cbm);
    }
    return {
      sc, occ, cap, mismatch, dimOver,
      filled: rows.length,
      avg: rows.length ? pctSum / rows.length : 0,
      handling: Array.from(byHandling.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [rows, cfg]);

  // ---- Heatmap zona × gudang (diperkaya: volume, kritis, agregat baris/kolom) ----
  const heat = useMemo(() => {
    const src = occRows || [];
    const whs = Array.from(new Set(src.map((r) => r.wh))).sort();
    const zMap = new Map<string, Map<string, HeatCellData>>();
    const colTot = new Map<string, { s: number; n: number }>();
    for (const r of src) {
      if (!r.zone) continue;
      let z = zMap.get(r.zone);
      if (!z) { z = new Map(); zMap.set(r.zone, z); }
      const c = z.get(r.wh) || { pctSum: 0, n: 0, occ: 0, crit: 0 };
      c.pctSum += r.pct; c.n++; c.occ += r.occupied_cbm;
      if (r.status === "CRITICAL" || r.status === "OVERLOAD") c.crit++;
      z.set(r.wh, c);
      const ct = colTot.get(r.wh) || { s: 0, n: 0 };
      ct.s += r.pct; ct.n++; colTot.set(r.wh, ct);
    }
    const zones = Array.from(zMap.entries())
      .map(([zone, m]) => {
        const vals = Array.from(m.values());
        const tot = vals.reduce((a, c) => a + c.n, 0);
        const avg = vals.reduce((a, c) => a + c.pctSum, 0) / Math.max(1, tot);
        const worst = Math.max(...vals.map((c) => c.pctSum / c.n));
        const crit = vals.reduce((a, c) => a + c.crit, 0);
        return { zone, m, tot, avg, worst, crit };
      })
      .filter((z) => z.tot >= 2)
      .sort((a, b) => b.worst - a.worst)
      .slice(0, 12);
    const colAvg = new Map<string, number>();
    for (const [w, c] of colTot) colAvg.set(w, c.s / Math.max(1, c.n));
    return { whs, zones, colAvg };
  }, [occRows]);

  const topCrit = useMemo(
    () =>
      rows
        .filter((r) => r.status !== "NORMAL")
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 6),
    [rows]
  );

  const cats = (catByWh?.[wh] || []).slice(0, 10);

  if (kpis === undefined || occRows === undefined) return null;
  if (!kpis || kpis.filledSlocs === 0) {
    return (
      <EmptyState
        title="Belum ada data okupansi"
        desc="Impor ekspor Superset atau muat data contoh untuk melihat dashboard bekerja."
        action={<Link href="/sync"><Btn>Buka Sinkron Data</Btn></Link>}
      />
    );
  }

  const whChips = ["ALL", ...kpis.whList.map((w) => w.code)];
  const topWh = kpis.whList.reduce((a, b) => (b.avgPct > a.avgPct ? b : a), kpis.whList[0]);

  return (
    <div className="flex flex-col gap-3.5">
      {/* ===== Header + filter gudang ===== */}
      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-2">
          <h1 className="font-display text-lg font-extrabold text-fit-ink sm:text-xl">Dashboard Okupansi</h1>
          <span className="text-[10px] text-slate-400">
            W≥{cfg.thresholds.warning} · C≥{cfg.thresholds.critical} · O≥{cfg.thresholds.overload}%
          </span>
        </div>
        <div className="thin-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {whChips.map((c) => (
            <button
              key={c}
              onClick={() => setWh(c)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-all ${
                wh === c
                  ? "bg-fit-plum text-white shadow-sm"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 active:scale-95"
              }`}
            >
              {c === "ALL" ? "Semua" : c}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Hero KPI ===== */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="relative col-span-2 overflow-hidden rounded-2xl bg-gradient-to-br from-fit-plum via-[#5B1A3C] to-fit-blue-dark p-4 text-white shadow-lg lg:col-span-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Rata-rata Okupansi</p>
          <p className="font-display text-3xl font-extrabold">{fmtPct(agg.avg)}</p>
          <p className="text-[11px] text-white/70">{fmtInt(agg.filled)} SLOC terisi</p>
          <div className="mt-1.5 opacity-90"><SparkLine data={spark.avg} color="#FFFFFF" /></div>
        </div>
        <MiniKpi
          label="Volume Terpakai"
          value={fmtCbm(agg.occ)}
          sub={`dari ${fmtCbm(agg.cap)} kapasitas`}
          spark={spark.occ}
          color="#3C83F6"
        />
        <MiniKpi
          label="SLOC Bermasalah"
          value={fmtInt(agg.sc.CRITICAL + agg.sc.OVERLOAD)}
          sub={`${fmtInt(agg.sc.OVERLOAD)} overload · ${fmtInt(agg.sc.WARNING)} warning`}
          spark={spark.problem}
          color={agg.sc.CRITICAL + agg.sc.OVERLOAD ? "#DC2626" : "#0E9F6E"}
        />
        <MiniKpi
          label="Alert Aktif"
          value={fmtInt(openAlerts || 0)}
          sub={`${fmtInt(agg.dimOver)} dimensi · ${fmtInt(agg.mismatch)} mismatch`}
          color={openAlerts ? "#B45309" : "#0E9F6E"}
          href="/alerts"
        />
      </div>

      {/* ===== Insight ringkas ===== */}
      <div className="flex flex-wrap gap-1.5">
        <Insight dot="#3C83F6" text={`${topWh.code} terpadat — rata-rata ${fmtPct(topWh.avgPct)}`} />
        {agg.sc.OVERLOAD > 0 && <Insight dot="#7C2D8F" text={`${fmtInt(agg.sc.OVERLOAD)} SLOC overload`} />}
        {agg.dimOver > 0 && <Insight dot="#DC2626" text={`${fmtInt(agg.dimOver)} lokasi lampaui dimensi fisik`} />}
        {agg.mismatch > 0 && <Insight dot="#B45309" text={`${fmtInt(agg.mismatch)} mismatch suhu`} />}
        {kpis.suspiciousCaps > 0 && wh === "ALL" && (
          <Insight dot="#64748B" text={`${fmtInt(kpis.suspiciousCaps)} kapasitas placeholder`} />
        )}
      </div>

      {/* ===== Status per gudang + distribusi ===== */}
      <div className="grid gap-3.5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Status SLOC per Gudang" subtitle="Komposisi Normal → Overload" />
          <div className="p-3">
            <StackedBarChart
              labels={kpis.whList.filter((w) => wh === "ALL" || w.code === wh).map((w) => w.code)}
              stacks={(["NORMAL", "WARNING", "CRITICAL", "OVERLOAD"] as const).map((st) => ({
                label: st[0] + st.slice(1).toLowerCase(),
                color: STATUS_META[st].color,
                values: kpis.whList
                  .filter((w) => wh === "ALL" || w.code === wh)
                  .map((w) =>
                    (occRows || []).filter((r) => r.wh === w.code && r.status === st).length
                  ),
              }))}
              horizontal
              height={Math.max(180, (wh === "ALL" ? kpis.whList.length : 1) * 34 + 70)}
            />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Distribusi Status" subtitle={wh === "ALL" ? "Semua gudang" : wh} />
          <div className="p-3">
            <DoughnutChart
              labels={["Normal", "Warning", "Critical", "Overload"]}
              values={[agg.sc.NORMAL, agg.sc.WARNING, agg.sc.CRITICAL, agg.sc.OVERLOAD]}
              colors={[STATUS_META.NORMAL.color, STATUS_META.WARNING.color, STATUS_META.CRITICAL.color, STATUS_META.OVERLOAD.color]}
              height={210}
            />
          </div>
        </Card>
      </div>

      {/* ===== Heatmap zona × gudang ===== */}
      <Card>
        <CardHeader
          title="Peta Panas Zona × Gudang"
          subtitle="Tiap sel = rata-rata okupansi zona itu. Arahkan kursor untuk detail, klik untuk lihat SLOC-nya."
          right={
            <div className="hidden items-center gap-2 sm:flex">
              {[
                ["#E7F0FE", "#1D4ED8", "<75"],
                ["#FEF3C7", "#92400E", "75–90"],
                ["#FEE2E2", "#B91C1C", "90–100"],
                ["#F3E8FF", "#7C2D8F", "≥100"],
              ].map(([bg, fg, lbl]) => (
                <span key={lbl} className="flex items-center gap-1 text-[10px] font-bold" style={{ color: fg }}>
                  <span className="h-3 w-3 rounded" style={{ background: bg }} />
                  {lbl}%
                </span>
              ))}
            </div>
          }
        />
        <div className="thin-scroll overflow-x-auto p-3">
          <table className="w-full min-w-[560px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white text-left text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                  Zona ↓ / Gudang →
                </th>
                {heat.whs.map((w) => (
                  <th key={w} className="px-1 text-center">
                    <div className="font-mono-fit text-[11px] font-extrabold text-slate-600">{w}</div>
                    <div className="text-[9px] font-semibold text-slate-400">
                      Ø {fmtInt(heat.colAvg.get(w) || 0)}%
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heat.zones.map((z) => (
                <tr key={z.zone} className="group">
                  <td className="sticky left-0 z-10 bg-white pr-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono-fit text-[11px] font-bold text-slate-700">{z.zone}</span>
                      <span className="text-[9px] text-slate-400">Ø{fmtInt(z.avg)}%</span>
                      {z.crit > 0 && (
                        <span className="rounded-full bg-rose-100 px-1 text-[8px] font-extrabold text-rose-600">
                          {fmtInt(z.crit)}!
                        </span>
                      )}
                    </div>
                  </td>
                  {heat.whs.map((w) => {
                    const c = z.m.get(w);
                    return (
                      <HeatCell
                        key={w}
                        cell={c}
                        zone={z.zone}
                        wh={w}
                        thr={cfg.thresholds}
                        onClick={() => c && setHeatSel({ zone: z.zone, wh: w })}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!heat.zones.length && <p className="py-4 text-center text-xs text-slate-400">Belum cukup data zona.</p>}
          <p className="mt-2 px-1 text-[10px] text-slate-400">
            Ø = rata-rata okupansi · angka merah = jumlah SLOC critical/overload · hanya zona dengan ≥2 SLOC, 12 terpadat.
          </p>
        </div>
      </Card>

      {heatSel && (
        <HeatDrillModal
          zone={heatSel.zone}
          wh={heatSel.wh}
          rows={(occRows || []).filter((r) => r.zone === heatSel.zone && r.wh === heatSel.wh)}
          thr={cfg.thresholds}
          onClose={() => setHeatSel(null)}
        />
      )}

      {/* ===== Pareto kategori + handling + top kritis ===== */}
      <div className="grid gap-3.5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Pareto Kategori" subtitle="Volume terbesar + kumulatif % — fokus ke yang kiri" />
          <div className="p-3">
            <ParetoChart
              labels={cats.map(([c]) => (c.length > 16 ? c.slice(0, 15) + "…" : c))}
              values={cats.map(([, v]) => +v.toFixed(2))}
              height={270}
            />
          </div>
        </Card>

        <div className="flex flex-col gap-3.5 lg:col-span-2">
          <Card>
            <CardHeader title="Komposisi Handling" subtitle="Pangsa volume terpakai" />
            <div className="flex flex-col gap-2 p-3">
              <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100">
                {agg.handling.map(([h, v]) => (
                  <div
                    key={h}
                    style={{ width: `${(v / Math.max(1e-9, agg.occ)) * 100}%`, background: HCOLOR[h] || "#94A3B8" }}
                    title={`${HANDLING_LABEL[h as keyof typeof HANDLING_LABEL] || h}: ${fmtCbm(v)}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {agg.handling.map(([h, v]) => (
                  <span key={h} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <span className="h-2 w-2 rounded-full" style={{ background: HCOLOR[h] || "#94A3B8" }} />
                    {HANDLING_LABEL[h as keyof typeof HANDLING_LABEL] || h}
                    <b className="font-mono-fit">{fmtPct((v / Math.max(1e-9, agg.occ)) * 100)}</b>
                  </span>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="SLOC Paling Kritis" subtitle="Okupansi tertinggi di luar Normal" />
            <div className="flex flex-col gap-2 p-3">
              {topCrit.map((r) => (
                <Link key={r.rack_name} href="/explorer" className="group flex items-center gap-2">
                  <span className="w-40 truncate font-mono-fit text-[11px] font-bold text-slate-700 group-hover:text-fit-blue">
                    {r.rack_name}
                  </span>
                  <FillMeter pct={r.pct} status={r.status} showLabel />
                  <StatusBadge status={r.status} />
                </Link>
              ))}
              {!topCrit.length && (
                <p className="py-3 text-center text-xs font-semibold text-emerald-600">Semua SLOC dalam kondisi Normal ✓</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------- komponen lokal ---------- */

const HCOLOR: Record<string, string> = {
  AMBIENT: "#3C83F6",
  DRY: "#14B8A6",
  CHILLER: "#0EA5E9",
  COOL: "#8B5CF6",
  FROZEN: "#45112A",
  UNKNOWN: "#94A3B8",
};

function MiniKpi({ label, value, sub, spark, color, href }: {
  label: string; value: string; sub: string; spark?: number[]; color: string; href?: string;
}) {
  const body = (
    <div className="flex h-full flex-col justify-between rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-100">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="font-display text-2xl font-extrabold" style={{ color }}>{value}</p>
        <p className="text-[11px] text-slate-500">{sub}</p>
      </div>
      {spark && spark.length > 1 && <div className="mt-1"><SparkLine data={spark} color={color} /></div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Insight({ dot, text }: { dot: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      {text}
    </span>
  );
}

type HeatCellData = { pctSum: number; n: number; occ: number; crit: number };
type Thr = { warning: number; critical: number; overload: number };

function heatColor(v: number, thr: Thr): [string, string] {
  if (v >= thr.overload) return ["#F3E8FF", "#7C2D8F"];
  if (v >= thr.critical) return ["#FEE2E2", "#B91C1C"];
  if (v >= thr.warning) return ["#FEF3C7", "#92400E"];
  return ["#E7F0FE", "#1D4ED8"];
}

function HeatCell({
  cell, zone, wh, thr, onClick,
}: {
  cell?: HeatCellData;
  zone: string;
  wh: string;
  thr: Thr;
  onClick: () => void;
}) {
  if (!cell)
    return (
      <td className="rounded-md bg-slate-50/70 py-2 text-center text-[10px] text-slate-300" title={`${wh} · ${zone}: tidak ada SLOC terisi`}>
        —
      </td>
    );
  const v = cell.pctSum / cell.n;
  const [bg, fg] = heatColor(v, thr);
  const tip = `${wh} · ${zone}\n${Math.round(v)}% okupansi rata-rata\n${cell.n} SLOC · ${cell.crit} kritis · ${fmtCbm(cell.occ)} terpakai\n(klik untuk rincian)`;
  return (
    <td className="p-0">
      <button
        onClick={onClick}
        title={tip}
        className="relative flex h-11 w-full flex-col items-center justify-center rounded-md font-mono-fit transition-transform hover:z-10 hover:scale-[1.08] hover:ring-2 hover:ring-fit-ink/20 active:scale-95"
        style={{ background: bg, color: fg }}
      >
        <span className="text-[12px] font-extrabold leading-none">{Math.round(v)}</span>
        <span className="text-[8px] font-semibold leading-tight opacity-70">{fmtInt(cell.n)} SLOC</span>
        {cell.crit > 0 && (
          <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-rose-600" />
        )}
      </button>
    </td>
  );
}

function HeatDrillModal({
  zone, wh, rows, thr, onClose,
}: {
  zone: string;
  wh: string;
  rows: OccRow[];
  thr: Thr;
  onClose: () => void;
}) {
  const sorted = [...rows].sort((a, b) => b.pct - a.pct);
  const avg = rows.length ? rows.reduce((s, r) => s + r.pct, 0) / rows.length : 0;
  const occ = rows.reduce((s, r) => s + r.occupied_cbm, 0);
  const crit = rows.filter((r) => r.status === "CRITICAL" || r.status === "OVERLOAD").length;
  const [bg, fg] = heatColor(avg, thr);

  return (
    <Modal open onClose={onClose} title={`${wh} · Zona ${zone}`} wide>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg px-3 py-2" style={{ background: bg }}>
            <div className="text-[10px] font-bold uppercase" style={{ color: fg }}>Rata-rata</div>
            <div className="font-mono-fit text-lg font-extrabold" style={{ color: fg }}>{fmtPct(avg)}</div>
          </div>
          <MiniBox label="SLOC terisi" value={fmtInt(rows.length)} />
          <MiniBox label="Kritis" value={fmtInt(crit)} danger={crit > 0} />
          <MiniBox label="Volume" value={fmtCbm(occ)} />
        </div>

        <div className="thin-scroll max-h-80 overflow-auto rounded-lg border border-slate-100">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="px-2.5 py-2 font-bold text-slate-500">SLOC</th>
                <th className="px-2.5 py-2 font-bold text-slate-500">Okupansi</th>
                <th className="px-2.5 py-2 text-right font-bold text-slate-500">Terpakai</th>
                <th className="px-2.5 py-2 text-center font-bold text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.rack_name} className="border-t border-slate-50">
                  <td className="px-2.5 py-1.5 font-mono-fit font-bold text-slate-700">{r.rack_name}</td>
                  <td className="min-w-[130px] px-2.5 py-1.5"><FillMeter pct={r.pct} status={r.status} showLabel /></td>
                  <td className="px-2.5 py-1.5 text-right font-mono-fit">{fmtCbm(r.occupied_cbm)}</td>
                  <td className="px-2.5 py-1.5 text-center"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Link
          href={`/explorer?wh=${encodeURIComponent(wh)}&zone=${encodeURIComponent(zone)}`}
          className="self-start rounded-lg bg-fit-blue px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-transform active:scale-95"
        >
          Buka di Explorer →
        </Link>
      </div>
    </Modal>
  );
}

function MiniBox({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${danger ? "bg-rose-50" : "bg-slate-50"}`}>
      <div className={`text-[10px] font-bold uppercase ${danger ? "text-rose-500" : "text-slate-400"}`}>{label}</div>
      <div className={`font-mono-fit text-lg font-extrabold ${danger ? "text-rose-700" : "text-fit-ink"}`}>{value}</div>
    </div>
  );
}
