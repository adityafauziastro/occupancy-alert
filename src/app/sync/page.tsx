"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearAllData, getDb, getMeta, saveConfig, setMeta } from "@/lib/db";
import {
  connectFiles,
  disconnectHandle,
  fsaSupported,
  getConnectedHandles,
  getFileRegistry,
  ingestFiles,
  ingestText,
  pollConnectedFiles,
  removeFileData,
  type FileRegistryEntry,
} from "@/lib/ingest";
import {
  makeSupersetClient,
  syncSupersetAll,
  type SupersetStatusMap,
} from "@/lib/superset";
import { recomputeAll } from "@/lib/compute";
import { SAMPLE_RACK_TSV, SAMPLE_STOCK_TSV } from "@/lib/sample-data";
import { useApp, useDbQuery } from "@/lib/store";
import type { AppConfig, SupersetSource } from "@/lib/config";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { Btn, Card, CardHeader, Td, Th } from "@/components/ui";

type Progress = { name: string; state: "proses" | "selesai" | "gagal"; info: string };

export default function SyncPage() {
  const { cfg, setCfg, bump, setComputing, computing } = useApp();

  return (
    <div className="flex flex-col gap-3.5 pb-16">
      <div>
        <h1 className="font-display text-lg font-extrabold text-fit-ink sm:text-xl">Sinkron Data</h1>
        <p className="text-[11px] text-slate-500">
          Tiga jalur menuju IndexedDB — tanpa API resmi, tanpa database, tanpa Google Sheets.
        </p>
      </div>

      <SupersetPanel cfg={cfg} setCfg={setCfg} bump={bump} setComputing={setComputing} computing={computing} />
      <FilePanel cfg={cfg} bump={bump} setComputing={setComputing} computing={computing} />
      <RegistryPanel cfg={cfg} bump={bump} setComputing={setComputing} />
    </div>
  );
}

/* ============================================================
   1 · SUPERSET LIVE SYNC — metode cookie (tanpa API key / DB)
   ============================================================ */
