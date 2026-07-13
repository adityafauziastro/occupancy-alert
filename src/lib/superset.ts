// ============================================================
// Superset Live Sync — "metode cookie", tanpa API key / akses DB
// ------------------------------------------------------------
// Cara kerja (meniru persis apa yang dilakukan UI Superset di browser):
//   1. Pengguna menyalin header Cookie sesi login dari DevTools (sekali,
//      berlaku sampai sesi kedaluwarsa).
//   2. Browser OAS memanggil proxy lokal /api/superset (Next.js Route
//      Handler) — fetch server-side bebas CORS — yang meneruskan request
//      ke Superset dengan Cookie tsb.
//   3. GET  /api/v1/security/csrf_token/  → token CSRF (wajib untuk POST)
//      GET  /api/v1/chart/{id}            → query_context tersimpan chart
//      POST /api/v1/chart/data            → data JSON, dengan override:
//        force=true (lewati cache), row_limit=pageSize, offset=n×pageSize
//        → paginasi menembus batas baris Superset (50K).
//   4. Hasil di-ingest ke IndexedDB sebagai src "superset:{nama}" —
//      tarikan berikutnya menimpa data sumber itu saja (pola chunk aman).
// Cookie hanya tersimpan lokal (IndexedDB) dan hanya dikirim ke Superset
// lewat proxy localhost — tidak pernah ke pihak ketiga.
// ============================================================

import type { AppConfig, SupersetSource } from "./config";
import { detectKind, type ParsedTable } from "./parser";
import { ingestParsed } from "./ingest";
import { recomputeAll } from "./compute";
import { setMeta, getMeta } from "./db";

export interface ProxyResponse {
  status: number;
  ok: boolean;
  redirected: boolean;
  body: string;
  contentType: string;
}

export type ProxyFetch = (payload: {
  baseUrl: string;
  path: string;
  method?: string;
  cookie: string;
  csrf?: string;
  body?: unknown;
}) => Promise<ProxyResponse>;

/** Hanya endpoint API v1 Superset yang boleh diproksikan. */
export function sanitizePath(path: string): string {
  if (!path.startsWith("/api/v1/")) throw new Error("Path di luar /api/v1/ ditolak");
  return path;
}

