import Dexie, { type Table } from "dexie";
import type {
  AlertRow,
  AppConfig,
  OccRow,
  RackRow,
  SnapshotRow,
  StockRow,
} from "./config";
import { DEFAULT_CONFIG } from "./config";

export interface KVRow {
  key: string;
  value: unknown;
}

export class OasDB extends Dexie {
  stock!: Table<StockRow, number>;
  racks!: Table<RackRow, string>;
  occupancy!: Table<OccRow, string>;
  alerts!: Table<AlertRow, string>;
  snapshots!: Table<SnapshotRow, string>;
  config!: Table<KVRow, string>;
  meta!: Table<KVRow, string>;

  constructor() {
    super("oas-fit");
    this.version(1).stores({
      stock: "++id, src, rack_name, location_id, l1_category_name, status",
      racks: "&rack_name, src, location_id, zone",
      occupancy: "&rack_name, wh, zone, handling, status, pct",
      alerts: "&key, type, severity, status, wh",
      snapshots: "&key, date, wh",
      config: "&key",
      meta: "&key",
    });
  }
}

let _db: OasDB | null = null;

/** Instansiasi hanya di browser (aman terhadap prerender/SSR). */
export function getDb(): OasDB {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB hanya tersedia di browser");
  }
  if (!_db) _db = new OasDB();
  return _db;
}

export async function loadConfig(): Promise<AppConfig> {
  const db = getDb();
  const row = await db.config.get("app");
  if (!row) return structuredClone(DEFAULT_CONFIG);
  // gabungkan dengan default agar field baru selalu terisi
  return { ...structuredClone(DEFAULT_CONFIG), ...(row.value as AppConfig) };
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  await getDb().config.put({ key: "app", value: cfg });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await getDb().meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await getDb().meta.put({ key, value });
}

export async function clearAllData(): Promise<void> {
  const db = getDb();
  await Promise.all([
    db.stock.clear(),
    db.racks.clear(),
    db.occupancy.clear(),
    db.alerts.clear(),
    db.snapshots.clear(),
    db.meta.clear(),
  ]);
}
