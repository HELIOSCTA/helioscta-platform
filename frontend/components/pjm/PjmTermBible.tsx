"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PlotCard, { type PlotSeries } from "@/components/dashboard/PlotCard";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

export type LmpProduct = "da" | "rt";
export type RtLmpSource = "verified" | "unverified";
export type LmpComponent = "total" | "energy" | "congestion" | "loss";
export type TermPeriod = "5x16" | "7x16" | "7x8" | "wrap" | "7x24";
export type TermBibleMode = "single" | "spread";
type DailyEditMap = Record<string, number>;

interface MonthlyPoint {
  year: number;
  month: number;
  value: number | string | null;
  pricedDays: number;
}

interface MonthlyStat {
  stat: "Mean" | "Min" | "Max";
  month: number;
  value: number | string | null;
}

interface YearlyStat {
  year: number;
  mean: number | string | null;
  min: number | string | null;
  max: number | string | null;
}

interface DailyValue {
  date: string;
  mmDd: string;
  year: number;
  value: number | string | null;
  isWeekend: boolean;
  isNercHoliday: boolean;
  excludesPjmOnpeakSettle: boolean;
  hourlyCount: number;
}

interface PjmTermBiblePayload {
  product: LmpProduct;
  rtSource: RtLmpSource;
  component: LmpComponent;
  period: TermPeriod;
  pnodeName: string;
  sourceTable: "pjm.da_hrl_lmps" | "pjm.rt_hrl_lmps" | "pjm.rt_unverified_hrl_lmps";
  startYear: number;
  endYear: number;
  detailMonth: number;
  minDate: string | null;
  maxDate: string | null;
  asOf: string | null;
  monthly: MonthlyPoint[];
  monthlyStats: MonthlyStat[];
  yearlyStats: YearlyStat[];
  dailyValues: DailyValue[];
  nercHolidays: unknown[];
  spread?: {
    fromHub: string;
    toHub: string;
    formula: string;
  };
  metadata: {
    holidayAdjustment: string;
    periodDefinition: string;
    availableHubs: string[];
    maxYearSpan: number;
  };
}

