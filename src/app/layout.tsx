import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "OAS — Occupancy Alert System | FIT",
  description:
    "Occupancy Alert System: monitoring okupansi SLOC gudang Astro berbasis ekspor Superset (Stock on Hand + Rack Master), sepenuhnya client-side.",
};

export const viewport: Viewport = {
  themeColor: "#45112A",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="font-body antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
