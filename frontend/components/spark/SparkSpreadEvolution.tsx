"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import PlotCard, { type PlotSeries } from "@/components/dashboard/PlotCard";
import IcePmiCurveTable from "@/components/ice/IcePmiCurveTable";
import StripSelector, { COMPOSITE_OPTIONS, STRIP_MONTHS } from "@/components/spark/StripSelector";
import { seasonalYearColor } from "@/components/spark/seasonalColors";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type {
  PowerEvolutionSnapshotPoint,
  SparkEvolutionPoint,
  SparkEvolutionResponse,
  SparkEvolutionSnapshotPoint,
} from "@/lib/sparkSpreads/evolution";
import {
  DEFAULT_SPARK_GAS_LEG,
  DEFAULT_POWER_SPARK_SPREAD_PRODUCT,
  POWER_SPARK_SPREAD_PRODUCTS,
  SPARK_GAS_LEGS,
  getSparkGasLeg,
  getPowerSparkSpreadProduct,
} from "@/lib/sparkSpreads/products";

const API_TTL_MS = 5 * 60 * 1000;
const VALID_STRIPS: Set<string> = new Set([
  ...STRIP_MONTHS.map((strip) => strip.code),
  ...COMPOSITE_OPTIONS.map((strip) => strip.code),
]);
const POWER_PRICING_WORKSPACE_TABS = ["evolution", "matrix"] as const;
const POWER_PRICING_MODES = ["power", "cal", "spark"] as const;
const MONTH_STRIP_CODES = STRIP_MONTHS.map((strip) => strip.code);
const STRIP_PIN_PARAM = "1";
const STRIP_ORDER: Record<string, number> = {
  F: 0,
  G: 1,
  H: 2,
  J: 3,
  K: 4,
  M: 5,
  N: 6,
  Q: 7,
  U: 8,
  V: 9,
  X: 10,
  Z: 11,
  JF: 0,
  Q1: 0,
  Q2: 3,
  JA: 6,
  Q3: 6,
  Q4: 9,
};
const NEXT_COMPOSITE_STRIP: Record<string, string> = {
  JF: "Q1",
  Q1: "Q2",
  Q2: "Q3",
  JA: "Q3",
  Q3: "Q4",
  Q4: "Q1",
};

type PowerPricingWorkspaceTab = (typeof POWER_PRICING_WORKSPACE_TABS)[number];
type PowerPricingMode = (typeof POWER_PRICING_MODES)[number];
type CalendarEvolutionSnapshotPoint = PowerEvolutionSnapshotPoint & { farPower: number };
type PricingSnapshotPoint = SparkEvolutionSnapshotPoint | PowerEvolutionSnapshotPoint | CalendarEvolutionSnapshotPoint;
type StripSelectionSource = "default" | "manual";

interface TooltipEntry {
  name: string;
  value: number | null;
  color: string;
  payload?: SparkEvolutionPoint;
}

function describeYearIssue(data: SparkEvolutionResponse, year: number): string {
  const diagnostic = data.yearDiagnostics?.[String(year)];
  if (!diagnostic) return "No diagnostic available";
  if (diagnostic.reason === "complete") return `${diagnostic.completePoints} complete points`;
  if (diagnostic.reason === "outside_horizon") return "All legs exist, outside chart horizon";
  if (diagnostic.reason === "missing_components") {
    return `Missing ${diagnostic.missingComponents.slice(0, 3).join(", ")}${
      diagnostic.missingComponents.length > 3 ? "..." : ""
    }`;
  }
  return "No settlement rows";
}

function currentMonthStrip(): string {
  const today = new Date();
  const currentMonthIndex = today.getUTCMonth();
  const currentYear = today.getUTCFullYear();
  const expiry = secondBusinessDayAfterDeliveryMonth(currentMonthIndex + 1, currentYear);
  const todayUtc = Date.UTC(currentYear, currentMonthIndex, today.getUTCDate());
  const defaultMonthIndex = todayUtc > expiry.getTime() ? currentMonthIndex + 1 : currentMonthIndex;
  return MONTH_STRIP_CODES[defaultMonthIndex % MONTH_STRIP_CODES.length] ?? "F";
}

