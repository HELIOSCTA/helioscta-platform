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
import { STRIP_MONTHS } from "@/components/spark/StripSelector";
import { seasonalYearColor } from "@/components/spark/seasonalColors";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import {
  DAILY_GAS_MARKETS,
  GAS_REGION_LABELS,
  GAS_REGION_ORDER,
  currentGasCurveStrip,
  defaultGasCurveYearWindow,
  gasCurveStripLabel,
  nextGasCurveStrip,
  normalizeGasCurveEvolutionView,
  validGasCurveStrip,
  type DailyGasMarket,
  type GasCurveEvolutionPoint,
  type GasCurveEvolutionResponse,
  type GasCurveEvolutionView,
  type GasRegion,
} from "@/lib/gasPricing";

const API_TTL_MS = 5 * 60 * 1000;
const DEFAULT_REGION: GasRegion = "south_central";
const DEFAULT_MARKET = DAILY_GAS_MARKETS.find((market) => market.market === "Henry Hub") ?? DAILY_GAS_MARKETS[0];

interface TooltipEntry {
  name: string;
  value: number | null;
  color: string;
  payload?: GasCurveEvolutionPoint;
}

function isGasRegion(value: string | null | undefined): value is GasRegion {
  return Boolean(value && (GAS_REGION_ORDER as readonly string[]).includes(value));
}

function findGasMarket(value: string | null | undefined): DailyGasMarket | null {
  const requested = value?.trim().toLowerCase();
  if (!requested) return null;
  return (
    DAILY_GAS_MARKETS.find(
      (market) =>
        market.market.toLowerCase() === requested ||
        market.shortLabel.toLowerCase() === requested ||
        market.futuresProduct?.toLowerCase() === requested,
    ) ?? null
  );
}

function firstFuturesMarket(region: GasRegion): DailyGasMarket {
  return (
    DAILY_GAS_MARKETS.find((market) => market.region === region && market.futuresProduct) ??
    DAILY_GAS_MARKETS.find((market) => market.futuresProduct) ??
    DEFAULT_MARKET
  );
}

function initialRegion(searchParams: URLSearchParams): GasRegion {
  const market = findGasMarket(searchParams.get("market"));
  if (market) return market.region;
  const region = searchParams.get("region");
  return isGasRegion(region) ? region : DEFAULT_REGION;
}

function initialMarketName(searchParams: URLSearchParams): string {
  const market = findGasMarket(searchParams.get("market"));
  if (market?.futuresProduct) return market.market;
  const region = initialRegion(searchParams);
  return firstFuturesMarket(region).market;
}

function initialView(searchParams: URLSearchParams): GasCurveEvolutionView {
  return normalizeGasCurveEvolutionView(searchParams.get("view"));
}

function initialGasStrip(searchParams: URLSearchParams): string {
  return (
    validGasCurveStrip(searchParams.get("gasStrip") ?? searchParams.get("sparkStrip")) ??
    currentGasCurveStrip()
  );
}

function initialGasNear(searchParams: URLSearchParams): string {
  return validGasCurveStrip(searchParams.get("gasNear")) ?? initialGasStrip(searchParams);
}

function initialGasFar(searchParams: URLSearchParams): string {
  const near = initialGasNear(searchParams);
  const far = validGasCurveStrip(searchParams.get("gasFar"));
  return far && far !== near ? far : nextGasCurveStrip(near);
}

function defaultSelectedYears(): number[] {
  return defaultGasCurveYearWindow(new Date().getUTCFullYear()).years;
}

function availableYearRange(): number[] {
  const currentYear = new Date().getUTCFullYear();
  return Array.from({ length: currentYear + 2 - 2020 + 1 }, (_, index) => 2020 + index);
}

