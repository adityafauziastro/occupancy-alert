// ============================================================
// Pipeline ingest & auto-sync
// - Setiap file diberi tag `src` = nama file. Ingest ulang file yang sama
//   akan menghapus baris lama file tsb lalu menulis ulang -> pola ekspor
//   ber-chunk dari Superset (per gudang / per kategori) aman digabung.
// - File System Access API: handle file disimpan di IndexedDB, dipoll
//   berdasarkan lastModified untuk auto-sync tanpa server/API.
// ============================================================

import { getDb, getMeta, setMeta } from "./db";
import { parseDelimited, toRackRows, toStockRows, type FileKind, type ParsedTable } from "./parser";
import type { AppConfig } from "./config";
import { recomputeAll } from "./compute";

export interface IngestResult {
  fileName: string;
  kind: FileKind;
  rows: number;
  ms: number;
}

export interface FileRegistryEntry {
  name: string;
  kind: FileKind;
  rows: number;
  size: number;
  lastModified: number;
  ingestedAt: number;
  connected: boolean;
}

const BATCH = 5000;

export async function ingestText(
  text: string,
  fileName: string,
  meta: { size: number; lastModified: number; connected: boolean },
  onProgress?: (done: number, total: number) => void
): Promise<IngestResult> {
  return ingestParsed(parseDelimited(text), fileName, meta, onProgress);
}

/** Inti ingest — dipakai baik oleh teks CSV/TSV maupun hasil JSON Superset. */
export async function ingestParsed(
  table: ParsedTable,
  fileName: string,
  meta: { size: number; lastModified: number; connected: boolean },
  onProgress?: (done: number, total: number) => void
): Promise<IngestResult> {
  const t0 = performance.now();
  const db = getDb();

  if (table.kind === "stock") {
    const rows = toStockRows(table, fileName);
    await db.stock.where("src").equals(fileName).delete();
    for (let i = 0; i < rows.length; i += BATCH) {
      await db.stock.bulkAdd(rows.slice(i, i + BATCH));
      onProgress?.(Math.min(i + BATCH, rows.length), rows.length);
    }
    await registerFile(fileName, "stock", rows.length, meta);
    return { fileName, kind: "stock", rows: rows.length, ms: performance.now() - t0 };
  }

  if (table.kind === "racks") {
    const rows = toRackRows(table, fileName);
    await db.racks.where("src").equals(fileName).delete();
    for (let i = 0; i < rows.length; i += BATCH) {
      await db.racks.bulkPut(rows.slice(i, i + BATCH));
      onProgress?.(Math.min(i + BATCH, rows.length), rows.length);
    }
    await registerFile(fileName, "racks", rows.length, meta);
    return { fileName, kind: "racks", rows: rows.length, ms: performance.now() - t0 };
  }

  return { fileName, kind: "unknown", rows: 0, ms: performance.now() - t0 };
}

async function registerFile(
  name: string,
  kind: FileKind,
  rows: number,
  meta: { size: number; lastModified: number; connected: boolean }
): Promise<void> {
  const reg = (await getMeta<Record<string, FileRegistryEntry>>("fileRegistry")) || {};
  reg[name] = {
    name,
    kind,
    rows,
    size: meta.size,
    lastModified: meta.lastModified,
    ingestedAt: Date.now(),
    connected: meta.connected,
  };
  await setMeta("fileRegistry", reg);
}

export async function getFileRegistry(): Promise<FileRegistryEntry[]> {
  const reg = (await getMeta<Record<string, FileRegistryEntry>>("fileRegistry")) || {};
  return Object.values(reg).sort((a, b) => b.ingestedAt - a.ingestedAt);
}

export async function removeFileData(name: string): Promise<void> {
  const db = getDb();
  await db.stock.where("src").equals(name).delete();
  await db.racks.where("src").equals(name).delete();
  const reg = (await getMeta<Record<string, FileRegistryEntry>>("fileRegistry")) || {};
  delete reg[name];
  await setMeta("fileRegistry", reg);
  await disconnectHandle(name);
}

export async function ingestFiles(
  files: { text: () => Promise<string>; name: string; size: number; lastModified: number }[],
  cfg: AppConfig,
  connected: boolean,
  onFile?: (r: IngestResult) => void,
  onProgress?: (fileName: string, done: number, total: number) => void
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const f of files) {
    const text = await f.text();
    const r = await ingestText(
      text,
      f.name,
      { size: f.size, lastModified: f.lastModified, connected },
      (d, t) => onProgress?.(f.name, d, t)
    );
    results.push(r);
    onFile?.(r);
  }
  await recomputeAll(cfg);
  await setMeta("lastSync", Date.now());
  return results;
}

// ---------------- File System Access (auto-sync) ----------------

export function fsaSupported(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

type FsHandle = FileSystemFileHandle & {
  queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
};

export async function connectFiles(): Promise<string[]> {
  const picker = (
    window as unknown as {
      showOpenFilePicker: (o: object) => Promise<FsHandle[]>;
    }
  ).showOpenFilePicker;
  const handles = await picker({
    multiple: true,
    types: [
      {
        description: "Ekspor Superset (CSV/TSV)",
        accept: { "text/csv": [".csv", ".tsv", ".txt"] },
      },
    ],
  });
  const stored = (await getMeta<Record<string, FsHandle>>("fsHandles")) || {};
  const names: string[] = [];
  for (const h of handles) {
    stored[h.name] = h;
    names.push(h.name);
  }
  await setMeta("fsHandles", stored);
  return names;
}

export async function getConnectedHandles(): Promise<Record<string, FsHandle>> {
  return (await getMeta<Record<string, FsHandle>>("fsHandles")) || {};
}

export async function disconnectHandle(name: string): Promise<void> {
  const stored = (await getMeta<Record<string, FsHandle>>("fsHandles")) || {};
  if (stored[name]) {
    delete stored[name];
    await setMeta("fsHandles", stored);
  }
}

async function ensurePermission(h: FsHandle): Promise<boolean> {
  try {
    if (h.queryPermission) {
      const q = await h.queryPermission({ mode: "read" });
      if (q === "granted") return true;
    }
    if (h.requestPermission) {
      const r = await h.requestPermission({ mode: "read" });
      return r === "granted";
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Cek seluruh file terhubung; ingest ulang yang berubah (lastModified naik).
 * Mengembalikan daftar nama file yang tersinkron ulang.
 */
export async function pollConnectedFiles(
  cfg: AppConfig,
  opts?: { force?: boolean; interactive?: boolean }
): Promise<string[]> {
  const handles = await getConnectedHandles();
  const reg = (await getMeta<Record<string, FileRegistryEntry>>("fileRegistry")) || {};
  const changed: { handle: FsHandle; file: File }[] = [];
  for (const [name, h] of Object.entries(handles)) {
    try {
      if (opts?.interactive) {
        const ok = await ensurePermission(h);
        if (!ok) continue;
      } else if (h.queryPermission) {
        const q = await h.queryPermission({ mode: "read" });
        if (q !== "granted") continue; // tidak boleh prompt di background
      }
      const file = await h.getFile();
      const prev = reg[name]?.lastModified || 0;
      if (opts?.force || file.lastModified > prev) {
        changed.push({ handle: h, file });
      }
    } catch {
      // file dipindah/dihapus — biarkan, pengguna bisa hubungkan ulang
    }
  }
  if (!changed.length) return [];
  await ingestFiles(
    changed.map((c) => c.file),
    cfg,
    true
  );
  return changed.map((c) => c.file.name);
}
