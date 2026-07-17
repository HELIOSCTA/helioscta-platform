"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DataTableShell from "@/components/dashboard/DataTableShell";
import PlotCard, { type PlotSeries } from "@/components/dashboard/PlotCard";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type Market = "rt" | "da";
type RtSource = "verified" | "unverified";
type ComponentKey = "total" | "energy" | "congestion" | "loss";
type HourFilter = "weekday_onpeak" | "all_he8_23" | "offpeak" | "all_hours";

export interface PjmPriceDurationCurvesFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface DurationSeriesRow {
  year: number;
  xPct: number;
  price: number;
  rank: number;
  datetimeBeginningEpt: string;
  hourEnding: number;
}

interface DurationSummaryRow {
  year: number | "all";
  hourCount: number;
  min: number | null;
  max: number | null;
  average: number | null;
  p50: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  countAboveThreshold: number | null;
}

interface DurationPayload {
  iso: "pjm";
  market: Market;
  rtSource: RtSource;
  hub: string;
  component: ComponentKey;
  month: number;
  monthLabel: string;
  years: number[];
  hourFilter: HourFilter;
  hourFilterLabel: string;
  threshold: number | null;
  source: string;
  sourceTable: string;
  asOf: string | null;
  rowCount: number;
  maxYears: number;
  metadata: {
    xAxis: string;
    yAxis: string;
    sorting: string;
    holidayAdjustment: string | null;
    availableHubs: readonly string[];
  };
  summary: DurationSummaryRow[];
  overallSummary: DurationSummaryRow;
  series: DurationSeriesRow[];
}

interface ChartRow {
  xPct: number;
  [key: `y${number}`]: number | null;
}

const API_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_YEARS = "2021,2022,2023,2024,2025";
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
const MONTHS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
] as const;
const COMPONENTS: Array<{ key: ComponentKey; label: string }> = [
  { key: "total", label: "Total LMP" },
  { key: "energy", label: "Energy" },
  { key: "congestion", label: "Congestion" },
  { key: "loss", label: "Loss" },
];
const HOUR_FILTERS: Array<{ key: HourFilter; label: string }> = [
  { key: "weekday_onpeak", label: "Weekday HE8-23" },
  { key: "all_he8_23", label: "All HE8-23" },
  { key: "offpeak", label: "Off-peak" },
  { key: "all_hours", label: "All hours" },
];
const YEAR_COLORS = [
  "#38bdf8",
  "#f97316",
  "#22c55e",
  "#f43f5e",
  "#a78bfa",
  "#eab308",
  "#14b8a6",
  "#fb7185",
  "#60a5fa",
  "#c084fc",
];

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `$${Math.round(value).toLocaleString()}`;
}

function fmtPriceCompact(value: number | string): string {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `$${Math.round(parsed).toLocaleString()}`;
}

