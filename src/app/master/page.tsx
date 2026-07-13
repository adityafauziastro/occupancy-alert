"use client";

import { useEffect, useState } from "react";
import { saveConfig } from "@/lib/db";
import { recomputeAll } from "@/lib/compute";
import { useApp } from "@/lib/store";
import type { AppConfig, Handling, MasterRole, Recipient, Sev } from "@/lib/config";
import { DEFAULT_CONFIG, HANDLING_LABEL, ROLE_OPTIONS, WAREHOUSE_MAP } from "@/lib/config";
import { Btn, Card, CardHeader, Select } from "@/components/ui";

const HANDLINGS: Handling[] = ["AMBIENT", "DRY", "CHILLER", "COOL", "FROZEN"];

export default function MasterPage() {
  const { cfg, setCfg, bump, setComputing } = useApp();
  const [draft, setDraft] = useState<AppConfig>(cfg);
  const [saved, setSaved] = useState(false);
  const [newZone, setNewZone] = useState({ zone: "", cap: "" });
  const [newCat, setNewCat] = useState({ cat: "", handling: "FROZEN" as Handling });
  const [newRcp, setNewRcp] = useState({
    wh: "ALL",
    role: "SPV" as MasterRole,
    name: "",
    email: "",
    minSev: "critical" as Sev,
  });

  useEffect(() => setDraft(cfg), [cfg]);

  const set = <K extends keyof AppConfig>(k: K, v: AppConfig[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setSaved(false);
  };

  const save = async () => {
    const clean: AppConfig = {
      ...draft,
      thresholds: {
        warning: Math.max(1, Math.min(200, draft.thresholds.warning)),
        critical: Math.max(1, Math.min(300, draft.thresholds.critical)),
        overload: Math.max(1, Math.min(500, draft.thresholds.overload)),
      },
      pollSec: Math.max(10, Math.min(3600, draft.pollSec)),
    };
    setComputing(true);
    try {
      await saveConfig(clean);
      setCfg(clean);
      await recomputeAll(clean);
      bump();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setComputing(false);
    }
  };

  const resetDefault = () => {
    setDraft({ ...DEFAULT_CONFIG });
    setSaved(false);
  };

  return (
    <div className="flex flex-col gap-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-extrabold text-fit-ink">Master Data & Konfigurasi</h1>
          <p className="text-xs text-slate-500">
            Perubahan memicu hitung ulang okupansi, alert, dan snapshot secara menyeluruh
          </p>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={resetDefault}>Reset ke Bawaan</Btn>
          <Btn onClick={save}>{saved ? "✓ Tersimpan" : "Simpan & Hitung Ulang"}</Btn>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Ambang Status Okupansi" subtitle="Persentase okupansi per SLOC" />
          <div className="grid grid-cols-3 gap-3 p-4">
            <NumField label="Warning ≥ (%)" value={draft.thresholds.warning}
              onChange={(v) => set("thresholds", { ...draft.thresholds, warning: v })} />
            <NumField label="Critical ≥ (%)" value={draft.thresholds.critical}
              onChange={(v) => set("thresholds", { ...draft.thresholds, critical: v })} />
            <NumField label="Overload ≥ (%)" value={draft.thresholds.overload}
              onChange={(v) => set("thresholds", { ...draft.thresholds, overload: v })} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Model Kapasitas" subtitle="Sumber kapasitas efektif per SLOC" />
          <div className="flex flex-col gap-3 p-4">
            <Select label="Mode" value={draft.capacityModel}
              onChange={(v) => set("capacityModel", v as AppConfig["capacityModel"])}
              options={[
                { value: "hybrid", label: "Hybrid — master, fallback jika placeholder (disarankan)" },
                { value: "master", label: "Master — selalu pakai max_volume rack master" },
                { value: "configured", label: "Configured — selalu pakai default/override" },
              ]} />
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Nilai kapasitas dianggap placeholder (pisahkan dengan koma)
              <input
                value={draft.suspiciousCapacities.join(", ")}
                onChange={(e) =>
                  set(
                    "suspiciousCapacities",
                    e.target.value
                      .split(",")
                      .map((s) => Number(s.trim()))
                      .filter((n) => Number.isFinite(n) && n > 0)
                  )
                }
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono-fit text-sm font-normal outline-none focus:border-fit-blue focus:ring-2 focus:ring-fit-blue/20"
              />
            </label>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Temuan data: rak MZ/SR ambient bernilai <span className="font-mono-fit">1</span>, cold storage bernilai{" "}
              <span className="font-mono-fit">100/200</span> — keduanya bukan m³ realistis, sehingga mode hybrid memakai fallback di bawah ini.
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Alert Dimensi Fisik" subtitle="Bandingkan Σ (p×l×t × qty) SKU dengan kapasitas lokasi" />
          <div className="flex flex-col gap-3 p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-fit-blue"
                checked={draft.dimAlert.enabled}
                onChange={(e) => set("dimAlert", { ...draft.dimAlert, enabled: e.target.checked })}
              />
              Aktifkan alert DIMENSION
            </label>
            <div className="max-w-[220px]">
              <NumField
                label="Toleransi (%)"
                value={draft.dimAlert.tolerancePct}
                onChange={(v) => set("dimAlert", { ...draft.dimAlert, tolerancePct: Math.max(0, v) })}
              />
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Alert terpicu bila volume dimensi total SKU di sebuah lokasi melebihi kapasitas lokasi + toleransi.
              Berguna sebagai pemeriksa silang independen terhadap <span className="font-mono-fit">occupied_cbm</span> —
              menangkap dimensi produk yang salah atau putaway ganda.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Penerima Email Alert (Master Role)"
            subtitle="SPV / Manager / Senior Manager / Head per gudang — dipakai tombol Kirim Email di Pusat Alert"
          />
          <div className="flex flex-col gap-2 p-4">
            <div className="thin-scroll max-h-64 overflow-auto">
              {draft.recipients.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-50 py-1.5 text-xs">
                  <span className="w-12 shrink-0 font-mono-fit font-bold text-slate-700">{r.wh}</span>
                  <span className="w-28 shrink-0 rounded bg-fit-plum/10 px-1.5 py-0.5 text-center text-[10px] font-bold text-fit-plum">{r.role}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-700" title={`${r.name} <${r.email}>`}>
                    {r.name || "—"} <span className="font-normal text-slate-400">{r.email}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-bold uppercase text-slate-400">≥ {r.minSev}</span>
                  <button
                    onClick={() => set("recipients", draft.recipients.filter((x) => x.id !== r.id))}
                    className="shrink-0 text-xs font-bold text-rose-500 hover:text-rose-700"
                  >✕</button>
                </div>
              ))}
              {!draft.recipients.length && (
                <p className="py-3 text-center text-xs text-slate-400">Belum ada penerima. Tambahkan di bawah.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-6">
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                Gudang
                <input
                  list="whlist"
                  value={newRcp.wh}
                  onChange={(e) => setNewRcp({ ...newRcp, wh: e.target.value.toUpperCase() })}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 font-mono-fit text-sm font-normal outline-none focus:border-fit-blue"
                />
                <datalist id="whlist">
                  <option value="ALL" />
                  {Object.values(WAREHOUSE_MAP).map((w) => <option key={w.code} value={w.code} />)}
                </datalist>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                Role
                <select
                  value={newRcp.role}
                  onChange={(e) => setNewRcp({ ...newRcp, role: e.target.value as MasterRole })}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-fit-blue"
                >
                  {ROLE_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600 sm:col-span-1">
                Nama
                <input
                  value={newRcp.name}
                  onChange={(e) => setNewRcp({ ...newRcp, name: e.target.value })}
                  placeholder="Pak Dwiki"
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal outline-none focus:border-fit-blue"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600 sm:col-span-2">
                Email
                <input
                  type="email"
                  value={newRcp.email}
                  onChange={(e) => setNewRcp({ ...newRcp, email: e.target.value })}
                  placeholder="nama@astro.id"
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal outline-none focus:border-fit-blue"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                Min. tingkat
                <select
                  value={newRcp.minSev}
                  onChange={(e) => setNewRcp({ ...newRcp, minSev: e.target.value as Sev })}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-fit-blue"
                >
                  <option value="info">Info+</option>
                  <option value="warning">Warning+</option>
                  <option value="critical">Critical+</option>
                  <option value="overload">Overload</option>
                </select>
              </label>
            </div>
            <Btn
              variant="ghost"
              onClick={() => {
                if (!newRcp.email.includes("@") || !newRcp.wh.trim()) return;
                const rec: Recipient = {
                  id: `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
                  wh: newRcp.wh.trim(),
                  role: newRcp.role,
                  name: newRcp.name.trim(),
                  email: newRcp.email.trim(),
                  minSev: newRcp.minSev,
                };
                set("recipients", [...draft.recipients, rec]);
                setNewRcp({ ...newRcp, name: "", email: "" });
              }}
            >+ Tambah Penerima</Btn>
            <p className="text-[11px] text-slate-400">
              "ALL" = menerima rekap semua gudang. Penerima menerima email bila ada alert dengan tingkat ≥ minimumnya.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Kapasitas Default per Handling (m³)" subtitle="Dipakai saat master placeholder / tidak ada, sebelum override zona" />
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
          {HANDLINGS.map((h) => (
            <NumField key={h} label={HANDLING_LABEL[h]} step={0.1} value={draft.defaultCaps[h] ?? 1.5}
              onChange={(v) => set("defaultCaps", { ...draft.defaultCaps, [h]: v })} />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Override Kapasitas per Zona" subtitle='Kunci = kode zona persis (mis. "Frozen", "MZ", "Staging-Antrian-Chiller")' />
        <div className="flex flex-col gap-2 p-4">
          {Object.entries(draft.zoneCaps).map(([z, cap]) => (
            <div key={z} className="flex items-center gap-2">
              <span className="w-56 truncate font-mono-fit text-xs font-bold text-slate-700">{z}</span>
              <input type="number" step={0.1} value={cap}
                onChange={(e) => set("zoneCaps", { ...draft.zoneCaps, [z]: Number(e.target.value) })}
                className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono-fit text-sm outline-none focus:border-fit-blue" />
              <span className="text-xs text-slate-400">m³</span>
              <Btn variant="danger" onClick={() => {
                const next = { ...draft.zoneCaps };
                delete next[z];
                set("zoneCaps", next);
              }}>Hapus</Btn>
            </div>
          ))}
          <div className="mt-1 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Zona
              <input value={newZone.zone} onChange={(e) => setNewZone({ ...newZone, zone: e.target.value })}
                placeholder="mis. Frozen"
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-normal outline-none focus:border-fit-blue" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Kapasitas (m³)
              <input type="number" step={0.1} value={newZone.cap}
                onChange={(e) => setNewZone({ ...newZone, cap: e.target.value })}
                className="w-32 rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono-fit text-sm font-normal outline-none focus:border-fit-blue" />
            </label>
            <Btn variant="ghost" onClick={() => {
              const c = Number(newZone.cap);
              if (!newZone.zone.trim() || !Number.isFinite(c) || c <= 0) return;
              set("zoneCaps", { ...draft.zoneCaps, [newZone.zone.trim()]: c });
              setNewZone({ zone: "", cap: "" });
            }}>+ Tambah Override</Btn>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Pemetaan Kategori → Handling" subtitle="Dasar deteksi mismatch penyimpanan" />
          <div className="flex flex-col gap-2 p-4">
            <div className="thin-scroll max-h-80 overflow-auto">
              {Object.entries(draft.categoryHandling).sort(([a], [b]) => a.localeCompare(b)).map(([cat, h]) => (
                <div key={cat} className="flex items-center gap-2 border-b border-slate-50 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700" title={cat}>{cat}</span>
                  <select value={h}
                    onChange={(e) => set("categoryHandling", { ...draft.categoryHandling, [cat]: e.target.value as Handling })}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-fit-blue">
                    {HANDLINGS.map((x) => <option key={x} value={x}>{HANDLING_LABEL[x]}</option>)}
                  </select>
                  <button onClick={() => {
                    const next = { ...draft.categoryHandling };
                    delete next[cat];
                    set("categoryHandling", next);
                  }} className="text-xs font-bold text-rose-500 hover:text-rose-700">✕</button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-slate-600">
                Kategori L1
                <input value={newCat.cat} onChange={(e) => setNewCat({ ...newCat, cat: e.target.value })}
                  placeholder="mis. Seafood Beku"
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-normal outline-none focus:border-fit-blue" />
              </label>
              <select value={newCat.handling}
                onChange={(e) => setNewCat({ ...newCat, handling: e.target.value as Handling })}
                className="rounded-lg border border-slate-200 px-2 py-2 text-xs outline-none focus:border-fit-blue">
                {HANDLINGS.map((x) => <option key={x} value={x}>{HANDLING_LABEL[x]}</option>)}
              </select>
              <Btn variant="ghost" onClick={() => {
                if (!newCat.cat.trim()) return;
                set("categoryHandling", { ...draft.categoryHandling, [newCat.cat.trim()]: newCat.handling });
                setNewCat({ cat: "", handling: "FROZEN" });
              }}>+ Tambah</Btn>
            </div>
            <p className="text-[11px] text-slate-400">
              Kategori yang tidak dipetakan dianggap fleksibel (tidak memicu mismatch).
            </p>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Status Stok Terhitung" subtitle="Status product_detail yang dihitung ke okupansi" />
            <div className="flex flex-wrap gap-4 p-4">
              {["Available", "Bad", "Lost"].map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" className="h-4 w-4 accent-fit-blue"
                    checked={draft.countStatuses.includes(s)}
                    onChange={(e) =>
                      set(
                        "countStatuses",
                        e.target.checked
                          ? [...draft.countStatuses, s]
                          : draft.countStatuses.filter((x) => x !== s)
                      )
                    } />
                  {s}
                </label>
              ))}
            </div>
            <p className="px-4 pb-3 text-[11px] text-slate-400">
              Secara fisik, stok Bad tetap memakai ruang — aktifkan bila ingin okupansi fisik penuh; biarkan hanya Available bila fokus ke stok sehat.
            </p>
          </Card>
          <Card>
            <CardHeader title="Sinkron & Snapshot" subtitle="Perilaku otomatisasi" />
            <div className="grid grid-cols-2 gap-3 p-4">
              <NumField label="Interval poll file terhubung (detik)" value={draft.pollSec}
                onChange={(v) => set("pollSec", v)} />
              <label className="flex items-center gap-2 pt-4 text-sm font-semibold text-slate-700">
                <input type="checkbox" className="h-4 w-4 accent-fit-blue" checked={draft.autoSnapshot}
                  onChange={(e) => set("autoSnapshot", e.target.checked)} />
                Snapshot otomatis tiap sinkron
              </label>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
      {label}
      <input type="number" step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono-fit text-sm font-normal outline-none focus:border-fit-blue focus:ring-2 focus:ring-fit-blue/20" />
    </label>
  );
}
