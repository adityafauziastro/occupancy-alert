const nf0 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export function fmtInt(v: number): string {
  return nf0.format(v || 0);
}

export function fmtCbm(v: number): string {
  return `${nf2.format(v || 0)} m³`;
}

export function fmtNum(v: number): string {
  return nf2.format(v || 0);
}

export function fmtPct(v: number): string {
  return `${nf2.format(v || 0)}%`;
}

export function fmtQty(v: number): string {
  if (v >= 1000) return `${nf2.format(v / 1000)}rb`;
  return nf0.format(v);
}

export function fmtDateTime(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function todayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
