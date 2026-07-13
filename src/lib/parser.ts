// ============================================================
// Parser CSV/TSV hasil ekspor Superset
// - deteksi delimiter otomatis (tab, koma, titik-koma, pipe)
// - angka berformat SI dari Superset: 6.91k, 576µ, 0.0063, 1.2M, dst.
// - deteksi tipe file otomatis: Stock on Hand vs Rack Master
// ============================================================

import type { RackRow, StockRow } from "./config";
import { normalizeHandling } from "./config";

const SI_SUFFIX: Record<string, number> = {
  T: 1e12,
  G: 1e9,
  B: 1e9,
  M: 1e6,
  k: 1e3,
  K: 1e3,
  m: 1e-3,
  "µ": 1e-6,
  u: 1e-6,
  n: 1e-9,
};

/** Parse angka Superset (mendukung sufiks SI + pemisah ribuan). */
export function parseNumber(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") return isFinite(raw) ? raw : 0;
  let s = String(raw).trim();
  if (!s || s === "-" || s.toLowerCase() === "null" || s.toLowerCase() === "n/a")
    return 0;
  s = s.replace(/\s/g, "");
  const last = s[s.length - 1];
  let mult = 1;
  if (last in SI_SUFFIX && !/[0-9.]/.test(last)) {
    mult = SI_SUFFIX[last];
    s = s.slice(0, -1);
  }
  // "1,234.56" -> hapus koma ribuan bila ada titik desimal; "1234,56" -> koma desimal
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  const v = parseFloat(s);
  return isFinite(v) ? v * mult : 0;
}

export function detectDelimiter(headerLine: string): string {
  const candidates = ["\t", ",", ";", "|"];
  let best = "\t";
  let bestCount = -1;
  for (const d of candidates) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** Split satu baris dengan dukungan tanda kutip ganda (untuk CSV). */
export function splitLine(line: string, delim: string): string[] {
  if (delim === "\t" || !line.includes('"')) return line.split(delim);
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function normKey(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_()..]/g, "_");
}

export type FileKind = "stock" | "racks" | "unknown";

export function detectKind(headers: string[]): FileKind {
  const set = new Set(headers.map(normKey));
  if (set.has("occupied_cbm") || set.has("sum(stock)") || set.has("sku_cbm"))
    return "stock";
  if (set.has("max_volume") || set.has("max_quantity") || set.has("position"))
    return "racks";
  return "unknown";
}

export interface ParsedTable {
  kind: FileKind;
  headers: string[];
  rows: string[][];
  delimiter: string;
}

/** Parse teks penuh menjadi tabel mentah. Baris kosong diabaikan. */
export function parseDelimited(text: string): ParsedTable {
  const lines = text.split(/\r\n|\n|\r/);
  let hi = 0;
  while (hi < lines.length && !lines[hi].trim()) hi++;
  if (hi >= lines.length)
    return { kind: "unknown", headers: [], rows: [], delimiter: "\t" };
  const delimiter = detectDelimiter(lines[hi]);
  const headers = splitLine(lines[hi], delimiter).map((h) => h.trim());
  const rows: string[][] = [];
  for (let i = hi + 1; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln || !ln.trim()) continue;
    rows.push(splitLine(ln, delimiter));
  }
  return { kind: detectKind(headers), headers, rows, delimiter };
}

function indexer(headers: string[]): (row: string[], key: string) => string {
  const idx = new Map<string, number>();
  headers.forEach((h, i) => idx.set(normKey(h), i));
  return (row, key) => {
    const i = idx.get(key);
    return i === undefined ? "" : (row[i] ?? "").trim();
  };
}

export function toStockRows(t: ParsedTable, src: string): StockRow[] {
  const g = indexer(t.headers);
  const out: StockRow[] = [];
  for (const r of t.rows) {
    const rack = g(r, "rack_name");
    out.push({
      src,
      location_id: g(r, "location_id"),
      product_id: g(r, "fpd.product_id") || g(r, "product_id"),
      product_name: g(r, "product_name"),
      sku_number: g(r, "sku_number"),
      l1_category_name: g(r, "l1_category_name") || "(Tanpa Kategori)",
      rack_storage_name: g(r, "rack_storage_name"),
      rack_name: rack,
      zone: g(r, "zone"),
      rack_zone: g(r, "rack_zone"),
      aisle: g(r, "aisle"),
      bay: g(r, "bay"),
      level: g(r, "level"),
      bin: g(r, "bin"),
      status: g(r, "product_detail_status_name") || "Available",
      stock_qty: parseNumber(g(r, "sum(stock)") || g(r, "stock")),
      sku_cbm: parseNumber(g(r, "sku_cbm")),
      length: parseNumber(g(r, "length")),
      width: parseNumber(g(r, "width")),
      height: parseNumber(g(r, "height")),
      occupied_cbm: parseNumber(g(r, "occupied_cbm")),
    });
  }
  return out;
}

export function toRackRows(t: ParsedTable, src: string): RackRow[] {
  const g = indexer(t.headers);
  const seen = new Map<string, RackRow>();
  for (const r of t.rows) {
    const rack = g(r, "rack_name");
    if (!rack) continue;
    const storage = g(r, "rack_storage_name");
    seen.set(rack, {
      rack_name: rack,
      src,
      location_id: g(r, "location_id"),
      location_name: g(r, "location_name"),
      area: g(r, "area"),
      zone: g(r, "zone"),
      aisle: g(r, "aisle"),
      bay: g(r, "bay"),
      level: g(r, "level"),
      bin: g(r, "bin"),
      active: g(r, "active").toLowerCase() !== "false",
      max_quantity: parseNumber(g(r, "max_quantity")),
      max_volume: parseNumber(g(r, "max_volume")),
      handling: normalizeHandling(storage),
      rack_storage_name: storage,
    });
  }
  return Array.from(seen.values());
}
