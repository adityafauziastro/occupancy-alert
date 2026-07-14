# OAS — Occupancy Alert System

Aplikasi monitoring okupansi SLOC (storage location) gudang Astro yang **menarik data langsung dari Superset secara otomatis** memakai **metode cookie sesi login** — tanpa API key, tanpa akses database, tanpa Google Sheets, tanpa CSV manual. Seluruh data hidup di **IndexedDB** browser; paginasi offset menembus batas baris Superset.

Dibangun oleh & untuk **FIT (Fulfillment Intelligence Team)**.

## Tech Stack

| Lapisan | Teknologi |
|---|---|
| Framework | Next.js 16 (App Router, static export) |
| UI | Tailwind CSS v4 + FIT Design System (Poppins / Nunito Sans / Inconsolata, biru `#3C83F6`, plum `#45112A`) |
| Penyimpanan lokal | Dexie 4 (IndexedDB) — jutaan baris aman |
| Grafik | Chart.js 4 + react-chartjs-2 |
| State | Zustand |
| Live sync | Proxy lokal (Next.js Route Handler) + cookie sesi Superset — bebas CORS, 100% gratis |
| Auto-sync file | File System Access API (Chrome/Edge desktop) — fallback offline |

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:3000
```

Uji logika inti (parser sufiks SI, model kapasitas, klasifikasi, mismatch):

```bash
npx tsx scripts/logic-test.ts
```

Build produksi (mode server — dibutuhkan proxy lokal `/api/superset`):

```bash
npm run build
npm start          # default port 3000; bebas dijalankan di laptop / VM internal
```

Catatan: static export ditiadakan karena Superset Live Sync memerlukan proxy
server-side untuk menembus CORS. `npm run dev`/`npm start` di mesin sendiri
tetap 100% gratis. Impor file manual tetap tersedia sebagai fallback offline.

## Superset Live Sync — Metode Cookie (utama)

**Prinsip:** OAS meniru persis apa yang dilakukan UI Superset di browser Anda. Karena Anda sudah login, cookie sesi itulah "kuncinya" — tidak perlu API key ataupun akses database.

```
Browser OAS ──▶ /api/superset (proxy lokal Next.js, bebas CORS)
                    │  + Cookie sesi Anda  + X-CSRFToken
                    ▼
              Superset internal
   GET /api/v1/security/csrf_token/   → token CSRF
   GET /api/v1/chart/{id}             → query_context tersimpan chart
   POST /api/v1/chart/data            → data JSON, di-override:
        force=true (lewati cache) · row_limit=pageSize · offset=n×pageSize
        → loop paginasi sampai habis  ⇒ MENEMBUS batas 50K baris
                    ▼
   IndexedDB (src "superset:{nama}") → hitung okupansi → alert → snapshot