function secondBusinessDayAfterDeliveryMonth(month: number, year: number): Date {
  const date = new Date(Date.UTC(year, month, 1));
  let count = 0;
  while (count < 2) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    if (count < 2) date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

function initialStrip(searchParams: URLSearchParams): string {
  const defaultStrip = currentMonthStrip();
  const candidate =
    searchParams.get("sparkStripSource") === "manual" && searchParams.get("sparkStripPinned") === STRIP_PIN_PARAM
      ? (searchParams.get("sparkStrip") ?? defaultStrip).toUpperCase()
      : defaultStrip;
  return VALID_STRIPS.has(candidate) ? candidate : defaultStrip;
}

function nextMonthStrip(strip: string): string {
  const index = (MONTH_STRIP_CODES as readonly string[]).indexOf(strip);
  if (index === -1) return currentMonthStrip();
  return MONTH_STRIP_CODES[(index + 1) % MONTH_STRIP_CODES.length] ?? "F";
}

function nextCalendarStrip(strip: string): string {
  return NEXT_COMPOSITE_STRIP[strip] ?? nextMonthStrip(strip);
}

function validCalendarStrip(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  return VALID_STRIPS.has(normalized) ? normalized : null;
}

function initialFarStrip(searchParams: URLSearchParams, nearStrip: string): string {
  const near = validCalendarStrip(nearStrip) ?? currentMonthStrip();
  return validCalendarStrip(searchParams.get("calFarStrip")) ?? nextCalendarStrip(near);
}

function calendarFarYear(nearStrip: string, farStrip: string, nearYear: number): number {
  const nearIndex = STRIP_ORDER[nearStrip];
  const farIndex = STRIP_ORDER[farStrip];
  if (nearIndex === undefined || farIndex === undefined) return nearYear;
  return farIndex <= nearIndex ? nearYear + 1 : nearYear;
}

function stripDisplayName(strip: string): string {
  return (
    STRIP_MONTHS.find((option) => option.code === strip)?.name ??
    COMPOSITE_OPTIONS.find((option) => option.code === strip)?.name ??
    strip
  );
}

function peakDisplayName(peak: "onpeak" | "offpeak" | "peakOffpeak"): string {
  if (peak === "peakOffpeak") return "Peak/Off-Peak";
  return peak === "offpeak" ? "Off-Peak" : "On-Peak";
}

function powerRootDisplay(product: { powerRoot: string; spreadRoot: string | null }): string {
  return product.spreadRoot ? `${product.powerRoot} - ${product.spreadRoot}` : product.powerRoot;
}

function initialStripSelectionSource(searchParams: URLSearchParams): StripSelectionSource {
  return searchParams.get("sparkStripSource") === "manual" && searchParams.get("sparkStripPinned") === STRIP_PIN_PARAM
    ? "manual"
    : "default";
}

function initialProductId(searchParams: URLSearchParams): string {
  return getPowerSparkSpreadProduct(searchParams.get("sparkProduct"))?.id ?? DEFAULT_POWER_SPARK_SPREAD_PRODUCT.id;
}

function initialSparkGasLegId(searchParams: URLSearchParams): string {
  return getSparkGasLeg(searchParams.get("sparkGasLeg"))?.id ?? DEFAULT_SPARK_GAS_LEG.id;
}

function initialHeatRate(searchParams: URLSearchParams): number {
  if (searchParams.get("heatRateSource") !== "manual") {
    return DEFAULT_POWER_SPARK_SPREAD_PRODUCT.heatRate;
  }
  const parsed = Number(searchParams.get("heatRate"));
  if (!Number.isFinite(parsed)) return DEFAULT_POWER_SPARK_SPREAD_PRODUCT.heatRate;
  return Math.min(20, Math.max(3, parsed));
}

function initialMode(searchParams: URLSearchParams): PowerPricingMode {
  const rawCandidate = (searchParams.get("pricingMode") ?? searchParams.get("view") ?? "power").toLowerCase();
  const candidate = rawCandidate === "calendar" || rawCandidate === "calender" ? "cal" : rawCandidate;
  return (POWER_PRICING_MODES as readonly string[]).includes(candidate)
    ? (candidate as PowerPricingMode)
    : "power";
}

function initialWorkspaceTab(searchParams: URLSearchParams): PowerPricingWorkspaceTab {
  const candidate = (searchParams.get("pricingView") ?? searchParams.get("pricingTab") ?? "evolution").toLowerCase();
  return (POWER_PRICING_WORKSPACE_TABS as readonly string[]).includes(candidate)
    ? (candidate as PowerPricingWorkspaceTab)
    : "evolution";
}

function defaultYearRange(referenceYear = new Date().getFullYear()): number[] {
  return Array.from({ length: 7 }, (_, index) => referenceYear - 4 + index);
}

function availableYearRange(referenceYear = new Date().getFullYear()): number[] {
  const startYear = 2020;
  const endYear = referenceYear + 2;
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

function normalizeActiveLabel(label: string | number | undefined): number | null {
  if (typeof label === "number" && Number.isFinite(label)) return label;
  if (typeof label === "string" && label.trim()) {
    const parsed = Number(label);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatMoney(value: number | null, decimals: number): string {
  if (value === null) return "--";
  return `$${value.toFixed(decimals)}`;
}

function formatSignedMoney(value: number | null, decimals: number): string {
  if (value === null) return "--";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(decimals)}`;
}

function formatSigned(value: number | null, decimals: number): string {
  if (value === null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(decimals)}`;
}

function latestAvailablePoint(
  data: SparkEvolutionResponse,
  year: number,
): SparkEvolutionSnapshotPoint | null {
  return data.latestByYear[String(year)] ?? null;
}

function latestPowerPoint(
  data: SparkEvolutionResponse,
  year: number,
): PowerEvolutionSnapshotPoint | null {
  return data.latestPowerByYear?.[String(year)] ?? null;
}

function metricSeries(
  data: SparkEvolutionResponse,
  year: number,
  mode: PowerPricingMode,
  farData?: SparkEvolutionResponse | null,
  nearStrip?: string,
  farStrip?: string,
): PricingSnapshotPoint[] {
  if (mode === "spark") return data.seriesByYear[String(year)] ?? [];
  if (mode === "cal") return calendarSeries(data, farData, year, nearStrip ?? data.strip, farStrip ?? farData?.strip ?? "");
  return data.powerSeriesByYear?.[String(year)] ?? [];
}

function calendarSeries(
  nearData: SparkEvolutionResponse,
  farData: SparkEvolutionResponse | null | undefined,
  year: number,
  nearStrip: string,
  farStrip: string,
): CalendarEvolutionSnapshotPoint[] {
  const nearSeries = nearData.powerSeriesByYear?.[String(year)] ?? [];
  const farYear = calendarFarYear(nearStrip, farStrip, year);
  const farSeries = farData?.powerSeriesByYear?.[String(farYear)] ?? [];
  if (!nearSeries.length || !farSeries.length) return [];

  const farByTradeDate = new Map(farSeries.map((point) => [point.tradeDate, point]));
  return nearSeries.flatMap((nearPoint) => {
    const farPoint = farByTradeDate.get(nearPoint.tradeDate);
    if (!farPoint) return [];
    return [{
      tradeDate: nearPoint.tradeDate,
      daysToExpiry: nearPoint.daysToExpiry,
      power: nearPoint.power,
      farPower: farPoint.power,
    }];
  });
}

function latestMetricPoint(
  data: SparkEvolutionResponse,
  year: number,
  mode: PowerPricingMode,
  farData?: SparkEvolutionResponse | null,
  nearStrip?: string,
  farStrip?: string,
): PricingSnapshotPoint | null {
  if (mode === "spark") return latestAvailablePoint(data, year);
  if (mode === "power") return latestPowerPoint(data, year);

  const series = metricSeries(data, year, mode, farData, nearStrip, farStrip);
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const point = series[index];
    if (metricValue(point, mode) !== null) return point;
  }
  return null;
}

function metricValue(
  point: PricingSnapshotPoint,
  mode: PowerPricingMode,
): number | null {
  if (mode === "power") return point.power;
  if (mode === "spark") return "sparkSpread" in point ? point.sparkSpread : null;
  return "farPower" in point ? Number((point.power - point.farPower).toFixed(2)) : null;
}

function hasMetricData(
  data: SparkEvolutionResponse,
  year: number,
  mode: PowerPricingMode,
  farData?: SparkEvolutionResponse | null,
  nearStrip?: string,
  farStrip?: string,
): boolean {
  return metricSeries(data, year, mode, farData, nearStrip, farStrip).some((point) => metricValue(point, mode) !== null);
}

function buildMetricChartData(
  data: SparkEvolutionResponse,
  mode: PowerPricingMode,
  farData?: SparkEvolutionResponse | null,
  nearStrip?: string,
  farStrip?: string,
): SparkEvolutionPoint[] {
  const byDte = new Map<number, SparkEvolutionPoint>();

  for (const year of data.years) {
    const yearKey = String(year);
    for (const point of metricSeries(data, year, mode, farData, nearStrip, farStrip)) {
      const value = metricValue(point, mode);
      if (value === null) continue;

      let row = byDte.get(point.daysToExpiry);
      if (!row) {
        row = { daysToExpiry: point.daysToExpiry };
        byDte.set(point.daysToExpiry, row);
      }
      row[yearKey] = value;
      row[`${yearKey}Date`] = point.tradeDate;
    }
  }

  return Array.from(byDte.values()).sort(
    (first, second) => Number(second.daysToExpiry) - Number(first.daysToExpiry),
  );
}

function metricFormatter(mode: PowerPricingMode): (value: number | null) => string {
  if (mode === "power") return (value) => formatMoney(value, 2);
  return (value) => formatSignedMoney(value, 2);
}

function modeCopy(mode: PowerPricingMode): {
  snapshotLabel: string;
  chartTitle: string;
  chartSubtitlePrefix: string;
  yAxisLabel: string;
  tableValueLabel: string;
  zeroLineLabel: string | null;
} {
  if (mode === "spark") {
    return {
      snapshotLabel: "Spark Spread",
      chartTitle: "Spark Spread Evolution",
      chartSubtitlePrefix: "Power less all-in gas at model heat rate",
      yAxisLabel: "$/MWh",
      tableValueLabel: "Spark",
      zeroLineLabel: "Break-even",
    };
  }
  if (mode === "cal") {
    return {
      snapshotLabel: "Calendar Spread",
      chartTitle: "Calendar Spread Evolution",
      chartSubtitlePrefix: "Near month power less far month power",
      yAxisLabel: "$/MWh",
      tableValueLabel: "Calendar",
      zeroLineLabel: "Flat",
    };
  }
  return {
    snapshotLabel: "Power Outright",
    chartTitle: "Power Outright Evolution",
    chartSubtitlePrefix: "ICE settlement price",
    yAxisLabel: "$/MWh",
    tableValueLabel: "Power",
    zeroLineLabel: null,
  };
}

function CustomTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  valueFormatter: (value: number | null) => string;
}) {
  if (!active || !payload?.length) return null;
  const validEntries = payload.filter((entry) => entry.value !== null && entry.value !== undefined);
  if (!validEntries.length) return null;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm shadow-xl">
      <p className="mb-2 font-semibold text-gray-200">{label}d to expiry</p>
      {validEntries.map((entry) => {
        const tradeDate = entry.payload?.[`${entry.name}Date`];
        const dateLabel = typeof tradeDate === "string" ? tradeDate.slice(0, 10) : "--";
        return (
          <div key={entry.name} className="flex items-center gap-2 py-0.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            <span className="text-gray-400">{entry.name} | {dateLabel}:</span>
            <span className="font-mono text-gray-100">
              {valueFormatter(Number(entry.value))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SparkLineChart({
  chartData,
  activeYears,
  zoomDomain,
  height,
  onHoverDte,
  valueFormatter,
  yAxisLabel,
  zeroLineLabel,
}: {
  chartData: SparkEvolutionPoint[];
  activeYears: number[];
  zoomDomain: [number, number];
  height: number;
  onHoverDte: (dte: number | null) => void;
  valueFormatter: (value: number | null) => string;
  yAxisLabel: string;
  zeroLineLabel: string | null;
}) {
  return (
    <div className="min-w-0 w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 80, left: 10, bottom: 20 }}
          onMouseMove={(state) => onHoverDte(normalizeActiveLabel(state?.activeLabel))}
          onMouseLeave={() => onHoverDte(null)}
        >
          <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
          <XAxis
            dataKey="daysToExpiry"
            type="number"
            domain={zoomDomain}
            allowDataOverflow
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={{ stroke: "#4b5563" }}
            tickLine={false}
            label={{
              value: "Days to Expiry",
              position: "insideBottom",
              offset: -12,
              fill: "#6b7280",
              fontSize: 12,
            }}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={{ stroke: "#4b5563" }}
            tickLine={false}
            tickFormatter={(value: number) => valueFormatter(value)}
            label={{
              value: yAxisLabel,
              angle: -90,
              position: "insideLeft",
              offset: 10,
              fill: "#6b7280",
              fontSize: 12,
            }}
          />
          <Tooltip
            content={<CustomTooltip valueFormatter={valueFormatter} />}
            cursor={{ stroke: "#64748b", strokeDasharray: "4 4", strokeWidth: 1 }}
          />
          <Legend wrapperStyle={{ paddingTop: "16px", fontSize: "13px", color: "#9ca3af" }} />
          {zeroLineLabel ? (
            <ReferenceLine
              y={0}
              stroke="#ef4444"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: zeroLineLabel, position: "right", fill: "#ef4444", fontSize: 11 }}
            />
          ) : null}
          {activeYears.map((year) => (
            <Line
              key={year}
              type="monotone"
              dataKey={String(year)}
              name={String(year)}
              stroke={seasonalYearColor(year)}
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ModeButton({
  title,
  subtitle,
  active = false,
  onClick,
  disabled = false,
}: {
  title: string;
  subtitle: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-12 flex-col justify-center rounded-[6px] px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? "border border-gray-700 bg-gray-800 text-gray-100"
          : disabled
            ? "border border-transparent text-gray-500"
            : "border border-transparent text-gray-300 hover:bg-gray-800/50 hover:text-gray-100"
      }`}
      aria-pressed={active}
    >
      <span className="text-sm font-semibold leading-4">{title}</span>
      <span className="mt-1 text-[11px] leading-3 text-gray-500">{subtitle}</span>
    </button>
  );
}

function ModeTabs({
  mode,
  onModeChange,
}: {
  mode: PowerPricingMode;
  onModeChange: (mode: PowerPricingMode) => void;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-gray-700 bg-gray-900 p-1">
      <ModeButton
        title="Power Outright"
        subtitle="Settlement price"
        active={mode === "power"}
        onClick={() => onModeChange("power")}
      />
      <ModeButton
        title="Calendar"
        subtitle="Near - far term spread"
        active={mode === "cal"}
        onClick={() => onModeChange("cal")}
      />
      <ModeButton
        title="Sparks"
        subtitle="Power - gas x 7.0"
        active={mode === "spark"}
        onClick={() => onModeChange("spark")}
      />
    </div>
  );
}

function ViewTabs({
  workspaceTab,
  mode,
  onWorkspaceTabChange,
}: {
  workspaceTab: PowerPricingWorkspaceTab;
  mode: PowerPricingMode;
  onWorkspaceTabChange: (tab: PowerPricingWorkspaceTab) => void;
}) {
  const matrixEnabled = mode === "power";
  return (
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-gray-700 bg-gray-900 p-1">
      <ModeButton
        title="Evolution"
        subtitle="History and trends"
        active={workspaceTab === "evolution"}
        onClick={() => onWorkspaceTabChange("evolution")}
      />
      <ModeButton
        title="Matrix"
        subtitle={matrixEnabled ? "Month x year scan" : "Power outright only"}
        active={workspaceTab === "matrix" && matrixEnabled}
        onClick={() => onWorkspaceTabChange("matrix")}
        disabled={!matrixEnabled}
      />
    </div>
  );
}

function ProductButton({
  title,
  subtitle,
  active = false,
  disabled = false,
  onClick,
}: {
  title: string;
  subtitle: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[53px] min-w-[86px] rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed ${
        active
          ? "border-sky-400/45 bg-sky-400/15 text-slate-50"
          : disabled
            ? "border-gray-800 bg-gray-950/40 text-gray-600"
          : "border-gray-700 bg-gray-900/70 text-gray-400 hover:border-gray-500"
      }`}
    >
      <span className="block text-sm font-semibold leading-4">{title}</span>
      <span className="mt-1 block text-[11px] leading-3 text-gray-500">{subtitle}</span>
    </button>
  );
}

function PeakOptionButton({
  label,
  root,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  root: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      title={disabled ? `${root} ${label} is not wired yet` : `${root} ${label}`}
      className={`min-h-[53px] min-w-[98px] rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed ${
        active
          ? "border-sky-400/45 bg-sky-400/15 text-slate-50"
          : disabled
            ? "border-gray-800 bg-gray-950/40 text-gray-500"
            : "border-gray-700 bg-gray-900/70 text-gray-400 hover:border-gray-500"
      }`}
    >
      <span className="block text-sm font-semibold leading-4">{label}</span>
      <span
        className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-3 ${
          active
            ? "border-sky-300/25 bg-sky-300/10 text-sky-100"
            : "border-gray-700 bg-gray-900 text-gray-500"
        }`}
      >
        {root}
      </span>
    </button>
  );
}

function YearSelector({
  availableYears,
  selectedYears,
  onToggleYear,
}: {
  availableYears: number[];
  selectedYears: number[];
  onToggleYear: (year: number) => void;
}) {
  const selectedYearSet = new Set(selectedYears);
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Years</p>
      <div className="flex flex-wrap gap-1.5">
        {availableYears.map((year) => {
          const active = selectedYearSet.has(year);
          return (
            <button
              key={year}
              type="button"
              aria-pressed={active}
              onClick={() => onToggleYear(year)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "border-gray-600 bg-gray-800 text-gray-100"
                  : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-300"
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: active ? seasonalYearColor(year) : "#4b5563" }}
                aria-hidden="true"
              />
              {year}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarLegSelector({
  label,
  value,
  onChange,
  blockedStrip,
}: {
  label: string;
  value: string;
  onChange: (strip: string) => void;
  blockedStrip?: string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">{label}</p>
      <div className="space-y-3">
        {[
          { label: "Months", options: STRIP_MONTHS, activeClass: "border-orange-400 bg-orange-400/20 text-orange-300" },
          { label: "Composites", options: COMPOSITE_OPTIONS, activeClass: "border-violet-400 bg-violet-400/20 text-violet-300" },
        ].map((group) => (
          <div key={group.label} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-widest text-gray-600">{group.label}</span>
              <span className="h-px flex-1 bg-gray-800" />
            </div>
            <div className="flex flex-wrap gap-2">
              {group.options.map(({ code, name }) => {
                const active = value === code;
                const disabled = blockedStrip === code;
                return (
                  <button
                    key={code}
                    type="button"
                    disabled={disabled}
                    aria-pressed={active}
                    onClick={() => onChange(code)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                      active
                        ? group.activeClass
                        : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GasContractSelector({
  product,
  selectedGasLegId,
  onChange,
}: {
  product: typeof DEFAULT_POWER_SPARK_SPREAD_PRODUCT;
  selectedGasLegId: string;
  onChange: (gasLegId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = SPARK_GAS_LEGS.filter((leg) => leg.market === product.market);
  const gasLegOptions = options.length > 0 ? options : SPARK_GAS_LEGS;
  const selectedGasLeg = getSparkGasLeg(selectedGasLegId) ?? gasLegOptions[0] ?? DEFAULT_SPARK_GAS_LEG;

  return (
    <div
      className="relative"
      onBlur={(event) => {
        const nextFocus = event.relatedTarget;
        if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus)) return;
        setOpen(false);
      }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Gas Contract</p>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[53px] w-full items-center justify-between gap-3 rounded-md border border-sky-400/45 bg-sky-400/15 px-3 py-2 text-left text-slate-50 transition-colors hover:border-sky-300 focus:border-sky-300 focus:outline-none"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-4">
            {selectedGasLeg.shortLabel} ({selectedGasLeg.gasRoot} + {selectedGasLeg.basisRoot})
          </span>
          <span className="mt-1 block truncate text-[11px] leading-3 text-sky-100/65">
            {selectedGasLeg.contextLabel}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded border border-sky-300/25 bg-sky-300/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-100">
            {selectedGasLeg.market}
          </span>
          <span
            className={`h-2 w-2 border-b border-r border-sky-100/70 transition-transform ${open ? "-rotate-[135deg]" : "rotate-45"}`}
            aria-hidden="true"
          />
        </span>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label="Gas contract"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-md border border-gray-700 bg-[#0b111a] shadow-2xl shadow-black/50"
        >
          {gasLegOptions.map((leg) => {
            const active = leg.id === selectedGasLeg.id;
            return (
              <button
                key={leg.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(leg.id);
                  setOpen(false);
                }}
                className={`w-full border-b border-gray-800 px-3 py-2 text-left last:border-b-0 transition-colors ${
                  active
                    ? "bg-sky-400/15 text-slate-50"
                    : "bg-[#0b111a] text-gray-300 hover:bg-gray-800/80 hover:text-gray-100"
                }`}
              >
                <span className="block text-sm font-semibold">
                  {leg.shortLabel} ({leg.gasRoot} + {leg.basisRoot})
                </span>
                <span className="mt-1 block text-[11px] text-gray-500">{leg.contextLabel}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ControlsPanel({
  selectedProduct,
  selectedGasLegId,
  heatRate,
  strip,
  farStrip,
  onGasLegChange,
  onHeatRateChange,
  onProductChange,
  onStripChange,
  onFarStripChange,
  mode,
  availableYears,
  selectedYears,
  onToggleYear,
  showStripSelector = true,
}: {
  selectedProduct: typeof DEFAULT_POWER_SPARK_SPREAD_PRODUCT;
  selectedGasLegId: string;
  heatRate: number;
  strip: string;
  farStrip: string;
  onGasLegChange: (gasLegId: string) => void;
  onHeatRateChange: (heatRate: number) => void;
  onProductChange: (productId: string) => void;
  onStripChange: (strip: string) => void;
  onFarStripChange: (strip: string) => void;
  mode: PowerPricingMode;
  availableYears: number[];
  selectedYears: number[];
  onToggleYear: (year: number) => void;
  showStripSelector?: boolean;
}) {
  const marketProducts = POWER_SPARK_SPREAD_PRODUCTS.filter((product) => product.peak === "onpeak");
  const onPeakProduct = getPowerSparkSpreadProduct(selectedProduct.onPeakProductId) ?? selectedProduct;
  const offPeakProduct = selectedProduct.offPeakProductId
    ? getPowerSparkSpreadProduct(selectedProduct.offPeakProductId)
    : null;
  const peakSpreadProduct =
    POWER_SPARK_SPREAD_PRODUCTS.find(
      (product) => product.market === selectedProduct.market && product.peak === "peakOffpeak",
    ) ?? null;

  return (
    <section className="rounded-xl border border-gray-800 bg-[#0f141d] p-4 shadow-2xl shadow-black/20">
      <div className={`grid grid-cols-1 gap-4 ${showStripSelector ? "xl:grid-cols-[minmax(280px,360px)_1fr]" : ""}`}>
        <div className="space-y-4">
          <div className="space-y-4">
            <div className="grid gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Market</p>
                <div className="flex flex-wrap gap-2">
                  {marketProducts.map((product) => {
                    const active = product.market === selectedProduct.market;
                    const disabled = mode === "spark" && !product.sparkEnabled;
                    const pairedOffPeakProduct = product.offPeakProductId
                      ? getPowerSparkSpreadProduct(product.offPeakProductId)
                      : null;
                    const subtitle = pairedOffPeakProduct
                      ? `${product.powerRoot} / ${pairedOffPeakProduct.powerRoot}`
                      : product.powerRoot;
                    return (
                      <ProductButton
                        key={product.id}
                        title={product.marketLabel}
                        subtitle={subtitle}
                        active={active}
                        disabled={disabled}
                        onClick={() => onProductChange(product.id)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Peak</p>
              <div className="flex flex-wrap gap-2">
                <PeakOptionButton
                  label="On-Peak"
                  root={onPeakProduct.powerRoot}
                  active={selectedProduct.peak === "onpeak"}
                  onClick={() => onProductChange(onPeakProduct.id)}
                />
                {offPeakProduct ? (
                  <PeakOptionButton
                    label="Off-Peak"
                    root={offPeakProduct.powerRoot}
                    active={selectedProduct.peak === "offpeak"}
                    onClick={() => onProductChange(offPeakProduct.id)}
                  />
                ) : null}
                {peakSpreadProduct ? (
                  <PeakOptionButton
                    label="Peak/Off-Peak"
                    root={`${peakSpreadProduct.powerRoot}/${peakSpreadProduct.spreadRoot}`}
                    active={selectedProduct.peak === "peakOffpeak"}
                    disabled={mode === "spark"}
                    onClick={() => onProductChange(peakSpreadProduct.id)}
                  />
                ) : null}
              </div>
            </div>

            {mode === "spark" ? (
              <div className="grid gap-4 sm:grid-cols-[minmax(210px,1fr)_140px] xl:grid-cols-1">
                <GasContractSelector
                  product={selectedProduct}
                  selectedGasLegId={selectedGasLegId}
                  onChange={onGasLegChange}
                />
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Heat Rate</p>
                  <label className="block">
                    <div className="flex h-11 overflow-hidden rounded-md border border-gray-700 bg-gray-900 focus-within:border-sky-300">
                      <input
                        type="number"
                        min={3}
                        max={20}
                        step={0.1}
                        value={heatRate}
                        onChange={(event) => onHeatRateChange(Math.min(20, Math.max(3, Number(event.target.value) || 3)))}
                        className="min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold text-gray-100 outline-none"
                      />
                      <span className="flex items-center border-l border-gray-700 px-2 text-[11px] font-medium text-gray-500">
                        x
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            ) : null}

            <YearSelector
              availableYears={availableYears}
              selectedYears={selectedYears}
              onToggleYear={onToggleYear}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
              {mode === "power" ? "Contract" : "Legs"}
            </p>
            <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-3">
              <div className="grid gap-2 text-xs sm:grid-cols-3 xl:grid-cols-1">
                <div>
                  <p className="text-gray-500">{mode === "cal" ? "Near Power" : "Power"}</p>
                  <p className="mt-1 truncate font-semibold text-gray-100" title={`${powerRootDisplay(selectedProduct)} (${selectedProduct.hub})`}>
                    {powerRootDisplay(selectedProduct)} ({selectedProduct.marketLabel} {selectedProduct.hub} {peakDisplayName(selectedProduct.peak)})
                  </p>
                </div>
                {mode === "cal" ? (
                  <div>
                    <p className="text-gray-500">Far Power</p>
                    <p className="mt-1 truncate font-semibold text-gray-100" title={`${powerRootDisplay(selectedProduct)} ${farStrip}`}>
                      {powerRootDisplay(selectedProduct)} {stripDisplayName(farStrip)}
                    </p>
                  </div>
                ) : null}
                {mode === "spark" ? (
                  <>
                    <div>
                      <p className="text-gray-500">Gas</p>
                      <p
                        className="mt-1 truncate font-semibold text-gray-100"
                        title={`${selectedProduct.gasRoot} + ${selectedProduct.basisRoot} (${selectedProduct.gasLabel})`}
                      >
                        {selectedProduct.gasRoot} + {selectedProduct.basisRoot} ({selectedProduct.gasLabel})
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Heat Rate</p>
                      <p className="mt-1 font-semibold text-gray-100">{heatRate.toFixed(1)} MMBtu/MWh</p>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {showStripSelector ? (
          <div className="rounded-lg border border-gray-800 bg-gray-950/30 p-4">
            {mode === "cal" ? (
              <div className="space-y-5">
                <CalendarLegSelector label="Near Leg" value={strip} onChange={onStripChange} blockedStrip={farStrip} />
                <CalendarLegSelector label="Far Leg" value={farStrip} onChange={onFarStripChange} blockedStrip={strip} />
              </div>
            ) : (
              <StripSelector value={strip} onChange={onStripChange} />
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DteWindowControls({
  chartWindowDays,
  maxWindowDays,
  onSetDteWindow,
}: {
  chartWindowDays: number | "all";
  maxWindowDays: number;
  onSetDteWindow: (days: number | "all") => void;
}) {
  const sliderValue = chartWindowDays === "all" ? maxWindowDays : chartWindowDays;
  return (
    <div className="flex min-w-[280px] flex-wrap items-center justify-end gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Window</span>
      <div className="flex flex-wrap gap-1 rounded-md border border-gray-800 bg-gray-950/40 p-1">
        {[
          { label: "30D", days: 30 },
          { label: "90D", days: 90 },
          { label: "180D", days: 180 },
          { label: "All", days: "all" as const },
        ].map(({ label, days }) => {
          const active = chartWindowDays === days;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSetDteWindow(days)}
              className={`min-w-12 rounded-[6px] px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                active ? "bg-gray-100 text-gray-950 shadow-sm" : "text-gray-400 hover:bg-gray-800/80"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex min-w-[190px] items-center gap-2">
        <input
          type="range"
          min={30}
          max={Math.max(30, maxWindowDays)}
          step={10}
          value={sliderValue}
          onChange={(event) => onSetDteWindow(Number(event.target.value))}
          className="h-2 flex-1 accent-cyan-400"
          aria-label="Chart days-to-expiry lookback window"
        />
        <span className="w-14 text-right text-[11px] font-semibold text-gray-400">
          {chartWindowDays === "all" ? "All" : `${chartWindowDays}D`}
        </span>
      </div>
    </div>
  );
}

function YearAvailabilityDiagnostics({ data }: { data: SparkEvolutionResponse }) {
  const unavailableYears = data.years.filter((year) => !data.dataAvailability[String(year)]);
  if (!unavailableYears.length) return null;

  return (
    <section className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold uppercase tracking-widest text-amber-300/80">Unavailable Contract Years</p>
          <p className="mt-1 text-gray-500">
            Spark lines require power, gas, and basis legs inside the chart horizon.
          </p>
        </div>
        <div className="flex max-w-4xl flex-wrap gap-2">
          {unavailableYears.map((year) => (
            <span
              key={year}
              className="rounded-md border border-gray-800 bg-gray-950/45 px-2.5 py-1 text-gray-300"
              title={describeYearIssue(data, year)}
            >
              {year}: {describeYearIssue(data, year)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function EvolutionYearTable({
  data,
  farData,
  nearStrip,
  farStrip,
  activeYears,
  mode,
}: {
  data: SparkEvolutionResponse;
  farData?: SparkEvolutionResponse | null;
  nearStrip: string;
  farStrip: string;
  activeYears: number[];
  mode: PowerPricingMode;
}) {
  const rows = activeYears
    .map((year) => {
      const point = latestMetricPoint(data, year, mode, farData, nearStrip, farStrip);
      const value = point ? metricValue(point, mode) : null;
      return { year, point, value };
    })
    .filter(
      (row): row is { year: number; point: PricingSnapshotPoint; value: number } =>
        row.point !== null && row.value !== null,
    );
  if (!rows.length) return null;
  const copy = modeCopy(mode);
  const valueFormatter = metricFormatter(mode);
  const showSparkLegs = mode === "spark";
  const showPowerLeg = mode !== "power";
  const showFarPowerLeg = mode === "cal";

  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-4 shadow-xl shadow-black/20">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Year Marks</h2>
          <p className="mt-1 text-xs text-gray-500">
            Latest/final {copy.snapshotLabel.toLowerCase()} row by active contract year.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-gray-300">
            Last update: {data.metadata.lastTradeDate ?? "--"}
          </span>
          {mode === "spark" ? (
            <span className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-gray-300">
              {data.metadata.gasLeg}
            </span>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-800">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-gray-950/60">
            <tr className="border-b border-gray-800 text-xs uppercase tracking-wider text-gray-500">
              <th className="px-3 py-3 text-left">Year</th>
              <th className="px-3 py-3 text-left">Trade Date</th>
              <th className="px-3 py-3 text-center">Days to Exp.</th>
              <th className="px-3 py-3 text-center">{copy.tableValueLabel}</th>
              {showPowerLeg ? <th className="px-3 py-3 text-center">Power</th> : null}
              {showFarPowerLeg ? <th className="px-3 py-3 text-center">Far Power</th> : null}
              {showSparkLegs ? <th className="px-3 py-3 text-center">Gas</th> : null}
              {showSparkLegs ? <th className="px-3 py-3 text-center">Basis</th> : null}
              {showSparkLegs ? <th className="px-3 py-3 text-center">All-In Gas</th> : null}
              <th className="px-3 py-3 text-center">Quality</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ year, point, value }, index) => {
              const gas = "gas" in point ? point.gas : null;
              const basis = "basis" in point ? point.basis : null;
              const allInGas = "allInGas" in point ? point.allInGas : null;
              const quality = point.daysToExpiry === 0 ? "Final" : "Latest";
              return (
                <tr
                  key={year}
                  className={`border-b border-gray-800/50 transition-colors hover:bg-gray-800/30 ${
                    index % 2 === 0 ? "bg-gray-900/20" : ""
                  }`}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: seasonalYearColor(year) }}
                        aria-hidden="true"
                      />
                      <span className="font-semibold text-gray-100">{year}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-gray-300">{point.tradeDate}</td>
                  <td className="px-3 py-3 text-center font-mono text-gray-300">{point.daysToExpiry}d</td>
                  <td className="px-3 py-3 text-center font-mono font-semibold text-emerald-300">
                    {valueFormatter(value)}
                  </td>
                  {showPowerLeg ? (
                    <td className="px-3 py-3 text-center font-mono text-gray-200">{formatMoney(point.power, 2)}</td>
                  ) : null}
                  {showFarPowerLeg ? (
                    <td className="px-3 py-3 text-center font-mono text-gray-200">
                      {formatMoney("farPower" in point ? point.farPower : null, 2)}
                    </td>
                  ) : null}
                  {showSparkLegs ? (
                    <td className="px-3 py-3 text-center font-mono text-orange-300">{formatMoney(gas, 3)}</td>
                  ) : null}
                  {showSparkLegs ? (
                    <td className="px-3 py-3 text-center font-mono text-purple-300">{formatSigned(basis, 3)}</td>
                  ) : null}
                  {showSparkLegs ? (
                    <td className="px-3 py-3 text-center font-mono text-cyan-300">{formatMoney(allInGas, 3)}</td>
                  ) : null}
                  <td className="px-3 py-3 text-center text-xs text-gray-400">{quality}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function SparkSpreadEvolution() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workspaceTab, setWorkspaceTab] = useState<PowerPricingWorkspaceTab>(() => initialWorkspaceTab(searchParams));
  const [strip, setStrip] = useState(() => initialStrip(searchParams));
  const [farStrip, setFarStrip] = useState(() => initialFarStrip(searchParams, initialStrip(searchParams)));
  const [stripSelectionSource, setStripSelectionSource] = useState<StripSelectionSource>(() =>
    initialStripSelectionSource(searchParams),
  );
  const [productId, setProductId] = useState(() => initialProductId(searchParams));
  const [sparkGasLegId, setSparkGasLegId] = useState(() => initialSparkGasLegId(searchParams));
  const [heatRate, setHeatRate] = useState(() => initialHeatRate(searchParams));
  const [heatRateSelectionSource, setHeatRateSelectionSource] = useState<"default" | "manual">(() =>
    searchParams.get("heatRateSource") === "manual" ? "manual" : "default",
  );
  const [mode, setMode] = useState<PowerPricingMode>(() => initialMode(searchParams));
  const [data, setData] = useState<SparkEvolutionResponse | null>(null);
  const [farData, setFarData] = useState<SparkEvolutionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenYears, setHiddenYears] = useState<Set<string>>(new Set());
  const [chartWindowDays, setChartWindowDays] = useState<number | "all">("all");
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const fallbackYears = useMemo(() => availableYearRange(currentYear), [currentYear]);
  const [selectedYears, setSelectedYears] = useState<number[]>(() => defaultYearRange());
  const [, setHoveredDte] = useState<number | null>(null);

  const baseProduct = getPowerSparkSpreadProduct(productId) ?? DEFAULT_POWER_SPARK_SPREAD_PRODUCT;
  const selectedGasLeg = getSparkGasLeg(sparkGasLegId) ?? DEFAULT_SPARK_GAS_LEG;
  const selectedProduct = useMemo(
    () => ({
      ...baseProduct,
      gasRoot: selectedGasLeg.gasRoot,
      basisRoot: selectedGasLeg.basisRoot,
      gasLabel: selectedGasLeg.gasLabel,
      heatRate,
    }),
    [baseProduct, heatRate, selectedGasLeg],
  );

  useEffect(() => {
    const urlStrip = initialStrip(searchParams);
    const urlFarStrip = initialFarStrip(searchParams, urlStrip);
    const urlProduct = initialProductId(searchParams);
    const urlSparkGasLeg = initialSparkGasLegId(searchParams);
    const urlHeatRate = initialHeatRate(searchParams);
    const urlHeatRateSelectionSource = searchParams.get("heatRateSource") === "manual" ? "manual" : "default";
    const urlMode = initialMode(searchParams);
    const urlWorkspaceTab = initialWorkspaceTab(searchParams);
    const urlStripSelectionSource = initialStripSelectionSource(searchParams);
    setWorkspaceTab((previous) => (previous === urlWorkspaceTab ? previous : urlWorkspaceTab));
    setStrip((previous) => (previous === urlStrip ? previous : urlStrip));
    setFarStrip((previous) => (previous === urlFarStrip ? previous : urlFarStrip));
    setStripSelectionSource((previous) =>
      previous === urlStripSelectionSource ? previous : urlStripSelectionSource,
    );
    setProductId((previous) => (previous === urlProduct ? previous : urlProduct));
    setSparkGasLegId((previous) => (previous === urlSparkGasLeg ? previous : urlSparkGasLeg));
    setHeatRate((previous) => (previous === urlHeatRate ? previous : urlHeatRate));
    setHeatRateSelectionSource((previous) =>
      previous === urlHeatRateSelectionSource ? previous : urlHeatRateSelectionSource,
    );
    setMode((previous) => (previous === urlMode ? previous : urlMode));
  }, [searchParams]);

  useEffect(() => {
    if (mode !== "power" && workspaceTab === "matrix") {
      setWorkspaceTab("evolution");
    }
  }, [mode, workspaceTab]);

  useEffect(() => {
    if (mode === "spark" && !baseProduct.sparkEnabled) {
      setProductId(DEFAULT_POWER_SPARK_SPREAD_PRODUCT.id);
    }
  }, [baseProduct.sparkEnabled, mode]);

  useEffect(() => {
    if (mode !== "cal") return;
    const nearStrip = validCalendarStrip(strip) ?? currentMonthStrip();
    if (nearStrip !== strip) {
      setStrip(nearStrip);
    }
    if (!validCalendarStrip(farStrip) || farStrip === nearStrip) {
      setFarStrip(nextCalendarStrip(nearStrip));
    }
  }, [farStrip, mode, strip]);

  useEffect(() => {
    const currentWorkspaceTab = (
      searchParams.get("pricingView") ??
      searchParams.get("pricingTab") ??
      ""
    ).toLowerCase();
    const currentStrip = (searchParams.get("sparkStrip") ?? "").toUpperCase();
    const currentStripSelectionSource = initialStripSelectionSource(searchParams);
    const expectedStrip = stripSelectionSource === "manual" ? strip : "";
    const currentFarStrip = (searchParams.get("calFarStrip") ?? "").toUpperCase();
    const currentProduct = (searchParams.get("sparkProduct") ?? "").toUpperCase();
    const currentSparkGasLeg = (searchParams.get("sparkGasLeg") ?? "").toUpperCase();
    const currentHeatRate = Number(searchParams.get("heatRate"));
    const currentHeatRateSelectionSource = searchParams.get("heatRateSource") === "manual" ? "manual" : "default";
    const currentView = (searchParams.get("pricingMode") ?? searchParams.get("view") ?? "").toLowerCase();
    if (
      currentWorkspaceTab === workspaceTab &&
      currentStrip === expectedStrip &&
      currentFarStrip === farStrip &&
      currentStripSelectionSource === stripSelectionSource &&
      currentProduct === baseProduct.id &&
      currentSparkGasLeg === selectedGasLeg.id &&
      currentHeatRateSelectionSource === heatRateSelectionSource &&
      (heatRateSelectionSource === "default" || (Number.isFinite(currentHeatRate) && currentHeatRate === heatRate)) &&
      currentView === mode
    ) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "spark-spreads");
    params.set("pricingView", workspaceTab);
    params.set("pricingMode", mode);
    params.delete("pricingTab");
    params.delete("view");
    if (stripSelectionSource === "manual") {
      params.set("sparkStrip", strip);
      params.set("sparkStripSource", "manual");
      params.set("sparkStripPinned", STRIP_PIN_PARAM);
    } else {
      params.delete("sparkStrip");
      params.delete("sparkStripSource");
      params.delete("sparkStripPinned");
    }
    params.set("calFarStrip", farStrip);
    params.set("sparkProduct", baseProduct.id);
    params.set("sparkGasLeg", selectedGasLeg.id);
    if (heatRateSelectionSource === "manual") {
      params.set("heatRate", String(heatRate));
      params.set("heatRateSource", "manual");
    } else {
      params.delete("heatRate");
      params.delete("heatRateSource");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [
    baseProduct.id,
    farStrip,
    heatRate,
    heatRateSelectionSource,
    mode,
    pathname,
    router,
    searchParams,
    selectedGasLeg.id,
    strip,
    stripSelectionSource,
    workspaceTab,
  ]);

  useEffect(() => {
    if (workspaceTab !== "evolution") {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);
    setHoveredDte(null);

    const nearStrip = mode === "cal" ? validCalendarStrip(strip) ?? currentMonthStrip() : strip;
    const encodedStrip = encodeURIComponent(nearStrip);
    const encodedProduct = encodeURIComponent(baseProduct.id);
    const encodedGasLeg = encodeURIComponent(selectedGasLeg.id);
    const encodedHeatRate = encodeURIComponent(String(heatRate));
    const sparkParams = `sparkProduct=${encodedProduct}&sparkGasLeg=${encodedGasLeg}&heatRate=${encodedHeatRate}`;
    const url = `/api/spark-spread-evolution?${sparkParams}&strip=${encodedStrip}`;
    const cacheKey = `api:spark-spread-evolution:v7:${encodedProduct}:${encodedGasLeg}:${encodedHeatRate}:${encodedStrip}`;
    const farUrl =
      mode === "cal"
        ? `/api/spark-spread-evolution?${sparkParams}&strip=${encodeURIComponent(farStrip)}`
        : null;
    const farCacheKey = farUrl
      ? `api:spark-spread-evolution:v7:${encodedProduct}:${encodedGasLeg}:${encodedHeatRate}:${encodeURIComponent(farStrip)}`
      : null;

    const nearRequest = fetchJsonWithCache<SparkEvolutionResponse>({
      key: cacheKey,
      url,
      ttlMs: API_TTL_MS,
      signal: controller.signal,
    });
    const farRequest =
      farUrl && farCacheKey
        ? fetchJsonWithCache<SparkEvolutionResponse>({
            key: farCacheKey,
            url: farUrl,
            ttlMs: API_TTL_MS,
            signal: controller.signal,
          })
        : Promise.resolve(null);

    Promise.all([nearRequest, farRequest])
      .then(([payload, farPayload]) => {
        if (!active) return;
        setData(payload);
        setFarData(farPayload);
        setHiddenYears(new Set());
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setData(null);
        setFarData(null);
        setError(err instanceof Error ? err.message : "Failed to load spark spreads");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [baseProduct.id, farStrip, heatRate, mode, selectedGasLeg.id, strip, workspaceTab]);

  const availableYears = useMemo(() => {
    const years = new Set(fallbackYears);
    if (data) {
      data.years
        .filter((year) => hasMetricData(data, year, mode, farData, strip, farStrip))
        .forEach((year) => years.add(year));
    }
    return [...years].sort((a, b) => a - b);
  }, [data, fallbackYears, farData, farStrip, mode, strip]);

  const selectedYearSet = useMemo(() => new Set(selectedYears), [selectedYears]);
  const selectedYearNumbers = useMemo(
    () => availableYears.filter((year) => selectedYearSet.has(year)),
    [availableYears, selectedYearSet],
  );
  const selectedYearsKey = selectedYearNumbers.join("-");

  const series: PlotSeries[] = useMemo(
    () =>
      selectedYearNumbers
        .filter((year) => data && hasMetricData(data, year, mode, farData, strip, farStrip))
        .map((year) => ({
          key: String(year),
          label: String(year),
          color: seasonalYearColor(year),
        })),
    [data, farData, mode, selectedYearNumbers, strip, farStrip],
  );
  const activeYears = useMemo(() => {
    if (!data) return [];
    return selectedYearNumbers.filter((year) => hasMetricData(data, year, mode, farData, strip, farStrip));
  }, [data, farData, farStrip, mode, selectedYearNumbers, strip]);
  const chartData = useMemo(
    () => (data ? buildMetricChartData(data, mode, farData, strip, farStrip) : []),
    [data, farData, farStrip, mode, strip],
  );
  const maxWindowDays = useMemo(() => {
    const dtes = chartData
      .map((point) => Number(point.daysToExpiry))
      .filter((value) => Number.isFinite(value));
    return Math.max(30, ...dtes);
  }, [chartData]);
  const zoomDomain = useMemo<[number, number]>(
    () => (chartWindowDays === "all" ? [maxWindowDays, 0] : [chartWindowDays, 0]),
    [chartWindowDays, maxWindowDays],
  );
  const copy = modeCopy(mode);
  const valueFormatter = selectedProduct.spreadRoot && mode !== "spark"
    ? (value: number | null) => formatSignedMoney(value, 2)
    : metricFormatter(mode);
  const zeroLineLabel = selectedProduct.spreadRoot && mode !== "spark" ? "Flat" : copy.zeroLineLabel;
  const matrixView = workspaceTab === "matrix" && mode === "power";
  const stripLabel =
    mode === "cal" && farData
      ? `${data?.monthName ?? strip} - ${farData.monthName}`
      : data?.monthName ?? strip;

  function toggleYear(yearKey: string) {
    setHiddenYears((previous) => {
      const next = new Set(previous);
      if (next.has(yearKey)) next.delete(yearKey);
      else next.add(yearKey);
      return next;
    });
  }

  function showAllYears() {
    setHiddenYears(new Set());
  }

  function hideAllYears() {
    if (!data) return;
    const available = data.years.filter((year) => hasMetricData(data, year, mode, farData, strip, farStrip)).map(String);
    setHiddenYears(new Set(available.slice(1)));
  }

  function toggleSelectedYear(year: number) {
    setSelectedYears((previous) => {
      const next = new Set(previous);
      if (next.has(year)) {
        if (next.size === 1) return previous;
        next.delete(year);
      } else {
        next.add(year);
      }
      return [...next].sort((a, b) => a - b);
    });
  }

  function handleStripChange(nextStrip: string) {
    setStrip(nextStrip);
    setStripSelectionSource("manual");
    if (mode === "cal" && nextStrip === farStrip) {
      setFarStrip(nextCalendarStrip(nextStrip));
    }
  }

  function handleFarStripChange(nextStrip: string) {
    setFarStrip(nextStrip === strip ? nextCalendarStrip(strip) : nextStrip);
  }

  function handleHeatRateChange(nextHeatRate: number) {
    setHeatRate(nextHeatRate);
    setHeatRateSelectionSource("manual");
  }

  function handleProductChange(nextProductId: string) {
    const nextProduct = getPowerSparkSpreadProduct(nextProductId);
    if (!nextProduct) return;
    if (mode === "spark" && !nextProduct.sparkEnabled) return;
    setProductId(nextProduct.id);
  }

  function handleModeChange(nextMode: PowerPricingMode) {
    if (nextMode === "spark" && !baseProduct.sparkEnabled) {
      setProductId(DEFAULT_POWER_SPARK_SPREAD_PRODUCT.id);
    }
    setMode(nextMode);
    if (nextMode !== "power") {
      setWorkspaceTab("evolution");
    }
  }

  const chart = data && activeYears.length > 0 ? (
    <SparkLineChart
      chartData={chartData}
      activeYears={activeYears}
      zoomDomain={zoomDomain}
      height={426}
      onHoverDte={setHoveredDte}
      valueFormatter={valueFormatter}
      yAxisLabel={copy.yAxisLabel}
      zeroLineLabel={zeroLineLabel}
    />
  ) : null;

  return (
    <div className={`mx-auto space-y-5 ${matrixView ? "max-w-none" : "max-w-6xl"}`}>
      <ModeTabs mode={mode} onModeChange={handleModeChange} />
      <ViewTabs workspaceTab={workspaceTab} mode={mode} onWorkspaceTabChange={setWorkspaceTab} />
      <ControlsPanel
        selectedProduct={selectedProduct}
        selectedGasLegId={selectedGasLeg.id}
        heatRate={heatRate}
        strip={strip}
        farStrip={farStrip}
        onGasLegChange={setSparkGasLegId}
        onHeatRateChange={handleHeatRateChange}
        onProductChange={handleProductChange}
        onStripChange={handleStripChange}
        onFarStripChange={handleFarStripChange}
        mode={mode}
        availableYears={availableYears}
        selectedYears={selectedYearNumbers}
        onToggleYear={toggleSelectedYear}
        showStripSelector={!matrixView}
      />

      {matrixView ? (
        <>
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Matrix source: ICE settlements for {copy.snapshotLabel.toLowerCase()} analytics.
          </div>
          <IcePmiCurveTable
            key={`${mode}-${selectedYearsKey}`}
            mode={mode}
            sparkProduct={baseProduct.id}
            selectedYears={selectedYearNumbers}
          />
        </>
      ) : (
        <>
          {loading && <div className="h-[440px] w-full animate-pulse rounded-lg bg-gray-800/60" />}

          {error && !loading && (
            <div className="flex h-[440px] items-center justify-center rounded-lg border border-red-900/40 bg-red-950/20 p-6 text-sm text-red-300">
              {error}
            </div>
          )}

          {data && !loading && !error && activeYears.length === 0 && (
            <div className="flex h-[440px] items-center justify-center rounded-lg border border-gray-800 bg-[#12141d] text-sm text-gray-500">
              No {copy.snapshotLabel.toLowerCase()} years are available for {data.monthName}.
            </div>
          )}

          {data && activeYears.length > 0 && !loading && !error && (
            <>
              {mode === "spark" ? <YearAvailabilityDiagnostics data={data} /> : null}

              {chart && (
                <PlotCard
                  key={`${mode}-${strip}-${selectedYearsKey}`}
                  title={`${copy.chartTitle} - ${selectedProduct.marketLabel} ${peakDisplayName(selectedProduct.peak)} ${stripLabel}`}
                  subtitle={`${copy.chartSubtitlePrefix} | Last update ${data.metadata.lastTradeDate ?? "--"}`}
                  series={series}
                  hiddenSeries={hiddenYears}
                  onToggleSeries={toggleYear}
                  onShowAll={showAllYears}
                  onHideAll={hideAllYears}
                  showSeriesControls={false}
                  controls={
                    <DteWindowControls
                      chartWindowDays={chartWindowDays}
                      maxWindowDays={maxWindowDays}
                      onSetDteWindow={setChartWindowDays}
                    />
                  }
                  focusedChildren={
                    <SparkLineChart
                      key={`expanded-${mode}-${strip}-${selectedYearsKey}`}
                      chartData={chartData}
                      activeYears={activeYears}
                      zoomDomain={zoomDomain}
                      height={620}
                      onHoverDte={setHoveredDte}
                      valueFormatter={valueFormatter}
                      yAxisLabel={copy.yAxisLabel}
                      zeroLineLabel={zeroLineLabel}
                    />
                  }
                >
                  {chart}
                </PlotCard>
              )}

              <EvolutionYearTable
                key={`year-marks-${mode}-${strip}-${selectedYearsKey}`}
                data={data}
                farData={farData}
                nearStrip={strip}
                farStrip={farStrip}
                activeYears={activeYears}
                mode={mode}
              />
            </>
          )}

          {data && data.componentCodes.length > 1 && !loading && !error && (
            <p className="text-xs text-gray-600">
              {data.monthName} averages component strips: {data.componentCodes.join(", ")}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
