"use client";

import { create } from "zustand";
import { useEffect, useState } from "react";
import type { AppConfig } from "./config";
import { DEFAULT_CONFIG } from "./config";
import { loadConfig } from "./db";

interface AppState {
  cfg: AppConfig;
  cfgLoaded: boolean;
  dataVersion: number;
  computing: boolean;
  syncMessage: string;
  setCfg: (cfg: AppConfig) => void;
  bump: () => void;
  setComputing: (v: boolean, msg?: string) => void;
}

export const useApp = create<AppState>((set) => ({
  cfg: DEFAULT_CONFIG,
  cfgLoaded: false,
  dataVersion: 0,
  computing: false,
  syncMessage: "",
  setCfg: (cfg) => set({ cfg, cfgLoaded: true }),
  bump: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
  setComputing: (v, msg = "") => set({ computing: v, syncMessage: msg }),
}));

/** Muat konfigurasi dari IndexedDB sekali di sisi klien. */
export function useConfigLoader(): void {
  const { cfgLoaded, setCfg } = useApp();
  useEffect(() => {
    if (cfgLoaded) return;
    loadConfig()
      .then(setCfg)
      .catch(() => setCfg(DEFAULT_CONFIG));
  }, [cfgLoaded, setCfg]);
}

/**
 * Hook kueri Dexie yang aman terhadap prerender: kueri berjalan di useEffect
 * dan otomatis dijalankan ulang ketika dataVersion berubah (setelah sync /
 * recompute / aksi alert).
 */
export function useDbQuery<T>(
  fn: () => Promise<T>,
  deps: React.DependencyList = []
): { data: T | undefined; loading: boolean; reload: () => void } {
  const dataVersion = useApp((s) => s.dataVersion);
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((v) => {
        if (alive) {
          setData(v);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion, tick, ...deps]);
  return { data, loading, reload: () => setTick((t) => t + 1) };
}