export interface PjmTermBibleFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface DailySelectionStats {
  selectedCells: number;
  selectedRows: number;
  observations: number;
  avg: number | null;
  sum: number | null;
  min: number | null;
  max: number | null;
  rowLabel: string;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_VISIBLE_CHART_YEARS = 2;
const HUBS = [
  "WESTERN HUB",
  "EASTERN HUB",
  "AEP-DAYTON HUB",
  "DOMINION HUB",
  "NEW JERSEY HUB",
  "CHICAGO HUB",
  "OHIO HUB",
  "N ILLINOIS HUB",
  "AEP GEN HUB",
  "ATSI GEN HUB",
  "CHICAGO GEN HUB",
  "WEST INT HUB",
] as const;
type HubName = (typeof HUBS)[number];

const MONTHS = [
  { number: 1, label: "Jan" },
  { number: 2, label: "Feb" },
  { number: 3, label: "Mar" },
  { number: 4, label: "Apr" },
  { number: 5, label: "May" },
  { number: 6, label: "Jun" },
  { number: 7, label: "Jul" },
  { number: 8, label: "Aug" },
  { number: 9, label: "Sep" },
  { number: 10, label: "Oct" },
  { number: 11, label: "Nov" },
  { number: 12, label: "Dec" },
] as const;

const PRODUCT_LABELS: Record<LmpProduct, string> = {
  da: "DA",
  rt: "RT",
};

const TERM_BIBLE_MODE_LABELS: Record<TermBibleMode, string> = {
  single: "Single Hub",
  spread: "Hub Spread",
};

const RT_SOURCE_LABELS: Record<RtLmpSource, string> = {
  verified: "Verified",
  unverified: "Unverified",
};

const MARKET_OPTIONS = [
  { value: "rt-verified", label: "RT Verified" },
  { value: "rt-unverified", label: "RT Unverified" },
  { value: "da", label: "DA" },
] as const;

export type MarketOption = (typeof MARKET_OPTIONS)[number]["value"];

export interface PjmTermBibleExternalFilters {
  mode: TermBibleMode;
  month: number;
  startYear: number;
  endYear: number;
  hub: string;
  spreadFromHub: string;
  spreadToHub: string;
  market: MarketOption;
  period: TermPeriod;
  component?: LmpComponent;
}

const LMP_COMPONENTS: Array<{ key: LmpComponent; label: string; color: string }> = [
  { key: "total", label: "Total", color: "#e5e7eb" },
  { key: "energy", label: "Energy", color: "#38bdf8" },
  { key: "congestion", label: "Congestion", color: "#f97316" },
  { key: "loss", label: "Loss", color: "#a78bfa" },
];

const LMP_COMPONENT_LABELS: Record<LmpComponent, string> = {
  total: "Total",
  energy: "Energy",
  congestion: "Congestion",
  loss: "Loss",
};

const PERIOD_LABELS: Record<TermPeriod, string> = {
  "5x16": "5x16",
  "7x16": "7x16",
  "7x8": "7x8",
  wrap: "Wrap",
  "7x24": "7x24",
};

const TERM_PERIOD_OPTIONS: Array<{ value: TermPeriod; label: string }> = [
  { value: "5x16", label: "5x16 - Business-day HE8-23" },
  { value: "7x16", label: "7x16 - All days HE8-23" },
  { value: "7x8", label: "7x8 - All days HE1-7, HE24" },
  { value: "wrap", label: "Wrap - 7x8 plus weekend HE8-23" },
  { value: "7x24", label: "7x24 - All hours" },
];

const YEAR_COLORS = [
  "#38bdf8",
  "#f97316",
  "#22c55e",
  "#a78bfa",
  "#facc15",
  "#fb7185",
  "#2dd4bf",
  "#818cf8",
  "#e5e7eb",
  "#84cc16",
];

function todayYear(): number {
  return new Date().getFullYear();
}

function currentMonth(): number {
  return new Date().getMonth() + 1;
}

function normalizeHub(value: string): HubName {
  return HUBS.find((hub) => hub === value) ?? "WESTERN HUB";
}

function productFromMarket(market: MarketOption | undefined): LmpProduct {
  return market === "da" ? "da" : "rt";
}

function rtSourceFromMarket(market: MarketOption | undefined): RtLmpSource {
  return market === "rt-unverified" ? "unverified" : "verified";
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toAverageNumber(value: number | string | null | undefined): number | null {
  const parsed = toNumber(value);
  return parsed === null || parsed === 0 ? null : parsed;
}

function fmtValue(value: number | string | null | undefined): string {
  const parsed = toNumber(value);
  return parsed === null ? "--" : parsed.toFixed(2);
}

function fmtEditValue(value: number | string | null | undefined): string {
  const parsed = toNumber(value);
  return parsed === null ? "" : parsed.toFixed(2);
}

function fmtTooltipValue(value: unknown): string {
  return typeof value === "number" || typeof value === "string" ? fmtValue(value) : "--";
}

function fmtStamp(value: string | null): string {
  if (!value) return "--";
  return value.replace("T", " ").slice(0, 16);
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value !== null);
  if (nums.length === 0) return null;
  return nums.reduce((total, value) => total + value, 0) / nums.length;
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function safeFileToken(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "table";
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function avgDailyValue(rows: DailyValue[]): number | null {
  const valuedRows = rows
    .map((row) => ({ value: toAverageNumber(row.value), hourlyCount: row.hourlyCount }))
    .filter((row): row is { value: number; hourlyCount: number } => row.value !== null);
  if (valuedRows.length === 0) return null;

  const weightedRows = valuedRows.filter((row) => row.hourlyCount > 0);
  const hourlyCount = weightedRows.reduce((total, row) => total + row.hourlyCount, 0);
  if (hourlyCount > 0) {
    return weightedRows.reduce((total, row) => total + row.value * row.hourlyCount, 0) / hourlyCount;
  }

  return avg(valuedRows.map((row) => row.value));
}

function monthLabel(month: number): string {
  return MONTHS.find((item) => item.number === month)?.label ?? String(month);
}

function valueUnitLabel(data: PjmTermBiblePayload | null): string {
  return data?.spread ? "Spread" : "LMP";
}

function dailyCellKey(year: number, mmDd: string): string {
  return `${year}:${mmDd}`;
}

function hasDailyEdit(edits: DailyEditMap, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(edits, key);
}

function parseDailyCellKey(key: string): { year: number; mmDd: string } | null {
  const [yearValue, mmDd] = key.split(":");
  const year = Number(yearValue);
  return Number.isInteger(year) && mmDd ? { year, mmDd } : null;
}

function parseDailyEditDraft(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? roundPrice(parsed) : null;
}

function percentile(values: number[], percent: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percent;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function heatStyleFromValues(
  value: number | null,
  values: number[],
): React.CSSProperties | undefined {
  if (value === null || values.length < 4) return undefined;
  const lowMax = Math.min(...values);
  const lowMin = percentile(values, 0.25);
  const highMin = percentile(values, 0.75);
  const highMax = Math.max(...values);
  if (lowMin === null || highMin === null || lowMax === highMax || lowMin === highMin) {
    return undefined;
  }

  if (value <= lowMin) {
    const spread = Math.max(lowMin - lowMax, 0.0001);
    const intensity = Math.min(Math.max((lowMin - value) / spread, 0), 1);
    const alpha = 0.05 + intensity * 0.18;
    return {
      backgroundColor: `rgba(220, 38, 38, ${alpha.toFixed(2)})`,
      boxShadow: `inset 2px 0 0 rgba(220, 38, 38, ${(alpha + 0.14).toFixed(2)})`,
      color: "#e5e7eb",
    };
  }

  if (value >= highMin) {
    const spread = Math.max(highMax - highMin, 0.0001);
    const intensity = Math.min(Math.max((value - highMin) / spread, 0), 1);
    const alpha = 0.05 + intensity * 0.18;
    return {
      backgroundColor: `rgba(22, 163, 74, ${alpha.toFixed(2)})`,
      boxShadow: `inset 2px 0 0 rgba(22, 163, 74, ${(alpha + 0.14).toFixed(2)})`,
      color: "#e5e7eb",
    };
  }

  return undefined;
}

function buildUrl({
  product,
  rtSource,
  component,
  period,
  hub,
  startYear,
  endYear,
  month,
  refreshToken,
}: {
  product: LmpProduct;
  rtSource: RtLmpSource;
  component: LmpComponent;
  period: TermPeriod;
  hub: HubName;
  startYear: number;
  endYear: number;
  month: number;
  refreshToken: number;
}): string {
  const params = new URLSearchParams({
    product,
    rtSource,
    component,
    period,
    hub,
    startYear: String(startYear),
    endYear: String(endYear),
    month: String(month),
  });
  if (refreshToken > 0) params.set("refresh", "1");
  return `/api/pjm-term-bible?${params.toString()}`;
}

function buildMonthlyMap(rows: MonthlyPoint[]): Map<number, Map<number, MonthlyPoint>> {
  const byYear = new Map<number, Map<number, MonthlyPoint>>();
  rows.forEach((point) => {
    const monthMap = byYear.get(point.year) ?? new Map<number, MonthlyPoint>();
    monthMap.set(point.month, point);
    byYear.set(point.year, monthMap);
  });
  return byYear;
}

function buildMonthlyStatsMap(rows: MonthlyStat[]): Map<string, Map<number, MonthlyStat>> {
  const byStat = new Map<string, Map<number, MonthlyStat>>();
  rows.forEach((point) => {
    const monthMap = byStat.get(point.stat) ?? new Map<number, MonthlyStat>();
    monthMap.set(point.month, point);
    byStat.set(point.stat, monthMap);
  });
  return byStat;
}

function buildDailyMaps(rows: DailyValue[]): {
  years: number[];
  byDay: Map<string, Map<number, DailyValue>>;
} {
  const years = new Set<number>();
  const byDay = new Map<string, Map<number, DailyValue>>();
  rows.forEach((point) => {
    years.add(point.year);
    const yearMap = byDay.get(point.mmDd) ?? new Map<number, DailyValue>();
    yearMap.set(point.year, point);
    byDay.set(point.mmDd, yearMap);
  });
  return { years: [...years].sort((a, b) => a - b), byDay };
}

function buildDailySelectionStats(
  data: PjmTermBiblePayload,
  selectedCells: Set<string>,
): DailySelectionStats | null {
  if (selectedCells.size === 0) return null;
  const { byDay } = buildDailyMaps(data.dailyValues);
  const selectedParsedCells = [...selectedCells]
    .map(parseDailyCellKey)
    .filter((cell): cell is { year: number; mmDd: string } => Boolean(cell))
    .filter((cell) => byDay.get(cell.mmDd)?.has(cell.year));
  if (selectedParsedCells.length === 0) return null;

  const rowSet = new Set(selectedParsedCells.map((cell) => cell.mmDd));
  const selectedPoints = selectedParsedCells
    .map((cell) => byDay.get(cell.mmDd)?.get(cell.year) ?? null)
    .filter((point): point is DailyValue => Boolean(point));
  const values = selectedPoints
    .map((point) => toAverageNumber(point.value))
    .filter((value): value is number => value !== null);
  const sortedRows = [...rowSet].sort();
  const rowLabel =
    sortedRows.length === 1
      ? sortedRows[0]
      : sortedRows.length > 1
        ? `${sortedRows[0]} to ${sortedRows[sortedRows.length - 1]}`
        : "--";

  return {
    selectedCells: selectedParsedCells.length,
    selectedRows: rowSet.size,
    observations: values.length,
    avg: avg(values),
    sum: values.length > 0 ? values.reduce((total, value) => total + value, 0) : null,
    min: values.length > 0 ? Math.min(...values) : null,
    max: values.length > 0 ? Math.max(...values) : null,
    rowLabel,
  };
}

function buildDailyHeatValues(rows: DailyValue[]): Map<number, number[]> {
  const byYear = new Map<number, number[]>();
  rows.forEach((row) => {
    const value = toAverageNumber(row.value);
    if (value === null) return;
    byYear.set(row.year, [...(byYear.get(row.year) ?? []), value]);
  });
  return byYear;
}

function buildDailyTableCsv(
  data: PjmTermBiblePayload,
  { includeAverageRow = true }: { includeAverageRow?: boolean } = {},
): string {
  const { years, byDay } = buildDailyMaps(data.dailyValues);
  const rows = [...byDay.keys()].sort();
  const header = ["Date", ...years.map(String)];
  const csvRows = [header];

  rows.forEach((mmDd) => {
    csvRows.push([
      mmDd,
      ...years.map((year) => {
        const value = toNumber(byDay.get(mmDd)?.get(year)?.value);
        return value === null ? "" : value.toFixed(2);
      }),
    ]);
  });

  if (includeAverageRow) {
    csvRows.push([
      "Avg",
      ...years.map((year) => {
        const value = avgDailyValue(
          rows
            .map((mmDd) => byDay.get(mmDd)?.get(year) ?? null)
            .filter((point): point is DailyValue => Boolean(point)),
        );
        return value === null ? "" : value.toFixed(2);
      }),
    ]);
  }

  return csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function dailyTableCsvFilename(data: PjmTermBiblePayload): string {
  return [
    "term-bible",
    monthLabel(data.detailMonth),
    data.startYear,
    data.endYear,
    data.product,
    data.rtSource,
    data.period,
    safeFileToken(data.pnodeName),
  ]
    .map(String)
    .map(safeFileToken)
    .filter(Boolean)
    .join("-");
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

function applyDailyEdits(data: PjmTermBiblePayload, dailyEdits: DailyEditMap): PjmTermBiblePayload {
  const editEntries = Object.entries(dailyEdits)
    .map(([key, value]) => ({ key, value, cell: parseDailyCellKey(key) }))
    .filter(
      (entry): entry is { key: string; value: number; cell: { year: number; mmDd: string } } =>
        Boolean(entry.cell) && Number.isFinite(entry.value),
    );
  if (editEntries.length === 0) return data;

  const dailyByKey = new Map(
    data.dailyValues.map((row) => [dailyCellKey(row.year, row.mmDd), row]),
  );

  editEntries.forEach(({ key, value, cell }) => {
    const existing = dailyByKey.get(key);
    dailyByKey.set(key, {
      date: existing?.date ?? `${cell.year}-${cell.mmDd}`,
      mmDd: cell.mmDd,
      year: cell.year,
      value: roundPrice(value),
      isWeekend: existing?.isWeekend ?? false,
      isNercHoliday: existing?.isNercHoliday ?? false,
      excludesPjmOnpeakSettle: existing?.excludesPjmOnpeakSettle ?? false,
      hourlyCount: existing && existing.hourlyCount > 0 ? existing.hourlyCount : 1,
    });
  });

  const dailyValues = [...dailyByKey.values()].sort((a, b) => {
    const daySort = a.mmDd.localeCompare(b.mmDd);
    return daySort === 0 ? a.year - b.year : daySort;
  });
  const editedYears = new Set(editEntries.map((entry) => entry.cell.year));
  const monthlyByKey = new Map(
    data.monthly.map((row) => [monthlyKey(row.year, row.month), row]),
  );

  editedYears.forEach((year) => {
    const rowsForYear = dailyValues.filter((row) => row.year === year);
    const value = avgDailyValue(rowsForYear);
    const key = monthlyKey(year, data.detailMonth);
    const existing = monthlyByKey.get(key);
    monthlyByKey.set(key, {
      year,
      month: data.detailMonth,
      value: value === null ? existing?.value ?? null : roundPrice(value),
      pricedDays: rowsForYear.filter((row) => toNumber(row.value) !== null).length,
    });
  });

  const monthly = [...monthlyByKey.values()].sort((a, b) => {
    const yearSort = a.year - b.year;
    return yearSort === 0 ? a.month - b.month : yearSort;
  });

  return {
    ...data,
    dailyValues,
    monthly,
    monthlyStats: buildMonthlyStatsFromPoints(monthly),
    yearlyStats: buildYearlyStatsFromPoints(monthly),
  };
}

function maxIsoStamp(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => Boolean(value));
  if (present.length === 0) return null;
  return present.sort().at(-1) ?? null;
}

function minIsoDate(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => Boolean(value));
  if (present.length === 0) return null;
  return present.sort()[0] ?? null;
}

function maxIsoDate(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => Boolean(value));
  if (present.length === 0) return null;
  return present.sort().at(-1) ?? null;
}

function monthlyKey(year: number, month: number): string {
  return `${year}:${month}`;
}

function buildMonthlyStatsFromPoints(rows: MonthlyPoint[]): MonthlyStat[] {
  const stats: MonthlyStat[] = [];
  MONTHS.forEach((month) => {
    const values = rows
      .filter((row) => row.month === month.number)
      .map((row) => toNumber(row.value))
      .filter((value): value is number => value !== null);
    if (values.length === 0) return;
    stats.push(
      { stat: "Mean", month: month.number, value: roundPrice(avg(values) ?? 0) },
      { stat: "Min", month: month.number, value: roundPrice(Math.min(...values)) },
      { stat: "Max", month: month.number, value: roundPrice(Math.max(...values)) },
    );
  });
  return stats;
}

function buildYearlyStatsFromPoints(rows: MonthlyPoint[]): YearlyStat[] {
  const years = [...new Set(rows.map((row) => row.year))].sort((a, b) => a - b);
  const stats: YearlyStat[] = [];
  years.forEach((year) => {
    const values = rows
      .filter((row) => row.year === year)
      .map((row) => toNumber(row.value))
      .filter((value): value is number => value !== null);
    if (values.length === 0) return;
    stats.push({
      year,
      mean: roundPrice(avg(values) ?? 0),
      min: roundPrice(Math.min(...values)),
      max: roundPrice(Math.max(...values)),
    });
  });
  return stats;
}

function buildSpreadPayload({
  fromPayload,
  toPayload,
  fromHub,
  toHub,
}: {
  fromPayload: PjmTermBiblePayload;
  toPayload: PjmTermBiblePayload;
  fromHub: HubName;
  toHub: HubName;
}): PjmTermBiblePayload {
  const fromMonthly = new Map(
    fromPayload.monthly.map((row) => [monthlyKey(row.year, row.month), row]),
  );
  const monthly = toPayload.monthly
    .map((toRow): MonthlyPoint | null => {
      const fromRow = fromMonthly.get(monthlyKey(toRow.year, toRow.month));
      const toValue = toNumber(toRow.value);
      const fromValue = toNumber(fromRow?.value);
      if (!fromRow || toValue === null || fromValue === null) return null;
      return {
        year: toRow.year,
        month: toRow.month,
        value: roundPrice(toValue - fromValue),
        pricedDays: Math.min(toRow.pricedDays, fromRow.pricedDays),
      };
    })
    .filter((row): row is MonthlyPoint => row !== null);

  const fromDaily = new Map(
    fromPayload.dailyValues.map((row) => [dailyCellKey(row.year, row.mmDd), row]),
  );
  const dailyValues = toPayload.dailyValues
    .map((toRow): DailyValue | null => {
      const fromRow = fromDaily.get(dailyCellKey(toRow.year, toRow.mmDd));
      const toValue = toNumber(toRow.value);
      const fromValue = toNumber(fromRow?.value);
      if (!fromRow || toValue === null || fromValue === null) return null;
      return {
        ...toRow,
        value: roundPrice(toValue - fromValue),
        hourlyCount: Math.min(toRow.hourlyCount, fromRow.hourlyCount),
      };
    })
    .filter((row): row is DailyValue => row !== null);

  return {
    ...toPayload,
    pnodeName: `${toHub} - ${fromHub}`,
    minDate: minIsoDate(dailyValues.map((row) => row.date)) ?? minIsoDate([fromPayload.minDate, toPayload.minDate]),
    maxDate: maxIsoDate(dailyValues.map((row) => row.date)) ?? maxIsoDate([fromPayload.maxDate, toPayload.maxDate]),
    asOf: maxIsoStamp([fromPayload.asOf, toPayload.asOf]),
    monthly,
    monthlyStats: buildMonthlyStatsFromPoints(monthly),
    yearlyStats: buildYearlyStatsFromPoints(monthly),
    dailyValues,
    spread: {
      fromHub,
      toHub,
      formula: `${toHub} - ${fromHub}`,
    },
  };
}

function SelectField({
  label,
  value,
  valueText,
  onChange,
  minCh = 10,
  maxCh = 28,
  children,
}: {
  label: string;
  value: string | number;
  valueText?: string;
  onChange: (value: string) => void;
  minCh?: number;
  maxCh?: number;
  children: React.ReactNode;
}) {
  const widthCh = Math.min(
    maxCh,
    Math.max(minCh, String(valueText ?? value).length + 4),
  );

  return (
    <label
      className="min-w-0 space-y-1"
      style={{ width: `min(100%, ${widthCh}ch)` }}
    >
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-600">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-gray-800 bg-gray-950/70 px-2.5 text-xs font-semibold text-gray-200 outline-none transition-colors focus:border-sky-500/60"
      >
        {children}
      </select>
    </label>
  );
}

function YearField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="w-[8ch] min-w-0 space-y-1">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-600">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 w-full rounded-md border border-gray-800 bg-gray-950/70 px-2 text-xs font-semibold text-gray-200 outline-none transition-colors focus:border-sky-500/60"
        aria-label={`${label} year`}
      />
    </label>
  );
}

function TableHeatmapToggle({
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
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
        enabled
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${enabled ? "bg-emerald-300" : "bg-gray-600"}`}
        aria-hidden="true"
      />
      Heatmap
    </button>
  );
}

function TermTableSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-800 bg-[#10151d] shadow-xl shadow-black/20">
      <div className="flex flex-col gap-3 border-b border-gray-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.24em] text-gray-100">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center justify-end gap-2">{action}</div>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function HeaderCell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`border border-gray-800 bg-[#0a0f16] px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 ${className}`}
    >
      {children}
    </th>
  );
}

function ValueCell({
  value,
  selected = false,
  edited = false,
  editing = false,
  editValue = "",
  ariaLabel,
  onClick,
  onDoubleClick,
  onKeyDown,
  onEditValueChange,
  onEditCommit,
  onEditCancel,
  style,
  className = "",
}: {
  value: number | string | null | undefined;
  selected?: boolean;
  edited?: boolean;
  editing?: boolean;
  editValue?: string;
  ariaLabel?: string;
  onClick?: (event: React.MouseEvent<HTMLTableCellElement>) => void;
  onDoubleClick?: (event: React.MouseEvent<HTMLTableCellElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTableCellElement>) => void;
  onEditValueChange?: (value: string) => void;
  onEditCommit?: (value: string) => void;
  onEditCancel?: () => void;
  style?: React.CSSProperties;
  className?: string;
}) {
  const numeric = toNumber(value);
  return (
    <td
      role={onClick && !editing ? "button" : undefined}
      tabIndex={onClick && !editing ? 0 : undefined}
      aria-pressed={onClick && !editing ? selected : undefined}
      aria-label={ariaLabel}
      onClick={editing ? undefined : onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={editing ? undefined : onKeyDown}
      className={`border border-gray-900 px-3 py-2 text-right tabular-nums ${
        numeric === null ? "text-gray-700" : "text-gray-100"
      } ${
        selected ? "bg-sky-500/20 text-sky-100 outline outline-1 -outline-offset-1 outline-sky-400/60" : ""
      } ${edited ? "font-semibold text-amber-100 shadow-[inset_0_-1px_0_rgba(251,191,36,0.55)]" : ""} ${
        onClick ? "cursor-pointer hover:bg-sky-500/10" : ""
      } ${editing ? "bg-gray-950/90 p-1" : ""} ${className}`}
      style={!selected ? style : undefined}
    >
      {editing ? (
        <input
          autoFocus
          inputMode="decimal"
          value={editValue}
          onChange={(event) => onEditValueChange?.(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => {
            if (event.currentTarget.dataset.cancelled === "true") return;
            onEditCommit?.(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.currentTarget.dataset.cancelled = "true";
              onEditCancel?.();
            }
          }}
          className="h-7 w-full min-w-[5.5rem] rounded border border-sky-500/50 bg-gray-950 px-2 text-right text-xs font-semibold text-gray-100 outline-none"
          aria-label={ariaLabel ? `Edit ${ariaLabel}` : "Edit value"}
        />
      ) : (
        fmtValue(value)
      )}
    </td>
  );
}

function TermSummaryTable({
  data,
  heatmapEnabled,
  action,
  includeSummaryStats = true,
}: {
  data: PjmTermBiblePayload;
  heatmapEnabled: boolean;
  action?: React.ReactNode;
  includeSummaryStats?: boolean;
}) {
  const monthlyByYear = useMemo(() => buildMonthlyMap(data.monthly), [data.monthly]);
  const years = useMemo(() => [...monthlyByYear.keys()].sort((a, b) => a - b), [monthlyByYear]);
  const statsByName = useMemo(() => buildMonthlyStatsMap(data.monthlyStats), [data.monthlyStats]);
  const yearlyStatsByYear = useMemo(
    () => new Map(data.yearlyStats.map((row) => [row.year, row])),
    [data.yearlyStats],
  );
  const monthlyHeatValues = useMemo(
    () => data.monthly.map((row) => toNumber(row.value)).filter((value): value is number => value !== null),
    [data.monthly],
  );
  const monthlyStatsHeatValues = useMemo(
    () =>
      data.monthlyStats
        .filter((row) => row.stat === "Mean")
        .map((row) => toNumber(row.value))
        .filter((value): value is number => value !== null),
    [data.monthlyStats],
  );

  return (
    <TermTableSection
      title={data.spread ? "Monthly Hub Spread" : "Monthly Term Bible"}
      subtitle={`${data.pnodeName} | ${PRODUCT_LABELS[data.product]} ${PERIOD_LABELS[data.period]} | ${LMP_COMPONENT_LABELS[data.component]}`}
      action={action}
    >
      <table className="w-full min-w-[1120px] border-collapse bg-[#0d1118] text-sm text-gray-100">
        <thead>
          <tr>
            <HeaderCell className="sticky left-0 z-20 text-left">Year</HeaderCell>
            {MONTHS.map((month) => (
              <HeaderCell key={month.number}>{month.label}</HeaderCell>
            ))}
            {includeSummaryStats && (
              <>
                <HeaderCell>Avg</HeaderCell>
                <HeaderCell>Min</HeaderCell>
                <HeaderCell>Max</HeaderCell>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {years.map((year) => {
            const monthMap = monthlyByYear.get(year);
            const yearly = yearlyStatsByYear.get(year);
            return (
              <tr key={year} className="hover:bg-gray-900/50">
                <td className="sticky left-0 z-10 border border-gray-900 bg-[#0d1118] px-3 py-2 font-semibold text-gray-100">
                  {year}
                </td>
                {MONTHS.map((month) => {
                  const point = monthMap?.get(month.number);
                  const value = toNumber(point?.value);
                  return (
                    <ValueCell
                      key={month.number}
                      value={point?.value}
                      style={
                        heatmapEnabled ? heatStyleFromValues(value, monthlyHeatValues) : undefined
                      }
                    />
                  );
                })}
                {includeSummaryStats && (
                  <>
                    <ValueCell value={yearly?.mean} className="font-semibold" />
                    <ValueCell value={yearly?.min} />
                    <ValueCell value={yearly?.max} />
                  </>
                )}
              </tr>
            );
          })}
          {includeSummaryStats &&
            (["Mean", "Min", "Max"] as const).map((stat) => {
              const monthMap = statsByName.get(stat);
              return (
                <tr key={stat} className="bg-gray-950/50 font-semibold hover:bg-gray-900/60">
                  <td className="sticky left-0 z-10 border border-gray-900 bg-[#0a0f16] px-3 py-2 text-gray-100">{stat}</td>
                  {MONTHS.map((month) => {
                    const point = monthMap?.get(month.number);
                    const value = toNumber(point?.value);
                    return (
                      <ValueCell
                        key={month.number}
                        value={point?.value}
                        style={
                          heatmapEnabled && stat === "Mean"
                            ? heatStyleFromValues(value, monthlyStatsHeatValues)
                            : undefined
                        }
                      />
                    );
                  })}
                  <td colSpan={3} className="border border-gray-900 px-3 py-2 text-right text-gray-700">
                    --
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </TermTableSection>
  );
}

function DailyValuesTable({
  data,
  heatmapEnabled,
  includeAverageRow = true,
  selectedCells,
  lastSelectedCell,
  dailyEdits,
  editingCell,
  editingDraft,
  action,
  onSelectedCellsChange,
  onLastSelectedCellChange,
  onStartEdit,
  onEditDraftChange,
  onEditCommit,
  onEditCancel,
}: {
  data: PjmTermBiblePayload;
  heatmapEnabled: boolean;
  includeAverageRow?: boolean;
  selectedCells: Set<string>;
  lastSelectedCell: string | null;
  dailyEdits: DailyEditMap;
  editingCell: string | null;
  editingDraft: string;
  action?: React.ReactNode;
  onSelectedCellsChange: (next: Set<string>) => void;
  onLastSelectedCellChange: (next: string | null) => void;
  onStartEdit: (year: number, mmDd: string, value: number | string | null | undefined) => void;
  onEditDraftChange: (value: string) => void;
  onEditCommit: (value: string) => void;
  onEditCancel: () => void;
}) {
  const { years, byDay } = useMemo(() => buildDailyMaps(data.dailyValues), [data.dailyValues]);
  const rows = useMemo(() => [...byDay.keys()].sort(), [byDay]);
  const dailyHeatValuesByYear = useMemo(() => buildDailyHeatValues(data.dailyValues), [data.dailyValues]);
  const yearAverages = useMemo(
    () =>
      new Map(
        years.map((year) => [
          year,
          avgDailyValue(
            rows
              .map((mmDd) => byDay.get(mmDd)?.get(year) ?? null)
              .filter((point): point is DailyValue => Boolean(point)),
          ),
        ]),
      ),
    [byDay, rows, years],
  );
  const yearAverageHeatValues = useMemo(
    () => [...yearAverages.values()].filter((value): value is number => value !== null),
    [yearAverages],
  );

  const toggleCell = (year: number, mmDd: string, shiftKey: boolean) => {
    const key = dailyCellKey(year, mmDd);
    const last = lastSelectedCell ? parseDailyCellKey(lastSelectedCell) : null;

    if (shiftKey && last && years.includes(last.year) && rows.includes(last.mmDd)) {
      const rowStart = rows.indexOf(last.mmDd);
      const rowEnd = rows.indexOf(mmDd);
      const yearStart = years.indexOf(last.year);
      const yearEnd = years.indexOf(year);
      const [rowFrom, rowTo] = rowStart <= rowEnd ? [rowStart, rowEnd] : [rowEnd, rowStart];
      const [yearFrom, yearTo] = yearStart <= yearEnd ? [yearStart, yearEnd] : [yearEnd, yearStart];
      const next = new Set(selectedCells);
      for (let rowIndex = rowFrom; rowIndex <= rowTo; rowIndex += 1) {
        for (let yearIndex = yearFrom; yearIndex <= yearTo; yearIndex += 1) {
          next.add(dailyCellKey(years[yearIndex], rows[rowIndex]));
        }
      }
      onSelectedCellsChange(next);
    } else {
      const next = new Set(selectedCells);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onSelectedCellsChange(next);
    }

    onLastSelectedCellChange(key);
  };

  return (
    <TermTableSection
      title={`${monthLabel(data.detailMonth)} Daily ${valueUnitLabel(data)}`}
      subtitle={`${PERIOD_LABELS[data.period]} ${LMP_COMPONENT_LABELS[data.component]} | ${data.metadata.holidayAdjustment}`}
      action={action}
    >
      <table className="w-full min-w-[620px] border-collapse bg-[#0d1118] text-sm text-gray-100">
        <thead>
          <tr>
            <HeaderCell className="sticky left-0 z-20 text-left">Date</HeaderCell>
            {years.map((year) => (
              <HeaderCell key={year}>{year}</HeaderCell>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((mmDd) => (
            <tr key={mmDd} className="hover:bg-gray-900/50">
              <td className="sticky left-0 z-10 border border-gray-900 bg-[#0d1118] px-3 py-2 font-semibold text-gray-100">
                {mmDd}
              </td>
              {years.map((year) => {
                const key = dailyCellKey(year, mmDd);
                const point = byDay.get(mmDd)?.get(year);
                const value = toAverageNumber(point?.value);
                const selected = selectedCells.has(key);
                return (
                  <ValueCell
                    key={year}
                    value={point?.value}
                    selected={selected}
                    edited={hasDailyEdit(dailyEdits, key)}
                    editing={editingCell === key}
                    editValue={editingCell === key ? editingDraft : ""}
                    ariaLabel={`${year} ${mmDd}`}
                    onClick={(event) => toggleCell(year, mmDd, event.shiftKey)}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onStartEdit(year, mmDd, point?.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "F2") {
                        event.preventDefault();
                        onStartEdit(year, mmDd, point?.value);
                        return;
                      }
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleCell(year, mmDd, event.shiftKey);
                      }
                    }}
                    onEditValueChange={onEditDraftChange}
                    onEditCommit={onEditCommit}
                    onEditCancel={onEditCancel}
                    style={
                      heatmapEnabled
                        ? heatStyleFromValues(value, dailyHeatValuesByYear.get(year) ?? [])
                        : undefined
                    }
                  />
                );
              })}
            </tr>
          ))}
          {includeAverageRow && (
            <tr className="bg-gray-950/50 font-semibold hover:bg-gray-900/60">
              <td className="sticky left-0 z-10 border border-gray-900 bg-[#0a0f16] px-3 py-2 text-gray-100">Avg</td>
              {years.map((year) => {
                const value = yearAverages.get(year) ?? null;
                return (
                  <ValueCell
                    key={year}
                    value={value}
                    style={
                      heatmapEnabled ? heatStyleFromValues(value, yearAverageHeatValues) : undefined
                    }
                  />
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </TermTableSection>
  );
}

function DailySelectionPopover({
  stats,
  onClear,
}: {
  stats: DailySelectionStats | null;
  onClear: () => void;
}) {
  if (!stats) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100vw-2rem)] max-w-4xl -translate-x-1/2 rounded-lg border border-sky-500/30 bg-[#090d15]/95 px-3 py-2 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-300">
        <span className="font-semibold text-sky-100">{stats.rowLabel}</span>
        <span>
          <span className="text-gray-500">Count:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">
            {stats.observations.toLocaleString()}
          </span>
        </span>
        <span>
          <span className="text-gray-500">Avg:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">{fmtValue(stats.avg)}</span>
        </span>
        <span>
          <span className="text-gray-500">Sum:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">{fmtValue(stats.sum)}</span>
        </span>
        <span>
          <span className="text-gray-500">Min:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">{fmtValue(stats.min)}</span>
        </span>
        <span>
          <span className="text-gray-500">Max:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">{fmtValue(stats.max)}</span>
        </span>
        <span>
          <span className="text-gray-500">Cells:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">
            {stats.selectedCells.toLocaleString()}
          </span>
        </span>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function DailyChart({
  data,
  hiddenSeries,
  focused = false,
  valueLabel,
}: {
  data: PjmTermBiblePayload;
  hiddenSeries: Set<string>;
  focused?: boolean;
  valueLabel: string;
}) {
  const { years, byDay } = useMemo(() => buildDailyMaps(data.dailyValues), [data.dailyValues]);
  const chartData = useMemo(
    () =>
      [...byDay.entries()].map(([mmDd, yearMap]) => {
        const row: Record<string, string | number | null> = { mmDd };
        years.forEach((year) => {
          row[String(year)] = toNumber(yearMap.get(year)?.value);
        });
        return row;
      }),
    [byDay, years],
  );

  return (
    <div className={focused ? "h-[70vh]" : "h-[340px]"}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 18, bottom: 8, left: -10 }}>
          <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
          <XAxis
            dataKey="mmDd"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
            tickFormatter={(value) => Number(value).toFixed(0)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#111827",
              border: "1px solid #374151",
              borderRadius: 8,
              color: "#e5e7eb",
            }}
            labelStyle={{ color: "#f3f4f6" }}
            formatter={(value: unknown) => [fmtTooltipValue(value), valueLabel]}
          />
          {years.map((year, index) =>
            hiddenSeries.has(String(year)) ? null : (
              <Line
                key={year}
                type="monotone"
                dataKey={String(year)}
                name={String(year)}
                stroke={YEAR_COLORS[index % YEAR_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ),
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function PjmTermBible({
  refreshToken = 0,
  onFreshnessChange,
  tableOnly = false,
  hideControls = false,
  externalFilters,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmTermBibleFreshnessSummary) => void;
  tableOnly?: boolean;
  hideControls?: boolean;
  externalFilters?: PjmTermBibleExternalFilters;
}) {
  const [mode, setMode] = useState<TermBibleMode>(externalFilters?.mode ?? "single");
  const [month, setMonth] = useState(externalFilters?.month ?? currentMonth());
  const [startYear, setStartYear] = useState(externalFilters?.startYear ?? 2020);
  const [endYear, setEndYear] = useState(externalFilters?.endYear ?? todayYear());
  const [hub, setHub] = useState<HubName>(normalizeHub(externalFilters?.hub ?? "WESTERN HUB"));
  const [spreadFromHub, setSpreadFromHub] = useState<HubName>(
    normalizeHub(externalFilters?.spreadFromHub ?? "WESTERN HUB"),
  );
  const [spreadToHub, setSpreadToHub] = useState<HubName>(
    normalizeHub(externalFilters?.spreadToHub ?? "EASTERN HUB"),
  );
  const [product, setProduct] = useState<LmpProduct>(productFromMarket(externalFilters?.market));
  const [rtSource, setRtSource] = useState<RtLmpSource>(rtSourceFromMarket(externalFilters?.market));
  const [period, setPeriod] = useState<TermPeriod>(externalFilters?.period ?? "5x16");
  const [component, setComponent] = useState<LmpComponent>(externalFilters?.component ?? "total");
  const [data, setData] = useState<PjmTermBiblePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => new Set());
  const [tableHeatmapEnabled, setTableHeatmapEnabled] = useState(true);
  const [selectedDailyCells, setSelectedDailyCells] = useState<Set<string>>(() => new Set());
  const [lastSelectedDailyCell, setLastSelectedDailyCell] = useState<string | null>(null);
  const [dailyEdits, setDailyEdits] = useState<DailyEditMap>({});
  const [editingDailyCell, setEditingDailyCell] = useState<string | null>(null);
  const [editingDailyDraft, setEditingDailyDraft] = useState("");

  useEffect(() => {
    if (!externalFilters) return;
    setMode(externalFilters.mode);
    setMonth(externalFilters.month);
    setStartYear(externalFilters.startYear);
    setEndYear(externalFilters.endYear);
    setHub(normalizeHub(externalFilters.hub));
    setSpreadFromHub(normalizeHub(externalFilters.spreadFromHub));
    setSpreadToHub(normalizeHub(externalFilters.spreadToHub));
    setProduct(productFromMarket(externalFilters.market));
    setRtSource(rtSourceFromMarket(externalFilters.market));
    setPeriod(externalFilters.period);
    setComponent(externalFilters.component ?? "total");
  }, [externalFilters]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const forceRefresh = refreshToken > 0;
    const fetchPayload = (selectedHub: HubName) => {
      const url = buildUrl({
        product,
        rtSource,
        component,
        period,
        hub: selectedHub,
        startYear,
        endYear,
        month,
        refreshToken,
      });
      return fetchJsonWithCache<PjmTermBiblePayload>({
        key: `pjm-term-bible:${product}:${rtSource}:${component}:${period}:${selectedHub}:${startYear}:${endYear}:${month}`,
        url,
        ttlMs: API_CACHE_TTL_MS,
        signal: controller.signal,
        cacheMode: forceRefresh ? "no-store" : "default",
        forceRefresh,
      });
    };

    setLoading(true);
    setError(null);
    const request =
      mode === "spread"
        ? Promise.all([fetchPayload(spreadFromHub), fetchPayload(spreadToHub)]).then(
            ([fromPayload, toPayload]) =>
              buildSpreadPayload({
                fromPayload,
                toPayload,
                fromHub: spreadFromHub,
                toHub: spreadToHub,
              }),
          )
        : fetchPayload(hub);

    request
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setSelectedDailyCells(new Set());
        setLastSelectedDailyCell(null);
        setDailyEdits({});
        setEditingDailyCell(null);
        setEditingDailyDraft("");
      })
      .catch((err) => {
        if (!active) return;
        if (err.name !== "AbortError") {
          setError(err.message ?? "Failed to load PJM Term Bible");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    component,
    endYear,
    hub,
    mode,
    month,
    period,
    product,
    refreshToken,
    rtSource,
    spreadFromHub,
    spreadToHub,
    startYear,
  ]);

  const plotSeries = useMemo<PlotSeries[]>(() => {
    const years = data ? [...new Set(data.dailyValues.map((row) => row.year))].sort((a, b) => a - b) : [];
    return years.map((year, index) => ({
      key: String(year),
      label: String(year),
      color: YEAR_COLORS[index % YEAR_COLORS.length],
      defaultVisible: true,
    }));
  }, [data]);

  useEffect(() => {
    if (plotSeries.length === 0) return;
    const visibleYears = new Set(
      plotSeries.slice(-DEFAULT_VISIBLE_CHART_YEARS).map((series) => series.key),
    );
    setHiddenSeries(
      new Set(plotSeries.filter((series) => !visibleYears.has(series.key)).map((series) => series.key)),
    );
  }, [plotSeries]);

  const fallbackHubLabel = mode === "spread" ? `${spreadToHub} - ${spreadFromHub}` : hub;
  const termLabel = data
    ? `${data.pnodeName} ${
        data.product === "rt" ? `RT ${RT_SOURCE_LABELS[data.rtSource]}` : PRODUCT_LABELS[data.product]
      } ${PERIOD_LABELS[data.period]} ${LMP_COMPONENT_LABELS[data.component]}`
    : `${fallbackHubLabel} ${
        product === "rt" ? `RT ${RT_SOURCE_LABELS[rtSource]}` : PRODUCT_LABELS[product]
      } ${PERIOD_LABELS[period]} ${LMP_COMPONENT_LABELS[component]}`;

  const freshnessSummary = useMemo<PjmTermBibleFreshnessSummary | null>(() => {
    if (!data) return null;
    const status = loading ? "Refreshing" : "Current";
    return {
      status,
      statusClass: loading
        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
      summary: `${termLabel} through ${data.maxDate ?? "--"}`,
      targetDateLabel: `${data.startYear}-${data.endYear}`,
      latestDateLabel: data.maxDate ?? "--",
      latestUpdateLabel: fmtStamp(data.asOf),
    };
  }, [data, loading, termLabel]);

  useEffect(() => {
    if (freshnessSummary) onFreshnessChange?.(freshnessSummary);
  }, [freshnessSummary, onFreshnessChange]);

  const editedData = useMemo(
    () => {
      if (!data) return null;
      const previewEdits = { ...dailyEdits };
      if (editingDailyCell) {
        const parsed = parseDailyEditDraft(editingDailyDraft);
        if (parsed === null) delete previewEdits[editingDailyCell];
        else previewEdits[editingDailyCell] = parsed;
      }
      return applyDailyEdits(data, previewEdits);
    },
    [dailyEdits, data, editingDailyCell, editingDailyDraft],
  );

  const dailySelectionStats = useMemo(
    () => (editedData ? buildDailySelectionStats(editedData, selectedDailyCells) : null),
    [editedData, selectedDailyCells],
  );

  const editedCellCount = Object.keys(dailyEdits).length;

  const startDailyEdit = (
    year: number,
    mmDd: string,
    value: number | string | null | undefined,
  ) => {
    const key = dailyCellKey(year, mmDd);
    setEditingDailyCell(key);
    setEditingDailyDraft(hasDailyEdit(dailyEdits, key) ? fmtEditValue(dailyEdits[key]) : fmtEditValue(value));
  };

  const commitDailyEdit = (draft: string) => {
    if (!editingDailyCell) return;
    const parsed = parseDailyEditDraft(draft);
    setDailyEdits((current) => {
      const next = { ...current };
      if (parsed === null) delete next[editingDailyCell];
      else next[editingDailyCell] = parsed;
      return next;
    });
    setEditingDailyCell(null);
    setEditingDailyDraft("");
  };

  const cancelDailyEdit = () => {
    setEditingDailyCell(null);
    setEditingDailyDraft("");
  };

  const renderTableHeatmapAction = () => (
    <TableHeatmapToggle
      enabled={tableHeatmapEnabled}
      onToggle={() => setTableHeatmapEnabled((enabled) => !enabled)}
    />
  );

  const renderDailyTableAction = () => (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => {
          if (!editedData) return;
          downloadTextFile(
            `${dailyTableCsvFilename(editedData)}.csv`,
            buildDailyTableCsv(editedData, { includeAverageRow: !tableOnly }),
            "text/csv;charset=utf-8",
          );
        }}
        disabled={!editedData || editedData.dailyValues.length === 0}
        className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 transition-colors hover:border-sky-400/60 hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        CSV
      </button>
      <TableHeatmapToggle
        enabled={tableHeatmapEnabled}
        onToggle={() => setTableHeatmapEnabled((enabled) => !enabled)}
      />
      <button
        type="button"
        onClick={() => {
          setDailyEdits({});
          setEditingDailyCell(null);
          setEditingDailyDraft("");
        }}
        disabled={editedCellCount === 0}
        className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-gray-700 hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Reset edits
      </button>
      <button
        type="button"
        onClick={() => {
          setSelectedDailyCells(new Set());
          setLastSelectedDailyCell(null);
        }}
        disabled={selectedDailyCells.size === 0}
        className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-gray-700 hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Clear
      </button>
    </div>
  );

  const marketSelection: MarketOption =
    product === "da" ? "da" : rtSource === "unverified" ? "rt-unverified" : "rt-verified";
  const marketLabel =
    MARKET_OPTIONS.find((option) => option.value === marketSelection)?.label ?? "RT Verified";
  const handleMarketChange = (value: string) => {
    if (value === "da") {
      setProduct("da");
      setRtSource("verified");
      return;
    }
    setProduct("rt");
    setRtSource(value === "rt-unverified" ? "unverified" : "verified");
  };

  return (
    <div className="space-y-4">
      {!hideControls && (
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="View"
            value={mode}
            valueText={TERM_BIBLE_MODE_LABELS[mode]}
            minCh={13}
            onChange={(value) => setMode(value as TermBibleMode)}
          >
            {(["single", "spread"] as const).map((item) => (
              <option key={item} value={item}>
                {TERM_BIBLE_MODE_LABELS[item]}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Month"
            value={month}
            valueText={monthLabel(month)}
            minCh={8}
            maxCh={10}
            onChange={(value) => setMonth(Number(value))}
          >
            {MONTHS.map((item) => (
              <option key={item.number} value={item.number}>
                {item.label}
              </option>
            ))}
          </SelectField>

          <YearField
            label="Start"
            value={startYear}
            min={2014}
            max={endYear}
            onChange={(value) => {
              const next = Math.min(Math.max(value || endYear, 2014), endYear);
              setStartYear(next);
            }}
          />
          <YearField
            label="End"
            value={endYear}
            min={startYear}
            max={todayYear()}
            onChange={(value) => {
              const next = Math.min(Math.max(value || startYear, startYear), todayYear());
              setEndYear(next);
            }}
          />

          {mode === "spread" ? (
            <>
              <SelectField
                label="From Hub"
                value={spreadFromHub}
                valueText={spreadFromHub}
                minCh={18}
                maxCh={26}
                onChange={(value) => setSpreadFromHub(value as HubName)}
              >
                {HUBS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="To Hub"
                value={spreadToHub}
                valueText={spreadToHub}
                minCh={18}
                maxCh={26}
                onChange={(value) => setSpreadToHub(value as HubName)}
              >
                {HUBS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectField>
            </>
          ) : (
            <SelectField
              label="Hub"
              value={hub}
              valueText={hub}
              minCh={18}
              maxCh={26}
              onChange={(value) => setHub(value as HubName)}
            >
              {HUBS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectField>
          )}

          <SelectField
            label="Market"
            value={marketSelection}
            valueText={marketLabel}
            minCh={13}
            maxCh={18}
            onChange={handleMarketChange}
          >
            {MARKET_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Strip"
            value={period}
            valueText={TERM_PERIOD_OPTIONS.find((item) => item.value === period)?.label ?? PERIOD_LABELS[period]}
            minCh={18}
            maxCh={34}
            onChange={(value) => setPeriod(value as TermPeriod)}
          >
            {TERM_PERIOD_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Component"
            value={component}
            valueText={LMP_COMPONENT_LABELS[component]}
            minCh={12}
            maxCh={16}
            onChange={(value) => setComponent(value as LmpComponent)}
          >
            {LMP_COMPONENTS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="mt-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-800 pt-3 text-xs">
          <span className="font-semibold text-gray-300">{termLabel}</span>
          {mode === "spread" && (
            <span className="rounded-md border border-gray-800 bg-gray-950/50 px-2 py-1 font-semibold text-gray-500">
              Spread = {spreadToHub} - {spreadFromHub}
            </span>
          )}
        </div>
      </section>
      )}

      {loading && !data && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Loading PJM Term Bible...
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {editedData && (
        <>
          <TermSummaryTable
            data={editedData}
            heatmapEnabled={tableHeatmapEnabled}
            includeSummaryStats={!tableOnly}
            action={renderTableHeatmapAction()}
          />

          {editedData.dailyValues.length > 0 ? (
            <div className={tableOnly ? "space-y-4" : "grid items-start gap-4 2xl:grid-cols-[minmax(520px,0.9fr)_minmax(620px,1.1fr)]"}>
              <DailyValuesTable
                data={editedData}
                heatmapEnabled={tableHeatmapEnabled}
                includeAverageRow={!tableOnly}
                selectedCells={selectedDailyCells}
                lastSelectedCell={lastSelectedDailyCell}
                dailyEdits={dailyEdits}
                editingCell={editingDailyCell}
                editingDraft={editingDailyDraft}
                action={renderDailyTableAction()}
                onSelectedCellsChange={setSelectedDailyCells}
                onLastSelectedCellChange={setLastSelectedDailyCell}
                onStartEdit={startDailyEdit}
                onEditDraftChange={setEditingDailyDraft}
                onEditCommit={commitDailyEdit}
                onEditCancel={cancelDailyEdit}
              />
              {!tableOnly && (
                <PlotCard
                  title={`${monthLabel(editedData.detailMonth)} Daily ${valueUnitLabel(editedData)}`}
                  subtitle={termLabel}
                  series={plotSeries}
                  hiddenSeries={hiddenSeries}
                  onToggleSeries={(key) =>
                    setHiddenSeries((current) => {
                      const next = new Set(current);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  onShowAll={() => setHiddenSeries(new Set())}
                  onHideAll={() => setHiddenSeries(new Set(plotSeries.map((series) => series.key)))}
                  focusedChildren={
                    <DailyChart
                      data={editedData}
                      hiddenSeries={hiddenSeries}
                      valueLabel={valueUnitLabel(editedData)}
                      focused
                    />
                  }
                >
                  <DailyChart data={editedData} hiddenSeries={hiddenSeries} valueLabel={valueUnitLabel(editedData)} />
                </PlotCard>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-gray-800 bg-[#12141d] p-4 text-sm text-gray-400">
              No daily values are available for {monthLabel(editedData.detailMonth)} in this selection.
            </div>
          )}
          <DailySelectionPopover
            stats={dailySelectionStats}
            onClear={() => {
              setSelectedDailyCells(new Set());
              setLastSelectedDailyCell(null);
            }}
          />
        </>
      )}
    </div>
  );
}
