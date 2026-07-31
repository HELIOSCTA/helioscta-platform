"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type SaltForecastRegion = "salt-main" | "se-salt";
export type SaltForecastWeatherRegion =
  | "CONUS"
  | "EAST"
  | "MIDWEST"
  | "MOUNTAIN"
  | "PACIFIC"
  | "SOUTHCENTRAL";

interface SaltForecastWeeklyPoint {
  weekEnding: string;
  label: string;
  year: number;
  actualChangeBcf: number | null;
  modelPredictedChangeBcf: number | null;
  residualBcf: number | null;
  looseTightZScore: number | null;
  weatherImpactBcf: number | null;
  saltSumBcf: number | null;
  gasHddObserved: number | null;
  gasCddObserved: number | null;
  weatherAnomaly: number | null;
  isRecent: boolean;
}

interface SaltForecastScatterPoint {
  weekEnding: string;
  year: number;
  x: number | null;
  y: number | null;
  isRecent: boolean;
}

interface SaltForecastModelWeight {
  model: string;
  weight: number | null;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
}

interface SaltForecastDriver {
  driver: string;
  value: number;
}

interface SaltForecastQueueRow {
  weekEnding: string;
  releaseDate: string | null;
  forecastActualWx: number | null;
  forecastNormalWx: number | null;
  weatherImpact: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  coverage: number | null;
  weatherAnomaly: number | null;
  status: string;
}

export interface SaltForecastPayload {
  selected: {
    saltRegion: SaltForecastRegion;
    saltRegionLabel: string;
    weatherRegion: SaltForecastWeatherRegion;
    lookbackWeeks: number;
  };
  summary: {
    minWeek: string | null;
    maxWeek: string | null;
    latestReportWeek: string | null;
    liveEiaChecked: string | null;
    ensembleMae: number | null;
    ensembleRmse: number | null;
    hitRate: number | null;
    latestLooseTight: number | null;
    latestLooseTightZ: number | null;
    nextForecast: number | null;
    rangeLow: number | null;
    rangeHigh: number | null;
    signalCoverage: number | null;
    nextWeatherImpact: number | null;
    weeklyRowCount: number;
    eiaRowCount: number;
    saltRowCount: number;
    weatherRowCount: number;
  };
  weeklySeries: SaltForecastWeeklyPoint[];
  expectedActualScatter: SaltForecastScatterPoint[];
  weatherLooseTightScatter: SaltForecastScatterPoint[];
  modelWeights: SaltForecastModelWeight[];
  leadDrivers: SaltForecastDriver[];
  pendingQueue: SaltForecastQueueRow[];
  sourceStatus: {
    status: "ok" | "partial" | "missing_model_inputs";
    warnings: string[];
    lineage: string;
  };
}

const SALT_FORECAST_REGION_OPTIONS: Array<{ value: SaltForecastRegion; label: string }> = [
  { value: "salt-main", label: "Salt Main" },
  { value: "se-salt", label: "SE Salt" },
];
const SALT_FORECAST_WEATHER_REGION_OPTIONS: SaltForecastWeatherRegion[] = [
  "CONUS",
  "EAST",
  "MIDWEST",
  "MOUNTAIN",
  "PACIFIC",
  "SOUTHCENTRAL",
];
const SALT_FORECAST_YEAR_FILTERS = [2023, 2024, 2025, 2026] as const;
const SALT_FORECAST_YEAR_COLORS: Record<(typeof SALT_FORECAST_YEAR_FILTERS)[number], string> = {
  2023: "#22d3ee",
  2024: "#f59e0b",
  2025: "#a78bfa",
  2026: "#34d399",
};

const labelClass = "mb-1 block text-[10px] font-semibold uppercase text-gray-500";
const controlClass =
  "h-9 w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-sm text-gray-100 outline-none transition-colors focus:border-cyan-500";
const rechartsTooltipStyle = {
  backgroundColor: "#020617",
  border: "1px solid #374151",
  borderRadius: "6px",
  color: "#e5e7eb",
  fontSize: "12px",
} satisfies CSSProperties;

export function makeSaltForecastApiUrl({
  saltRegion,
  weatherRegion,
  lookbackWeeks,
}: {
  saltRegion: SaltForecastRegion;
  weatherRegion: SaltForecastWeatherRegion;
  lookbackWeeks: number;
}): string {
  const params = new URLSearchParams({
    saltRegion,
    weatherRegion,
    lookbackWeeks: String(Math.max(52, Math.min(520, lookbackWeeks))),
  });
  return `/api/salts/forecast?${params.toString()}`;
}

function fmtNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function fmtAxisTick(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return value.toFixed(0);
  return value.toFixed(1);
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function fmtChange(value: number | null | undefined, digits: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const formatted = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function fmtRatioPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${fmtNumber(value * 100, 0)}%`;
}

function fmtMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString()} ms`;
}

function flowTone(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || Math.abs(value) < 1e-9) {
    return "text-gray-300";
  }
  return value > 0 ? "text-emerald-300" : "text-rose-300";
}

function fmtSignedBcf(value: number | null | undefined): string {
  return fmtChange(value, 1);
}

function initialChartDimension(height: CSSProperties["height"]) {
  return {
    width: 640,
    height: typeof height === "number" ? height : 420,
  };
}

function forecastYearColor(year: number): string {
  return SALT_FORECAST_YEAR_COLORS[year as (typeof SALT_FORECAST_YEAR_FILTERS)[number]] ?? "#94a3b8";
}

function ForecastNumberInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label>
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          if (Number.isFinite(parsed)) onChange(Math.max(min, Math.min(max, parsed)));
        }}
        className={controlClass}
      />
    </label>
  );
}

function ForecastKpi({
  label,
  value,
  detail,
  valueClassName = "text-gray-100",
}: {
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-800 bg-gray-950/60 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 truncate text-xl font-semibold tabular-nums ${valueClassName}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-gray-500">{detail}</p>
    </div>
  );
}

function ForecastHelpButton({ label }: { label: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-xs font-bold text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-8 z-20 hidden w-64 rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-left text-xs font-normal leading-snug text-gray-300 shadow-xl shadow-black/40 group-hover:block group-focus-within:block"
      >
        {label}
      </span>
    </span>
  );
}

function ForecastFocusButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:bg-gray-800 hover:text-white"
    >
      Focus Mode
    </button>
  );
}

function ForecastZDot({
  cx,
  cy,
  payload,
}: {
  cx?: number;
  cy?: number;
  payload?: Partial<SaltForecastWeeklyPoint>;
}) {
  if (typeof cx !== "number" || typeof cy !== "number") return null;
  const recent = payload?.isRecent;
  const color = recent ? "#34d399" : forecastYearColor(payload?.year ?? 0);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={recent ? 4.5 : 2.8}
      fill={color}
      stroke={recent ? "#e5e7eb" : "#020617"}
      strokeWidth={recent ? 1.6 : 0.8}
      opacity={0.95}
    />
  );
}

function RecentPointShape({ cx, cy, fill }: { cx?: number; cy?: number; fill?: string }) {
  if (typeof cx !== "number" || typeof cy !== "number") return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={6.2} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={0.95} />
      <circle cx={cx} cy={cy} r={3.2} fill={fill ?? "#fbbf24"} opacity={0.95} />
    </g>
  );
}

function ForecastActualModelChart({
  series,
  height = 360,
}: {
  series: SaltForecastWeeklyPoint[];
  height?: CSSProperties["height"];
}) {
  return (
    <div className="relative min-w-0" style={{ height, minHeight: height }}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={1}
        minHeight={1}
        debounce={50}
        initialDimension={initialChartDimension(height)}
      >
        <LineChart data={series} margin={{ top: 18, right: 22, bottom: 24, left: 0 }}>
          <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickLine={{ stroke: "#374151" }}
            axisLine={{ stroke: "#374151" }}
            minTickGap={22}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickLine={{ stroke: "#374151" }}
            axisLine={{ stroke: "#374151" }}
            tickFormatter={(value) => fmtAxisTick(Number(value))}
          />
          <Tooltip contentStyle={rechartsTooltipStyle} formatter={(value) => fmtNumber(Number(value), 2)} />
          <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="actualChangeBcf"
            name="Actual EIA Change"
            stroke="#22d3ee"
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="modelPredictedChangeBcf"
            name="Model Predicted Change"
            stroke="#f97316"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {!series.length && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
          No weekly forecast rows are available.
        </div>
      )}
    </div>
  );
}

