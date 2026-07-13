"use client";

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

ChartJS.defaults.font.family = '"Nunito Sans", system-ui, sans-serif';
ChartJS.defaults.font.size = 11;
ChartJS.defaults.color = "#64748B";

export const FIT_PALETTE = [
  "#3C83F6",
  "#45112A",
  "#0E9F6E",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#14B8A6",
  "#F472B6",
  "#64748B",
  "#A855F7",
];

const gridOpts = { color: "#F1F5F9" };

export function BarChart({
  labels,
  values,
  colors,
  horizontal,
  suffix = "",
  height = 240,
}: {
  labels: string[];
  values: number[];
  colors?: string[];
  horizontal?: boolean;
  suffix?: string;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <Bar
        data={{
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: colors || "#3C83F6",
              borderRadius: 5,
              maxBarThickness: 34,
            },
          ],
        }}
        options={{
          indexAxis: horizontal ? ("y" as const) : ("x" as const),
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (c) => ` ${Number(c.parsed[horizontal ? "x" : "y"]).toLocaleString("id-ID", { maximumFractionDigits: 2 })}${suffix}`,
              },
            },
          },
          scales: {
            x: { grid: horizontal ? gridOpts : { display: false } },
            y: { grid: horizontal ? { display: false } : gridOpts },
          },
        }}
      />
    </div>
  );
}

export function DoughnutChart({
  labels,
  values,
  colors,
  height = 240,
}: {
  labels: string[];
  values: number[];
  colors: string[];
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <Doughnut
        data={{
          labels,
          datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: "62%",
          plugins: { legend: { position: "bottom" as const, labels: { boxWidth: 10, padding: 12 } } },
        }}
      />
    </div>
  );
}

export function LineChart({
  labels,
  series,
  suffix = "",
  height = 260,
}: {
  labels: string[];
  series: { label: string; data: number[]; color: string }[];
  suffix?: string;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <Line
        data={{
          labels,
          datasets: series.map((s) => ({
            label: s.label,
            data: s.data,
            borderColor: s.color,
            backgroundColor: `${s.color}22`,
            fill: series.length === 1,
            tension: 0.35,
            pointRadius: 3,
            borderWidth: 2,
          })),
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom" as const, labels: { boxWidth: 10, padding: 12 } },
            tooltip: {
              callbacks: {
                label: (c) => ` ${c.dataset.label}: ${Number(c.parsed.y).toLocaleString("id-ID", { maximumFractionDigits: 2 })}${suffix}`,
              },
            },
          },
          scales: { x: { grid: { display: false } }, y: { grid: gridOpts } },
        }}
      />
    </div>
  );
}

/* ================= Komponen tambahan (ringkas & mobile-friendly) ================= */

/** Garis mini tanpa sumbu — untuk KPI card. */
export function SparkLine({
  data,
  color = "#3C83F6",
  height = 34,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  if (data.length < 2) return <div style={{ height }} />;
  return (
    <div style={{ height }}>
      <Line
        data={{
          labels: data.map((_, i) => i),
          datasets: [
            {
              data,
              borderColor: color,
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.35,
              fill: true,
              backgroundColor: (ctx) => {
                const { chart } = ctx;
                const { ctx: c, chartArea } = chart;
                if (!chartArea) return "transparent";
                const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                g.addColorStop(0, color + "33");
                g.addColorStop(1, color + "00");
                return g;
              },
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 500 },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false } },
        }}
      />
    </div>
  );
}

/** Bar bertumpuk — komposisi status per gudang. */
export function StackedBarChart({
  labels,
  stacks,
  horizontal,
  height = 240,
}: {
  labels: string[];
  stacks: { label: string; values: number[]; color: string }[];
  horizontal?: boolean;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <Bar
        data={{
          labels,
          datasets: stacks.map((s) => ({
            label: s.label,
            data: s.values,
            backgroundColor: s.color,
            borderRadius: 3,
            maxBarThickness: 26,
          })),
        }}
        options={{
          indexAxis: horizontal ? ("y" as const) : ("x" as const),
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom" as const, labels: { boxWidth: 9, padding: 10 } },
            tooltip: {
              callbacks: {
                label: (c) =>
                  ` ${c.dataset.label}: ${Number(c.parsed[horizontal ? "x" : "y"]).toLocaleString("id-ID")} SLOC`,
              },
            },
          },
          scales: {
            x: { stacked: true, grid: horizontal ? gridOpts : { display: false } },
            y: { stacked: true, grid: horizontal ? { display: false } : gridOpts },
          },
        }}
      />
    </div>
  );
}

/** Pareto — bar volume + garis kumulatif %. */
export function ParetoChart({
  labels,
  values,
  height = 260,
  suffix = " m³",
}: {
  labels: string[];
  values: number[];
  height?: number;
  suffix?: string;
}) {
  const total = values.reduce((s, v) => s + v, 0) || 1;
  let run = 0;
  const cum = values.map((v) => {
    run += v;
    return +((run / total) * 100).toFixed(1);
  });
  return (
    <div style={{ height }}>
      <Bar
        data={{
          labels,
          datasets: [
            {
              type: "bar" as const,
              label: "Volume",
              data: values,
              backgroundColor: "#3C83F6",
              borderRadius: 5,
              maxBarThickness: 30,
              yAxisID: "y",
              order: 2,
            },
            {
              type: "line" as const,
              label: "Kumulatif %",
              data: cum,
              borderColor: "#45112A",
              backgroundColor: "#45112A",
              borderWidth: 2,
              pointRadius: 3,
              tension: 0.3,
              yAxisID: "y1",
              order: 1,
            } as never,
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom" as const, labels: { boxWidth: 9, padding: 10 } },
            tooltip: {
              callbacks: {
                label: (c) =>
                  c.dataset.label === "Kumulatif %"
                    ? ` Kumulatif ${c.parsed.y}%`
                    : ` ${Number(c.parsed.y).toLocaleString("id-ID", { maximumFractionDigits: 2 })}${suffix}`,
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 30 } },
            y: { grid: gridOpts, title: { display: false } },
            y1: {
              position: "right" as const,
              min: 0,
              max: 100,
              grid: { display: false },
              ticks: { callback: (v) => v + "%" },
            },
          },
        }}
      />
    </div>
  );
}

/** Area bertumpuk — evolusi jumlah SLOC bermasalah dari waktu ke waktu. */
export function StackedAreaChart({
  labels,
  series,
  height = 250,
}: {
  labels: string[];
  series: { label: string; data: number[]; color: string }[];
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <Line
        data={{
          labels,
          datasets: series.map((s) => ({
            label: s.label,
            data: s.data,
            borderColor: s.color,
            backgroundColor: s.color + "3D",
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.3,
            fill: true,
            stack: "s",
          })),
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index" as const, intersect: false },
          plugins: {
            legend: { position: "bottom" as const, labels: { boxWidth: 9, padding: 10 } },
            tooltip: {
              callbacks: {
                label: (c) => ` ${c.dataset.label}: ${Number(c.parsed.y).toLocaleString("id-ID")} SLOC`,
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
            y: { stacked: true, grid: gridOpts, beginAtZero: true },
          },
        }}
      />
    </div>
  );
}
