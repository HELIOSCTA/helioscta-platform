"use client";

import type { CSSProperties, ReactNode } from "react";

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

export type ForecastYAxisDomain = [number, number];

export function autoscaledYAxisDomain({
  rows,
  keys,
  minPadding = 250,
  paddingRatio = 0.08,
  clampNonNegative = true,
}: {
  rows: Array<Record<string, number | null | undefined>>;
  keys: string[];
  minPadding?: number;
  paddingRatio?: number;
  clampNonNegative?: boolean;
}): ForecastYAxisDomain | undefined {
  const values = rows.flatMap((row) =>
    keys
      .map((key) => row[key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
  );
  if (!values.length) return undefined;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const magnitude = Math.max(Math.abs(min), Math.abs(max), 1);
  const padding =
    range > 0 ? Math.max(range * paddingRatio, minPadding) : Math.max(magnitude * 0.02, minPadding);
  let lower = min - padding;
  const upper = max + padding;

  if (clampNonNegative && min >= 0 && lower < 0) lower = 0;

  return [Math.floor(lower), Math.ceil(upper)];
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

export function compareLevelCellStyle(
  value: number | null,
  min: number,
  max: number,
  tone: "base" | "compare",
): CSSProperties | undefined {
  if (value === null || max === min) return undefined;
  const ratio = Math.min(Math.max((value - min) / (max - min), 0), 1);
  const alpha = 0.08 + ratio * 0.22;
  const [r, g, b] = tone === "base" ? [96, 165, 250] : [251, 146, 60];
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`,
    boxShadow: `inset 0 -1px 0 rgba(${r}, ${g}, ${b}, ${(alpha + 0.1).toFixed(2)})`,
    color: "#f8fafc",
  };
}

export function compareDeltaCellStyle(
  value: number | null,
  bound: number,
): CSSProperties | undefined {
  if (value === null || bound <= 0) return undefined;
  const ratio = Math.min(Math.abs(value) / bound, 1);
  const alpha = 0.08 + ratio * 0.3;
  const [r, g, b] =
    value > 0 ? [52, 211, 153] : value < 0 ? [248, 113, 113] : [148, 163, 184];
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`,
    color: "#f8fafc",
  };
}

export const FORECAST_EXPLORER_TABLE_CLASS =
  "w-max table-auto border-collapse bg-[#0d1119] text-[11px] text-gray-200";
export const FORECAST_EXPLORER_ROW_HEADER_COL_CLASS = "w-[150px]";
export const FORECAST_EXPLORER_DATE_COL_CLASS = "w-[96px]";

export const FORECAST_POPUP_TABLE_CLASS =
  "w-max table-auto border-collapse bg-[#0d1119] text-[11px] text-gray-200";
export const FORECAST_POPUP_PINNED_SHADOW = "shadow-[2px_0_0_rgba(31,41,55,0.9)]";
export const FORECAST_POPUP_PINNED_LEFT_CLASSES = ["left-0", "left-[104px]", "left-[246px]"] as const;
export const FORECAST_POPUP_DESCRIPTOR_COL_CLASSES = ["w-[104px]", "w-[142px]", "w-[78px]"] as const;
export const FORECAST_POPUP_METRIC_COL_CLASS = "w-[82px]";
export const FORECAST_POPUP_HOUR_COL_CLASS = "w-[62px]";

export function forecastPopupColCount(metricCount: number): number {
  return 3 + metricCount + 24;
}

export function forecastPopupMinWidthClass(metricCount: number): string {
  return metricCount >= 4 ? "min-w-[2140px]" : "min-w-[2060px]";
}

export function forecastPopupHourDividerClass(hour: number): string {
  return hour % 6 === 0 ? "border-l border-gray-700/90" : "border-l border-gray-800/80";
}

export function forecastPopupMetricBorderClass(metricIndex: number): string {
  return metricIndex === 0 ? "border-l border-gray-700/90" : "border-l border-gray-800/80";
}

export function ForecastPopupColGroup({ metricCount }: { metricCount: number }) {
  return (
    <colgroup>
      {FORECAST_POPUP_DESCRIPTOR_COL_CLASSES.map((className, index) => (
        <col key={`descriptor-${index}`} className={className} />
      ))}
      {Array.from({ length: metricCount }, (_, index) => (
        <col key={`metric-${index}`} className={FORECAST_POPUP_METRIC_COL_CLASS} />
      ))}
      {Array.from({ length: 24 }, (_, hour) => (
        <col key={`hour-${hour}`} className={FORECAST_POPUP_HOUR_COL_CLASS} />
      ))}
    </colgroup>
  );
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

export interface ForecastSegmentOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

export function ForecastFilterCard({
  summary,
  children,
}: {
  summary?: string;
  children: ReactNode;
}) {
  return (
    <section className="w-fit max-w-full rounded-lg border border-sky-950/70 bg-[#0d121b] p-3 shadow-xl shadow-black/20 ring-1 ring-white/[0.02] sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
          Forecast Filters
        </h2>
        <span className="h-px flex-1 bg-gray-800" />
        {summary && (
          <span className="truncate text-xs font-semibold text-gray-500">
            {summary}
          </span>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function ForecastControlGroup({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <span className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function ForecastStaticToken({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <ForecastControlGroup label={label}>
      <span
        title={title}
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-gray-800 bg-gray-950/70 px-3 text-xs font-semibold text-sky-100"
      >
        {value}
      </span>
    </ForecastControlGroup>
  );
}

export function ForecastSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  options: Array<ForecastSegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap rounded-md border border-gray-800 bg-gray-950/70 p-0.5 ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={option.title}
            onClick={() => {
              if (!active) onChange(option.value);
            }}
            className={`h-7 shrink-0 rounded px-2.5 text-center text-xs font-semibold transition-colors ${
              active
                ? "bg-sky-500/15 text-white shadow-sm ring-1 ring-inset ring-sky-400/30"
                : "text-gray-500 hover:bg-gray-900 hover:text-gray-200"
            }`}
          >
            <span className="whitespace-nowrap">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ForecastSelectControl({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <ForecastControlGroup label={label}>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-44 max-w-full rounded-md border border-gray-700 bg-gray-900 px-3 text-xs text-gray-200 focus:border-gray-500 focus:outline-none disabled:cursor-default disabled:text-gray-500"
      >
        {!options.length && <option value="">--</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option.slice(0, 10)}
          </option>
        ))}
      </select>
    </ForecastControlGroup>
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
