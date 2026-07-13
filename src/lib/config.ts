// ============================================================
// OAS — Konfigurasi & tipe domain
// Identifier berbahasa Inggris, seluruh teks UI berbahasa Indonesia.
// ============================================================

export type Handling = "AMBIENT" | "CHILLER" | "COOL" | "FROZEN" | "DRY" | "UNKNOWN";

export type OccStatus = "NORMAL" | "WARNING" | "CRITICAL" | "OVERLOAD";

export type CapSource = "master" | "zone" | "default";

export type CapacityModel = "master" | "hybrid" | "configured";

export interface StockRow {
  id?: number;
  src: string; // nama file sumber (untuk sinkron per-chunk)
  location_id: string;
  product_id: string;
  product_name: string;
  sku_number: string;
  l1_category_name: string;
  rack_storage_name: string;
  rack_name: string;
  zone: string;
  rack_zone: string;
  aisle: string;
  bay: string;
  level: string;
  bin: string;
  status: string; // product_detail_status_name: Available | Bad | Lost
  stock_qty: number;
  sku_cbm: number;
  length: number; // dimensi SKU (cm)
  width: number;
  height: number;
  occupied_cbm: number;
}

export interface RackRow {
  rack_name: string; // primary key (kode SLOC lengkap)
  src: string;
  location_id: string;
  location_name: string;
  area: string;
  zone: string;
  aisle: string;
  bay: string;
  level: string;
  bin: string;
  active: boolean;
  max_quantity: number;
  max_volume: number;
  handling: Handling;
  rack_storage_name: string;
}

export interface OccRow {
  rack_name: string;
  location_id: string;
  wh: string; // kode gudang (CBT, STL, ...)
  zone: string; // zona 3 huruf (SRA, MZE, PLA, ...)
  rack_zone: string;
  handling: Handling;
  occupied_cbm: number;
  capacity_cbm: number;
  dim_cbm: number; // Σ (p×l×t / 1e6) × qty — volume dimensi fisik SKU
  cap_source: CapSource;
  cap_suspicious: boolean;
  pct: number; // persentase okupansi
  status: OccStatus;
  sku_count: number;
  qty_total: number;
  mismatch: boolean;
  mismatch_cats: string[];
  in_master: boolean;
}

export interface AlertRow {
  key: string;
  type: "OCCUPANCY" | "MISMATCH" | "DIMENSION" | "DATA_CAPACITY";
  severity: "info" | "warning" | "critical" | "overload";
  status: "open" | "acknowledged" | "resolved";
  rack_name: string;
  wh: string;
  message: string;
  value: number;
  firstSeen: number;
  lastSeen: number;
  resolvedAt?: number;
}

export interface SnapshotRow {
  key: string; // `${date}|${wh}`
  date: string; // YYYY-MM-DD
  wh: string; // kode gudang atau "ALL"
  filled: number;
  occupied_cbm: number;
  capacity_cbm: number;
  avg_pct: number;
  warning: number;
  critical: number;
  overload: number;
  mismatch: number;
}

export type MasterRole = "SPV" | "Manager" | "Senior Manager" | "Head";
export const ROLE_OPTIONS: MasterRole[] = ["SPV", "Manager", "Senior Manager", "Head"];
export type Sev = "info" | "warning" | "critical" | "overload";
export const SEV_RANK: Record<Sev, number> = { info: 0, warning: 1, critical: 2, overload: 3 };

export interface Recipient {
  id: string;
  wh: string; // kode gudang atau "ALL"
  role: MasterRole;
  name: string;
  email: string;
  minSev: Sev; // menerima alert dengan tingkat >= ini
}

/** Volume dimensi SKU melebihi kapasitas lokasi (dengan toleransi %). */
export function isDimOver(dimCbm: number, capCbm: number, tolerancePct: number): boolean {
  if (!(dimCbm > 0) || !(capCbm > 0)) return false;
  return dimCbm > capCbm * (1 + tolerancePct / 100);
}

export interface SupersetSource {
  id: string;
  name: string; // label unik — data disimpan sebagai src "superset:{name}"
  chartId: number; // ID chart/slice di Superset
  pageSize: number; // baris per halaman (paginasi offset menembus batas row)
}

export interface SupersetConfig {
  baseUrl: string; // mis. https://superset.astro.internal
  cookie: string; // header Cookie sesi login (disimpan lokal di IndexedDB)
  pollMin: number; // interval tarik otomatis (menit)
  autoPull: boolean;
  sources: SupersetSource[];
}

export interface AppConfig {
  thresholds: { warning: number; critical: number; overload: number };
  capacityModel: CapacityModel;
  suspiciousCapacities: number[];
  defaultCaps: Record<Handling, number>;
  zoneCaps: Record<string, number>; // override kapasitas per zona (SRA, PLA, ...)
  countStatuses: string[]; // status stok yang dihitung sebagai okupansi
  categoryHandling: Record<string, Handling>; // kategori L1 -> handling minimum
  pollSec: number; // interval auto-sync file terhubung
  autoSnapshot: boolean;
  dimAlert: { enabled: boolean; tolerancePct: number };
  recipients: Recipient[];
  superset: SupersetConfig;
}

