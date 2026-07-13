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
import { Btn, Card, CardHeader, EmptyState, FillMeter, StatusBadge } from "@/components/ui";

export default function DashboardPage() {
  const { cfg } = useApp();
  const [wh, setWh] = useState("ALL");

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

  // ---- Heatmap zona × gudang ----
  const heat = useMemo(() => {
    const src = occRows || [];
    const whs = Array.from(new Set(src.map((r) => r.wh))).sort();
    const zMap = new Map<string, Map<string, { s: number; n: number }>>();
    for (const r of src) {
      let z = zMap.get(r.zone);
      if (!z) { z = new Map(); zMap.set(r.zone, z); }
      const c = z.get(r.wh) || { s: 0, n: 0 };
      c.s += r.pct; c.n++;
      z.set(r.wh, c);
    }
    const zones = Array.from(zMap.entries())
      .map(([zone, m]) => {
        const tot = Array.from(m.values()).reduce((a, c) => a + c.n, 0);
        const worst = Math.max(...Array.from(m.values()).map((c) => c.s / c.n));
        return { zone, m, tot, worst };
      })
      .filter((z) => z.tot >= 2 && z.zone)
      .sort((a, b) => b.worst - a.worst)
      .slice(0, 12);
    return { whs, zones };
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
        <CardHeader title="Peta Panas Zona × Gudang" subtitle="Rata-rata okupansi — merah = padat, ungu = overload" />
        <div className="thin-scroll overflow-x-auto p-3">
          <table className="w-full min-w-[520px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-16 text-left text-[10px] font-bold uppercase text-slate-400">Zona</th>
                {heat.whs.map((w) => (
                  <th key={w} className="text-center font-mono-fit text-[10px] font-bold text-slate-500">{w}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heat.zones.map((z) => (
                <tr key={z.zone}>
                  <td className="font-mono-fit text-[11px] font-bold text-slate-600">{z.zone}</td>
                  {heat.whs.map((w) => {
                    const c = z.m.get(w);
                    const v = c ? c.s / c.n : null;
                    return <HeatCell key={w} v={v} n={c?.n || 0} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!heat.zones.length && <p className="py-4 text-center text-xs text-slate-400">Belum cukup data zona.</p>}
        </div>
      </Card>

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

function HeatCell({ v, n }: { v: number | null; n: number }) {
  if (v === null)
    return <td className="rounded-md bg-slate-50 py-1.5 text-center text-[10px] text-slate-300">—</td>;
  const [bg, fg] =
    v >= 100 ? ["#F3E8FF", "#7C2D8F"]
    : v >= 90 ? ["#FEE2E2", "#B91C1C"]
    : v >= 75 ? ["#FEF3C7", "#92400E"]
    : ["#E7F0FE", "#1D4ED8"];
  return (
    <td
      className="rounded-md py-1.5 text-center font-mono-fit text-[11px] font-bold"
      style={{ background: bg, color: fg }}
      title={`${n} SLOC`}
    >
      {Math.round(v)}
    </td>
  );
}