function normalizeActiveLabel(label: string | number | undefined): number | null {
  if (typeof label === "number" && Number.isFinite(label)) return label;
  if (typeof label === "string" && label.trim()) {
    const parsed = Number(label);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatMoney(value: number | null, decimals = 3): string {
  if (value === null) return "--";
  return `$${value.toFixed(decimals)}`;
}

function formatSignedMoney(value: number | null, decimals = 3): string {
  if (value === null) return "--";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(decimals)}`;
}

function viewLabel(view: GasCurveEvolutionView): string {
  return view === "cal-spread" ? "Calendar Spread" : "Gas Outright";
}

function valueFormatter(view: GasCurveEvolutionView): (value: number | null) => string {
  return view === "cal-spread" ? formatSignedMoney : formatMoney;
}

function describeYearIssue(data: GasCurveEvolutionResponse, year: number): string {
  const diagnostic = data.yearDiagnostics[String(year)];
  if (!diagnostic) return "No diagnostic available";
  if (diagnostic.reason === "complete") return `${diagnostic.completePoints} complete points`;
  if (diagnostic.reason === "no_contract") return "No monthly futures contract configured";
  if (diagnostic.reason === "missing_symbols") {
    return `Missing ${diagnostic.missingSymbols.slice(0, 3).join(", ")}${
      diagnostic.missingSymbols.length > 3 ? "..." : ""
    }`;
  }
  if (diagnostic.reason === "outside_horizon") return "Rows exist outside the chart horizon";
  return "No settlement rows";
}

function filterButtonClass(active: boolean, disabled = false): string {
  if (active) {
    return "rounded-full border border-cyan-500 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100";
  }
  if (disabled) {
    return "cursor-not-allowed rounded-full border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs font-semibold text-gray-600";
  }
  return "rounded-full border border-gray-700 bg-gray-950/30 px-3 py-1.5 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200";
}

function GasCurveTooltip({
  active,
  payload,
  label,
  formatValue,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatValue: (value: number | null) => string;
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
            <span className="font-mono text-gray-100">{formatValue(Number(entry.value))}</span>
          </div>
        );
      })}
    </div>
  );
}

function GasCurveLineChart({
  chartData,
  activeYears,
  zoomDomain,
  height,
  onHoverDte,
  formatValue,
  zeroLine,
}: {
  chartData: GasCurveEvolutionPoint[];
  activeYears: number[];
  zoomDomain: [number, number];
  height: number;
  onHoverDte: (dte: number | null) => void;
  formatValue: (value: number | null) => string;
  zeroLine: boolean;
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
            tickFormatter={(value: number) => formatValue(value)}
            label={{
              value: "$/MMBtu",
              angle: -90,
              position: "insideLeft",
              offset: 10,
              fill: "#6b7280",
              fontSize: 12,
            }}
          />
          <Tooltip
            content={<GasCurveTooltip formatValue={formatValue} />}
            cursor={{ stroke: "#64748b", strokeDasharray: "4 4", strokeWidth: 1 }}
          />
          <Legend wrapperStyle={{ paddingTop: "16px", fontSize: "13px", color: "#9ca3af" }} />
          {zeroLine ? (
            <ReferenceLine
              y={0}
              stroke="#ef4444"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: "Flat", position: "right", fill: "#ef4444", fontSize: 11 }}
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

function ModeTabs({
  view,
  onViewChange,
}: {
  view: GasCurveEvolutionView;
  onViewChange: (view: GasCurveEvolutionView) => void;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-gray-700 bg-gray-900 p-1">
      {[
        { key: "gas-outright" as const, title: "Gas Outright", subtitle: "Monthly settlement curve" },
        { key: "cal-spread" as const, title: "Calendar Spread", subtitle: "Near - far gas months" },
      ].map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={view === option.key}
          onClick={() => onViewChange(option.key)}
          className={`flex min-h-12 flex-col justify-center rounded-[6px] px-3 py-2 text-left transition-colors ${
            view === option.key
              ? "border border-gray-700 bg-gray-800 text-gray-100"
              : "border border-transparent text-gray-300 hover:bg-gray-800/50 hover:text-gray-100"
          }`}
        >
          <span className="text-sm font-semibold leading-4">{option.title}</span>
          <span className="mt-1 text-[11px] leading-3 text-gray-500">{option.subtitle}</span>
        </button>
      ))}
    </div>
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

function StripButtons({
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
      <div className="flex flex-wrap gap-2">
        {STRIP_MONTHS.map(({ code, name }) => {
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
                  ? "border-orange-400 bg-orange-400/20 text-orange-300"
                  : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
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
        ].map(({ label, days }) => (
          <button
            key={label}
            type="button"
            onClick={() => onSetDteWindow(days)}
            className={`min-w-12 rounded-[6px] px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              chartWindowDays === days
                ? "bg-gray-100 text-gray-950 shadow-sm"
                : "text-gray-400 hover:bg-gray-800/80"
            }`}
          >
            {label}
          </button>
        ))}
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

function YearAvailabilityDiagnostics({
  data,
  selectedYears,
}: {
  data: GasCurveEvolutionResponse;
  selectedYears: number[];
}) {
  const unavailableYears = selectedYears.filter((year) => !data.dataAvailability[String(year)]);
  if (!unavailableYears.length) return null;

  return (
    <section className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold uppercase tracking-widest text-amber-300/80">Unavailable Contract Years</p>
          <p className="mt-1 text-gray-500">
            Complete rows require every configured gas futures leg on the same trade date.
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

function GasCurveYearTable({
  data,
  activeYears,
}: {
  data: GasCurveEvolutionResponse;
  activeYears: number[];
}) {
  const rows = activeYears
    .map((year) => ({ year, point: data.latestByYear[String(year)] ?? null }))
    .filter((row): row is { year: number; point: NonNullable<typeof row.point> } => row.point !== null);
  if (!rows.length) return null;
  const formatValue = valueFormatter(data.view);
  const showFar = data.view === "cal-spread";

  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-4 shadow-xl shadow-black/20">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Year Marks</h2>
          <p className="mt-1 text-xs text-gray-500">
            Latest/final {viewLabel(data.view).toLowerCase()} row by active contract year.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-gray-300">
            Last trade: {data.metadata.lastTradeDate ?? "--"}
          </span>
          <span className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-gray-300">
            {data.market.curveStyle === "basis" ? "Henry + basis" : "Fixed price"}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-800">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-gray-950/60">
            <tr className="border-b border-gray-800 text-xs uppercase tracking-wider text-gray-500">
              <th className="px-3 py-3 text-left">Year</th>
              <th className="px-3 py-3 text-left">Trade Date</th>
              <th className="px-3 py-3 text-center">Days to Exp.</th>
              <th className="px-3 py-3 text-center">{viewLabel(data.view)}</th>
              {showFar ? <th className="px-3 py-3 text-center">Near</th> : null}
              {showFar ? <th className="px-3 py-3 text-center">Far</th> : null}
              <th className="px-3 py-3 text-left">Source Symbols</th>
              <th className="px-3 py-3 text-center">Quality</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ year, point }, index) => (
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
                  {formatValue(point.value)}
                </td>
                {showFar ? (
                  <td className="px-3 py-3 text-center font-mono text-cyan-200">
                    {formatMoney(point.nearValue)}
                  </td>
                ) : null}
                {showFar ? (
                  <td className="px-3 py-3 text-center font-mono text-orange-200">
                    {formatMoney(point.farValue)}
                  </td>
                ) : null}
                <td className="max-w-[300px] px-3 py-3">
                  <div className="truncate font-mono text-xs text-gray-300" title={`${point.sourceSymbols.join(" + ")} | ${point.formula}`}>
                    {point.sourceSymbols.join(" + ")}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-gray-600" title={point.formula}>
                    {point.formula}
                  </div>
                </td>
                <td className="px-3 py-3 text-center text-xs capitalize text-gray-400">{point.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function GasCurveEvolution() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<GasCurveEvolutionView>(() => initialView(searchParams));
  const [selectedRegion, setSelectedRegion] = useState<GasRegion>(() => initialRegion(searchParams));
  const [marketName, setMarketName] = useState(() => initialMarketName(searchParams));
  const [gasStrip, setGasStrip] = useState(() => initialGasStrip(searchParams));
  const [gasNear, setGasNear] = useState(() => initialGasNear(searchParams));
  const [gasFar, setGasFar] = useState(() => initialGasFar(searchParams));
  const [selectedYears, setSelectedYears] = useState<number[]>(() => defaultSelectedYears());
  const [data, setData] = useState<GasCurveEvolutionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartWindowDays, setChartWindowDays] = useState<number | "all">("all");
  const [, setHoveredDte] = useState<number | null>(null);

  const selectedMarket = useMemo(
    () => findGasMarket(marketName) ?? firstFuturesMarket(selectedRegion),
    [marketName, selectedRegion],
  );
  const marketOptions = useMemo(
    () => DAILY_GAS_MARKETS.filter((market) => market.region === selectedRegion),
    [selectedRegion],
  );
  const availableYears = useMemo(() => {
    const years = new Set(availableYearRange());
    data?.years.forEach((year) => years.add(year));
    return [...years].sort((first, second) => first - second);
  }, [data?.years]);
  const selectedYearSet = useMemo(() => new Set(selectedYears), [selectedYears]);
  const selectedYearNumbers = useMemo(
    () => availableYears.filter((year) => selectedYearSet.has(year)),
    [availableYears, selectedYearSet],
  );
  const activeYears = useMemo(() => {
    if (!data) return [];
    return selectedYearNumbers.filter((year) => data.dataAvailability[String(year)]);
  }, [data, selectedYearNumbers]);
  const chartData = useMemo(() => data?.data ?? [], [data?.data]);
  const maxWindowDays = useMemo(() => {
    const dtes = chartData.map((point) => Number(point.daysToExpiry)).filter((value) => Number.isFinite(value));
    return Math.max(30, ...dtes);
  }, [chartData]);
  const zoomDomain = useMemo<[number, number]>(
    () => (chartWindowDays === "all" ? [maxWindowDays, 0] : [chartWindowDays, 0]),
    [chartWindowDays, maxWindowDays],
  );
  const chartSeries: PlotSeries[] = useMemo(
    () =>
      activeYears.map((year) => ({
        key: String(year),
        label: String(year),
        color: seasonalYearColor(year),
      })),
    [activeYears],
  );
  const hiddenSeries = useMemo(() => new Set<string>(), []);
  const formatValue = valueFormatter(view);
  const stripTitle =
    view === "cal-spread"
      ? `${gasCurveStripLabel(gasNear)} - ${gasCurveStripLabel(gasFar)}`
      : gasCurveStripLabel(gasStrip);

  useEffect(() => {
    const urlView = initialView(searchParams);
    const urlRegion = initialRegion(searchParams);
    const urlMarketName = initialMarketName(searchParams);
    const urlGasStrip = initialGasStrip(searchParams);
    const urlGasNear = initialGasNear(searchParams);
    const urlGasFar = initialGasFar(searchParams);
    setView((previous) => (previous === urlView ? previous : urlView));
    setSelectedRegion((previous) => (previous === urlRegion ? previous : urlRegion));
    setMarketName((previous) => (previous === urlMarketName ? previous : urlMarketName));
    setGasStrip((previous) => (previous === urlGasStrip ? previous : urlGasStrip));
    setGasNear((previous) => (previous === urlGasNear ? previous : urlGasNear));
    setGasFar((previous) => (previous === urlGasFar ? previous : urlGasFar));
  }, [searchParams]);

  useEffect(() => {
    if (selectedMarket.region === selectedRegion) return;
    setMarketName(firstFuturesMarket(selectedRegion).market);
  }, [selectedMarket.region, selectedRegion]);

  useEffect(() => {
    if (gasNear !== gasFar) return;
    setGasFar(nextGasCurveStrip(gasNear));
  }, [gasFar, gasNear]);

  useEffect(() => {
    const currentSection = searchParams.get("section");
    const currentView = normalizeGasCurveEvolutionView(searchParams.get("view"));
    const currentRegion = searchParams.get("region");
    const currentMarket = searchParams.get("market") ?? "";
    const currentGasStrip = validGasCurveStrip(searchParams.get("gasStrip")) ?? "";
    const currentGasNear = validGasCurveStrip(searchParams.get("gasNear")) ?? "";
    const currentGasFar = validGasCurveStrip(searchParams.get("gasFar")) ?? "";

    if (
      currentSection === "gas-outright" &&
      currentView === view &&
      currentRegion === selectedRegion &&
      currentMarket === selectedMarket.market &&
      currentGasStrip === gasStrip &&
      currentGasNear === gasNear &&
      currentGasFar === gasFar &&
      !searchParams.has("sparkStrip")
    ) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "gas-outright");
    params.set("view", view);
    params.set("region", selectedRegion);
    params.set("market", selectedMarket.market);
    params.set("gasStrip", gasStrip);
    params.set("gasNear", gasNear);
    params.set("gasFar", gasFar);
    params.delete("sparkStrip");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [gasFar, gasNear, gasStrip, pathname, router, searchParams, selectedMarket.market, selectedRegion, view]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const params = new URLSearchParams({
      view,
      market: selectedMarket.market,
      gasStrip,
      gasNear,
      gasFar,
    });
    const url = `/api/gas-curve-evolution?${params.toString()}`;
    const cacheKey = `api:gas-curve-evolution:v1:${view}:${selectedMarket.market}:${gasStrip}:${gasNear}:${gasFar}`;

    setLoading(true);
    setError(null);
    setHoveredDte(null);

    fetchJsonWithCache<GasCurveEvolutionResponse>({
      key: cacheKey,
      url,
      ttlMs: API_TTL_MS,
      signal: controller.signal,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setData(null);
        setError(caught instanceof Error ? caught.message : "Failed to load gas curve evolution");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [gasFar, gasNear, gasStrip, selectedMarket.market, view]);

  function handleRegionChange(region: GasRegion) {
    setSelectedRegion(region);
    setMarketName(firstFuturesMarket(region).market);
  }

  function handleNearChange(strip: string) {
    setGasNear(strip);
    if (strip === gasFar) setGasFar(nextGasCurveStrip(strip));
  }

  function handleFarChange(strip: string) {
    setGasFar(strip === gasNear ? nextGasCurveStrip(gasNear) : strip);
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
      return [...next].sort((first, second) => first - second);
    });
  }

  const chart =
    data && activeYears.length > 0 ? (
      <GasCurveLineChart
        chartData={chartData}
        activeYears={activeYears}
        zoomDomain={zoomDomain}
        height={426}
        onHoverDte={setHoveredDte}
        formatValue={formatValue}
        zeroLine={view === "cal-spread"}
      />
    ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <ModeTabs view={view} onViewChange={setView} />

      <section className="rounded-xl border border-gray-800 bg-[#0f141d] p-4 shadow-2xl shadow-black/20">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(300px,390px)_1fr]">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Region</p>
              <div className="flex flex-wrap gap-2">
                {GAS_REGION_ORDER.map((region) => (
                  <button
                    key={region}
                    type="button"
                    aria-pressed={selectedRegion === region}
                    onClick={() => handleRegionChange(region)}
                    className={filterButtonClass(selectedRegion === region)}
                  >
                    {GAS_REGION_LABELS[region]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Market</p>
              <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto pr-1">
                {marketOptions.map((market) => {
                  const disabled = !market.futuresProduct;
                  const active = selectedMarket.market === market.market;
                  return (
                    <button
                      key={market.market}
                      type="button"
                      disabled={disabled}
                      aria-pressed={active}
                      onClick={() => setMarketName(market.market)}
                      title={
                        disabled
                          ? `${market.market} has no monthly futures product configured`
                          : `${market.market} | ${market.futuresProduct}`
                      }
                      className={filterButtonClass(active, disabled)}
                    >
                      {market.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            <YearSelector
              availableYears={availableYears}
              selectedYears={selectedYearNumbers}
              onToggleYear={toggleSelectedYear}
            />
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-950/30 p-4">
            {view === "cal-spread" ? (
              <div className="space-y-5">
                <StripButtons label="Near Leg" value={gasNear} onChange={handleNearChange} blockedStrip={gasFar} />
                <StripButtons label="Far Leg" value={gasFar} onChange={handleFarChange} blockedStrip={gasNear} />
              </div>
            ) : (
              <StripButtons label="Gas Strip" value={gasStrip} onChange={setGasStrip} />
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-md border border-gray-800 bg-gray-950/35 p-3">
            <p className="text-gray-500">Selected Market</p>
            <p className="mt-1 font-semibold text-gray-100">{selectedMarket.market}</p>
          </div>
          <div className="rounded-md border border-gray-800 bg-gray-950/35 p-3">
            <p className="text-gray-500">Futures Product</p>
            <p className="mt-1 font-mono font-semibold text-gray-100">{selectedMarket.futuresProduct ?? "--"}</p>
          </div>
          <div className="rounded-md border border-gray-800 bg-gray-950/35 p-3">
            <p className="text-gray-500">Formula</p>
            <p className="mt-1 font-semibold text-gray-100">
              {selectedMarket.curveStyle === "basis" ? "Henry + basis" : "Fixed settlement"}
            </p>
          </div>
        </div>
      </section>

      {loading && <div className="h-[440px] w-full animate-pulse rounded-lg bg-gray-800/60" />}

      {error && !loading && (
        <div className="flex h-[440px] items-center justify-center rounded-lg border border-red-900/40 bg-red-950/20 p-6 text-sm text-red-300">
          {error}
        </div>
      )}

      {data && !loading && !error && data.metadata.noContract && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/10 p-4 text-sm text-amber-100">
          {selectedMarket.market} does not have a monthly futures product configured in the gas registry.
        </div>
      )}

      {data && !loading && !error && !data.metadata.noContract && activeYears.length === 0 && (
        <div className="flex h-[440px] items-center justify-center rounded-lg border border-gray-800 bg-[#12141d] p-6 text-center text-sm text-gray-500">
          No {viewLabel(view).toLowerCase()} years are available for {selectedMarket.market} {stripTitle}.
        </div>
      )}

      {data && !loading && !error && !data.metadata.noContract && (
        <>
          <YearAvailabilityDiagnostics data={data} selectedYears={selectedYearNumbers} />

          {chart && (
            <PlotCard
              key={`${view}-${selectedMarket.market}-${gasStrip}-${gasNear}-${gasFar}`}
              title={`${viewLabel(view)} Evolution - ${selectedMarket.shortLabel} ${stripTitle}`}
              subtitle={`${data.metadata.formula} | Last trade ${data.metadata.lastTradeDate ?? "--"}`}
              series={chartSeries}
              hiddenSeries={hiddenSeries}
              onToggleSeries={() => undefined}
              showSeriesControls={false}
              controls={
                <DteWindowControls
                  chartWindowDays={chartWindowDays}
                  maxWindowDays={maxWindowDays}
                  onSetDteWindow={setChartWindowDays}
                />
              }
              focusedChildren={
                <GasCurveLineChart
                  chartData={chartData}
                  activeYears={activeYears}
                  zoomDomain={zoomDomain}
                  height={620}
                  onHoverDte={setHoveredDte}
                  formatValue={formatValue}
                  zeroLine={view === "cal-spread"}
                />
              }
            >
              {chart}
            </PlotCard>
          )}

          <GasCurveYearTable data={data} activeYears={activeYears} />
        </>
      )}
    </div>
  );
}
