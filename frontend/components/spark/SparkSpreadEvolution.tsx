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
import SparkSnapshotTable from "@/components/spark/SparkSnapshotTable";
import StripSelector, { COMPOSITE_OPTIONS, STRIP_MONTHS } from "@/components/spark/StripSelector";
import { seasonalYearColor } from "@/components/spark/seasonalColors";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type { SparkEvolutionPoint, SparkEvolutionResponse } from "@/lib/sparkSpreads/evolution";
import {
  DEFAULT_POWER_SPARK_SPREAD_PRODUCT,
  POWER_SPARK_SPREAD_PRODUCTS,
  getPowerSparkSpreadProduct,
} from "@/lib/sparkSpreads/products";

const API_TTL_MS = 5 * 60 * 1000;
const VALID_STRIPS: Set<string> = new Set([
  ...STRIP_MONTHS.map((strip) => strip.code),
  ...COMPOSITE_OPTIONS.map((strip) => strip.code),
]);

interface TooltipEntry {
  name: string;
  value: number | null;
  color: string;
  payload?: SparkEvolutionPoint;
}

function defaultAvailableYears(
  years: number[],
  hasData: (year: number) => boolean,
  currentYear = new Date().getFullYear(),
): number[] {
  const defaults = years
    .filter((year) => year >= currentYear - 3 && year <= currentYear + 1)
    .filter(hasData);
  if (defaults.length) return defaults;
  return years.filter(hasData);
}

function initialStrip(searchParams: URLSearchParams): string {
  const candidate = (searchParams.get("sparkStrip") ?? "H").toUpperCase();
  return VALID_STRIPS.has(candidate) ? candidate : "H";
}

function initialProductId(searchParams: URLSearchParams): string {
  return getPowerSparkSpreadProduct(searchParams.get("sparkProduct"))?.id ?? DEFAULT_POWER_SPARK_SPREAD_PRODUCT.id;
}

