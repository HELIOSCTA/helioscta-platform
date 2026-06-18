import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isDurationCurvesDevEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const MAX_YEARS = 10;
const DEFAULT_HUB = "WESTERN HUB";
const ROUTE_CONFIG = {
  route: "/api/pjm-price-duration-curves",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "PJM historical hourly LMP price duration curves",
  p95TargetMs: 1_500,
  freshnessSource: "pjm.da_hrl_lmps, pjm.rt_hrl_lmps, or pjm.rt_unverified_hrl_lmps updated_at",
} as const;

type Market = "rt" | "da";
type RtSource = "verified" | "unverified";
type ComponentKey = "total" | "energy" | "congestion" | "loss";
type HourFilter = "weekday_onpeak" | "all_he8_23" | "offpeak" | "all_hours";

interface SourceConfig {
  sourceTable: "pjm.da_hrl_lmps" | "pjm.rt_hrl_lmps" | "pjm.rt_unverified_hrl_lmps";
  sourceLabel: string;
  currentFilter: string;
}

interface PriceRow {
  year: number;
  datetime_beginning_ept: string;
  hour_ending: number;
  price: number | string | null;
  as_of: string | null;
}

interface SeriesRow {
  year: number;
  xPct: number;
  price: number;
  rank: number;
  datetimeBeginningEpt: string;
  hourEnding: number;
}

