"use client";

import { useMemo, useState } from "react";
import { getDb, getMeta } from "@/lib/db";
import { takeSnapshot, type Kpis } from "@/lib/compute";
import { useApp, useDbQuery } from "@/lib/store";
import { fmtCbm, fmtInt, fmtPct } from "@/lib/format";
import { LineChart, StackedAreaChart } from "@/components/charts";
import { Btn, Card, CardHeader, EmptyState, Select, Td, Th } from "@/components/ui";

export default function TrendsPage() {
  const { bump } = useApp();
  const [wh, setWh] = useState("ALL");
  const [busy, setBusy] = useState(false);

  const { data: snaps } = useDbQuery(async () => {
    const db = getDb();
    return db.snapshots.orderBy("date").toArray();
  }, []);

  const whOptions = useMemo(() => {
    const s = new Set((snaps || []).map((r) => r.wh));
    const arr = Array.from(s).filter((w) => w !== "ALL").sort();
    return ["ALL", ...arr];
  }, [snaps]);

  const series = useMemo(() => {
    const rows = (snaps || []).filter((r) => r.wh === wh).sort((a, b) => a.date.localeCompare(b.date));
    return {
      labels: rows.map((r) => r.date.slice(5)),
      avgPct: rows.map((r) => Number(r.avg_pct.toFixed(2))),
      critical: rows.map((r) => r.critical + r.overload),
      critOnly: rows.map((r) => r.critical),
      overload: rows.map((r) => r.overload),
      warning: rows.map((r) => r.warning),
      occ: rows.map((r) => Number(r.occupied_cbm.toFixed(2))),
      cap: rows.map((r) => Number(r.capacity_cbm.toFixed(2))),
      rows,
    };
  }, [snaps, wh]);

  const manualSnapshot = async () => {
    setBusy(true);
    try {
      const kpis = await getMeta<Kpis>("kpis");
      if (kpis) {
        const db = getDb();
        const occRows = await db.occupancy.toArray();
        await takeSnapshot(kpis, occRows);
        bump();
      }
    } finally {
      setBusy(false);
    }
  };

  if (snaps === undefined) return null;
  if (!snaps.length)
    return (
      <EmptyState
        title="Belum ada snapshot tren"
        desc="Snapshot harian diambil otomatis setiap sinkron (dapat diatur di Master Data), atau ambil manual sekarang."
        action={<Btn onClick={manualSnapshot} disabled={busy}>{busy ? "Menyimpan…" : "Ambil Snapshot Sekarang"}</Btn>}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-extrabold text-fit-ink">Tren Okupansi</h1>
          <p className="text-xs text-slate-500">
            Satu snapshot per tanggal per gudang (di-upsert saat sinkron ulang di hari yang sama)
          </p>
        </div>
        <div className="flex items-end gap-2">
          <Select label="Gudang" value={wh} onChange={setWh}
            options={whOptions.map((w) => ({ value: w, label: w === "ALL" ? "Semua (agregat)" : w }))} />
          <Btn onClick={manualSnapshot} disabled={busy}>{busy ? "Menyimpan…" : "Ambil Snapshot"}</Btn>
        </div>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Rata-rata Okupansi (%)" subtitle={wh === "ALL" ? "Seluruh gudang" : wh} />
          <div className="p-3">
            <LineChart
              labels={series.labels}
              series={[{ label: "Rata-rata okupansi", data: series.avgPct, color: "#3C83F6" }]}
              suffix="%"
              height={230}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Komposisi SLOC Bermasalah" subtitle="Area bertumpuk — makin tipis makin sehat" />
          <div className="p-3">
            <StackedAreaChart
              labels={series.labels}
              series={[
                { label: "Warning", data: series.warning, color: "#B45309" },
                { label: "Critical", data: series.critOnly, color: "#DC2626" },
                { label: "Overload", data: series.overload, color: "#7C2D8F" },
              ]}
              height={230}
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Volume Terpakai vs Kapasitas (m³)" subtitle="Ruang tersisa = jarak antar garis" />
        <div className="p-3">
          <LineChart
            labels={series.labels}
            series={[
              { label: "Kapasitas efektif", data: series.cap, color: "#45112A" },
              { label: "Volume terpakai", data: series.occ, color: "#3C83F6" },
            ]}
            suffix=" m³"
            height={220}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Riwayat Snapshot" subtitle={wh === "ALL" ? "Agregat seluruh gudang" : `Gudang ${wh}`} />
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <Th>Tanggal</Th>
                <Th>SLOC Terisi</Th>
                <Th>Terpakai</Th>
                <Th>Rata-rata</Th>
                <Th>Warning</Th>
                <Th>Critical</Th>
                <Th>Overload</Th>
                <Th>Mismatch</Th>
              </tr>
            </thead>
            <tbody>
              {[...series.rows].reverse().map((r) => (
                <tr key={r.key} className="border-b border-slate-50">
                  <Td className="font-mono-fit font-bold">{r.date}</Td>
                  <Td className="font-mono-fit">{fmtInt(r.filled)}</Td>
                  <Td className="font-mono-fit">{fmtCbm(r.occupied_cbm)}</Td>
                  <Td className="font-mono-fit">{fmtPct(r.avg_pct)}</Td>
                  <Td className="font-mono-fit text-fit-warn">{fmtInt(r.warning)}</Td>
                  <Td className="font-mono-fit text-fit-crit">{fmtInt(r.critical)}</Td>
                  <Td className="font-mono-fit text-fit-over">{fmtInt(r.overload)}</Td>
                  <Td className="font-mono-fit">{fmtInt(r.mismatch)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
