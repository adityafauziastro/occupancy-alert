"use client";

import { useMemo, useState } from "react";
import { getDb } from "@/lib/db";
import { useApp, useDbQuery } from "@/lib/store";
import type { OccRow, StockRow } from "@/lib/config";
import { HANDLING_LABEL, isDimOver } from "@/lib/config";
import { fmtCbm, fmtInt, fmtPct, fmtQty } from "@/lib/format";
import {
  Btn,
  CapSourceBadge,
  Card,
  CardHeader,
  EmptyState,
  FillMeter,
  Modal,
  Select,
  StatusBadge,
  Td,
  Th,
} from "@/components/ui";

const PAGE = 50;
type SortKey = "pct" | "occupied_cbm" | "capacity_cbm" | "sku_count" | "rack_name";

export default function ExplorerPage() {
  const { cfg } = useApp();
  const [wh, setWh] = useState("ALL");
  const [zone, setZone] = useState("ALL");
  const [handling, setHandling] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("pct");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<OccRow | null>(null);

  const { data: allRows } = useDbQuery(async () => {
    const db = getDb();
    return db.occupancy.toArray();
  }, []);

  const whOptions = useMemo(() => {
    const s = new Set((allRows || []).map((r) => r.wh));
    return ["ALL", ...Array.from(s).sort()];
  }, [allRows]);
  const zoneOptions = useMemo(() => {
    const s = new Set(
      (allRows || []).filter((r) => wh === "ALL" || r.wh === wh).map((r) => r.zone)
    );
    return ["ALL", ...Array.from(s).sort()];
  }, [allRows, wh]);

  const filtered = useMemo(() => {
    let rows = allRows || [];
    if (wh !== "ALL") rows = rows.filter((r) => r.wh === wh);
    if (zone !== "ALL") rows = rows.filter((r) => r.zone === zone);
    if (handling !== "ALL") rows = rows.filter((r) => r.handling === handling);
    if (status !== "ALL") rows = rows.filter((r) => r.status === status);
    if (onlyMismatch) rows = rows.filter((r) => r.mismatch);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.rack_name.toLowerCase().includes(needle) ||
          r.zone.toLowerCase().includes(needle) ||
          r.mismatch_cats.some((c) => c.toLowerCase().includes(needle))
      );
    }
    rows = [...rows].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (typeof av === "string" && typeof bv === "string")
        return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    return rows;
  }, [allRows, wh, zone, handling, status, onlyMismatch, q, sort, dir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const setSortKey = (k: SortKey) => {
    if (sort === k) setDir(dir === 1 ? -1 : 1);
    else {
      setSort(k);
      setDir(-1);
    }
    setPage(0);
  };

  if (allRows === undefined) return null;
  if (!allRows.length)
    return (
      <EmptyState
        title="Belum ada data SLOC"
        desc="Impor data melalui halaman Sinkron Data terlebih dahulu."
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl font-extrabold text-fit-ink">Explorer SLOC</h1>
        <p className="text-xs text-slate-500">
          {fmtInt(filtered.length)} SLOC terisi sesuai filter · klik baris untuk detail SKU
        </p>
      </div>

      <Card>
        <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-6">
          <Select label="Gudang" value={wh} onChange={(v) => { setWh(v); setZone("ALL"); setPage(0); }}
            options={whOptions.map((w) => ({ value: w, label: w === "ALL" ? "Semua" : w }))} />
          <Select label="Zona" value={zone} onChange={(v) => { setZone(v); setPage(0); }}
            options={zoneOptions.map((z) => ({ value: z, label: z === "ALL" ? "Semua" : z }))} />
          <Select label="Handling" value={handling} onChange={(v) => { setHandling(v); setPage(0); }}
            options={[{ value: "ALL", label: "Semua" }, ...Object.entries(HANDLING_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
          <Select label="Status" value={status} onChange={(v) => { setStatus(v); setPage(0); }}
            options={["ALL", "NORMAL", "WARNING", "CRITICAL", "OVERLOAD"].map((s) => ({ value: s, label: s === "ALL" ? "Semua" : s }))} />
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Cari
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="SLOC / zona…"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-normal outline-none focus:border-fit-blue focus:ring-2 focus:ring-fit-blue/20"
            />
          </label>
          <label className="flex items-end gap-2 pb-1.5 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={onlyMismatch} onChange={(e) => { setOnlyMismatch(e.target.checked); setPage(0); }}
              className="h-4 w-4 accent-fit-blue" />
            Hanya mismatch
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Daftar SLOC Terisi" subtitle="SLOC kosong tidak ditampilkan (dilaporkan sebagai KPI di Dashboard)" />
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[560px] md:min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <Th onClick={() => setSortKey("rack_name")} active={sort === "rack_name"} dir={dir}>SLOC</Th>
                <Th>Gudang · Zona</Th>
                <Th>Handling</Th>
                <Th onClick={() => setSortKey("pct")} active={sort === "pct"} dir={dir}>Okupansi</Th>
                <Th className="hidden md:table-cell" onClick={() => setSortKey("occupied_cbm")} active={sort === "occupied_cbm"} dir={dir}>Terpakai</Th>
                <Th className="hidden md:table-cell" onClick={() => setSortKey("capacity_cbm")} active={sort === "capacity_cbm"} dir={dir}>Kapasitas</Th>
                <Th className="hidden sm:table-cell" onClick={() => setSortKey("sku_count")} active={sort === "sku_count"} dir={dir}>SKU</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.rack_name}
                  onClick={() => setDetail(r)}
                  className="cursor-pointer border-b border-slate-50 transition-colors hover:bg-fit-blue/5">
                  <Td>
                    <div className="font-mono-fit text-[13px] font-bold text-fit-ink">{r.rack_name}</div>
                    {r.mismatch && (
                      <span className="mr-1 text-[10px] font-bold text-fit-over">⚠ MISMATCH</span>
                    )}
                    {cfg.dimAlert.enabled &&
                      isDimOver(r.dim_cbm, r.capacity_cbm, cfg.dimAlert.tolerancePct) && (
                        <span className="mr-1 text-[10px] font-bold text-rose-600">⚠ DIM</span>
                      )}
                    {!r.in_master && (
                      <span className="ml-1 text-[10px] font-bold text-amber-600">∅ non-master</span>
                    )}
                  </Td>
                  <Td>
                    <span className="font-semibold">{r.wh}</span>
                    <span className="text-slate-400"> · {r.zone}</span>
                  </Td>
                  <Td>{HANDLING_LABEL[r.handling]}</Td>
                  <Td className="min-w-[160px]"><FillMeter pct={r.pct} status={r.status} showLabel /></Td>
                  <Td className="hidden font-mono-fit md:table-cell">{fmtCbm(r.occupied_cbm)}</Td>
                  <Td className="hidden md:table-cell">
                    <span className="font-mono-fit">{fmtCbm(r.capacity_cbm)}</span>{" "}
                    <CapSourceBadge source={r.cap_source} suspicious={r.cap_suspicious} />
                  </Td>
                  <Td className="hidden font-mono-fit sm:table-cell">{fmtInt(r.sku_count)}</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-3 text-xs text-slate-500">
          <span>Halaman {page + 1} dari {pages}</span>
          <div className="flex gap-1.5">
            <Btn variant="ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← Sebelumnya</Btn>
            <Btn variant="ghost" disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}>Berikutnya →</Btn>
          </div>
        </div>
      </Card>

      {detail && <DetailModal row={detail} onClose={() => setDetail(null)} countStatuses={cfg.countStatuses} />}
    </div>
  );
}

function DetailModal({ row, onClose, countStatuses }: { row: OccRow; onClose: () => void; countStatuses: string[] }) {
  const { cfg } = useApp();
  const dimOver = cfg.dimAlert.enabled && isDimOver(row.dim_cbm, row.capacity_cbm, cfg.dimAlert.tolerancePct);
  const { data: skus } = useDbQuery(async () => {
    const db = getDb();
    return db.stock.where("rack_name").equals(row.rack_name).toArray();
  }, [row.rack_name]);

  const counted = (s: StockRow) => countStatuses.includes(s.status);

  return (
    <Modal open onClose={onClose} title={row.rack_name} wide>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MiniStat label="Okupansi" value={fmtPct(row.pct)} />
          <MiniStat label="Terpakai" value={fmtCbm(row.occupied_cbm)} />
          <MiniStat label="Kapasitas" value={fmtCbm(row.capacity_cbm)} />
          <MiniStat label="Vol. Dimensi" value={row.dim_cbm > 0 ? fmtCbm(row.dim_cbm) : "—"} warn={dimOver} />
          <MiniStat label="Handling" value={HANDLING_LABEL[row.handling]} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={row.status} />
          <CapSourceBadge source={row.cap_source} suspicious={row.cap_suspicious} />
          {!row.in_master && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
              Tidak ada di Rack Master
            </span>
          )}
        </div>
        {row.mismatch && (
          <p className="rounded-lg bg-fit-over/10 px-3 py-2 text-xs font-semibold text-fit-over">
            ⚠ Mismatch handling: kategori {row.mismatch_cats.join(", ")} membutuhkan suhu lebih dingin dari tipe rak ini.
          </p>
        )}
        {dimOver && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            ⚠ Volume dimensi SKU (Σ p×l×t × qty = {fmtCbm(row.dim_cbm)}) melebihi kapasitas lokasi{" "}
            {fmtCbm(row.capacity_cbm)} — cek data dimensi produk atau putaway ganda.
          </p>
        )}
        {row.cap_suspicious && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            Kapasitas master bernilai placeholder — persentase memakai kapasitas fallback. Kalibrasi di halaman Master Data.
          </p>
        )}
        <div>
          <h4 className="mb-2 font-display text-sm font-bold text-fit-ink">
            Isi SLOC ({fmtInt(skus?.length || 0)} baris stok)
          </h4>
          <div className="thin-scroll max-h-72 overflow-auto rounded-lg border border-slate-100">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-2.5 py-2 font-bold text-slate-500">SKU</th>
                  <th className="px-2.5 py-2 font-bold text-slate-500">Produk</th>
                  <th className="px-2.5 py-2 font-bold text-slate-500">Kategori</th>
                  <th className="px-2.5 py-2 font-bold text-slate-500">Status</th>
                  <th className="px-2.5 py-2 text-right font-bold text-slate-500">Qty</th>
                  <th className="px-2.5 py-2 text-right font-bold text-slate-500">Vol (m³)</th>
                </tr>
              </thead>
              <tbody>
                {(skus || [])
                  .sort((a, b) => b.occupied_cbm - a.occupied_cbm)
                  .map((s, i) => (
                    <tr key={i} className={`border-t border-slate-50 ${counted(s) ? "" : "opacity-45"}`}>
                      <td className="px-2.5 py-1.5 font-mono-fit">{s.sku_number}</td>
                      <td className="max-w-[220px] truncate px-2.5 py-1.5" title={s.product_name}>{s.product_name}</td>
                      <td className="px-2.5 py-1.5">{s.l1_category_name}</td>
                      <td className="px-2.5 py-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          s.status === "Available" ? "bg-emerald-50 text-emerald-700"
                          : s.status === "Bad" ? "bg-rose-50 text-rose-700"
                          : "bg-slate-100 text-slate-600"}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono-fit">{fmtQty(s.stock_qty)}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono-fit">{fmtCbm(s.occupied_cbm).replace(" m³", "")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">
            Baris redup = status tidak dihitung dalam okupansi (lihat pengaturan Status Terhitung di Master Data).
          </p>
        </div>
      </div>
    </Modal>
  );
}

function MiniStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${warn ? "bg-rose-50" : "bg-slate-50"}`}>
      <div className={`text-[10px] font-bold uppercase tracking-wide ${warn ? "text-rose-500" : "text-slate-400"}`}>{label}</div>
      <div className={`font-mono-fit text-sm font-bold ${warn ? "text-rose-700" : "text-fit-ink"}`}>{value}</div>
    </div>
  );
}
