"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useApp, useConfigLoader, useDbQuery } from "@/lib/store";
import { getMeta } from "@/lib/db";
import { fsaSupported, pollConnectedFiles } from "@/lib/ingest";
import { syncSupersetAll } from "@/lib/superset";
import { fmtDateTime } from "@/lib/format";

const NAV_GROUPS: { label: string; hrefs: string[] }[] = [
  { label: "Monitor", hrefs: ["/dashboard", "/explorer", "/alerts", "/trends"] },
  { label: "Kelola", hrefs: ["/master", "/sync"] },
];

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "M3 13h6V3H3v10zm0 8h6v-6H3v6zm8 0h10V11H11v10zm0-18v6h10V3H11z" },
  { href: "/explorer", label: "Explorer SLOC", icon: "M10 18a8 8 0 1 1 5.3-2L21 21.7 19.7 23 14 17.3A8 8 0 0 1 10 18zm0-2a6 6 0 1 0 0-12 6 6 0 0 0 0 12z" },
  { href: "/alerts", label: "Alert Center", icon: "M12 22a2.5 2.5 0 0 0 2.4-2h-4.8a2.5 2.5 0 0 0 2.4 2zm7-6v-5a7 7 0 0 0-5-6.7V4a2 2 0 1 0-4 0v.3A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z" },
  { href: "/trends", label: "Tren Historis", icon: "M3 17l6-6 4 4 7-8v4h2V4h-7v2h4l-6 6.8-4-4L2 16z" },
  { href: "/master", label: "Master Data", icon: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9.4 4a7.6 7.6 0 0 0-.1-1.2l2.1-1.6-2-3.5-2.5 1a7.7 7.7 0 0 0-2-1.2L16.5 3h-4l-.4 2.5a7.7 7.7 0 0 0-2 1.2l-2.5-1-2 3.5 2.1 1.6a7.6 7.6 0 0 0 0 2.4L5.6 14.8l2 3.5 2.5-1c.6.5 1.3.9 2 1.2l.4 2.5h4l.4-2.5c.7-.3 1.4-.7 2-1.2l2.5 1 2-3.5-2.1-1.6c.1-.4.1-.8.1-1.2z" },
  { href: "/sync", label: "Sinkron Data", icon: "M12 4V1L8 5l4 4V6a6 6 0 0 1 6 6c0 1-.3 2-.7 2.8l1.5 1.5A8 8 0 0 0 12 4zm0 14a6 6 0 0 1-6-6c0-1 .3-2 .7-2.8L5.2 7.7A8 8 0 0 0 12 20v3l4-4-4-4v3z" },
];

function NavIcon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function FitMark() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-fit-blue font-display text-sm font-extrabold text-white shadow-sm">
        OA
      </div>
      <div className="leading-tight">
        <p className="font-display text-sm font-extrabold tracking-tight text-white">
          Occupancy Alert System
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
          FIT · Fulfillment Intelligence
        </p>
      </div>
    </div>
  );
}

/** Poller auto-sync file terhubung (File System Access). */
function AutoSyncPoller() {
  const { cfg, cfgLoaded, bump, setComputing } = useApp();
  useEffect(() => {
    if (!cfgLoaded || !fsaSupported()) return;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const changed = await pollConnectedFiles(cfg);
        if (changed.length) {
          setComputing(false, `Auto-sync: ${changed.join(", ")}`);
          bump();
        }
      } catch {
        /* diamkan; percobaan berikutnya berjalan lagi */
      } finally {
        busy = false;
      }
    };
    const id = setInterval(tick, Math.max(10, cfg.pollSec) * 1000);
    return () => clearInterval(id);
  }, [cfg, cfgLoaded, bump, setComputing]);
  return null;
}