interface SummaryRow {
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

const REPORT_HUBS = [
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

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const HOUR_FILTER_LABELS: Record<HourFilter, string> = {
  weekday_onpeak: "Weekday HE8-23, no holiday adjustment",
  all_he8_23: "All days HE8-23",
  offpeak: "Off-peak: weekends plus weekday HE1-7 and HE24, no holiday adjustment",
  all_hours: "All hours",
};

function parseMarket(value: string | null): Market {
  return value === "da" ? "da" : "rt";
}

function parseRtSource(value: string | null): RtSource {
  return value === "unverified" ? "unverified" : "verified";
}

function parseComponent(value: string | null): ComponentKey {
  if (value === "energy" || value === "congestion" || value === "loss") return value;
  return "total";
}

function parseMonth(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : 7;
}

function parseHourFilter(value: string | null): HourFilter {
  if (
    value === "all_he8_23" ||
    value === "offpeak" ||
    value === "all_hours" ||
    value === "weekday_onpeak"
  ) {
    return value;
  }
  return "weekday_onpeak";
}

function defaultYears(month: number): number[] {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const latestCompleteYear = month < currentMonth ? currentYear : currentYear - 1;
  return Array.from({ length: 5 }, (_, index) => latestCompleteYear - 4 + index);
}

function parseYears(value: string | null, month: number): number[] {
  if (!value) return defaultYears(month);
  const currentYear = new Date().getUTCFullYear();
  const parsed = value
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((year) => Number.isInteger(year) && year >= 2000 && year <= currentYear);
  const years = [...new Set(parsed)].sort((a, b) => a - b);
  return years.length ? years.slice(-MAX_YEARS) : defaultYears(month);
}

function parseThreshold(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceConfig(market: Market, rtSource: RtSource): SourceConfig {
  if (market === "da") {
    return {
      sourceTable: "pjm.da_hrl_lmps",
      sourceLabel: "PJM day-ahead hourly LMPs",
      currentFilter: "and row_is_current = true",
    };
  }
  if (rtSource === "unverified") {
    return {
      sourceTable: "pjm.rt_unverified_hrl_lmps",
      sourceLabel: "PJM unverified real-time hourly LMPs",
      currentFilter: "",
    };
  }
  return {
    sourceTable: "pjm.rt_hrl_lmps",
    sourceLabel: "PJM verified real-time hourly LMPs",
    currentFilter: "and row_is_current = true",
  };
}

function componentExpr(market: Market, rtSource: RtSource, component: ComponentKey): string {
  if (market === "da") {
    if (component === "energy") return "system_energy_price_da";
    if (component === "congestion") return "congestion_price_da";
    if (component === "loss") return "marginal_loss_price_da";
    return "total_lmp_da";
  }
  if (component === "energy" && rtSource === "unverified") {
    return "(total_lmp_rt - congestion_price_rt - marginal_loss_price_rt)";
  }
  if (component === "energy") return "system_energy_price_rt";
  if (component === "congestion") return "congestion_price_rt";
  if (component === "loss") return "marginal_loss_price_rt";
  return "total_lmp_rt";
}

function hourFilterSql(hourFilter: HourFilter): string {
  if (hourFilter === "weekday_onpeak") {
    return "and extract(isodow from datetime_beginning_ept)::int between 1 and 5 and (extract(hour from datetime_beginning_ept)::int + 1) between 8 and 23";
  }
  if (hourFilter === "all_he8_23") {
    return "and (extract(hour from datetime_beginning_ept)::int + 1) between 8 and 23";
  }
  if (hourFilter === "offpeak") {
    return "and (extract(isodow from datetime_beginning_ept)::int in (6, 7) or (extract(hour from datetime_beginning_ept)::int + 1) not between 8 and 23)";
  }
  return "";
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

function percentile(sortedAsc: number[], pct: number): number | null {
  if (!sortedAsc.length) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const position = (pct / 100) * (sortedAsc.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedAsc[lower];
  const weight = position - lower;
  return sortedAsc[lower] * (1 - weight) + sortedAsc[upper] * weight;
}

function summarize(year: number | "all", values: number[], threshold: number | null): SummaryRow {
  if (!values.length) {
    return {
      year,
      hourCount: 0,
      min: null,
      max: null,
      average: null,
      p50: null,
      p90: null,
      p95: null,
      p99: null,
      countAboveThreshold: threshold === null ? null : 0,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    year,
    hourCount: values.length,
    min: round(sortedAsc[0]),
    max: round(sortedAsc.at(-1) ?? null),
    average: round(total / values.length),
    p50: round(percentile(sortedAsc, 50)),
    p90: round(percentile(sortedAsc, 90)),
    p95: round(percentile(sortedAsc, 95)),
    p99: round(percentile(sortedAsc, 99)),
    countAboveThreshold:
      threshold === null ? null : values.filter((value) => value >= threshold).length,
  };
}

function maxStamp(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const market = parseMarket(searchParams.get("market"));
  const rtSource = parseRtSource(searchParams.get("rtSource"));
  const hub = searchParams.get("hub")?.trim() || DEFAULT_HUB;
  const component = parseComponent(searchParams.get("component"));
  const month = parseMonth(searchParams.get("month"));
  const years = parseYears(searchParams.get("years"), month);
  const hourFilter = parseHourFilter(searchParams.get("hourFilter"));
  const threshold = parseThreshold(searchParams.get("threshold"));
  const source = sourceConfig(market, rtSource);
  const valueExpr = componentExpr(market, rtSource, component);
  const filterSql = hourFilterSql(hourFilter);

  const rows = await query<PriceRow>(
    `
      select
        extract(year from datetime_beginning_ept)::int as year,
        to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
        (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
        ${valueExpr}::float8 as price,
        to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
      from ${source.sourceTable}
      where pnode_name = $1
        and extract(month from datetime_beginning_ept)::int = $2
        and extract(year from datetime_beginning_ept)::int = any($3::int[])
        ${source.currentFilter}
        ${filterSql}
      order by year, datetime_beginning_ept
    `,
    [hub, month, years],
  );

  const rowsByYear = new Map<number, PriceRow[]>();
  for (const row of rows) {
    const price = toNumber(row.price);
    if (price === null) continue;
    const yearRows = rowsByYear.get(row.year) ?? [];
    yearRows.push(row);
    rowsByYear.set(row.year, yearRows);
  }

  const series: SeriesRow[] = [];
  const summaries: SummaryRow[] = [];
  const allPrices: number[] = [];

  for (const year of years) {
    const sortedRows = (rowsByYear.get(year) ?? []).sort(
      (a, b) => (toNumber(b.price) ?? 0) - (toNumber(a.price) ?? 0),
    );
    const prices = sortedRows
      .map((row) => toNumber(row.price))
      .filter((price): price is number => price !== null);
    allPrices.push(...prices);
    summaries.push(summarize(year, prices, threshold));

    const denominator = Math.max(sortedRows.length - 1, 1);
    sortedRows.forEach((row, index) => {
      const price = toNumber(row.price);
      if (price === null) return;
      series.push({
        year,
        xPct: Math.round((index / denominator) * 10_000) / 100,
        price: round(price) ?? price,
        rank: index + 1,
        datetimeBeginningEpt: row.datetime_beginning_ept,
        hourEnding: Number(row.hour_ending),
      });
    });
  }

  const latestAsOf = maxStamp(rows.map((row) => row.as_of));

  return {
    payload: {
      iso: "pjm",
      market,
      rtSource,
      hub,
      component,
      month,
      monthLabel: MONTH_LABELS[month - 1],
      years,
      hourFilter,
      hourFilterLabel: HOUR_FILTER_LABELS[hourFilter],
      threshold,
      source: source.sourceLabel,
      sourceTable: source.sourceTable,
      asOf: latestAsOf,
      rowCount: series.length,
      maxYears: MAX_YEARS,
      metadata: {
        xAxis: "Exceedance share of selected hours, sorted by descending price",
        yAxis: "$/MWh",
        sorting: "Each selected year's matching hourly prices are sorted descending.",
        holidayAdjustment:
          hourFilter === "weekday_onpeak" || hourFilter === "offpeak"
            ? "No holiday calendar is applied in this v1 view."
            : null,
        availableHubs: REPORT_HUBS,
      },
      summary: summaries,
      overallSummary: summarize("all", allPrices, threshold),
      series,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: series.length,
    dataAsOf: latestAsOf,
  };
});

export async function GET(request: Request): Promise<Response> {
  if (!isDurationCurvesDevEnabled()) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return observedGET(request);
}
