import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mode server (bukan static export): dibutuhkan oleh proxy lokal
  // /api/superset yang meneruskan permintaan ke Superset memakai cookie sesi
  // — menembus CORS tanpa server eksternal. Jalankan: npm run dev / npm start.
};

export default nextConfig;
