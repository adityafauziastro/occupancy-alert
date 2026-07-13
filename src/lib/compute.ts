// ============================================================
// Mesin komputasi okupansi
// Agregasi streaming (Dexie .each) agar hemat memori untuk data besar.
// ============================================================

import { getDb, getMeta, setMeta } from "./db";
import type { AppConfig, Handling, OccRow, SnapshotRow } from "./config";
import {
  HANDLING_RANK,
  WAREHOUSE_MAP,
  classifyPct,
  isDimOver,
  normalizeHandling,
  resolveCapacity,
  whCodeOf,
} from "./config";
import { runAlertEngine } from "./alerts";
import { todayKey } from "./format";

export interface Kpis {
  filledSlocs: number;
  masterSlocs: number;
  emptySlocs: number;
  occupiedCbm: number;
  capacityCbm: number;
  avgPct: number;
  statusCount: Record<string, number>;
  mismatchCount: number;
  noRackRows: number;
  suspiciousCaps: number;
  skuRows: number;
  dimOverCount: number;
  lastCompute: number;
  whList: { code: string; name: string; filled: number; occ: number; cap: number; avgPct: number; crit: number }[];
}

interface Agg {
  occ: number;
  dim: number;
  qty: number;
  skus: Set<string>;
  location_id: string;
  zone: string;
  rack_zone: string;
  handlingStock: Handling;
  minReqRank: number;
  reqCats: Map<string, number>; // kategori -> rank kebutuhan
}

export async function recomputeAll(cfg: AppConfig): Promise<Kpis> {
  const db = getDb();
  const aggs = new Map<string, Agg>();
  const catAgg = new Map<string, number>();
  const catAggByWh = new Map<string, Map<string, number>>();
  let noRackRows = 0;
  let skuRows = 0;
  const countSet = new Set(cfg.countStatuses);

  await db.stock.each((row) => {
    skuRows++;
    if (!countSet.has(row.status)) return;
    if (!row.rack_name) {
      noRackRows++;
      return;
    }
    let a = aggs.get(row.rack_name);
    if (!a) {
      a = {
        occ: 0,
        dim: 0,
        qty: 0,
        skus: new Set(),
        location_id: row.location_id,
        zone: row.zone || row.rack_name.split("-")[1]?.slice(0, 3) || "",
        rack_zone: row.rack_zone,
        handlingStock: normalizeHandling(row.rack_storage_name),
        minReqRank: 99,
        reqCats: new Map(),
      };
      aggs.set(row.rack_name, a);
    }
    a.occ += row.occupied_cbm;
    a.dim +=
      ((row.length || 0) * (row.width || 0) * (row.height || 0) / 1e6) *
      (row.stock_qty || 0);
    a.qty += row.stock_qty;
    a.skus.add(row.sku_number || row.product_id);
    const cat = row.l1_category_name;
    catAgg.set(cat, (catAgg.get(cat) || 0) + row.occupied_cbm);
    const whC = whCodeOf(row.location_id, row.rack_name);
    let cm = catAggByWh.get(whC);
    if (!cm) {
      cm = new Map();
      catAggByWh.set(whC, cm);
    }
    cm.set(cat, (cm.get(cat) || 0) + row.occupied_cbm);
    const req = cfg.categoryHandling[cat];
    if (req !== undefined) {
      const rank = HANDLING_RANK[req];
      if (rank < a.minReqRank) a.minReqRank = rank;
      a.reqCats.set(cat, rank);
    }
  });

  // Peta rack master (kapasitas + handling resmi + nama gudang)
  const rackMap = new Map<
    string,
    { max_volume: number; handling: Handling; location_id: string; location_name: string }
  >();
  const whNames = new Map<string, string>();
  let masterSlocs = 0;
  await db.racks.each((r) => {
    masterSlocs++;
    rackMap.set(r.rack_name, {
      max_volume: r.max_volume,
      handling: r.handling,
      location_id: r.location_id,
      location_name: r.location_name,
    });
    if (r.location_id && r.location_name) {
      const code = r.rack_name.includes("-")
        ? r.rack_name.split("-")[0]
        : whCodeOf(r.location_id);
      whNames.set(r.location_id, `${code}|${r.location_name}`);
    }
  });
  await setMeta("whNames", Object.fromEntries(whNames));

  // Susun baris okupansi
  const occRows: OccRow[] = [];
  let suspiciousCaps = 0;
  for (const [rack, a] of aggs) {
    const master = rackMap.get(rack);
    const inMaster = !!master;
    const handling: Handling =
      master && master.handling !== "UNKNOWN" ? master.handling : a.handlingStock;
    const cap = resolveCapacity(cfg, handling, a.zone, master?.max_volume, inMaster);
    if (cap.suspicious) suspiciousCaps++;
    const pct = cap.cap > 0 ? (a.occ / cap.cap) * 100 : 0;
    const rackRank = HANDLING_RANK[handling];
    const mismatch = a.minReqRank < rackRank && rackRank !== 9;
    const mismatchCats = mismatch
      ? Array.from(a.reqCats.entries())
          .filter(([, rank]) => rank < rackRank)
          .map(([cat]) => cat)
      : [];
    occRows.push({
      rack_name: rack,
      location_id: a.location_id,
      wh: whCodeOf(a.location_id, rack),
      zone: a.zone,
      rack_zone: a.rack_zone,
      handling,
      occupied_cbm: a.occ,
      capacity_cbm: cap.cap,
      dim_cbm: a.dim,
      cap_source: cap.source,
      cap_suspicious: cap.suspicious,
      pct,
      status: classifyPct(pct, cfg.thresholds),
      sku_count: a.skus.size,
      qty_total: a.qty,
      mismatch,
      mismatch_cats: mismatchCats,
      in_master: inMaster,
    });
  }

  await db.occupancy.clear();
  for (let i = 0; i < occRows.length; i += 5000) {
    await db.occupancy.bulkPut(occRows.slice(i, i + 5000));
  }

  // KPI global + per gudang
  const statusCount: Record<string, number> = {
    NORMAL: 0,
    WARNING: 0,
    CRITICAL: 0,
    OVERLOAD: 0,
  };
  const perWh = new Map<
    string,
    { filled: number; occ: number; cap: number; pctSum: number; crit: number }
  >();
  let occupiedCbm = 0;
  let capacityCbm = 0;
  let pctSum = 0;
  let mismatchCount = 0;
  let dimOverCount = 0;
  for (const r of occRows) {
    if (cfg.dimAlert.enabled && isDimOver(r.dim_cbm, r.capacity_cbm, cfg.dimAlert.tolerancePct))
      dimOverCount++;
    statusCount[r.status]++;
    occupiedCbm += r.occupied_cbm;
    capacityCbm += r.capacity_cbm;
    pctSum += r.pct;
    if (r.mismatch) mismatchCount++;
    let w = perWh.get(r.wh);
    if (!w) {
      w = { filled: 0, occ: 0, cap: 0, pctSum: 0, crit: 0 };
      perWh.set(r.wh, w);
    }
    w.filled++;
    w.occ += r.occupied_cbm;
    w.cap += r.capacity_cbm;
    w.pctSum += r.pct;
    if (r.status === "CRITICAL" || r.status === "OVERLOAD") w.crit++;
  }

  const savedNames = (await getMeta<Record<string, string>>("whNames")) || {};
  const nameByCode = new Map<string, string>();
  for (const v of Object.values(savedNames)) {
    const [code, name] = v.split("|");
    nameByCode.set(code, name);
  }
  const whList = Array.from(perWh.entries())
    .map(([code, w]) => ({
      code,
      name:
        nameByCode.get(code) ||
        Object.values(WAREHOUSE_MAP).find((m) => m.code === code)?.name ||
        code,
      filled: w.filled,
      occ: w.occ,
      cap: w.cap,
      avgPct: w.filled ? w.pctSum / w.filled : 0,
      crit: w.crit,
    }))
    .sort((x, y) => y.occ - x.occ);

  const kpis: Kpis = {
    filledSlocs: occRows.length,
    masterSlocs,
    emptySlocs: Math.max(0, masterSlocs - occRows.length),
    occupiedCbm,
    capacityCbm,
    avgPct: occRows.length ? pctSum / occRows.length : 0,
    statusCount,
    mismatchCount,
    noRackRows,
    suspiciousCaps,
    skuRows,
    dimOverCount,
    lastCompute: Date.now(),
    whList,
  };
  await setMeta("kpis", kpis);
  await setMeta(
    "catAgg",
    Array.from(catAgg.entries()).sort((a, b) => b[1] - a[1])
  );
  const catByWhObj: Record<string, [string, number][]> = {
    ALL: Array.from(catAgg.entries()).sort((a, b) => b[1] - a[1]),
  };
  for (const [w, cm] of catAggByWh) {
    catByWhObj[w] = Array.from(cm.entries()).sort((a, b) => b[1] - a[1]);
  }
  await setMeta("catAggByWh", catByWhObj);

  await runAlertEngine(cfg, occRows);
  if (cfg.autoSnapshot) await takeSnapshot(kpis, occRows);
  return kpis;
}