function ForecastZScoreChart({
  series,
  height = 300,
}: {
  series: SaltForecastWeeklyPoint[];
  height?: CSSProperties["height"];
}) {
  const chartSeries = series.map((point) => ({
    ...point,
    z2023: point.year === 2023 ? point.looseTightZScore : null,
    z2024: point.year === 2024 ? point.looseTightZScore : null,
    z2025: point.year === 2025 ? point.looseTightZScore : null,
    z2026: point.year === 2026 ? point.looseTightZScore : null,
  }));

  return (
    <div className="relative min-w-0" style={{ height, minHeight: height }}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={1}
        minHeight={1}
        debounce={50}
        initialDimension={initialChartDimension(height)}
      >
        <LineChart data={chartSeries} margin={{ top: 12, right: 22, bottom: 24, left: 0 }}>
          <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickLine={{ stroke: "#374151" }}
            axisLine={{ stroke: "#374151" }}
            minTickGap={22}
          />
          <YAxis
            domain={[-4, 4]}
            allowDataOverflow
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickLine={{ stroke: "#374151" }}
            axisLine={{ stroke: "#374151" }}
            tickFormatter={(value) => fmtAxisTick(Number(value))}
          />
          <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
          <ReferenceLine y={1} stroke="#38bdf8" strokeDasharray="3 3" />
          <ReferenceLine y={-1} stroke="#38bdf8" strokeDasharray="3 3" />
          <ReferenceLine y={2} stroke="#f59e0b" strokeDasharray="3 3" />
          <ReferenceLine y={-2} stroke="#f59e0b" strokeDasharray="3 3" />
          <Tooltip contentStyle={rechartsTooltipStyle} formatter={(value) => fmtNumber(Number(value), 2)} />
          <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
          {SALT_FORECAST_YEAR_FILTERS.map((year) => (
            <Line
              key={year}
              type="monotone"
              dataKey={`z${year}`}
              name={String(year)}
              stroke={forecastYearColor(year)}
              strokeWidth={1.9}
              dot={<ForecastZDot />}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {!series.length && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
          No loose/tight rows are available.
        </div>
      )}
    </div>
  );
}

function ForecastYearControls({
  activeYears,
  showRecent,
  setActiveYears,
  setShowRecent,
}: {
  activeYears: Set<number>;
  showRecent: boolean;
  setActiveYears: Dispatch<SetStateAction<Set<number>>>;
  setShowRecent: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Salt forecast scatter year filters">
      {SALT_FORECAST_YEAR_FILTERS.map((year) => {
        const active = activeYears.has(year);
        return (
          <button
            key={year}
            type="button"
            aria-pressed={active}
            onClick={() =>
              setActiveYears((previous) => {
                const next = new Set(previous);
                if (next.has(year)) next.delete(year);
                else next.add(year);
                return next;
              })
            }
            className={`h-7 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
              active
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
            }`}
          >
            {year}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setActiveYears(new Set(SALT_FORECAST_YEAR_FILTERS))}
        className="h-7 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-[11px] font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
      >
        All On
      </button>
      <button
        type="button"
        onClick={() => setActiveYears(new Set())}
        className="h-7 rounded-md border border-gray-800 bg-gray-950/40 px-2.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-700 hover:text-gray-400"
      >
        All Off
      </button>
      <button
        type="button"
        aria-pressed={showRecent}
        onClick={() => setShowRecent((value) => !value)}
        className={`h-7 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
          showRecent
            ? "border-gray-600 bg-gray-800 text-white"
            : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
        }`}
      >
        Last 8 Weeks
      </button>
    </div>
  );
}

function ForecastScatterPanel({
  title,
  help,
  data,
  xLabel,
  yLabel,
  activeYears,
  showRecent,
  onFocus,
  showFocusButton = true,
  height = 300,
}: {
  title: string;
  help: string;
  data: SaltForecastScatterPoint[];
  xLabel: string;
  yLabel: string;
  activeYears: Set<number>;
  showRecent: boolean;
  onFocus: () => void;
  showFocusButton?: boolean;
  height?: CSSProperties["height"];
}) {
  const visibleData = data.filter(
    (point) =>
      point.x !== null &&
      point.y !== null &&
      activeYears.has(point.year) &&
      (!point.isRecent || showRecent),
  );
  const regularData = visibleData.filter((point) => !point.isRecent);
  const recentData = visibleData.filter((point) => point.isRecent);

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
            <ForecastHelpButton label={help} />
          </div>
        </div>
        {showFocusButton && <ForecastFocusButton onClick={onFocus} />}
      </div>
      <div className="relative min-w-0" style={{ height, minHeight: height }}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={1}
          minHeight={1}
          debounce={50}
          initialDimension={initialChartDimension(height)}
        >
          <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 0 }}>
            <CartesianGrid stroke="#1f2937" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              tickFormatter={(value) => fmtAxisTick(Number(value))}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              tickFormatter={(value) => fmtAxisTick(Number(value))}
            />
            <Tooltip contentStyle={rechartsTooltipStyle} formatter={(value) => fmtNumber(Number(value), 2)} />
            {SALT_FORECAST_YEAR_FILTERS.map((year) => (
              <Scatter
                key={year}
                name={String(year)}
                data={regularData.filter((point) => point.year === year)}
                fill={forecastYearColor(year)}
                fillOpacity={0.82}
                isAnimationActive={false}
              />
            ))}
            <Scatter
              name="Last 8 Weeks"
              data={recentData}
              fill="#f8fafc"
              shape={<RecentPointShape />}
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
        {!visibleData.length && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
            No scatter rows match the selected filters.
          </div>
        )}
      </div>
    </section>
  );
}

function ForecastWeightsTable({ rows }: { rows: SaltForecastModelWeight[] }) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-100">Model Blend Weights</h3>
        <ForecastHelpButton label="Weights are inverse-MAE shares from the walk-forward backtest." />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[620px] w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-gray-500">
            <tr>
              {["Model", "Weight", "MAE", "RMSE", "Bias"].map((header) => (
                <th key={header} className="border-b border-gray-800 px-2 py-2 text-right first:text-left">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.model} className="hover:bg-gray-900/45">
                <td className="border-t border-gray-900 px-2 py-2 font-semibold text-gray-100">{row.model}</td>
                <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-cyan-200">
                  {fmtRatioPercent(row.weight)}
                </td>
                <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                  {fmtNumber(row.mae, 2)}
                </td>
                <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                  {fmtNumber(row.rmse, 2)}
                </td>
                <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(row.bias)}`}>
                  {fmtSignedBcf(row.bias)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ForecastDriversPanel({ rows }: { rows: SaltForecastDriver[] }) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-100">Lead Model Drivers (abs weight)</h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.driver} className="rounded-md border border-gray-800 bg-gray-900/70 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">{row.driver}</p>
            <p className={`mt-1 font-mono text-sm font-semibold tabular-nums ${flowTone(row.value)}`}>
              {fmtChange(row.value, 4)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ForecastPendingQueue({ rows }: { rows: SaltForecastQueueRow[] }) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-100">Pending Weekly Forecast Queue</h3>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-left text-[11px]">
          <thead className="uppercase tracking-wider text-gray-500">
            <tr>
              {[
                "Week Ending",
                "Release Date",
                "Forecast (Actual Wx)",
                "Forecast (Normal Wx)",
                "Weather Impact",
                "80% Range",
                "Coverage",
                "Wx Anom",
                "Status",
              ].map((header) => (
                <th key={header} className="border-b border-gray-800 px-2 py-2 text-right first:text-left">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.weekEnding}>
                  <td className="border-t border-gray-900 px-2 py-2 text-left text-gray-100">
                    {fmtDate(row.weekEnding)}
                  </td>
                  <td className="border-t border-gray-900 px-2 py-2 text-right text-gray-300">
                    {fmtDate(row.releaseDate)}
                  </td>
                  <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                    {fmtSignedBcf(row.forecastActualWx)}
                  </td>
                  <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                    {fmtSignedBcf(row.forecastNormalWx)}
                  </td>
                  <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(row.weatherImpact)}`}>
                    {fmtSignedBcf(row.weatherImpact)}
                  </td>
                  <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                    {row.rangeLow === null || row.rangeHigh === null
                      ? "-"
                      : `${fmtSignedBcf(row.rangeLow)} to ${fmtSignedBcf(row.rangeHigh)}`}
                  </td>
                  <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                    {fmtRatioPercent(row.coverage)}
                  </td>
                  <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(row.weatherAnomaly)}`}>
                    {fmtNumber(row.weatherAnomaly, 2)}
                  </td>
                  <td className="border-t border-gray-900 px-2 py-2 text-right text-gray-300">
                    {row.status}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="border-t border-gray-900 px-2 py-4 text-sm text-gray-500">
                  No pending week is available from the promoted inputs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function SaltForecastTab({
  data,
  loading,
  error,
  apiElapsedMs,
  saltRegion,
  setSaltRegion,
  weatherRegion,
  setWeatherRegion,
  lookbackWeeks,
  setLookbackWeeks,
}: {
  data: SaltForecastPayload | null;
  loading: boolean;
  error: string | null;
  apiElapsedMs: number | null;
  saltRegion: SaltForecastRegion;
  setSaltRegion: Dispatch<SetStateAction<SaltForecastRegion>>;
  weatherRegion: SaltForecastWeatherRegion;
  setWeatherRegion: Dispatch<SetStateAction<SaltForecastWeatherRegion>>;
  lookbackWeeks: number;
  setLookbackWeeks: Dispatch<SetStateAction<number>>;
}) {
  const [activeYears, setActiveYears] = useState<Set<number>>(
    () => new Set(SALT_FORECAST_YEAR_FILTERS),
  );
  const [showRecent, setShowRecent] = useState(true);
  const [focusedChart, setFocusedChart] = useState<"z-score" | "expected-actual" | "weather-loose-tight" | null>(
    null,
  );
  const warnings = data?.sourceStatus.warnings ?? [];

  useEffect(() => {
    if (!focusedChart) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusedChart(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focusedChart]);

  return (
    <section className="space-y-5 rounded-xl border border-gray-800 bg-gray-900/60 p-5 shadow-2xl">
      <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
        <div className="grid gap-3 md:grid-cols-[170px_190px_140px]">
          <label>
            <span className={labelClass}>Salt Region</span>
            <select
              value={saltRegion}
              aria-label="Salt Region"
              onChange={(event) => setSaltRegion(event.target.value as SaltForecastRegion)}
              className={controlClass}
            >
              {SALT_FORECAST_REGION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Weather Region</span>
            <select
              value={weatherRegion}
              aria-label="Weather Region"
              onChange={(event) => setWeatherRegion(event.target.value as SaltForecastWeatherRegion)}
              className={controlClass}
            >
              {SALT_FORECAST_WEATHER_REGION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <ForecastNumberInput
            label="Lookback Weeks"
            value={lookbackWeeks}
            onChange={setLookbackWeeks}
            min={52}
            max={520}
          />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          EIA Salt | Weather {weatherRegion} | Latest report week {fmtDate(data?.summary.latestReportWeek)} | Live
          EIA checked {fmtDate(data?.summary.liveEiaChecked)} | API {fmtMs(apiElapsedMs)}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {data?.sourceStatus.lineage ?? "Derived local Salt Fc route will report source lineage after load."}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {warnings.join(" ")}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-4 text-sm text-gray-500">
          Loading Salt Fc forecast diagnostics...
        </div>
      )}

      {data && !loading && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <ForecastKpi
              label="Next EIA Forecast (Bcf)"
              value={fmtSignedBcf(data.summary.nextForecast)}
              detail={data.summary.nextForecast === null ? "No pending week" : "Actual weather case"}
              valueClassName="text-cyan-300"
            />
            <ForecastKpi
              label="80% Range"
              value={
                data.summary.rangeLow === null || data.summary.rangeHigh === null
                  ? "-"
                  : `${fmtSignedBcf(data.summary.rangeLow)} to ${fmtSignedBcf(data.summary.rangeHigh)}`
              }
              detail="Walk-forward residual envelope"
              valueClassName="text-gray-100"
            />
            <ForecastKpi
              label="Ensemble Backtest"
              value={`MAE ${fmtNumber(data.summary.ensembleMae, 2)}`}
              detail={`OOS RMSE ${fmtNumber(data.summary.ensembleRmse, 2)} | Hit ${fmtRatioPercent(data.summary.hitRate)}`}
              valueClassName="text-gray-100"
            />
            <ForecastKpi
              label="Signal Coverage"
              value={fmtRatioPercent(data.summary.signalCoverage)}
              detail={data.summary.signalCoverage === null ? "No pending week" : "Pending-week source coverage"}
              valueClassName="text-gray-100"
            />
            <ForecastKpi
              label="Weather Impact / Loose-Tight"
              value={fmtSignedBcf(data.summary.nextWeatherImpact)}
              detail={`LT adj ${fmtSignedBcf(data.summary.latestLooseTight)} | z ${fmtNumber(data.summary.latestLooseTightZ, 2)}`}
              valueClassName={flowTone(data.summary.nextWeatherImpact)}
            />
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-100">
              Weekly EIA Salt Activity: Actual vs Model
            </h3>
            <ForecastActualModelChart series={data.weeklySeries} />
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <h3 className="text-sm font-semibold text-gray-100">
                Loose/Tight Z-Score (Weather Adjusted) | Last 8 weeks highlighted
              </h3>
              <div className="flex items-center gap-2">
                <ForecastFocusButton onClick={() => setFocusedChart("z-score")} />
                <ForecastHelpButton label="Z-score is actual minus walk-forward ensemble prediction, standardized by residual history." />
              </div>
            </div>
            <ForecastZScoreChart series={data.weeklySeries} />
          </section>

          <div className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-gray-950/60 p-3 md:flex-row md:items-center md:justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Scatter Filters</p>
            <ForecastYearControls
              activeYears={activeYears}
              showRecent={showRecent}
              setActiveYears={setActiveYears}
              setShowRecent={setShowRecent}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <ForecastScatterPanel
              title="Scatter: Expected vs Actual (Weather Adjusted)"
              help="Expected is the derived walk-forward ensemble prediction; actual is EIA weekly salt working gas change."
              data={data.expectedActualScatter}
              xLabel="Expected"
              yLabel="Actual"
              activeYears={activeYears}
              showRecent={showRecent}
              onFocus={() => setFocusedChart("expected-actual")}
            />
            <ForecastScatterPanel
              title="Scatter: Weather Impact vs Loose/Tight"
              help="Weather impact is the weather-adjusted model component; loose/tight is actual minus predicted."
              data={data.weatherLooseTightScatter}
              xLabel="Weather Impact"
              yLabel="Loose/Tight"
              activeYears={activeYears}
              showRecent={showRecent}
              onFocus={() => setFocusedChart("weather-loose-tight")}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <ForecastWeightsTable rows={data.modelWeights} />
            <ForecastDriversPanel rows={data.leadDrivers} />
          </div>

          <ForecastPendingQueue rows={data.pendingQueue} />
        </>
      )}

      {focusedChart && data && (
        <div
          className="fixed inset-0 z-50 bg-black/75 p-2 sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFocusedChart(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="salt-forecast-focus-title"
            className="mx-auto flex h-full max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl shadow-black/50"
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-800 p-3">
              <div>
                <h2 id="salt-forecast-focus-title" className="text-sm font-semibold text-gray-100">
                  {focusedChart === "z-score"
                    ? "Loose/Tight Z-Score"
                    : focusedChart === "expected-actual"
                      ? "Expected vs Actual"
                      : "Weather Impact vs Loose/Tight"}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {data.summary.weeklyRowCount.toLocaleString()} weekly rows | {fmtDate(data.summary.minWeek)} to{" "}
                  {fmtDate(data.summary.maxWeek)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFocusedChart(null)}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {focusedChart === "z-score" && <ForecastZScoreChart series={data.weeklySeries} height="70vh" />}
              {focusedChart === "expected-actual" && (
                <ForecastScatterPanel
                  title="Scatter: Expected vs Actual (Weather Adjusted)"
                  help="Expected is the derived walk-forward ensemble prediction; actual is EIA weekly salt working gas change."
                  data={data.expectedActualScatter}
                  xLabel="Expected"
                  yLabel="Actual"
                  activeYears={activeYears}
                  showRecent={showRecent}
                  onFocus={() => undefined}
                  showFocusButton={false}
                  height="62vh"
                />
              )}
              {focusedChart === "weather-loose-tight" && (
                <ForecastScatterPanel
                  title="Scatter: Weather Impact vs Loose/Tight"
                  help="Weather impact is the weather-adjusted model component; loose/tight is actual minus predicted."
                  data={data.weatherLooseTightScatter}
                  xLabel="Weather Impact"
                  yLabel="Loose/Tight"
                  activeYears={activeYears}
                  showRecent={showRecent}
                  onFocus={() => undefined}
                  showFocusButton={false}
                  height="62vh"
                />
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