```

**Setup (±2 menit):**
1. Halaman **Sinkron Data → Superset Live Sync**: isi URL Superset.
2. Ambil cookie: buka Superset (login) → F12 → Network → klik request mana pun → salin seluruh nilai header **Cookie** → tempel.
3. Tambah sumber: nama (mis. `stock_on_hand`) + **Chart ID** (dari URL `/explore/?slice_id=1234`) untuk chart Stock on Hand & Rack Master.
4. **Tes Koneksi** → **Tarik Sekarang** → centang **Tarik otomatis** (interval menit) → chip **LIVE** menyala di header.

**Keamanan & batasan:**
- Cookie tersimpan **hanya di IndexedDB browser Anda** dan hanya mengalir browser → proxy localhost → Superset internal. Jangan bagikan cookie; itu setara sesi login Anda.
- Sesi kedaluwarsa → status sumber menampilkan pesan jelas; cukup salin ulang cookie.
- "Real-time" = polling per-menit (dapat diatur). Force-refresh memastikan hasil bukan cache Superset.
- Jika `query_context` chart kosong, buka chart di Superset dan **Save** sekali.
- Proxy hanya meneruskan path `/api/v1/*` ke baseUrl yang dikonfigurasi — tidak lebih.

## Jalur Fallback — File Ekspor

Tetap tersedia bila jaringan/VPN ke Superset tidak ada: seret CSV/TSV (chunk aman digabung — **sumber bernama sama saling menimpa**), atau hubungkan file via File System Access API agar terserap otomatis setiap ditimpa (Chrome/Edge desktop).

## Enam Modul

1. **Dashboard** — kartu hero gradien + sparkline tren, insight ringkas otomatis, status SLOC per gudang (bar bertumpuk), distribusi status, **peta panas Zona × Gudang**, **Pareto kategori** (volume + kumulatif %), komposisi handling, dan daftar SLOC paling kritis. Semua chip filter gudang, ringkas & mobile-first.
2. **Explorer** — tabel seluruh SLOC terisi: filter gudang/zona/handling/status, pencarian, sortir, paginasi; klik baris → detail isi SLOC per SKU, sumber kapasitas, catatan mismatch. *SLOC kosong tidak dirinci per baris; jumlahnya dilaporkan sebagai KPI.*
3. **Alerts** — empat jenis alert dengan siklus hidup terbuka → ditindak → selesai; otomatis selesai saat kondisi hilang dan terbuka lagi jika kambuh:
   - `OCCUPANCY` per SLOC (Warning ≥ 75%, Critical ≥ 90%, Overload ≥ 100% — dapat diubah),
   - `DIMENSION` per SLOC — **volume dimensi total SKU (Σ p×l×t × qty, dari kolom length/width/height) melebihi kapasitas lokasi + toleransi**; pemeriksa silang independen terhadap `occupied_cbm` yang menangkap dimensi produk salah / putaway ganda,
   - `MISMATCH` per SLOC (kategori butuh suhu lebih dingin dari tipe rak, mis. Es Krim di rak Ambient),
   - `DATA_CAPACITY` teragregasi per gudang+handling (mencegah banjir alert kualitas data).

   **Email alert ke Master Role**: di Master Data, daftarkan penerima per gudang dengan role **SPV / Manager / Senior Manager / Head** dan tingkat minimum (mis. SPV terima Warning+, Head hanya Overload). Di Pusat Alert, tombol **Kirim Email** per gudang menyusun rekap ringkas dan membukanya lewat aplikasi email (mailto) ke penerima yang cocok — konsisten dengan arsitektur tanpa server. Aturan `ALL` = menerima rekap semua gudang.
4. **Trends** — snapshot harian per gudang + agregat ALL (di-upsert per tanggal), grafik rata-rata okupansi & jumlah SLOC bermasalah, snapshot manual.
5. **Master Data** — ambang status, **alert dimensi fisik (aktif/nonaktif + toleransi %)**, **penerima email alert per gudang (Master Role + tingkat minimum)**, model kapasitas, kapasitas default per handling, override per zona, pemetaan kategori→handling, status stok terhitung (Available/Bad/Lost), interval poll, snapshot otomatis. Semua perubahan memicu hitung ulang penuh.
6. **Sinkron Data** — **Superset Live Sync (metode cookie): koneksi, sumber chart, tarik otomatis per-menit, status per sumber**; impor file manual; auto-sync file terhubung; data contoh; registri sumber (label LIVE untuk sumber Superset); hapus per sumber / semua.

## ⚠ Catatan Kualitas Data Kapasitas (penting)

`max_volume` pada Rack Master **tidak dapat dipakai mentah**:

- Rak ambient (MZ/SR) bernilai `1` — jelas placeholder.
- Rak cold storage bernilai `100` / `200` — bukan m³ realistis untuk satu SLOC.

Karena itu OAS memakai **model kapasitas hybrid** (default): nilai master dipakai hanya jika wajar; nilai placeholder di-fallback ke **kapasitas default per handling** (Ambient/Dry 1,5 m³ · Chiller/Cool 2,0 m³ · Frozen 2,5 m³ — silakan kalibrasi) atau **override per zona**. Setiap SLOC menampilkan lencana sumber kapasitasnya (Master / Override Zona / Default), dan alert `DATA_CAPACITY` merangkum berapa SLOC yang masih memakai fallback per gudang.

**Tindak lanjut yang disarankan:** konfirmasi basis kapasitas riil per tipe rak/zona ke tim gudang, lalu masukkan sebagai override zona di Master Data — atau perbaiki `max_volume` di sumber. Persentase okupansi hanya seakurat kapasitasnya.

## Format File yang Dikenali

Deteksi otomatis dari header (urutan kolom bebas, pemisah `TAB`/`,`/`;`/`|`):

- **Stock on Hand** — wajib mengandung `occupied_cbm` / `SUM(stock)` / `sku_cbm`; kolom dipakai: `rack_name`, `location_id`, `l1_category_name`, `rack_storage_name`, `zone`, `product_detail_status_name`, `sku_number`, `product_name`, dst.
- **Rack Master** — wajib mengandung `max_volume` / `max_quantity` / `position`; kolom dipakai: `rack_name` (kunci join), `location_id`, `zone`, `max_volume`, `rack_storage_name`, `active`, dst.

Angka bersufiks SI dari Superset (`6.91k`, `576µ`, `13.4m`) diparse dengan benar. Kolom `length/width/height` (cm) pada Stock on Hand dipakai untuk alert `DIMENSION`; jika kolom tidak ada, alert dimensi otomatis tidak terpicu.

## Privasi & Batasan

- Data & cookie tidak pernah meninggalkan mesin Anda (proxy berjalan lokal; tanpa telemetri, tanpa pihak ketiga).
- Data terikat ke browser+perangkat tempat impor dilakukan; pengguna lain mengimpor ekspornya sendiri.
- Menghapus site data browser akan menghapus data OAS — cukup impor ulang ekspor terakhir.
