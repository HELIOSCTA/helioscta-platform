"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

export interface PjmGenerationFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface SourceFreshness {
  sourceTable: string;
  rowCount: number;
  minEpt: string | null;
  maxEpt: string | null;
  latestUpdateAt: string | null;
}

interface FuelHour {
  fuelType: string;
  mw: number | null;
  share: number | null;
  isRenewable: boolean | null;
}

interface HourlyGenerationRow {
  operatingDate: string;
  hourEpt: string;
  hourUtc: string;
  hourBeginning: number;
  totalGenerationMw: number | null;
  renewableMw: number | null;
  nonrenewableMw: number | null;
  renewableSharePct: number | null;
  fuels: FuelHour[];
  ecoMaxMw: number | null;
  emergencyMaxMw: number | null;
  totalCommittedMw: number | null;
  rtEcomaxMw: number | null;
  rtEcomaxSuppressed: boolean;
  confidentialityDisclaimer: string | null;
  selfScheduledEcomaxMw: number | null;
}

interface FuelSummaryRow {
  fuelType: string;
  isRenewable: boolean | null;
  hourlyRows: number;
  avgMw: number | null;
  minMw: number | null;
  maxMw: number | null;
  totalMwh: number | null;
  avgSharePct: number | null;
}

interface DailyFuelSummaryRow {
  date: string;
  fuelType: string;
  hourlyRows: number;
  flatAvgMw: number | null;
  onPeakAvgMw: number | null;
  offPeakAvgMw: number | null;
  minMw: number | null;
  maxMw: number | null;
  totalMwh: number | null;
  avgSharePct: number | null;
  maxUpRampMw: number | null;
  maxDownRampMw: number | null;
}

interface RampRow {
  date: string;
  hourEpt: string;
  hourBeginning: number;
  hourEnding: number;
  fuelType: string;
  rampMw: number | null;
}

interface DateCoverage {
  date: string;
  hourCount: number;
  isComplete: boolean;
}

interface GenerationSummary {
  hourCount: number;
  fuelCount: number;
  avgGenerationMw: number | null;
  peakGenerationMw: number | null;
  peakGenerationHourEpt: string | null;
  avgRenewableSharePct: number | null;
  avgEcoMaxMw: number | null;
  avgEmergencyMaxMw: number | null;
  avgTotalCommittedMw: number | null;
  avgRtEcomaxMw: number | null;
  avgSelfScheduledEcomaxMw: number | null;
  avgGenerationToEcoMaxPct: number | null;
  avgGenerationToCommittedPct: number | null;
  rtEcomaxAvailableHours: number;
  rtEcomaxSuppressedHours: number;
}

interface GenerationPayload {
  iso: "pjm";
  source: string;
  requestedDate: string | null;
  selectedDate: string | null;
  selectedStartDate: string | null;
  selectedDates: string[];
  lookbackDays: number;
  latestCommonDate: string | null;
  availableDates: string[];
  availableDateCoverage: DateCoverage[];
  selectedDateCoverage: DateCoverage | null;
  fuelTypes: string[];
  asOf: string | null;
  freshness: SourceFreshness[];
  summary: GenerationSummary;
  hourly: HourlyGenerationRow[];
  fuelSummary: FuelSummaryRow[];
  dailySummary: DailyFuelSummaryRow[];
  rampRows: RampRow[];
}

interface GenerationChartRow {
  hourLabel: string;
  hourEpt: string;
  totalGenerationMw: number | null;
  ecoMaxMw: number | null;
  emergencyMaxMw: number | null;
  totalCommittedMw: number | null;
  rtEcomaxMw: number | null;
  selfScheduledEcomaxMw: number | null;
  [key: string]: string | number | null;
}

