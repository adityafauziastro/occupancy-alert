/**
 * OAS — Uji logika inti (parser, kapasitas, klasifikasi, mismatch).
 * Jalankan: npx tsx scripts/logic-test.ts
 */
import { parseNumber, detectDelimiter, detectKind, parseDelimited, toStockRows, toRackRows } from "../src/lib/parser";
import { classifyPct, resolveCapacity, normalizeHandling, isDimOver, HANDLING_RANK, DEFAULT_CONFIG } from "../src/lib/config";
import type { AlertRow, Recipient } from "../src/lib/config";
import { maxSevOf, recipientsFor, buildAlertMailto } from "../src/lib/email";
import { makeSupersetClient, sanitizePath, type ProxyFetch, type ProxyResponse } from "../src/lib/superset";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
}
function close(name: string, got: number, want: number, eps = 1e-9) {
  const ok = Math.abs(got - want) <= eps * Math.max(1, Math.abs(want));
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}\n      got:  ${got}\n      want: ${want}`); }
}

console.log("\n[1] parseNumber — sufiks SI Superset");
close("6.91k = 6910", parseNumber("6.91k"), 6910);
close("576µ = 0.000576", parseNumber("576µ"), 0.000576);
close("13.4m = 0.0134 (mili)", parseNumber("13.4m"), 0.0134);
close("2.5M = 2_500_000", parseNumber("2.5M"), 2_500_000);
close("1.2G = 1.2e9", parseNumber("1.2G"), 1.2e9);
close("plain 42 = 42", parseNumber("42"), 42);
close("1,234.5 (ribuan) = 1234.5", parseNumber("1,234.5"), 1234.5);
close("negatif -3.2k = -3200", parseNumber("-3.2k"), -3200);
eq("kosong → 0", parseNumber(""), 0);
eq("null → 0", parseNumber(null as unknown as string), 0);

console.log("\n[2] detectDelimiter & detectKind");
eq("TSV terdeteksi", detectDelimiter("a\tb\tc\n1\t2\t3"), "\t");
eq("CSV terdeteksi", detectDelimiter("a,b,c\n1,2,3"), ",");
const stockHdr = "location_id\tfpd.product_id\tproduct_name\tsku_number\tl1_category_name\track_storage_name\track_name\tzone\tproduct_detail_status_name\tSUM(stock)\tsku_cbm\toccupied_cbm";
const rackHdr = "location_id\tlocation_name\tid\tposition\track_name\tarea\tzone\taisle\tbay\tlevel\tbin\tactive\tmax_quantity\tmax_volume\track_storage_name";
eq("kind stock", detectKind(parseDelimited(stockHdr + "\n").headers), "stock");
eq("kind racks", detectKind(parseDelimited(rackHdr + "\n").headers), "racks");

console.log("\n[3] Parser end-to-end (baris asli ekspor)");
const stockSample =
  stockHdr +
  "\n819\t12345\tSania Minyak Goreng 2L\tSKU-001\tSembako\tAmbient Racking\tCBT-MZ-A-01-1-A\tMZ\tAvailable\t6.91k\t2.44m\t16.87" +
  "\n819\t22222\tEs Krim Walls\tSKU-002\t\tCold Storage\tCBT-FZ-B-02-1-B\tFrozen\tBad\t12\t576µ\t0.0069";
const st = parseDelimited(stockSample);
const stockRows = toStockRows(st, "chunk1.tsv");
eq("2 baris stok", stockRows.length, 2);
close("qty SI 6.91k", stockRows[0].stock_qty, 6910);
close("occupied 16.87", stockRows[0].occupied_cbm, 16.87);
eq("kategori kosong → (Tanpa Kategori)", stockRows[1].l1_category_name, "(Tanpa Kategori)");
eq("src tag", stockRows[0].src, "chunk1.tsv");

const rackSample =
  rackHdr +
  "\n819\tCibitung\t1\tP1\tCBT-MZ-A-01-1-A\tSTORAGE\tMZ\tA\t01\t1\tA\ttrue\t100\t1\tAmbient Racking" +
  "\n772\tSentul\t2\tP2\tSTL-FZ-B-02-1-B\tSTORAGE\tFrozen\tB\t02\t1\tB\ttrue\t50\t200\tCold Storage" +
  "\n819\tCibitung\t1\tP1\tCBT-MZ-A-01-1-A\tSTORAGE\tMZ\tA\t01\t1\tA\ttrue\t100\t1\tAmbient Racking";
const rk = parseDelimited(rackSample);
const rackRows = toRackRows(rk, "rack.tsv");
eq("dedup rack_name → 2 baris", rackRows.length, 2);
close("max_volume placeholder 1 terbaca", rackRows[0].max_volume, 1);

console.log("\n[4] normalizeHandling & rank suhu");
eq("Cold Storage → FROZEN", normalizeHandling("Cold Storage"), "FROZEN");
eq("Freezer → FROZEN", normalizeHandling("Freezer"), "FROZEN");
eq("Ambient Racking → AMBIENT", normalizeHandling("Ambient Racking"), "AMBIENT");
eq("Chiller → CHILLER", normalizeHandling("Chiller Room"), "CHILLER");
eq("rank FROZEN < CHILLER", HANDLING_RANK.FROZEN < HANDLING_RANK.CHILLER, true);
eq("rank CHILLER < AMBIENT", HANDLING_RANK.CHILLER < HANDLING_RANK.AMBIENT, true);
// mismatch: kategori butuh FROZEN (rank 0) di rak AMBIENT (rank 3) → mismatch
eq("mismatch FROZEN@AMBIENT", HANDLING_RANK.FROZEN < HANDLING_RANK.AMBIENT, true);
// tidak mismatch: kategori AMBIENT di rak FROZEN (lebih dingin selalu aman)
eq("aman AMBIENT@FROZEN", HANDLING_RANK.AMBIENT < HANDLING_RANK.FROZEN, false);

console.log("\n[5] resolveCapacity — model hybrid & placeholder");
const cfg = { ...DEFAULT_CONFIG };
let r = resolveCapacity(cfg, "AMBIENT", "MZ", 1, true);
eq("hybrid: master=1 placeholder → fallback default", [r.source, r.cap, r.suspicious], ["default", cfg.defaultCaps.AMBIENT, true]);
r = resolveCapacity(cfg, "FROZEN", "Frozen", 4.2, true);
eq("hybrid: master wajar dipakai", [r.source, r.cap, r.suspicious], ["master", 4.2, false]);
r = resolveCapacity({ ...cfg, zoneCaps: { Frozen: 3.0 } }, "FROZEN", "Frozen", 1, true);
eq("hybrid: placeholder + override zona", [r.source, r.cap], ["zone", 3.0]);
r = resolveCapacity(cfg, "CHILLER", "Chiller", 0, false);
eq("hybrid: non-master → default", [r.source, r.cap], ["default", cfg.defaultCaps.CHILLER]);
r = resolveCapacity({ ...cfg, capacityModel: "master" }, "AMBIENT", "MZ", 1, true);
eq("master: pakai 1 apa adanya (suspicious tetap ditandai)", [r.source, r.cap, r.suspicious], ["master", 1, true]);
r = resolveCapacity({ ...cfg, capacityModel: "configured" }, "FROZEN", "Frozen", 4.2, true);
eq("configured: abaikan master", [r.source, r.cap], ["default", cfg.defaultCaps.FROZEN]);

console.log("\n[6] classifyPct — ambang status");
eq("74.9 → NORMAL", classifyPct(74.9, cfg.thresholds), "NORMAL");
eq("75 → WARNING", classifyPct(75, cfg.thresholds), "WARNING");
eq("90 → CRITICAL", classifyPct(90, cfg.thresholds), "CRITICAL");
eq("100 → OVERLOAD", classifyPct(100, cfg.thresholds), "OVERLOAD");
eq("134.2 → OVERLOAD", classifyPct(134.2, cfg.thresholds), "OVERLOAD");

console.log("\n[7] isDimOver — volume dimensi vs kapasitas (+toleransi)");
// Dada Ayam PGS-PLA1: 14×5×17 cm = 1190 cm³ = 0.00119 m³ × 2970 qty = 3.5343 m³ vs 2.5 frozen
const dimAyam = (14 * 5 * 17 / 1e6) * 2970;
close("Σ p×l×t×qty benar", dimAyam, 3.5343, 1e-6);
eq("3.53 > 2.5 (+10%) → over", isDimOver(dimAyam, 2.5, 10), true);
eq("2.6 vs 2.5 (+10%=2.75) → aman", isDimOver(2.6, 2.5, 10), false);
eq("tepat di batas 2.75 → aman (harus >)", isDimOver(2.75, 2.5, 10), false);
eq("dim 0 → tidak pernah alert", isDimOver(0, 2.5, 0), false);
eq("kapasitas 0 → tidak alert (hindari div/eror)", isDimOver(5, 0, 0), false);

console.log("\n[8] Rute email — Master Role per gudang");
const mkA = (wh: string, sev: AlertRow["severity"]): AlertRow => ({
  key: `${wh}|${sev}|${Math.random()}`, type: "OCCUPANCY", severity: sev, status: "open",
  rack_name: `${wh}-X`, wh, message: "", value: 90, firstSeen: 1, lastSeen: 1,
});
const R = (wh: string, role: Recipient["role"], minSev: Recipient["minSev"], email = "a@b.c"): Recipient =>
  ({ id: wh + role + minSev, wh, role, name: role, email, minSev });
const cfgR = {
  ...DEFAULT_CONFIG,
  recipients: [
    R("CBT", "SPV", "warning"),
    R("CBT", "Manager", "critical"),
    R("CBT", "Head", "overload"),
    R("ALL", "Senior Manager", "critical"),
    R("STL", "SPV", "warning"),
    R("CBT", "Manager", "critical", "tanpa-at"), // email invalid -> diabaikan
  ],
};
eq("maxSev [warning,critical] = critical", maxSevOf([mkA("CBT","warning"), mkA("CBT","critical")]), "critical");
eq("maxSev [] = null", maxSevOf([]), null);
let got = recipientsFor(cfgR, "CBT", [mkA("CBT","critical")]).map(r => r.role + "|" + r.wh).sort();
eq("CBT critical → SPV+Manager+ALL SM (Head tidak, invalid tidak)",
   got, ["Manager|CBT","SPV|CBT","Senior Manager|ALL"].sort());
got = recipientsFor(cfgR, "CBT", [mkA("CBT","overload")]).map(r => r.role).sort();
eq("CBT overload → semua incl. Head", got, ["Head","Manager","SPV","Senior Manager"].sort());
got = recipientsFor(cfgR, "STL", [mkA("STL","warning")]).map(r => r.role + "|" + r.wh);
eq("STL warning → hanya SPV STL (ALL SM butuh critical)", got, ["SPV|STL"]);
eq("Tanpa alert → tidak ada penerima", recipientsFor(cfgR, "CBT", []).length, 0);
const mail = buildAlertMailto("CBT", "Cibitung FC", [mkA("CBT","overload"), mkA("CBT","critical")], recipientsFor(cfgR, "CBT", [mkA("CBT","overload")]));
eq("mailto: diawali mailto:", mail.href.startsWith("mailto:"), true);
eq("subject memuat gudang & hitungan", mail.subject.includes("CBT") && mail.subject.includes("1 Overload"), true);
eq("4 penerima di to:", mail.to.length, 4);
eq("panjang href aman (<2000)", mail.href.length < 2000, true);

(async () => {
  console.log("\n[9] Superset Live Sync — klien metode cookie (mock proxy)");
  eq("sanitizePath izinkan /api/v1/*", sanitizePath("/api/v1/chart/data"), "/api/v1/chart/data");
  let threw = false;
  try { sanitizePath("/login/"); } catch { threw = true; }
  eq("sanitizePath tolak path lain", threw, true);

  const PAGE = 3;
  const TOTAL = 7; // 3 + 3 + 1 → 3 halaman
  const calls: string[] = [];
  const qcStored = {
    datasource: { id: 1, type: "table" },
    queries: [{ columns: ["rack_name", "occupied_cbm"], row_limit: 50000 }],
  };
  const rowsAll = Array.from({ length: TOTAL }, (_, i) => ({
    rack_name: `CBT-SRA1-${i}`,
    occupied_cbm: i + 0.5,
    max_volume: null,
  }));
  const fake: ProxyFetch = async ({ path, method, body, cookie }): Promise<ProxyResponse> => {
    calls.push(`${method || "GET"} ${path}`);
    const okJson = (o: unknown): ProxyResponse => ({
      status: 200, ok: true, redirected: false, contentType: "application/json", body: JSON.stringify(o),
    });
    if (cookie === "EXPIRED") return { status: 302, ok: false, redirected: true, contentType: "", body: "" };
    if (path === "/api/v1/security/csrf_token/") return okJson({ result: "tok123" });
    if (path === "/api/v1/chart/77") return okJson({ result: { query_context: JSON.stringify(qcStored) } });
    if (path === "/api/v1/chart/data" && method === "POST") {
      const q = (body as { queries: { row_limit: number; offset: number }[] }).queries[0];
      eq(`  force=true di hal offset ${q.offset}`, (body as { force: boolean }).force, true);
      const page = rowsAll.slice(q.offset, q.offset + q.row_limit);
      return okJson({ result: [{ colnames: ["rack_name", "occupied_cbm", "max_volume"], data: page }] });
    }
    return { status: 404, ok: false, redirected: false, contentType: "", body: "" };
  };

  const sp = { baseUrl: "https://superset.example.com/", cookie: "session=abc", pollMin: 5, autoPull: true, sources: [] };
  const client = makeSupersetClient(sp, fake);
  const r = await client.pullChartAll({ id: "s1", name: "soh", chartId: 77, pageSize: PAGE });
  eq("total baris 7 (paginasi 3+3+1)", r.rows.length, TOTAL);
  eq("jumlah halaman 3", r.pages, 3);
  eq("header dari colnames", r.headers, ["rack_name", "occupied_cbm", "max_volume"]);
  eq("null → string kosong", r.rows[0][2], "");
  eq("nilai numerik jadi string", r.rows[0][1], "0.5");
  eq("urutan panggilan: chart meta → csrf → data×3",
     calls.filter((c) => c.includes("chart/data")).length, 3);

  const clientExp = makeSupersetClient({ ...sp, cookie: "EXPIRED" }, fake);
  let msg = "";
  try { await clientExp.testConnection(); } catch (e) { msg = (e as Error).message; }
  eq("cookie kedaluwarsa terdeteksi", msg.includes("kedaluwarsa"), true);
  console.log(`\n=== HASIL: ${pass} lulus, ${fail} gagal ===`);
  if (fail > 0) process.exit(1);
})();