export async function takeSnapshot(kpis: Kpis, occRows?: OccRow[]): Promise<void> {
  const db = getDb();
  const rows = occRows ?? (await db.occupancy.toArray());
  const date = todayKey();
  const perWh = new Map<string, SnapshotRow>();
  const mk = (wh: string): SnapshotRow => ({
    key: `${date}|${wh}`,
    date,
    wh,
    filled: 0,
    occupied_cbm: 0,
    capacity_cbm: 0,
    avg_pct: 0,
    warning: 0,
    critical: 0,
    overload: 0,
    mismatch: 0,
  });
  const all = mk("ALL");
  const pctSums = new Map<string, number>();
  for (const r of rows) {
    for (const key of ["ALL", r.wh]) {
      let s = key === "ALL" ? all : perWh.get(key);
      if (!s) {
        s = mk(key);
        perWh.set(key, s);
      }
      s.filled++;
      s.occupied_cbm += r.occupied_cbm;
      s.capacity_cbm += r.capacity_cbm;
      pctSums.set(key, (pctSums.get(key) || 0) + r.pct);
      if (r.status === "WARNING") s.warning++;
      if (r.status === "CRITICAL") s.critical++;
      if (r.status === "OVERLOAD") s.overload++;
      if (r.mismatch) s.mismatch++;
    }
  }
  const snaps = [all, ...perWh.values()].map((s) => ({
    ...s,
    avg_pct: s.filled ? (pctSums.get(s.wh) || 0) / s.filled : 0,
  }));
  await db.snapshots.bulkPut(snaps);
}