function buildApiUrl({
  market,
  rtSource,
  hub,
  component,
  month,
  years,
  hourFilter,
  thresholdEnabled,
  threshold,
  refresh,
}: {
  market: Market;
  rtSource: RtSource;
  hub: string;
  component: ComponentKey;
  month: number;
  years: string;
  hourFilter: HourFilter;
  thresholdEnabled: boolean;
  threshold: number;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({
    market,
    rtSource,
    hub,
    component,
    month: String(month),
    years,
    hourFilter,
  });
  if (thresholdEnabled) params.set("threshold", String(threshold));
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-price-duration-curves?${params.toString()}`;
}

function cacheKey({
  market,
  rtSource,
  hub,
  component,
  month,
  years,
  hourFilter,
  thresholdEnabled,
  threshold,
}: {
  market: Market;
  rtSource: RtSource;
  hub: string;
  component: ComponentKey;
  month: number;
  years: string;
  hourFilter: HourFilter;
  thresholdEnabled: boolean;
  threshold: number;
}): string {
  return [
    "api:pjm-price-duration-curves",
    market,
    rtSource,
    hub,
    component,
    month,
    years,
    hourFilter,
    thresholdEnabled ? threshold : "none",
  ].join(":");
}

function normalizeYears(value: string): string {
  const years = value
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((year) => Number.isInteger(year))
    .slice(0, 10);
  return years.length ? [...new Set(years)].sort((a, b) => a - b).join(",") : DEFAULT_YEARS;
}

function freshnessFromPayload(payload: DurationPayload | null): PjmPriceDurationCurvesFreshnessSummary {
  if (!payload) {
    return {
      status: "Unknown",
      statusClass: "border-gray-700 bg-gray-900 text-gray-400",
      summary: "Duration curves --",
      targetDateLabel: "--",
      latestDateLabel: "--",
      latestUpdateLabel: "--",
    };
  }
  return {
    status: payload.asOf ? "Current" : "No Data",
    statusClass: payload.asOf
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
    summary: `${payload.rowCount.toLocaleString()} hours | ${payload.monthLabel} ${payload.years.join(", ")}`,
    targetDateLabel: `${payload.hub} | ${payload.market.toUpperCase()}`,
    latestDateLabel: payload.hourFilterLabel,
    latestUpdateLabel: fmtDateTime(payload.asOf),
  };
}

function toSeries(payload: DurationPayload | null): PlotSeries[] {
  return (payload?.years ?? []).map((year, index) => ({
    key: `y${year}`,
    label: String(year),
    color: YEAR_COLORS[index % YEAR_COLORS.length],
  }));
}

function toChartRows(payload: DurationPayload | null): ChartRow[] {
  if (!payload) return [];
  const byPct = new Map<number, ChartRow>();
  for (const row of payload.series) {
    const existing = byPct.get(row.xPct) ?? { xPct: row.xPct };
    existing[`y${row.year}`] = row.price;
    byPct.set(row.xPct, existing);
  }
  return [...byPct.values()].sort((a, b) => a.xPct - b.xPct);
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

export default function PjmPriceDurationCurves({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmPriceDurationCurvesFreshnessSummary) => void;
}) {
  const [market, setMarket] = useState<Market>("rt");
  const [rtSource, setRtSource] = useState<RtSource>("verified");
  const [hub, setHub] = useState("WESTERN HUB");
  const [component, setComponent] = useState<ComponentKey>("total");
  const [month, setMonth] = useState(7);
  const [yearsInput, setYearsInput] = useState(DEFAULT_YEARS);
  const [hourFilter, setHourFilter] = useState<HourFilter>("weekday_onpeak");
  const [thresholdEnabled, setThresholdEnabled] = useState(true);
  const [threshold, setThreshold] = useState(500);
  const [data, setData] = useState<DurationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => new Set());

  const years = useMemo(() => normalizeYears(yearsInput), [yearsInput]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    const key = cacheKey({
      market,
      rtSource,
      hub,
      component,
      month,
      years,
      hourFilter,
      thresholdEnabled,
      threshold,
    });
    const url = buildApiUrl({
      market,
      rtSource,
      hub,
      component,
      month,
      years,
      hourFilter,
      thresholdEnabled,
      threshold,
      refresh: refreshToken > 0,
    });

    fetchJsonWithCache<DurationPayload>({
      key,
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
        setError(err.message || "Failed to load PJM price duration curves");
        setData(null);
        onFreshnessChange?.({
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Duration curve query failed",
          targetDateLabel: `${hub} | ${market.toUpperCase()}`,
          latestDateLabel: HOUR_FILTERS.find((item) => item.key === hourFilter)?.label ?? hourFilter,
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
  }, [
    component,
    hourFilter,
    hub,
    market,
    month,
    onFreshnessChange,
    refreshToken,
    rtSource,
    threshold,
    thresholdEnabled,
    years,
  ]);

  const series = useMemo(() => toSeries(data), [data]);
  const chartRows = useMemo(() => toChartRows(data), [data]);
  const summaryByYear = useMemo(
    () => new Map((data?.summary ?? []).map((item) => [String(item.year), item] as const)),
    [data],
  );
  const activeThreshold = thresholdEnabled ? data?.threshold ?? threshold : null;
  const subtitle = data
    ? `${data.hub} | ${data.market.toUpperCase()} ${data.rtSource} | ${data.component} | ${data.hourFilterLabel}`
    : `${hub} | ${market.toUpperCase()} | July weekday HE8-23`;

  const toggleSeries = (key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderChart = (heightClass: string) => (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartRows} margin={{ top: 12, right: 20, bottom: 12, left: 8 }}>
          <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
          <XAxis
            dataKey="xPct"
            type="number"
            domain={[0, 100]}
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickFormatter={(value) => `${Math.round(Number(value))}%`}
            label={{ value: "Exceedance Share", position: "insideBottom", offset: -4, fill: "#6b7280" }}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickFormatter={(value) => fmtPriceCompact(value)}
            width={76}
            label={{ value: "$/MWh", angle: -90, position: "insideLeft", fill: "#6b7280" }}
          />
          <Tooltip
            contentStyle={{
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: 8,
              color: "#e5e7eb",
            }}
            labelFormatter={(value) => `${Number(value).toFixed(2)}% exceedance share`}
            formatter={(value, name) => [
              fmtPriceCompact(typeof value === "number" || typeof value === "string" ? value : 0),
              String(name).replace(/^y/, ""),
            ]}
          />
          {activeThreshold !== null && (
            <ReferenceLine
              y={activeThreshold}
              stroke="#facc15"
              strokeDasharray="5 5"
              label={{ value: `$${activeThreshold}/MWh`, fill: "#facc15", fontSize: 11, position: "right" }}
            />
          )}
          {series
            .filter((item) => !hiddenSeries.has(item.key))
            .map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="grid gap-3 xl:grid-cols-[160px_160px_160px_150px_160px_1fr] xl:items-end">
          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Market
            </span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Market">
              {(["rt", "da"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={market === item}
                  onClick={() => setMarket(item)}
                  className={`rounded-md border px-2 py-2 text-xs font-semibold uppercase transition-colors ${
                    market === item
                      ? "border-sky-500/50 bg-sky-500/10 text-white"
                      : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <label>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              RT Source
            </span>
            <select
              value={rtSource}
              onChange={(event) => setRtSource(event.target.value as RtSource)}
              disabled={market === "da"}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 disabled:cursor-not-allowed disabled:text-gray-600 focus:border-gray-500 focus:outline-none"
            >
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
            </select>
          </label>

          <label>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Hub
            </span>
            <select
              value={hub}
              onChange={(event) => setHub(event.target.value)}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            >
              {HUBS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Component
            </span>
            <select
              value={component}
              onChange={(event) => setComponent(event.target.value as ComponentKey)}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            >
              {COMPONENTS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Month
            </span>
            <select
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            >
              {MONTHS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Years
            </span>
            <input
              value={yearsInput}
              onChange={(event) => setYearsInput(event.target.value)}
              onBlur={() => setYearsInput(years)}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[280px_220px_150px_1fr] xl:items-end">
          <label>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Hour Filter
            </span>
            <select
              value={hourFilter}
              onChange={(event) => setHourFilter(event.target.value as HourFilter)}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            >
              {HOUR_FILTERS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 rounded-md border border-gray-800 bg-gray-950/40 px-3 py-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={thresholdEnabled}
              onChange={(event) => setThresholdEnabled(event.target.checked)}
              className="rounded accent-yellow-400"
            />
            Threshold line
          </label>

          <label>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              $/MWh
            </span>
            <input
              type="number"
              value={threshold}
              disabled={!thresholdEnabled}
              onChange={(event) => setThreshold(Number(event.target.value))}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 disabled:cursor-not-allowed disabled:text-gray-600 focus:border-gray-500 focus:outline-none"
            />
          </label>

          <p className="text-xs text-gray-500">
            Weekday filters are Monday-Friday and do not exclude holidays in this v1 view.
          </p>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {loading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading price duration curves...
        </div>
      )}
      {data && !loading && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile label="Hours" value={data.overallSummary.hourCount.toLocaleString()} sub={data.hourFilterLabel} />
            <StatTile label="Average" value={fmtPrice(data.overallSummary.average)} />
            <StatTile label="P95" value={fmtPrice(data.overallSummary.p95)} />
            <StatTile label="Max" value={fmtPrice(data.overallSummary.max)} />
            <StatTile
              label="Above Threshold"
              value={
                data.overallSummary.countAboveThreshold === null
                  ? "-"
                  : data.overallSummary.countAboveThreshold.toLocaleString()
              }
              sub={data.threshold === null ? "No threshold" : `>= ${fmtPrice(data.threshold)}`}
            />
          </div>

          <PlotCard
            title="Historical Price Duration Curves"
            subtitle={subtitle}
            series={series}
            hiddenSeries={hiddenSeries}
            onToggleSeries={toggleSeries}
            onShowAll={() => setHiddenSeries(new Set())}
            onHideAll={() => setHiddenSeries(new Set(series.map((item) => item.key)))}
            focusedChildren={renderChart("h-[70vh]")}
          >
            {data.series.length ? (
              renderChart("h-[420px]")
            ) : (
              <div className="flex h-[320px] items-center justify-center rounded-md border border-gray-800 bg-gray-950/40 text-sm text-gray-500">
                No hourly prices match the selected filters.
              </div>
            )}
          </PlotCard>

          <DataTableShell
            title="Year Summary"
            subtitle={`Sorted descending by hourly ${data.component} price | source: ${data.sourceTable} | as of ${fmtDateTime(data.asOf)}`}
          >
            <table className="w-full min-w-[860px] border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr>
                  {["Year", "Hours", "Avg", "Min", "P50", "P90", "P95", "P99", "Max", "Above Threshold"].map(
                    (label) => (
                      <th
                        key={label}
                        className="px-3 py-2 text-right font-semibold uppercase tracking-wide first:text-left"
                      >
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {series.map((item) => {
                  const summary = summaryByYear.get(item.label);
                  return (
                    <tr key={item.key} className="hover:bg-gray-900/60">
                      <td className="px-3 py-2 text-left font-semibold text-gray-100">
                        <span
                          className="mr-2 inline-block h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: item.color }}
                          aria-hidden="true"
                        />
                        {item.label}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {summary?.hourCount.toLocaleString() ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPrice(summary?.average)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPrice(summary?.min)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPrice(summary?.p50)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPrice(summary?.p90)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPrice(summary?.p95)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPrice(summary?.p99)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPrice(summary?.max)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {summary?.countAboveThreshold === null ||
                        summary?.countAboveThreshold === undefined
                          ? "-"
                          : summary.countAboveThreshold.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {!series.length && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-gray-500">
                      No summary rows are available for this selection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </DataTableShell>
        </>
      )}
    </div>
  );
}