/** Poller Superset Live Sync (metode cookie via proxy lokal). */
function SupersetPoller() {
  const { cfg, cfgLoaded, bump, setComputing } = useApp();
  useEffect(() => {
    const sp = cfg.superset;
    if (!cfgLoaded || !sp.autoPull || !sp.baseUrl || !sp.cookie || !sp.sources.length) return;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        setComputing(true, "Menarik data Superset…");
        const st = await syncSupersetAll(cfg);
        const ok = Object.values(st).filter((x) => x.ok).length;
        setComputing(false, ok ? `Superset tersinkron (${ok} sumber)` : "");
        if (ok) bump();
      } catch {
        setComputing(false, "");
      } finally {
        busy = false;
      }
    };
    tick(); // tarik segera saat aktif
    const id = setInterval(tick, Math.max(1, sp.pollMin) * 60_000);
    return () => clearInterval(id);
  }, [cfg, cfgLoaded, bump, setComputing]);
  return null;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useConfigLoader();
  const { computing, syncMessage } = useApp();
  const { data: lastSync } = useDbQuery(() => getMeta<number>("lastSync"), []);
  const active = (href: string) => pathname?.startsWith(href);
  const { cfg } = useApp();
  const pageTitle = NAV.find((n) => active(n.href))?.label || "OAS";
  const live = cfg.superset.autoPull && !!cfg.superset.baseUrl && !!cfg.superset.cookie && cfg.superset.sources.length > 0;

  return (
    <div className="min-h-dvh bg-fit-bg">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col gap-6 bg-fit-plum px-3 py-5 md:flex">
        <FitMark />
        <nav className="flex flex-col gap-4">
          {NAV_GROUPS.map((g) => (
            <div key={g.label} className="flex flex-col gap-1">
              <p className="px-3 text-[9px] font-extrabold uppercase tracking-[0.2em] text-white/35">{g.label}</p>
              {g.hrefs.map((href) => {
                const n = NAV.find((x) => x.href === href)!;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`fit-focus flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-all ${
                      active(n.href)
                        ? "bg-white/12 text-white shadow-[inset_2px_0_0_0_#3C83F6]"
                        : "text-white/55 hover:bg-white/8 hover:text-white"
                    }`}
                  >
                    <NavIcon d={n.icon} />
                    {n.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto rounded-lg bg-white/6 px-3 py-2.5 text-[11px] leading-relaxed text-white/55">
          Data tersimpan lokal di IndexedDB browser — tanpa server, tanpa API,
          tanpa Google Sheets.
        </div>
      </aside>

      {/* Konten */}
      <div className="md:pl-60">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-fit-blue font-display text-xs font-extrabold text-white">
              OA
            </div>
            <span className="font-display text-sm font-bold text-fit-ink">OAS · FIT</span>
          </div>
          <div className="hidden items-center gap-2.5 md:flex">
            <span className="font-display text-sm font-extrabold tracking-tight text-fit-ink">{pageTitle}</span>
            {live && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
                </span>
                LIVE Superset · {cfg.superset.pollMin}m
              </span>
            )}
          </div>
          <div className="hidden text-xs text-slate-500 md:block">
            {computing ? (
              <span className="inline-flex items-center gap-2 font-semibold text-fit-blue">
                <span className="h-2 w-2 animate-ping rounded-full bg-fit-blue" />
                {syncMessage || "Memproses data…"}
              </span>
            ) : syncMessage ? (
              <span className="text-emerald-600">{syncMessage}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="hidden sm:inline">Sinkron terakhir:</span>
            <span className="rounded-md bg-slate-100 px-2 py-1 font-mono-fit font-semibold text-slate-700">
              {fmtDateTime(lastSync)}
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 md:px-6 md:pb-10">
          {children}
        </main>
      </div>

      {/* Bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[9px] font-semibold ${
              active(n.href) ? "text-fit-blue" : "text-slate-400"
            }`}
          >
            <NavIcon d={n.icon} />
            {n.label.split(" ")[0]}
          </Link>
        ))}
      </nav>

      <AutoSyncPoller />
      <SupersetPoller />
    </div>
  );
}