interface HourlyMatrixRow {
  date: string;
  fuelType: string;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const TOTAL_FUEL_TYPE = "Total";
const LOOKBACK_OPTIONS = [1, 3, 7, 14] as const;
const HOURS = Array.from({ length: 24 }, (_, index) => index + 1);
const DEFAULT_RAMP_FUELS = [TOTAL_FUEL_TYPE, "Gas", "Coal"];
const FUEL_COLORS: Record<string, string> = {
  [TOTAL_FUEL_TYPE]: "#f8fafc",
  Coal: "#9ca3af",
  Gas: "#38bdf8",
  Hydro: "#06b6d4",
  Multiple: "#c084fc",
  "Multiple Fuels": "#c084fc",
  Nuclear: "#facc15",
  Oil: "#ef4444",
  Other: "#a78bfa",
  "Other Renewables": "#84cc16",
  Solar: "#f97316",
  Storage: "#f43f5e",
  Wind: "#22c55e",
};
const FALLBACK_COLORS = [
  "#38bdf8",
  "#f97316",
  "#22c55e",
  "#f43f5e",
  "#a78bfa",
  "#facc15",
  "#14b8a6",
  "#fb7185",
  "#60a5fa",
  "#c084fc",
];
const DAY_COLORS = [
  "#60a5fa",
  "#f97316",
  "#22c55e",
  "#f43f5e",
  "#c084fc",
  "#facc15",
  "#14b8a6",
  "#fb7185",
  "#a3e635",
  "#38bdf8",
  "#e879f9",
  "#f59e0b",
  "#10b981",
  "#94a3b8",
];

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmtMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString()} MW`;
}

function fmtSignedMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString()}`;
}

function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString();
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").replace("Z", "").slice(0, 16);
}

function fmtShortDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(5);
}

function hourEndingFromBeginning(hourBeginning: number): number {
  return (hourBeginning % 24) + 1;
}

function fmtHeFromBeginning(hourBeginning: number): string {
  return `HE${hourEndingFromBeginning(hourBeginning)}`;
}

function fmtHe(hourEnding: number): string {
  return `HE${hourEnding}`;
}

function fuelKey(fuelType: string): string {
  return `fuel:${fuelType}`;
}

function dayKey(date: string): string {
  return `date:${date}`;
}

function rampKey(fuelType: string): string {
  return `ramp:${fuelType}`;
}

function fuelLabel(key: string): string {
  return key.startsWith("fuel:") ? key.slice(5) : key;
}