function SupersetPanel({
  cfg, setCfg, bump, setComputing, computing,
}: {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
  bump: () => void;
  setComputing: (b: boolean, msg?: string) => void;
  computing: boolean;
}) {
  const sp = cfg.superset;
  const [draft, setDraft] = useState(sp);
  const [showCookie, setShowCookie] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newSrc, setNewSrc] = useState({ name: "", chartId: "", pageSize: "20000" });
  const { data: status } = useDbQuery(
    () => getMeta<SupersetStatusMap>("supersetStatus"),
    []
  );

  useEffect(() => setDraft(sp), [sp]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(sp);

  const persist = async (next = draft) => {
    const merged = { ...cfg, superset: next };
    await saveConfig(merged);
    setCfg(merged);
  };

  const test = async () => {
    setTestMsg(null);
    try {
      await persist();
      await makeSupersetClient(draft).testConnection();
      setTestMsg({ ok: true, text: "Terhubung & login valid — token CSRF diterima." });
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  const pullNow = async () => {
    setComputing(true, "Menarik data Superset…");
    try {
      await persist();
      const st = await syncSupersetAll({ ...cfg, superset: draft });
      const ok = Object.values(st).filter((x) => x.ok).length;
      setComputing(false, ok ? `Superset tersinkron (${ok} sumber)` : "");
      bump();
    } catch (e) {
      setComputing(false, "");
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  const addSource = () => {
    const id = Number(newSrc.chartId);
    if (!newSrc.name.trim() || !Number.isInteger(id) || id <= 0) return;
    const src: SupersetSource = {
      id: `s${Date.now()}`,
      name: newSrc.name.trim(),
      chartId: id,
      pageSize: Math.max(1000, Number(newSrc.pageSize) || 20000),
    };
    setDraft({ ...draft, sources: [...draft.sources, src] });
    setNewSrc({ name: "", chartId: "", pageSize: "20000" });
  };

  return (
    <Card className="ring-1 ring-fit-blue/20">
      <CardHeader
        title="1 · Superset Live Sync"
        subtitle="Tarik otomatis langsung dari Superset dengan cookie sesi login — menembus batas baris via paginasi"
        right={
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            sp.autoPull && sp.cookie ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-500"}`}>
            {sp.autoPull && sp.cookie ? `LIVE · ${sp.pollMin}m` : "NONAKTIF"}
          </span>
        }
      />
      <div className="flex flex-col gap-3 p-3.5">
        {/* Koneksi */}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
            URL Superset
            <input
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              placeholder="https://superset.perusahaan.co.id"
              className="fit-focus rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono-fit text-sm font-normal outline-none focus:border-fit-blue"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
            Cookie Sesi (dari DevTools)
            <div className="flex gap-1.5">
              <input
                type={showCookie ? "text" : "password"}
                value={draft.cookie}
                onChange={(e) => setDraft({ ...draft, cookie: e.target.value })}
                placeholder="session=eyJ…"
                className="fit-focus min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono-fit text-sm font-normal outline-none focus:border-fit-blue"
              />
              <button
                onClick={() => setShowCookie(!showCookie)}
                className="shrink-0 rounded-lg bg-slate-100 px-2.5 text-xs font-bold text-slate-500"
              >{showCookie ? "Sembunyi" : "Lihat"}</button>
            </div>
          </label>
        </div>

        <details className="rounded-lg bg-fit-blue-soft px-3 py-2 text-[11px] leading-relaxed text-slate-600">
          <summary className="cursor-pointer font-bold text-fit-blue-dark">Cara ambil cookie (30 detik)</summary>
          <ol className="mt-1.5 list-decimal pl-4">
            <li>Buka Superset di tab lain (dalam keadaan login) → tekan <b>F12</b> → tab <b>Network</b>.</li>
            <li>Muat ulang halaman, klik request mana pun ke Superset → bagian <b>Request Headers</b>.</li>
            <li>Salin seluruh nilai header <b>Cookie</b> (mis. <span className="font-mono-fit">session=eyJ…</span>) lalu tempel di atas.</li>
          </ol>
          <p className="mt-1">Cookie hanya tersimpan di browser ini dan hanya dikirim ke Superset melalui proxy localhost. Jika sesi kedaluwarsa, cukup salin ulang.</p>
        </details>

        {/* Sumber chart */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Sumber (chart Superset)</p>
          {draft.sources.map((s) => {
            const st = status?.[s.id];
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-mono-fit font-bold text-slate-700">
                  {s.name} <span className="font-normal text-slate-400">· chart #{s.chartId} · {fmtInt(s.pageSize)}/hal</span>
                </span>
                {st && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    st.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
                    title={st.error || ""}>
                    {st.ok
                      ? `✓ ${fmtInt(st.rows)} baris · ${st.pages} hal · ${(st.ms / 1000).toFixed(1)}s`
                      : `✗ ${st.error?.slice(0, 60)}`}
                  </span>
                )}
                <button
                  onClick={() => setDraft({ ...draft, sources: draft.sources.filter((x) => x.id !== s.id) })}
                  className="shrink-0 text-xs font-bold text-rose-500 hover:text-rose-700"
                >✕</button>
              </div>
            );
          })}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-32 flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-600">
              Nama sumber
              <input value={newSrc.name} onChange={(e) => setNewSrc({ ...newSrc, name: e.target.value })}
                placeholder="stock_on_hand"
                className="fit-focus rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-normal outline-none focus:border-fit-blue" />
            </label>
            <label className="flex w-28 flex-col gap-1 text-[11px] font-semibold text-slate-600">
              Chart ID
              <input value={newSrc.chartId} onChange={(e) => setNewSrc({ ...newSrc, chartId: e.target.value })}
                placeholder="1234" inputMode="numeric"
                className="fit-focus rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono-fit text-sm font-normal outline-none focus:border-fit-blue" />
            </label>
            <label className="flex w-32 flex-col gap-1 text-[11px] font-semibold text-slate-600">
              Baris/halaman
              <input value={newSrc.pageSize} onChange={(e) => setNewSrc({ ...newSrc, pageSize: e.target.value })}
                inputMode="numeric"
                className="fit-focus rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono-fit text-sm font-normal outline-none focus:border-fit-blue" />
            </label>
            <Btn variant="ghost" onClick={addSource}>+ Tambah</Btn>
          </div>
          <p className="text-[10px] text-slate-400">
            Chart ID ada di URL Superset: <span className="font-mono-fit">/explore/?slice_id=1234</span>. Data ditarik penuh
            lewat paginasi offset (force refresh), lalu menimpa data sumber yang sama.
          </p>
        </div>

        {/* Otomatisasi + aksi */}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-fit-blue"
              checked={draft.autoPull}
              onChange={(e) => setDraft({ ...draft, autoPull: e.target.checked })} />
            Tarik otomatis
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            setiap
            <input type="number" min={1} max={720} value={draft.pollMin}
              onChange={(e) => setDraft({ ...draft, pollMin: Math.max(1, Number(e.target.value) || 5) })}
              className="fit-focus w-16 rounded-lg border border-slate-200 px-2 py-1 font-mono-fit text-sm outline-none focus:border-fit-blue" />
            menit
          </label>
          <div className="ml-auto flex gap-2">
            <Btn variant="ghost" onClick={test}>Tes Koneksi</Btn>
            {dirty && <Btn variant="ghost" onClick={() => persist()}>Simpan</Btn>}
            <Btn onClick={pullNow} disabled={computing || !draft.sources.length || !draft.cookie || !draft.baseUrl}>
              ⟳ Tarik Sekarang
            </Btn>
          </div>
        </div>
        {testMsg && (
          <p className={`rounded-lg px-3 py-2 text-xs font-semibold ${
            testMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {testMsg.text}
          </p>
        )}
      </div>
    </Card>
  );
}

/* ============================================================
   2 · FILE — impor manual & auto-sync file terhubung (fallback offline)
   ============================================================ */
function FilePanel({
  cfg, bump, setComputing, computing,
}: {
  cfg: AppConfig;
  bump: () => void;
  setComputing: (b: boolean, msg?: string) => void;
  computing: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [fsa, setFsa] = useState(false);
  const [handles, setHandles] = useState<{ name: string }[]>([]);
  const [pollMsg, setPollMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshHandles = useCallback(async () => {
    const hs = await getConnectedHandles();
    setHandles(Object.keys(hs).map((name) => ({ name })));
  }, []);

  useEffect(() => {
    setFsa(fsaSupported());
    refreshHandles();
  }, [refreshHandles]);

  const runIngest = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setComputing(true);
      setProgress(files.map((f) => ({ name: f.name, state: "proses", info: "membaca…" })));
      try {
        await ingestFiles(
          files, cfg, false,
          (r) =>
            setProgress((p) =>
              p.map((x) =>
                x.name === r.fileName
                  ? r.kind === "unknown"
                    ? { ...x, state: "gagal", info: "header tidak dikenali" }
                    : { ...x, state: "selesai", info: `${r.kind === "stock" ? "Stock on Hand" : "Rack Master"} · ${fmtInt(r.rows)} baris` }
                  : x
              )
            ),
          (name, done, total) =>
            setProgress((p) =>
              p.map((x) =>
                x.name === name && x.state === "proses"
                  ? { ...x, info: `menulis ${fmtInt(done)}/${fmtInt(total)}…` }
                  : x
              )
            )
        );
        bump();
      } finally {
        setComputing(false);
      }
    },
    [cfg, bump, setComputing]
  );

  const loadSample = async () => {
    setComputing(true);
    try {
      await ingestText(SAMPLE_STOCK_TSV, "contoh_stock_on_hand.tsv",
        { size: SAMPLE_STOCK_TSV.length, lastModified: Date.now(), connected: false });
      await ingestText(SAMPLE_RACK_TSV, "contoh_rack_master.tsv",
        { size: SAMPLE_RACK_TSV.length, lastModified: Date.now(), connected: false });
      await recomputeAll(cfg);
      await setMeta("lastSync", Date.now());
      bump();
    } finally {
      setComputing(false);
    }
  };

  const doPoll = async (force = false) => {
    setComputing(true);
    setPollMsg("");
    try {
      const names = await pollConnectedFiles(cfg, { force, interactive: true });
      setPollMsg(names.length ? `Tersinkron: ${names.join(", ")}` : "Tidak ada perubahan file.");
      if (names.length) bump();
    } finally {
      setComputing(false);
    }
  };

  const doConnect = async () => {
    try {
      const names = await connectFiles();
      if (names.length) {
        await refreshHandles();
        await doPoll(true);
      }
    } catch { /* picker dibatalkan */ }
  };

  return (
    <Card>
      <CardHeader
        title="2 · File Ekspor (fallback offline)"
        subtitle="Seret CSV/TSV — chunk aman digabung — atau hubungkan file agar terserap otomatis saat ditimpa"
      />
      <div className="flex flex-col gap-3 p-3.5">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); runIngest(Array.from(e.dataTransfer.files)); }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-5 py-7 text-center transition-colors ${
            drag ? "border-fit-blue bg-fit-blue-soft" : "border-slate-200 bg-slate-50/60 hover:border-fit-blue/50"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-fit-blue" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 16V4m0 0L7 9m5-5l5 5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" strokeLinecap="round" />
          </svg>
          <p className="text-sm font-bold text-fit-ink">Seret file ekspor ke sini</p>
          <p className="text-[11px] text-slate-500">atau klik untuk memilih · beberapa file sekaligus</p>
          <input ref={inputRef} type="file" multiple accept=".csv,.tsv,.txt" className="hidden"
            onChange={(e) => { runIngest(Array.from(e.target.files || [])); e.target.value = ""; }} />
        </div>

        {!!progress.length && (
          <div className="flex flex-col gap-1.5">
            {progress.map((p) => (
              <div key={p.name} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                <span className={`h-2 w-2 shrink-0 rounded-full ${
                  p.state === "selesai" ? "bg-emerald-500" : p.state === "gagal" ? "bg-rose-500" : "animate-pulse bg-fit-blue"}`} />
                <span className="min-w-0 flex-1 truncate font-mono-fit font-bold text-slate-700">{p.name}</span>
                <span className={p.state === "gagal" ? "text-rose-600" : "text-slate-500"}>{p.info}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {fsa ? (
            <>
              <Btn variant="ghost" onClick={doConnect}>+ Hubungkan File</Btn>
              <Btn variant="ghost" onClick={() => doPoll(true)} disabled={!handles.length || computing}>Sinkron File</Btn>
            </>
          ) : (
            <span className="text-[11px] text-amber-700">Auto-sync file butuh Chrome/Edge desktop.</span>
          )}
          <Btn variant="ghost" onClick={loadSample} disabled={computing}>Muat Data Contoh</Btn>
          {pollMsg && <span className="text-[11px] font-semibold text-fit-blue">{pollMsg}</span>}
        </div>
        {!!handles.length && (
          <div className="flex flex-wrap gap-1.5">
            {handles.map((h) => (
              <span key={h.name} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {h.name}
                <button onClick={async () => { await disconnectHandle(h.name); refreshHandles(); }}
                  className="text-rose-500">✕</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ============================================================
   3 · Registri & penyimpanan
   ============================================================ */
function RegistryPanel({
  cfg, bump, setComputing,
}: {
  cfg: AppConfig;
  bump: () => void;
  setComputing: (b: boolean, msg?: string) => void;
}) {
  const { data: registry } = useDbQuery(() => getFileRegistry(), []);
  const { data: stats } = useDbQuery(async () => {
    const db = getDb();
    const [stock, racks, occ, alerts, snaps, lastSync] = await Promise.all([
      db.stock.count(), db.racks.count(), db.occupancy.count(),
      db.alerts.count(), db.snapshots.count(), getMeta<number>("lastSync"),
    ]);
    return { stock, racks, occ, alerts, snaps, lastSync };
  }, []);

  const deleteFile = async (entry: FileRegistryEntry) => {
    if (!confirm(`Hapus seluruh data dari sumber "${entry.name}"?`)) return;
    setComputing(true);
    try {
      await removeFileData(entry.name);
      await recomputeAll(cfg);
      bump();
    } finally { setComputing(false); }
  };

  const wipeAll = async () => {
    if (!confirm("Hapus SEMUA data (stok, rack master, alert, snapshot)? Konfigurasi tetap tersimpan.")) return;
    setComputing(true);
    try {
      await clearAllData();
      bump();
    } finally { setComputing(false); }
  };

  return (
    <Card>
      <CardHeader title="3 · Registri Sumber Data" subtitle="Sumber bernama sama saling menimpa — aman untuk chunk & refresh berkala" />
      <div className="thin-scroll overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <Th>Sumber</Th><Th>Jenis</Th><Th>Baris</Th><Th className="hidden sm:table-cell">Terakhir</Th><Th> </Th>
            </tr>
          </thead>
          <tbody>
            {(registry || []).map((r) => (
              <tr key={r.name} className="border-b border-slate-50">
                <Td className="font-mono-fit text-xs font-bold">
                  {r.name.startsWith("superset:") && (
                    <span className="mr-1.5 rounded bg-fit-blue-soft px-1.5 py-0.5 text-[9px] font-extrabold text-fit-blue-dark">LIVE</span>
                  )}
                  {r.name.replace(/^superset:/, "")}
                </Td>
                <Td>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    r.kind === "stock" ? "bg-fit-blue/10 text-fit-blue-dark" : "bg-fit-plum/10 text-fit-plum"}`}>
                    {r.kind === "stock" ? "Stock on Hand" : "Rack Master"}
                  </span>
                </Td>
                <Td className="font-mono-fit">{fmtInt(r.rows)}</Td>
                <Td className="hidden text-xs text-slate-500 sm:table-cell">{fmtDateTime(r.ingestedAt)}</Td>
                <Td><Btn variant="danger" onClick={() => deleteFile(r)}>Hapus</Btn></Td>
              </tr>
            ))}
            {!registry?.length && (
              <tr><Td className="py-5 text-center text-xs text-slate-400" colSpan={5}>Belum ada sumber data.</Td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3">
        <span className="text-[11px] text-slate-400">
          {stats ? `${fmtInt(stats.stock)} stok · ${fmtInt(stats.racks)} SLOC master · ${fmtInt(stats.occ)} terisi · ${fmtInt(stats.alerts)} alert · ${fmtInt(stats.snaps)} snapshot` : "…"}
          {" · sinkron terakhir "}{stats?.lastSync ? fmtDateTime(stats.lastSync) : "—"}
        </span>
        <Btn variant="danger" onClick={wipeAll}>Hapus Semua Data</Btn>
      </div>
    </Card>
  );
}
