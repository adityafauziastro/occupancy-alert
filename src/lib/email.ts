// ============================================================
// Rute email alert (tanpa server — via mailto:)
// Penerima = Master Role per gudang (SPV/Manager/Senior Manager/Head)
// dengan tingkat minimum; email terkirim lewat aplikasi email pengguna.
// ============================================================

import type { AlertRow, AppConfig, Recipient, Sev } from "./config";
import { SEV_RANK } from "./config";
import { fmtPct, todayKey } from "./format";

/** Tingkat tertinggi di antara sekumpulan alert aktif. */
export function maxSevOf(alerts: AlertRow[]): Sev | null {
  let max: Sev | null = null;
  for (const a of alerts) {
    if (max === null || SEV_RANK[a.severity] > SEV_RANK[max]) max = a.severity;
  }
  return max;
}

/**
 * Penerima yang berhak menerima rekap sebuah gudang:
 * cocok gudang (atau "ALL") DAN tingkat alert tertinggi >= minSev penerima.
 */
export function recipientsFor(
  cfg: AppConfig,
  wh: string,
  alerts: AlertRow[]
): Recipient[] {
  const top = maxSevOf(alerts);
  if (!top) return [];
  return cfg.recipients.filter(
    (r) =>
      (r.wh === wh || r.wh === "ALL") &&
      r.email.includes("@") &&
      SEV_RANK[top] >= SEV_RANK[r.minSev]
  );
}

const SEV_LABEL: Record<Sev, string> = {
  overload: "OVERLOAD",
  critical: "CRITICAL",
  warning: "WARNING",
  info: "INFO",
};

/** Susun tautan mailto: rekap alert satu gudang (ringkas, aman batas URL). */
export function buildAlertMailto(
  wh: string,
  whName: string,
  alerts: AlertRow[],
  recipients: Recipient[]
): { href: string; to: string[]; subject: string } {
  const sorted = [...alerts].sort(
    (a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.value - a.value
  );
  const count = (s: Sev) => sorted.filter((a) => a.severity === s).length;
  const ov = count("overload");
  const cr = count("critical");
  const wa = count("warning");
  const inf = count("info");

  const subject = `[OAS] ${wh} — ${ov} Overload · ${cr} Critical · ${wa} Warning (${todayKey()})`;

  const lines: string[] = [
    `Rekap Alert OAS — ${wh}${whName && whName !== wh ? ` (${whName})` : ""} — ${todayKey()}`,
    `Overload: ${ov} · Critical: ${cr} · Warning: ${wa} · Info: ${inf}`,
    ``,
    `ALERT TERATAS:`,
  ];
  const MAXL = 12;
  sorted.slice(0, MAXL).forEach((a, i) => {
    const loc = a.rack_name || a.wh;
    const brief =
      a.type === "OCCUPANCY"
        ? `Okupansi ${fmtPct(a.value)}`
        : a.type === "DIMENSION"
          ? `Dimensi SKU ${fmtPct(a.value)} dari kapasitas`
          : a.type === "MISMATCH"
            ? `Mismatch suhu (${a.value} kategori)`
            : `${a.value} SLOC kapasitas fallback`;
    lines.push(`${i + 1}. [${SEV_LABEL[a.severity]}] ${loc} — ${brief}`);
  });
  if (sorted.length > MAXL) lines.push(`(+${sorted.length - MAXL} alert lainnya di aplikasi OAS)`);
  lines.push(``, `Mohon tindak lanjut sesuai prioritas. Detail lengkap ada di OAS.`, `— FIT · Occupancy Alert System`);

  let body = lines.join("\r\n");
  if (body.length > 1600) body = body.slice(0, 1580) + "\r\n(terpotong)";

  const to = recipients.map((r) => r.email);
  const href = `mailto:${encodeURIComponent(to.join(","))}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { href, to, subject };
}