function fuelColor(fuelType: string, index: number): string {
  return FUEL_COLORS[fuelType] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function fuelMw(row: HourlyGenerationRow, fuelType: string): number | null {
  if (fuelType === TOTAL_FUEL_TYPE) return row.totalGenerationMw;
  return row.fuels.find((fuel) => fuel.fuelType === fuelType)?.mw ?? null;
}

function buildApiUrl(endDate: string, lookbackDays: number, refresh: boolean): string {
  const params = new URLSearchParams();
  if (endDate) params.set("endDate", endDate);
  params.set("lookbackDays", String(lookbackDays));
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-generation?${params.toString()}`;
}

function cacheKey(endDate: string, lookbackDays: number): string {
  return ["api:pjm-generation", endDate || "latest", lookbackDays].join(":");
}

function defaultProfileFuel(fuelTypes: string[]): string {
  if (fuelTypes.includes("Gas")) return "Gas";
  if (fuelTypes.includes(TOTAL_FUEL_TYPE)) return TOTAL_FUEL_TYPE;
  return fuelTypes[0] ?? TOTAL_FUEL_TYPE;
}

function defaultRampFuels(fuelTypes: string[]): string[] {
  const defaults = DEFAULT_RAMP_FUELS.filter((fuel) => fuelTypes.includes(fuel));
  return defaults.length ? defaults : fuelTypes.slice(0, 3);
}

function fmtDateOption(date: string, coverage: DateCoverage | undefined): string {
  if (!coverage || coverage.isComplete) return date;
  return `${date} (${coverage.hourCount}/24)`;
}

function freshnessFromPayload(payload: GenerationPayload | null): PjmGenerationFreshnessSummary {
  if (!payload) {
    return {
      status: "Unknown",
      statusClass: "border-gray-700 bg-gray-900 text-gray-400",
      summary: "Generation --",
      targetDateLabel: "--",
      latestDateLabel: "--",
      latestUpdateLabel: "--",
    };
  }

  const hasData = payload.summary.hourCount > 0;
  const targetLabel =
    payload.selectedStartDate && payload.selectedDate
      ? `${payload.selectedStartDate} to ${payload.selectedDate}`
      : payload.selectedDate ?? "--";
  return {
    status: hasData ? "Current" : "No Data",
    statusClass: hasData
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
    summary: `${targetLabel} | ${payload.summary.hourCount} hours | ${payload.summary.fuelCount} fuels`,
    targetDateLabel: targetLabel,
    latestDateLabel: payload.latestCommonDate ?? "--",
    latestUpdateLabel: fmtDateTime(payload.asOf),
  };
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gray-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "good" | "warn" | "neutral" }) {
  const className =
    tone === "good"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
        ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
        : "border-gray-700 bg-gray-900 text-gray-400";
  return (
    <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

function tooltipStyle() {
  return {
    background: "#111827",
    border: "1px solid #374151",
    borderRadius: 8,
    color: "#e5e7eb",
  };
}

function metricBound(values: Array<number | null>): number {
  const numericValues = values.filter((value): value is number => value !== null);
  return numericValues.length ? Math.max(...numericValues.map((value) => Math.abs(value))) : 0;
}

export default function PjmGeneration({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmGenerationFreshnessSummary) => void;
}) {
  const [endDate, setEndDate] = useState("");
  const [lookbackDays, setLookbackDays] = useState<number>(7);
  const [profileFuel, setProfileFuel] = useState("Gas");
  const [rampFuels, setRampFuels] = useState<string[]>(DEFAULT_RAMP_FUELS);
  const [data, setData] = useState<GenerationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    const url = buildApiUrl(endDate, lookbackDays, refreshToken > 0);

    fetchJsonWithCache<GenerationPayload>({
      key: cacheKey(endDate, lookbackDays),
      url,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        onFreshnessChange?.(freshnessFromPayload(payload));
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setError(err.message || "Failed to load PJM generation data");
        setData(null);
        onFreshnessChange?.({
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Generation query failed",
          targetDateLabel: endDate || "--",
          latestDateLabel: "--",
          latestUpdateLabel: "-",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [endDate, lookbackDays, onFreshnessChange, refreshToken]);

  useEffect(() => {
    if (!data) return;
    if (!data.fuelTypes.includes(profileFuel)) {
      setProfileFuel(defaultProfileFuel(data.fuelTypes));
    }
    setRampFuels((current) => {
      const retained = current.filter((fuel) => data.fuelTypes.includes(fuel));
      return retained.length ? retained : defaultRampFuels(data.fuelTypes);
    });
  }, [data, profileFuel]);

  const selectedDateValue = endDate || data?.selectedDate || "";
  const coverageByDate = useMemo(() => {
    return new Map((data?.availableDateCoverage ?? []).map((row) => [row.date, row]));
  }, [data]);
  const selectedDayRows = useMemo(
    () => data?.hourly.filter((row) => row.operatingDate === data.selectedDate) ?? [],
    [data],
  );
  const selectedDateCoverage =
    data?.selectedDateCoverage ?? (data?.selectedDate ? coverageByDate.get(data.selectedDate) ?? null : null);
  const topFuels = useMemo(() => data?.fuelSummary.slice(0, 12) ?? [], [data]);
  const tableFuelTypes = useMemo(() => data?.fuelTypes ?? [], [data]);
  const selectedRampFuels = useMemo(
    () => rampFuels.filter((fuel) => data?.fuelTypes.includes(fuel)),
    [data, rampFuels],
  );
  const rampFuelOptions = useMemo(() => {
    if (!data) return [];
    const topFuelNames = topFuels.map((fuel) => fuel.fuelType);
    return [TOTAL_FUEL_TYPE, ...topFuelNames, ...data.fuelTypes.filter((fuel) => fuel !== TOTAL_FUEL_TYPE && !topFuelNames.includes(fuel))];
  }, [data, topFuels]);

  const selectedDayChartRows = useMemo<GenerationChartRow[]>(() => {
    return selectedDayRows.map((row) => {
      const chartRow: GenerationChartRow = {
        hourLabel: fmtHeFromBeginning(row.hourBeginning),
        hourEpt: row.hourEpt,
        totalGenerationMw: row.totalGenerationMw,
        ecoMaxMw: row.ecoMaxMw,
        emergencyMaxMw: row.emergencyMaxMw,
        totalCommittedMw: row.totalCommittedMw,
        rtEcomaxMw: row.rtEcomaxMw,
        selfScheduledEcomaxMw: row.selfScheduledEcomaxMw,
      };
      for (const fuel of row.fuels) {
        chartRow[fuelKey(fuel.fuelType)] = fuel.mw;
      }
      return chartRow;
    });
  }, [selectedDayRows]);

  const profileRows = useMemo<Array<Record<string, number | string | null>>>(() => {
    if (!data) return [];
    return HOURS.map((hour) => {
      const point: Record<string, number | string | null> = {
        hourEnding: hour,
        hourLabel: fmtHe(hour),
      };
      for (const date of data.selectedDates) {
        const row = data.hourly.find(
          (item) =>
            item.operatingDate === date && hourEndingFromBeginning(item.hourBeginning) === hour,
        );
        point[dayKey(date)] = row ? fuelMw(row, profileFuel) : null;
      }
      return point;
    });
  }, [data, profileFuel]);

  const rampChartRows = useMemo<Array<Record<string, number | string | null>>>(() => {
    if (!data?.selectedDate) return [];
    return HOURS.map((hour) => {
      const point: Record<string, number | string | null> = {
        hourEnding: hour,
        hourLabel: fmtHe(hour),
      };
      for (const fuel of selectedRampFuels) {
        const row = data.rampRows.find(
          (item) =>
            item.date === data.selectedDate &&
            item.hourEnding === hour &&
            item.fuelType === fuel,
        );
        point[rampKey(fuel)] = row?.rampMw ?? null;
      }
      return point;
    });
  }, [data, selectedRampFuels]);

  const hourlyValueMap = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!data) return map;
    for (const row of data.hourly) {
      const hour = hourEndingFromBeginning(row.hourBeginning);
      for (const fuel of data.fuelTypes) {
        map.set(`${row.operatingDate}|${fuel}|${hour}`, fuelMw(row, fuel));
      }
    }
    return map;
  }, [data]);

  const rampValueMap = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!data) return map;
    for (const row of data.rampRows) {
      map.set(`${row.date}|${row.fuelType}|${row.hourEnding}`, row.rampMw);
    }
    return map;
  }, [data]);

  const hourlyMatrixRows = useMemo<HourlyMatrixRow[]>(() => {
    if (!data) return [];
    return data.selectedDates.flatMap((date) =>
      tableFuelTypes.map((fuelType) => ({ date, fuelType })),
    );
  }, [data, tableFuelTypes]);

  const rampMatrixRows = useMemo<HourlyMatrixRow[]>(() => {
    if (!data) return [];
    return data.selectedDates.flatMap((date) =>
      selectedRampFuels.map((fuelType) => ({ date, fuelType })),
    );
  }, [data, selectedRampFuels]);

  const totalRampValues = useMemo(() => {
    return data?.rampRows
      .filter((row) => row.fuelType === TOTAL_FUEL_TYPE)
      .map((row) => row.rampMw) ?? [];
  }, [data]);
  const maxUpRamp = useMemo(() => {
    const values = totalRampValues.filter((value): value is number => value !== null);
    return values.length ? Math.max(...values) : null;
  }, [totalRampValues]);
  const maxDownRamp = useMemo(() => {
    const values = totalRampValues.filter((value): value is number => value !== null);
    return values.length ? Math.min(...values) : null;
  }, [totalRampValues]);
  const rampAxisBound = metricBound(
    rampChartRows.flatMap((row) =>
      selectedRampFuels.map((fuel) => toNumber(row[rampKey(fuel)])),
    ),
  );

  const chartSubtitle = data?.selectedDate
    ? `${data.selectedDate} EPT | ${selectedDayRows.length} hourly records`
    : "Latest fuel-mix operating day";
  const rangeLabel =
    data?.selectedStartDate && data.selectedDate
      ? `${data.selectedStartDate} to ${data.selectedDate}`
      : data?.selectedDate ?? "--";
  const rtAvailabilityTone =
    data && data.summary.hourCount > 0 && data.summary.rtEcomaxAvailableHours === data.summary.hourCount
      ? "good"
      : "warn";
  const selectedDateCoverageTone =
    selectedDateCoverage && selectedDateCoverage.isComplete ? "good" : "warn";

  const toggleRampFuel = (fuelType: string) => {
    setRampFuels((current) =>
      current.includes(fuelType)
        ? current.filter((item) => item !== fuelType)
        : [...current, fuelType],
    );
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(180px,260px)_minmax(260px,1fr)_minmax(180px,260px)] lg:items-end">
          <label className="w-full">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              End Date
            </span>
            <select
              value={selectedDateValue}
              onChange={(event) => setEndDate(event.target.value)}
              disabled={!data?.availableDates.length}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 disabled:cursor-not-allowed disabled:text-gray-600 focus:border-gray-500 focus:outline-none"
            >
              {(data?.availableDates ?? []).map((date) => (
                <option key={date} value={date}>
                  {fmtDateOption(date, coverageByDate.get(date))}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Lookback
            </span>
            <div className="grid grid-cols-4 overflow-hidden rounded-md border border-gray-700 bg-gray-900">
              {LOOKBACK_OPTIONS.map((days) => {
                const active = lookbackDays === days;
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setLookbackDays(days)}
                    aria-pressed={active}
                    className={`px-3 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? "bg-gray-700 text-white"
                        : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                    }`}
                  >
                    {days}D
                  </button>
                );
              })}
            </div>
          </div>

          <label className="w-full">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Profile Fuel
            </span>
            <select
              value={profileFuel}
              onChange={(event) => setProfileFuel(event.target.value)}
              disabled={!data?.fuelTypes.length}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 disabled:cursor-not-allowed disabled:text-gray-600 focus:border-gray-500 focus:outline-none"
            >
              {(data?.fuelTypes ?? [profileFuel]).map((fuel) => (
                <option key={fuel} value={fuel}>
                  {fuel}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge
            label={`${data?.availableDates.length ?? 0} fuel days`}
            tone={data?.availableDates.length ? "good" : "warn"}
          />
          <StatusBadge
            label={`${data?.selectedDates.length ?? 0}/${lookbackDays} selected days`}
            tone={data?.selectedDates.length ? "good" : "warn"}
          />
          <StatusBadge
            label={`Selected day ${selectedDateCoverage?.hourCount ?? selectedDayRows.length}/24 hours`}
            tone={selectedDateCoverageTone}
          />
          <StatusBadge
            label={`RT ecomax ${data?.summary.rtEcomaxAvailableHours ?? 0}/${data?.summary.hourCount ?? 0}`}
            tone={rtAvailabilityTone}
          />
          <StatusBadge label={`As of ${fmtDateTime(data?.asOf)}`} tone="neutral" />
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {loading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading generation data...
        </div>
      )}

      {data && !loading && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <StatTile label="Avg Generation" value={fmtMw(data.summary.avgGenerationMw)} sub={rangeLabel} />
            <StatTile
              label="Peak Generation"
              value={fmtMw(data.summary.peakGenerationMw)}
              sub={fmtDateTime(data.summary.peakGenerationHourEpt)}
            />
            <StatTile
              label="Renewable Share"
              value={fmtPct(data.summary.avgRenewableSharePct)}
              sub={`${data.summary.fuelCount} fuel buckets`}
            />
            <StatTile
              label="Economic Max"
              value={fmtMw(data.summary.avgEcoMaxMw)}
              sub={`${fmtPct(data.summary.avgGenerationToEcoMaxPct)} utilized`}
            />
            <StatTile label="Max Up Ramp" value={fmtMw(maxUpRamp)} sub="Total generation" />
            <StatTile label="Max Down Ramp" value={fmtSignedMw(maxDownRamp)} sub="MW/hr total generation" />
          </div>

          {data.summary.rtEcomaxSuppressedHours > 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
              RT load and reserve economic max is suppressed for{" "}
              {data.summary.rtEcomaxSuppressedHours} hourly records by the source confidentiality
              disclaimer.
            </div>
          )}

          <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-100">Selected Day Fuel Mix And Capacity</h2>
                <p className="mt-1 text-xs text-gray-500">{chartSubtitle}</p>
              </div>
              <div className="flex max-w-full flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                {topFuels.map((fuel, index) => (
                  <span key={fuel.fuelType} className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: fuelColor(fuel.fuelType, index) }}
                      aria-hidden="true"
                    />
                    {fuel.fuelType}
                  </span>
                ))}
              </div>
            </div>

            {selectedDayChartRows.length ? (
              <div className="h-[410px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={selectedDayChartRows}
                    margin={{ top: 12, right: 18, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="hourLabel"
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      minTickGap={14}
                    />
                    <YAxis
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                      width={58}
                      label={{ value: "MW", angle: -90, position: "insideLeft", fill: "#6b7280" }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      labelFormatter={(label) => `${String(label)} EPT`}
                      formatter={(value, name) => [
                        fmtMw(toNumber(value)),
                        fuelLabel(String(name))
                          .replace("totalGenerationMw", "Total generation")
                          .replace("ecoMaxMw", "Economic max")
                          .replace("emergencyMaxMw", "Emergency max")
                          .replace("totalCommittedMw", "Total committed")
                          .replace("rtEcomaxMw", "RT load/reserve ecomax")
                          .replace("selfScheduledEcomaxMw", "Self-scheduled ecomax"),
                      ]}
                    />
                    {topFuels.map((fuel, index) => (
                      <Area
                        key={fuel.fuelType}
                        type="monotone"
                        dataKey={fuelKey(fuel.fuelType)}
                        name={fuel.fuelType}
                        stackId="fuel"
                        stroke={fuelColor(fuel.fuelType, index)}
                        fill={fuelColor(fuel.fuelType, index)}
                        fillOpacity={0.68}
                        strokeWidth={1}
                        isAnimationActive={false}
                      />
                    ))}
                    <Line
                      type="monotone"
                      dataKey="totalGenerationMw"
                      name="Total generation"
                      stroke="#ffffff"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="ecoMaxMw"
                      name="Economic max"
                      stroke="#60a5fa"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="emergencyMaxMw"
                      name="Emergency max"
                      stroke="#fb7185"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="totalCommittedMw"
                      name="Total committed"
                      stroke="#a3e635"
                      strokeWidth={2}
                      strokeDasharray="8 5"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="selfScheduledEcomaxMw"
                      name="Self-scheduled ecomax"
                      stroke="#f97316"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="rtEcomaxMw"
                      name="RT load/reserve ecomax"
                      stroke="#c084fc"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[320px] items-center justify-center rounded-md border border-gray-800 bg-gray-950/40 text-sm text-gray-500">
                No generation rows are available for the selected day.
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-100">Fuel Profile Lookback</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {profileFuel} hourly levels | {rangeLabel}
                </p>
              </div>
              <div className="flex max-w-full flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                {data.selectedDates.map((date, index) => (
                  <span key={date} className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-3.5 rounded-sm"
                      style={{ backgroundColor: DAY_COLORS[index % DAY_COLORS.length] }}
                      aria-hidden="true"
                    />
                    {fmtShortDate(date)}
                  </span>
                ))}
              </div>
            </div>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={profileRows} margin={{ top: 12, right: 18, bottom: 8, left: 8 }}>
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                  <XAxis dataKey="hourLabel" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                    width={58}
                    label={{ value: "MW", angle: -90, position: "insideLeft", fill: "#6b7280" }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    labelFormatter={(label) => `${String(label)} EPT`}
                    formatter={(value, name) => [fmtMw(toNumber(value)), String(name).replace("date:", "")]}
                  />
                  {data.selectedDates.map((date, index) => (
                    <Line
                      key={date}
                      type="monotone"
                      dataKey={dayKey(date)}
                      name={date}
                      stroke={DAY_COLORS[index % DAY_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
            <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-100">Selected Day Ramps</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Hour-over-hour fuel movement | {data.selectedDate ?? "--"} | MW/hr
                </p>
              </div>
              <div className="flex max-w-full flex-wrap gap-2">
                {rampFuelOptions.map((fuel, index) => {
                  const checked = selectedRampFuels.includes(fuel);
                  return (
                    <label
                      key={fuel}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                        checked
                          ? "border-gray-600 bg-gray-800 text-gray-100"
                          : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRampFuel(fuel)}
                        className="h-3 w-3 accent-sky-500"
                      />
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ backgroundColor: fuelColor(fuel, index) }}
                        aria-hidden="true"
                      />
                      {fuel}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rampChartRows}
                  margin={{ top: 8, right: 18, bottom: 8, left: 8 }}
                  barGap={1}
                  barCategoryGap="18%"
                >
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                  <XAxis dataKey="hourLabel" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis
                    domain={rampAxisBound ? [-rampAxisBound, rampAxisBound] : undefined}
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                    width={58}
                    label={{ value: "MW/hr", angle: -90, position: "insideLeft", fill: "#6b7280" }}
                  />
                  <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    labelFormatter={(label) => `${String(label)} EPT`}
                    formatter={(value, name) => [
                      fmtSignedMw(toNumber(value)),
                      String(name).replace("ramp:", ""),
                    ]}
                  />
                  {selectedRampFuels.map((fuel, index) => (
                    <Bar
                      key={fuel}
                      dataKey={rampKey(fuel)}
                      name={fuel}
                      fill={fuelColor(fuel, index)}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <DataTableShell
            title="Daily Fuel Summary"
            subtitle="Date and fuel rows with flat, OnPeak, OffPeak, daily extrema, share, and intraday ramp statistics."
          >
            <table className="w-full min-w-[1180px] border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr>
                  {[
                    "Date",
                    "Fuel",
                    "Hours",
                    "Flat Avg",
                    "OnPeak Avg",
                    "OffPeak Avg",
                    "Min",
                    "Max",
                    "MWh",
                    "Share",
                    "Max Up",
                    "Max Down",
                  ].map((label, index) => (
                    <th
                      key={label}
                      className={`px-3 py-2 font-semibold uppercase tracking-wide ${
                        index < 2 ? "text-left" : "text-right"
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.dailySummary.map((row) => (
                  <tr
                    key={`${row.date}-${row.fuelType}`}
                    className={row.fuelType === TOTAL_FUEL_TYPE ? "bg-gray-950/30" : "hover:bg-gray-900/60"}
                  >
                    <td className="px-3 py-2 text-left tabular-nums text-gray-400">{row.date}</td>
                    <td className="px-3 py-2 text-left font-semibold text-gray-100">{row.fuelType}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.hourlyRows)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.flatAvgMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.onPeakAvgMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.offPeakAvgMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.minMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.maxMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.totalMwh)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPct(row.avgSharePct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtSignedMw(row.maxUpRampMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtSignedMw(row.maxDownRampMw)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>

          <DataTableShell
            title="Hourly Levels Matrix"
            subtitle="Rows are date and fuel. Columns are HE1-HE24. MW values."
          >
            <table className="w-full min-w-[1680px] border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Date</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Fuel</th>
                  {HOURS.map((hour) => (
                    <th key={hour} className="px-2 py-2 text-right font-semibold uppercase tracking-wide">
                      {fmtHe(hour)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {hourlyMatrixRows.map((row) => (
                  <tr
                    key={`level-${row.date}-${row.fuelType}`}
                    className={row.fuelType === TOTAL_FUEL_TYPE ? "bg-gray-950/30" : "hover:bg-gray-900/60"}
                  >
                    <td className="px-3 py-2 text-left tabular-nums text-gray-400">{row.date}</td>
                    <td className="px-3 py-2 text-left font-semibold text-gray-100">{row.fuelType}</td>
                    {HOURS.map((hour) => (
                      <td key={hour} className="px-2 py-2 text-right tabular-nums">
                        {fmtNumber(hourlyValueMap.get(`${row.date}|${row.fuelType}|${hour}`))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>

          <DataTableShell
            title="Hourly Ramp Matrix"
            subtitle="Rows are date and selected ramp fuel. Columns are HE1-HE24. First hour per day is blank."
          >
            <table className="w-full min-w-[1680px] border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Date</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Fuel</th>
                  {HOURS.map((hour) => (
                    <th key={hour} className="px-2 py-2 text-right font-semibold uppercase tracking-wide">
                      {fmtHe(hour)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rampMatrixRows.map((row) => (
                  <tr
                    key={`ramp-${row.date}-${row.fuelType}`}
                    className={row.fuelType === TOTAL_FUEL_TYPE ? "bg-gray-950/30" : "hover:bg-gray-900/60"}
                  >
                    <td className="px-3 py-2 text-left tabular-nums text-gray-400">{row.date}</td>
                    <td className="px-3 py-2 text-left font-semibold text-gray-100">{row.fuelType}</td>
                    {HOURS.map((hour) => (
                      <td key={hour} className="px-2 py-2 text-right tabular-nums">
                        {fmtSignedMw(rampValueMap.get(`${row.date}|${row.fuelType}|${hour}`))}
                      </td>
                    ))}
                  </tr>
                ))}
                {!rampMatrixRows.length && (
                  <tr>
                    <td colSpan={26} className="px-3 py-8 text-center text-sm text-gray-500">
                      Select at least one ramp fuel.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </DataTableShell>

          <DataTableShell title="Source Windows" subtitle="Raw table coverage behind the view.">
            <table className="w-full min-w-[760px] border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr>
                  {["Source", "Rows", "Min EPT", "Max EPT", "Updated"].map((label) => (
                    <th
                      key={label}
                      className="px-3 py-2 text-right font-semibold uppercase tracking-wide first:text-left"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.freshness.map((row) => (
                  <tr key={row.sourceTable} className="hover:bg-gray-900/60">
                    <td className="px-3 py-2 text-left font-semibold text-gray-100">
                      {row.sourceTable}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtNumber(row.rowCount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtDateTime(row.minEpt)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtDateTime(row.maxEpt)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtDateTime(row.latestUpdateAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        </>
      )}
    </div>
  );
}
