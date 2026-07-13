"use client";

import { STATUS_META, type CapSource, type OccStatus } from "@/lib/config";
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`fit-card ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5">
      <div className="min-w-0">
        <h3 className="font-display text-[13px] font-bold tracking-tight text-fit-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** Elemen khas OAS: meter kapasitas SLOC. */
export function FillMeter({
  pct,
  status,
  height = 8,
  showLabel = false,
}: {
  pct: number;
  status: OccStatus;
  height?: number;
  showLabel?: boolean;
}) {
  const meta = STATUS_META[status];
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex w-full items-center gap-2">
      <div
        className="relative flex-1 overflow-hidden rounded-full bg-slate-100"
        style={{ height }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${width}%`, background: meta.color }}
        />
        {pct > 100 && (
          <div
            className="absolute inset-y-0 right-0 w-1.5 animate-pulse"
            style={{ background: meta.color }}
          />
        )}
      </div>
      {showLabel && (
        <span
          className="w-16 text-right font-mono-fit text-xs font-semibold tabular-nums"
          style={{ color: meta.color }}
        >
          {pct.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: OccStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: m.color, background: m.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export function CapSourceBadge({
  source,
  suspicious,
}: {
  source: CapSource;
  suspicious?: boolean;
}) {
  const label =
    source === "master" ? "Master" : source === "zone" ? "Override Zona" : "Default";
  const cls =
    source === "master"
      ? "bg-blue-50 text-fit-blue"
      : source === "zone"
        ? "bg-violet-50 text-violet-700"
        : "bg-amber-50 text-amber-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {label}
      {suspicious && <span title="max_volume master terindikasi placeholder">⚠</span>}
    </span>
  );
}

export function SevBadge({ sev }: { sev: string }) {
  const map: Record<string, { l: string; c: string }> = {
    info: { l: "Info", c: "bg-blue-50 text-fit-blue" },
    warning: { l: "Warning", c: "bg-amber-50 text-amber-700" },
    critical: { l: "Critical", c: "bg-red-50 text-red-600" },
    overload: { l: "Overload", c: "bg-purple-50 text-purple-700" },
  };
  const m = map[sev] || map.info;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.c}`}>
      {m.l}
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className="mt-1 font-display text-2xl font-bold tabular-nums"
        style={{ color: accent || "var(--color-fit-ink)" }}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

export function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
  small,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "plum";
  disabled?: boolean;
  small?: boolean;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const size = small ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm";
  const v =
    variant === "primary"
      ? "bg-fit-blue text-white hover:bg-fit-blue-dark"
      : variant === "plum"
        ? "bg-fit-plum text-white hover:opacity-90"
        : variant === "danger"
          ? "bg-red-50 text-red-600 hover:bg-red-100"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  return (
    <button type={type} className={`${base} ${size} ${v}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-600">
      {label && <span className="font-semibold">{label}</span>}
      <select
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-fit-blue focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-fit-plum/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3.5">
          <h3 className="font-display text-base font-bold text-fit-ink">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-fit-blue">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
          <path d="M3 8l9 5 9-5M12 13v8" />
        </svg>
      </div>
      <h3 className="font-display text-base font-bold text-fit-ink">{title}</h3>
      <p className="max-w-sm text-sm text-slate-500">{desc}</p>
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

export function Th({
  children,
  className = "",
  onClick,
  active,
  dir,
}: {
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  active?: boolean;
  dir?: 1 | -1;
}) {
  return (
    <th
      onClick={onClick}
      className={`whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide ${
        active ? "text-fit-blue-dark" : "text-slate-500"
      } ${onClick ? "cursor-pointer select-none hover:text-fit-blue" : ""} ${className}`}
    >
      {children}
      {active ? <span className="ml-0.5">{dir === 1 ? "▲" : "▼"}</span> : null}
    </th>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2 align-middle text-xs text-slate-700 ${className}`}>
      {children}
    </td>
  );
}