const defaultProxyFetch: ProxyFetch = async (payload) => {
  const res = await fetch("/api/superset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Proxy lokal gagal (${res.status})`);
  return (await res.json()) as ProxyResponse;
};

export interface SourceStatus {
  ok: boolean;
  rows: number;
  pages: number;
  ms: number;
  at: number;
  kind?: string;
  error?: string;
}
export type SupersetStatusMap = Record<string, SourceStatus>;

function authError(r: ProxyResponse): string | null {
  if (r.redirected || r.status === 401 || r.status === 403)
    return "Sesi ditolak — cookie kedaluwarsa/salah. Salin ulang dari DevTools.";
  return null;
}

export function makeSupersetClient(
  sp: AppConfig["superset"],
  proxyFetch: ProxyFetch = defaultProxyFetch
) {
  const base = sp.baseUrl.replace(/\/+$/, "");
  const call = (path: string, method = "GET", body?: unknown, csrf?: string) =>
    proxyFetch({ baseUrl: base, path: sanitizePath(path), method, cookie: sp.cookie, csrf, body });

  async function getCsrf(): Promise<string> {
    const r = await call("/api/v1/security/csrf_token/");
    const err = authError(r);
    if (err) throw new Error(err);
    if (!r.ok) throw new Error(`CSRF gagal (HTTP ${r.status})`);
    const j = JSON.parse(r.body) as { result?: string };
    if (!j.result) throw new Error("Token CSRF kosong");
    return j.result;
  }

  /** Uji koneksi + login: cukup ambil token CSRF. */
  async function testConnection(): Promise<{ ok: true }> {
    await getCsrf();
    return { ok: true };
  }

  async function getQueryContext(chartId: number): Promise<Record<string, unknown>> {
    const r = await call(`/api/v1/chart/${chartId}`);
    const err = authError(r);
    if (err) throw new Error(err);
    if (r.status === 404) throw new Error(`Chart ${chartId} tidak ditemukan`);
    if (!r.ok) throw new Error(`Ambil chart gagal (HTTP ${r.status})`);
    const j = JSON.parse(r.body) as { result?: { query_context?: string | null } };
    const qcRaw = j.result?.query_context;
    if (!qcRaw)
      throw new Error(
        "query_context kosong — buka chart di Superset lalu Save sekali agar konteksnya tersimpan"
      );
    return JSON.parse(qcRaw) as Record<string, unknown>;
  }

  /**
   * Tarik SELURUH baris sebuah chart dengan paginasi offset
   * (menembus batas row Superset). Mengembalikan tabel siap-ingest.
   */
  async function pullChartAll(
    source: SupersetSource,
    onPage?: (page: number, rows: number) => void
  ): Promise<{ headers: string[]; rows: string[][]; pages: number }> {
    const qc = await getQueryContext(source.chartId);
    const csrf = await getCsrf();
    const pageSize = Math.max(1, Math.min(50000, source.pageSize || 20000));
    const MAX_PAGES = 60;

    qc["force"] = true;
    qc["result_format"] = "json";
    qc["result_type"] = "full";
    const queries = (qc["queries"] as Record<string, unknown>[]) || [];
    if (!queries.length) throw new Error("query_context tanpa queries");
    const q = queries[0];

    let headers: string[] = [];
    const rows: string[][] = [];
    let page = 0;

    for (; page < MAX_PAGES; page++) {
      q["row_limit"] = pageSize;
      q["offset"] = page * pageSize;
      const r = await call("/api/v1/chart/data", "POST", qc, csrf);
      const err = authError(r);
      if (err) throw new Error(err);
      if (!r.ok) throw new Error(`chart/data gagal (HTTP ${r.status}) hal.${page + 1}`);
      const j = JSON.parse(r.body) as {
        result?: { colnames?: string[]; data?: Record<string, unknown>[] }[];
      };
      const res0 = j.result?.[0];
      const data = res0?.data || [];
      if (!headers.length) headers = res0?.colnames || Object.keys(data[0] || {});
      for (const obj of data) {
        rows.push(headers.map((h) => (obj[h] === null || obj[h] === undefined ? "" : String(obj[h]))));
      }
      onPage?.(page + 1, rows.length);
      if (data.length < pageSize) break; // halaman terakhir
    }
    return { headers, rows, pages: Math.min(page + 1, MAX_PAGES) };
  }

  return { testConnection, getCsrf, getQueryContext, pullChartAll };
}

/** Tarik semua sumber terkonfigurasi → ingest → hitung ulang. */
export async function syncSupersetAll(
  cfg: AppConfig,
  opts?: {
    proxyFetch?: ProxyFetch;
    onStatus?: (map: SupersetStatusMap) => void;
    skipRecompute?: boolean;
  }
): Promise<SupersetStatusMap> {
  const sp = cfg.superset;
  const client = makeSupersetClient(sp, opts?.proxyFetch);
  const status: SupersetStatusMap =
    (await getMeta<SupersetStatusMap>("supersetStatus")) || {};
  let anyOk = false;

  for (const src of sp.sources) {
    const t0 = Date.now();
    try {
      const { headers, rows, pages } = await client.pullChartAll(src);
      const table: ParsedTable = {
        kind: detectKind(headers),
        headers,
        rows,
        delimiter: "\t",
      };
      if (table.kind === "unknown")
        throw new Error("Kolom tidak dikenali (bukan Stock on Hand / Rack Master)");
      const r = await ingestParsed(table, `superset:${src.name}`, {
        size: rows.length,
        lastModified: Date.now(),
        connected: true,
      });
      status[src.id] = {
        ok: true, rows: r.rows, pages, ms: Date.now() - t0, at: Date.now(), kind: r.kind,
      };
      anyOk = true;
    } catch (e) {
      status[src.id] = {
        ok: false, rows: 0, pages: 0, ms: Date.now() - t0, at: Date.now(),
        error: e instanceof Error ? e.message : String(e),
      };
    }
    opts?.onStatus?.({ ...status });
    await setMeta("supersetStatus", status);
  }

  if (anyOk && !opts?.skipRecompute) {
    await recomputeAll(cfg);
    await setMeta("lastSync", Date.now());
  }
  return status;
}
