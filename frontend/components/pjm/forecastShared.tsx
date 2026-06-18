"use client";

import type { CSSProperties } from "react";

export interface ForecastMetricDefinition<K extends string> {
  key: K;
  label: string;
  defaultVisible: boolean;
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

export function fmtMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString();
}

export function fmtSignedMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString()}`;
}

export function fmtForecastHourHeader(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${value}Z`);
  if (Number.isNaN(date.getTime())) return fmtDateTime(value);
  const day = date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const dateNum = date.toLocaleDateString("en-US", { day: "2-digit", timeZone: "UTC" });
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
  return `${day} ${month}-${dateNum}${weekend ? " W" : ""}`;
}

export function heNumber(value: string): number | null {
  const match = value.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function avg(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value !== null);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

export function heatCellStyle(
  value: number | null,
  min: number,
  max: number,
): CSSProperties | undefined {
  if (value === null || max === min) return undefined;
  const ratio = (value - min) / (max - min);
  const hue = 140 - ratio * 140;
  return {
    backgroundColor: `hsla(${hue}, 70%, 34%, 0.34)`,
    color: "#f8fafc",
  };
}

export function deltaCellStyle(value: number | null, bound: number): CSSProperties | undefined {
  if (value === null || bound <= 0) return undefined;
  const ratio = Math.min(Math.abs(value) / bound, 1);
  const hue = value >= 0 ? 0 : 140;
  return {
    backgroundColor: `hsla(${hue}, 70%, 34%, ${0.12 + ratio * 0.34})`,
    color: "#f8fafc",
  };
}

export function ForecastHeatmapToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={onToggle}
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
        enabled
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
      }`}
    >
      Heatmap
    </button>
  );
}

export function ForecastMetricToggleGroup<K extends string>({
  metrics,
  visibleMetrics,
  onToggle,
  label = "Rows",
}: {
  metrics: Array<ForecastMetricDefinition<K>>;
  visibleMetrics: Set<K>;
  onToggle: (key: K) => void;
  label?: string;
}) {
  return (
    <div>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {metrics.map((metric) => (
          <button
            key={metric.key}
            type="button"
            aria-pressed={visibleMetrics.has(metric.key)}
            onClick={() => onToggle(metric.key)}
            className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
              visibleMetrics.has(metric.key)
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
            }`}
          >
            {metric.label}
          </button>
        ))}
      </div>
    </div>
  );
}
