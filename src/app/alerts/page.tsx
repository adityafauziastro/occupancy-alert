"use client";

import { useMemo, useState } from "react";
import { getDb } from "@/lib/db";
import { setAlertStatus } from "@/lib/alerts";
import { useApp, useDbQuery } from "@/lib/store";
import type { AlertRow, AppConfig } from "@/lib/config";
import { fmtDateTime, fmtInt } from "@/lib/format";
import Link from "next/link";
import { buildAlertMailto, recipientsFor } from "@/lib/email";
import { getMeta } from "@/lib/db";
import type { Kpis } from "@/lib/compute";
import { Btn, Card, CardHeader, EmptyState, Select, SevBadge } from "@/components/ui";

const TYPE_LABEL: Record<string, string> = {
  OCCUPANCY: "Okupansi",
  DIMENSION: "Dimensi Fisik",
  MISMATCH: "Mismatch Handling",
  DATA_CAPACITY: "Kualitas Data",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Terbuka",
  acknowledged: "Ditindak",
  resolved: "Selesai",
};

export default function AlertsPage() {
  const { cfg, bump } = useApp();
  const [sev, setSev] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [status, setStatus] = useState("ACTIVE");
  const [wh, setWh] = useState("ALL");

  const { data: all } = useDbQuery(async () => {
    const db = getDb();
    return db.alerts.toArray();
  }, []);
  const { data: kpis } = useDbQuery(() => getMeta<Kpis>("kpis"), []);

  const whOptions = useMemo(() => {
    const s = new Set((all || []).map((a) => a.wh));
    return ["ALL", ...Array.from(s).sort()];
  }, [all]);

  const filtered = useMemo(() => {
    let rows = all || [];
    if (status === "ACTIVE") rows = rows.filter((a) => a.status !== "resolved");
    else if (status !== "ALL") rows = rows.filter((a) => a.status === status);
    if (sev !== "ALL") rows = rows.filter((a) => a.severity === sev);
    if (type !== "ALL") rows = rows.filter((a) => a.type === type);
    if (wh !== "ALL") rows = rows.filter((a) => a.wh === wh);
    const sevRank = { overload: 0, critical: 1, warning: 2, info: 3 } as Record<string, number>;
    const stRank = { open: 0, acknowledged: 1, resolved: 2 } as Record<string, number>;
    return [...rows].sort(
      (a, b) =>
        stRank[a.status] - stRank[b.status] ||
        sevRank[a.severity] - sevRank[b.severity] ||
        b.lastSeen - a.lastSeen
    );
  }, [all, sev, type, status, wh]);

  const counts = useMemo(() => {
    const active = (all || []).filter((a) => a.status !== "resolved");
    return {
      open: active.filter((a) => a.status === "open").length,
      ack: active.filter((a) => a.status === "acknowledged").length,
      overload: active.filter((a) => a.severity === "overload").length,
      critical: active.filter((a) => a.severity === "critical").length,
    };
  }, [all]);

  const act = async (key: string, s: AlertRow["status"]) => {
    await setAlertStatus(key, s);
    bump();
  };

  if (all === undefined) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-extrabold text-fit-ink">Pusat Alert</h1>
          <p className="text-xs text-slate-500">
            {fmtInt(counts.open)} terbuka · {fmtInt(counts.ack)} ditindak · {fmtInt(counts.overload)} overload · {fmtInt(counts.critical)} critical
          </p>
        </div>
      </div>

      <Card>
        <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Status" value={status} onChange={setStatus}
            options={[
              { value: "ACTIVE", label: "Aktif (terbuka + ditindak)" },
              { value: "open", label: "Terbuka" },
              { value: "acknowledged", label: "Ditindak" },
              { value: "resolved", label: "Selesai" },
              { value: "ALL", label: "Semua" },
            ]} />
          <Select label="Tingkat" value={sev} onChange={setSev}
            options={[
              { value: "ALL", label: "Semua" },
              { value: "overload", label: "Overload" },
              { value: "critical", label: "Critical" },
              { value: "warning", label: "Warning" },
              { value: "info", label: "Info" },
            ]} />
          <Select label="Jenis" value={type} onChange={setType}
            options={[{ value: "ALL", label: "Semua" }, ...Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
          <Select label="Gudang" value={wh} onChange={setWh}
            options={whOptions.map((w) => ({ value: w, label: w === "ALL" ? "Semua" : w }))} />
        </div>
      </Card>

      <EmailPanel all={all || []} cfg={cfg} kpis={kpis || null} />

      {!filtered.length ? (
        <EmptyState
          title="Tidak ada alert pada filter ini"
          desc="Semua SLOC dalam kondisi terkendali, atau data belum diimpor."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((a) => (
            <Card key={a.key} className={a.status === "resolved" ? "opacity-60" : ""}>
              <div className="flex flex-col gap-2.5 p-3.5 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <SevBadge sev={a.severity} />
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                      {TYPE_LABEL[a.type]}
                    </span>
                    <span className="font-mono-fit text-xs font-bold text-slate-600">{a.wh}</span>
                    <span className={`text-[10px] font-bold ${
                      a.status === "open" ? "text-rose-600" : a.status === "acknowledged" ? "text-amber-600" : "text-emerald-600"}`}>
                      ● {STATUS_LABEL[a.status]}
                    </span>
                  </div>
                  <p className="font-mono-fit text-sm font-bold text-fit-ink">
                    {a.rack_name || TYPE_LABEL[a.type]}
                  </p>
                  <p className="text-xs text-slate-500">{a.message}</p>
                  <p className="text-[10px] text-slate-400">
                    Pertama terdeteksi {fmtDateTime(a.firstSeen)} · terakhir {fmtDateTime(a.lastSeen)}
                  </p>
                </div>
                {a.status !== "resolved" && (
                  <div className="flex shrink-0 gap-1.5">
                    {a.status === "open" && (
                      <Btn variant="ghost" onClick={() => act(a.key, "acknowledged")}>Tandai Ditindak</Btn>
                    )}
                    <Btn variant="primary" onClick={() => act(a.key, "resolved")}>Selesai</Btn>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-400">
        Alert diselesaikan otomatis saat kondisi tidak lagi terpicu pada sinkron berikutnya, dan dibuka kembali jika terulang.
      </p>
    </div>
  );
}


/* ---------- Panel Email per Gudang (mailto — tanpa server) ---------- */

function EmailPanel({ all, cfg, kpis }: { all: AlertRow[]; cfg: AppConfig; kpis: Kpis | null }) {
  const byWh = new Map<string, AlertRow[]>();
  for (const a of all) {
    if (a.status === "resolved") continue;
    const list = byWh.get(a.wh) || [];
    list.push(a);
    byWh.set(a.wh, list);
  }
  const whs = Array.from(byWh.keys()).sort();
  if (!whs.length) return null;
  const nameOf = (code: string) => kpis?.whList.find((w) => w.code === code)?.name || code;

  return (
    <Card>
      <CardHeader
        title="Kirim Email Alert"
        subtitle="Ke Master Role gudang (SPV / Manager / Senior Manager / Head) — terbuka lewat aplikasi email Anda"
      />
      <div className="flex flex-col gap-2 p-3">
        {whs.map((w) => {
          const alerts = byWh.get(w)!;
          const rcp = recipientsFor(cfg, w, alerts);
          const { href } = buildAlertMailto(w, nameOf(w), alerts, rcp);
          return (
            <div key={w} className="flex flex-col gap-1.5 rounded-xl bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-mono-fit text-sm font-bold text-fit-ink">
                  {w} <span className="font-body text-[11px] font-normal text-slate-400">· {fmtInt(alerts.length)} alert aktif</span>
                </span>
                <div className="flex flex-wrap gap-1">
                  {rcp.length ? (
                    rcp.map((r) => (
                      <span key={r.id} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                        {r.role}: {r.name || r.email}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      Belum ada penerima yang cocok —{" "}
                      <Link href="/master" className="font-semibold text-fit-blue underline">atur di Master Data</Link>
                    </span>
                  )}
                </div>
              </div>
              {rcp.length > 0 && (
                <a
                  href={href}
                  className="shrink-0 rounded-lg bg-fit-blue px-3.5 py-1.5 text-center text-xs font-bold text-white shadow-sm transition-transform active:scale-95"
                >
                  ✉ Kirim Email
                </a>
              )}
            </div>
          );
        })}
        <p className="text-[10px] leading-relaxed text-slate-400">
          Penerima ditentukan oleh aturan gudang + tingkat minimum di Master Data. Aplikasi ini statis tanpa server,
          jadi email disusun otomatis lalu dikirim dari aplikasi email Anda (mailto).
        </p>
      </div>
    </Card>
  );
}