// ---- Normalisasi storage handling -------------------------------------
export function normalizeHandling(raw: string | undefined | null): Handling {
  const s = (raw || "").toLowerCase();
  if (!s || s === "n/a") return "UNKNOWN";
  if (s.includes("frozen") || s.includes("freez") || s.includes("cold")) return "FROZEN";
  if (s.includes("chill")) return "CHILLER";
  if (s.includes("cool")) return "COOL";
  if (s.includes("dry")) return "DRY";
  if (s.includes("ambient")) return "AMBIENT";
  return "UNKNOWN";
}

// Peringkat suhu: makin kecil makin dingin.
export const HANDLING_RANK: Record<Handling, number> = {
  FROZEN: 0,
  CHILLER: 1,
  COOL: 2,
  AMBIENT: 3,
  DRY: 3,
  UNKNOWN: 9,
};

export const HANDLING_LABEL: Record<Handling, string> = {
  FROZEN: "Frozen (-15…-18°C)",
  CHILLER: "Chiller (0…5°C)",
  COOL: "Cool Room (15…20°C)",
  AMBIENT: "Ambient (25…30°C)",
  DRY: "WH Dry",
  UNKNOWN: "Tidak diketahui",
};

// ---- Peta gudang (fallback; diperkaya otomatis dari file Rack Master) --
export const WAREHOUSE_MAP: Record<string, { code: string; name: string }> = {
  "819": { code: "CBT", name: "WH Cibitung" },
  "772": { code: "STL", name: "WH Sentul" },
  "160": { code: "PGS", name: "WH Pegangsaan" },
  "796": { code: "SRG", name: "WH Srengseng" },
  "661": { code: "CBN", name: "WH Cibinong" },
  "912": { code: "STR", name: "WH Sunter Overflow" },
  "860": { code: "BGO", name: "WH Bogor" },
  "983": { code: "BIT", name: "WH Bitung" },
};

export function whCodeOf(locationId: string, rackName?: string): string {
  const m = WAREHOUSE_MAP[locationId];
  if (m) return m.code;
  if (rackName && rackName.includes("-")) return rackName.split("-")[0];
  return locationId || "?";
}

// ---- Konfigurasi bawaan -------------------------------------------------
export const DEFAULT_CONFIG: AppConfig = {
  thresholds: { warning: 75, critical: 90, overload: 100 },
  capacityModel: "hybrid",
  // max_volume=1 terindikasi placeholder di rack master (MZ/SR/HR ambient).
  suspiciousCapacities: [1],
  defaultCaps: {
    AMBIENT: 1.5,
    DRY: 1.5,
    CHILLER: 2.0,
    COOL: 2.0,
    FROZEN: 2.5,
    UNKNOWN: 1.5,
  },
  zoneCaps: {},
  countStatuses: ["Available"],
  categoryHandling: {
    "Makanan Beku": "FROZEN",
    "Es Krim": "FROZEN",
    "Ayam & Unggas": "FROZEN",
    "Daging & Seafood": "FROZEN",
    "Astro Kitchen - Raw Material Chilled/frozen": "FROZEN",
    "Sayur Segar": "CHILLER",
    "Buah Segar": "CHILLER",
    "Telur & Produk Segar": "CHILLER",
    "Roti & Kue": "COOL",
  },
  pollSec: 60,
  autoSnapshot: true,
  dimAlert: { enabled: true, tolerancePct: 10 },
  recipients: [],
  superset: { baseUrl: "", cookie: "", pollMin: 5, autoPull: false, sources: [] },
};

export const STATUS_META: Record<
  OccStatus,
  { label: string; color: string; bg: string }
> = {
  NORMAL: { label: "Normal", color: "#0E9F6E", bg: "#DEF7EC" },
  WARNING: { label: "Warning", color: "#B45309", bg: "#FEF3C7" },
  CRITICAL: { label: "Critical", color: "#DC2626", bg: "#FEE2E2" },
  OVERLOAD: { label: "Overload", color: "#7C2D8F", bg: "#F3E8FF" },
};

export function classifyPct(
  pct: number,
  t: AppConfig["thresholds"]
): OccStatus {
  if (pct >= t.overload) return "OVERLOAD";
  if (pct >= t.critical) return "CRITICAL";
  if (pct >= t.warning) return "WARNING";
  return "NORMAL";
}

// ---- Resolusi kapasitas efektif per SLOC --------------------------------
export function resolveCapacity(
  cfg: AppConfig,
  handling: Handling,
  zone: string,
  masterVolume: number | undefined,
  inMaster: boolean
): { cap: number; source: CapSource; suspicious: boolean } {
  const suspicious =
    inMaster &&
    masterVolume !== undefined &&
    cfg.suspiciousCapacities.includes(masterVolume);
  const zoneCap = cfg.zoneCaps[zone];
  const fallback = () =>
    zoneCap !== undefined && zoneCap > 0
      ? { cap: zoneCap, source: "zone" as CapSource, suspicious }
      : { cap: cfg.defaultCaps[handling] ?? 1.5, source: "default" as CapSource, suspicious };

  if (cfg.capacityModel === "configured") return fallback();
  const masterValid =
    inMaster && masterVolume !== undefined && masterVolume > 0 && !suspicious;
  if (cfg.capacityModel === "master") {
    if (inMaster && masterVolume !== undefined && masterVolume > 0)
      return { cap: masterVolume, source: "master", suspicious };
    return fallback();
  }
  // hybrid: pakai master hanya jika valid & tidak mencurigakan
  if (masterValid) return { cap: masterVolume!, source: "master", suspicious: false };
  return fallback();
}