function normalizeActiveLabel(label: string | number | undefined): number | null {
  if (typeof label === "number" && Number.isFinite(label)) return label;
  if (typeof label === "string" && label.trim()) {
    const parsed = Number(label);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatSeasonalTooltipDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10) return null;

  const year = Number(value.slice(0, 4));
  const monthIndex = Number(value.slice(5, 7)) - 1;
  const day = Number(value.slice(8, 10));
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) return null;

  const date = new Date(Date.UTC(year, monthIndex, day));
  if (Number.isNaN(date.getTime())) return null;

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${weekdays[date.getUTCDay()]} ${months[date.getUTCMonth()]}-${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCFullYear()).slice(-2)}`;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const validEntries = payload.filter((entry) => entry.value !== null && entry.value !== undefined);
  if (!validEntries.length) return null;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm shadow-xl">
      <p className="mb-2 font-semibold text-gray-200">{label}d to expiry</p>
      {validEntries.map((entry) => {
        const dateLabel = formatSeasonalTooltipDate(entry.payload?.[`${entry.name}Date`]);
        return (
          <div key={entry.name} className="flex items-center gap-2 py-0.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            <span className="text-gray-400">{entry.name}:</span>
            <span className="font-mono text-gray-100">
              {`$${Number(entry.value).toFixed(2)}${dateLabel ? ` | ${dateLabel}` : ""}`}
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
  currentYear,
  zoomDomain,
  height,
  onHoverDte,
}: {
  chartData: SparkEvolutionPoint[];
  activeYears: number[];
  currentYear: number;
  zoomDomain: [number, number];
  height: number;
  onHoverDte: (dte: number | null) => void;
}) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
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
            tickFormatter={(value: number) => `$${value.toFixed(0)}`}
            label={{
              value: "$/MWh",
              angle: -90,
              position: "insideLeft",
              offset: 10,
              fill: "#6b7280",
              fontSize: 12,
            }}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: "#64748b", strokeDasharray: "4 4", strokeWidth: 1 }}
          />
          <Legend wrapperStyle={{ paddingTop: "16px", fontSize: "13px", color: "#9ca3af" }} />
          <ReferenceLine
            y={0}
            stroke="#ef4444"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{ value: "Break-even", position: "right", fill: "#ef4444", fontSize: 11 }}
          />
          {activeYears.map((year) => (
            <Line
              key={year}
              type="monotone"
              dataKey={String(year)}
              name={String(year)}
              stroke={seasonalYearColor(year)}
              strokeWidth={year === currentYear ? 2.5 : 1.8}
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

export default function SparkSpreadEvolution() {
  const currentYear = new Date().getFullYear();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [strip, setStrip] = useState(() => initialStrip(searchParams));
  const [productId, setProductId] = useState(() => initialProductId(searchParams));
  const [data, setData] = useState<SparkEvolutionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenYears, setHiddenYears] = useState<Set<string>>(new Set());
  const [zoomDomain, setZoomDomain] = useState<[number, number]>([730, 0]);
  const [hoveredDte, setHoveredDte] = useState<number | null>(null);

  const selectedProduct = getPowerSparkSpreadProduct(productId) ?? DEFAULT_POWER_SPARK_SPREAD_PRODUCT;

  useEffect(() => {
    const urlStrip = initialStrip(searchParams);
    const urlProduct = initialProductId(searchParams);
    setStrip((previous) => (previous === urlStrip ? previous : urlStrip));
    setProductId((previous) => (previous === urlProduct ? previous : urlProduct));
  }, [searchParams]);

  useEffect(() => {
    const currentStrip = (searchParams.get("sparkStrip") ?? "").toUpperCase();
    const currentProduct = (searchParams.get("sparkProduct") ?? "").toUpperCase();
    const currentView = (searchParams.get("view") ?? "").toLowerCase();
    if (currentStrip === strip && currentProduct === selectedProduct.id && currentView === "spark") return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "spark-spreads");
    params.set("view", "spark");
    params.set("sparkStrip", strip);
    params.set("sparkProduct", selectedProduct.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams, selectedProduct.id, strip]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);
    setHoveredDte(null);

    const encodedStrip = encodeURIComponent(strip);
    const encodedProduct = encodeURIComponent(selectedProduct.id);
    const url = `/api/spark-spread-evolution?sparkProduct=${encodedProduct}&strip=${encodedStrip}`;
    const cacheKey = `api:spark-spread-evolution:${encodedProduct}:${encodedStrip}`;

    fetchJsonWithCache<SparkEvolutionResponse>({
      key: cacheKey,
      url,
      ttlMs: API_TTL_MS,
      signal: controller.signal,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        const defaultYears = new Set(
          defaultAvailableYears(
            payload.years,
            (year) => Boolean(payload.dataAvailability[String(year)]),
            currentYear,
          ).map(String),
        );
        setHiddenYears(
          new Set(
            payload.years
              .map(String)
              .filter((year) => !defaultYears.has(year) || !payload.dataAvailability[year]),
          ),
        );
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setData(null);
        setError(err instanceof Error ? err.message : "Failed to load spark spreads");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [currentYear, selectedProduct.id, strip]);

  const series: PlotSeries[] = useMemo(
    () =>
      (data?.years ?? [])
        .filter((year) => data?.dataAvailability[String(year)])
        .map((year) => ({
          key: String(year),
          label: String(year),
          color: seasonalYearColor(year),
        })),
    [data],
  );
  const activeYears = useMemo(
    () => {
      if (!data) return [];
      return data.years.filter(
        (year) => data.dataAvailability[String(year)] && !hiddenYears.has(String(year)),
      );
    },
    [data, hiddenYears],
  );

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
    const available = data.years.filter((year) => data.dataAvailability[String(year)]).map(String);
    setHiddenYears(new Set(available.slice(1)));
  }

  function setZoomPreset(days: number | "all") {
    setZoomDomain(days === "all" ? [730, 0] : [days, 0]);
  }

  const chart = data ? (
    <SparkLineChart
      chartData={data.data}
      activeYears={activeYears}
      currentYear={currentYear}
      zoomDomain={zoomDomain}
      height={440}
      onHoverDte={setHoveredDte}
    />
  ) : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20">
          <div className="grid gap-3">
            <div>
              <label
                htmlFor="spark-spread-product"
                className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-500"
              >
                Spark Product
              </label>
              <select
                id="spark-spread-product"
                value={selectedProduct.id}
                onChange={(event) => setProductId(event.target.value)}
                className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm font-semibold text-gray-100 outline-none transition-colors focus:border-sky-500"
              >
                {POWER_SPARK_SPREAD_PRODUCTS.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.shortLabel}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wider">
            <span className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-gray-300">
              {selectedProduct.powerRoot}
            </span>
            <span className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-gray-400">
              {selectedProduct.gasRoot}+{selectedProduct.basisRoot}
            </span>
            <span className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-gray-400">
              {selectedProduct.heatRate.toFixed(1)}x
            </span>
          </div>
        </section>

        <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20">
          <StripSelector label="Spark Strip" value={strip} onChange={setStrip} />
        </section>
      </div>

      {data && !loading && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-gray-300">
              Selected: {data.monthName} ({strip})
            </span>
            <span className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-gray-300">
              Active years: {activeYears.length} / {series.length}
            </span>
            <span className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-gray-300">
              Source rows: {data.metadata.rowCount.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Zoom Level</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Last 30 Days", days: 30 },
            { label: "Last 60 Days", days: 60 },
            { label: "Last 90 Days", days: 90 },
            { label: "Last 6 Months", days: 180 },
            { label: "All", days: "all" as const },
          ].map(({ label, days }) => {
            const active = days === "all" ? zoomDomain[0] === 730 : zoomDomain[0] === days;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setZoomPreset(days)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  active ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {loading && <div className="h-[440px] w-full animate-pulse rounded-lg bg-gray-800/60" />}

      {error && !loading && (
        <div className="flex h-[440px] items-center justify-center rounded-lg border border-red-900/40 bg-red-950/20 p-6 text-sm text-red-300">
          {error}
        </div>
      )}

      {data && !loading && !error && activeYears.length === 0 && (
        <div className="flex h-[440px] items-center justify-center rounded-lg border border-gray-800 bg-[#12141d] text-sm text-gray-500">
          No complete spark spread years are available for {data.monthName}.
        </div>
      )}

      {data && !loading && !error && activeYears.length > 0 && chart && (
        <PlotCard
          title="Spark Spread"
          subtitle={`${selectedProduct.shortLabel} | ${data.metadata.powerLeg} / ${data.metadata.gasLeg} | ${data.monthName} (${strip})`}
          series={series}
          hiddenSeries={hiddenYears}
          onToggleSeries={toggleYear}
          onShowAll={showAllYears}
          onHideAll={hideAllYears}
          focusedChildren={
            <SparkLineChart
              chartData={data.data}
              activeYears={activeYears}
              currentYear={currentYear}
              zoomDomain={zoomDomain}
              height={620}
              onHoverDte={setHoveredDte}
            />
          }
        >
          {chart}
        </PlotCard>
      )}

      {data && !loading && !error && (
        <SparkSnapshotTable data={data} activeYears={activeYears} hoveredDte={hoveredDte} />
      )}
    </div>
  );
}
