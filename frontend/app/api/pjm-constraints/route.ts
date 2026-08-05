import { observedJsonRoute } from "@/lib/server/apiObservability";
import { queryWithStatementTimeout } from "@/lib/server/db";
import type {
  PjmConstraintMarket,
  PjmConstraintRow,
  PjmConstraintsPayload,
} from "@/lib/pjmConstraintsTypes";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;
const CACHE_HEADER = "public, s-maxage=180, stale-while-revalidate=120, stale-if-error=600";
const QUERY_TIMEOUT = {
  statementTimeoutMs: 18_000,
  queryTimeoutMs: 22_000,
};
const ROUTE_CONFIG = {
  route: "/api/pjm-constraints",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=180, stale-while-revalidate=120, stale-if-error=600",
  owner: "frontend",
  purpose: "PJM DA and RT marginal value constraint heatmap",
  p95TargetMs: 2_500,
  freshnessSource: "pjm.da_marginal_value / pjm.rt_marginal_value updated_at",
} as const;

const SOURCE_TABLE_BY_MARKET: Record<PjmConstraintMarket, string> = {
  da: "pjm.da_marginal_value",
  rt: "pjm.rt_marginal_value",
};

interface BoundsRow {
  latest_date: string | null;
  available_dates: string[] | null;
}

interface PeriodSummaryRow {
  source_row_count: number | string;
  source_interval_count: number | string;
  source_max_timestamp: string | null;
  latest_update_timestamp: string | null;
}

interface FlatConstraintRow {
  rank: number | string;
  monitored_facility: string | null;
  contingency_facility: string | null;
  he: number | string;
  hour_value: number | string | null;
  interval_count: number | string | null;
  hour_max_shadow_price: number | string | null;
  total_value: number | string | null;
  total_intervals: number | string | null;
  total_max_shadow_price: number | string | null;
}

function parseMarket(value: string | null): PjmConstraintMarket {
  return value === "rt" ? "rt" : "da";
}

function parseDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function searchTerms(value: string | null): string[] {
  return (value ?? "")
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 12);
}

async function loadBounds(sourceTable: string): Promise<BoundsRow> {
  const [row] = await queryWithStatementTimeout<BoundsRow>(
    `
      with available_dates as (
        select distinct datetime_beginning_ept::date as d
        from ${sourceTable}
        where datetime_beginning_ept is not null
        order by d desc
        limit 90
      )
      select
        to_char((select max(d) from available_dates), 'YYYY-MM-DD') as latest_date,
        coalesce(
          array_agg(to_char(d, 'YYYY-MM-DD') order by d desc),
          array[]::text[]
        ) as available_dates
      from available_dates
    `,
    [],
    QUERY_TIMEOUT,
  );

  return row ?? { latest_date: null, available_dates: [] };
}

async function loadPeriodSummary(
  sourceTable: string,
  selectedDate: string,
): Promise<PeriodSummaryRow> {
  const [row] = await queryWithStatementTimeout<PeriodSummaryRow>(
    `
      select
        count(*)::int as source_row_count,
        count(distinct datetime_beginning_ept)::int as source_interval_count,
        to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as source_max_timestamp,
        to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SSOF') as latest_update_timestamp
      from ${sourceTable}
      where shadow_price is not null
        and datetime_beginning_ept >= $1::date::timestamp
        and datetime_beginning_ept < ($1::date + interval '1 day')::timestamp
    `,
    [selectedDate],
    QUERY_TIMEOUT,
  );

  return row ?? {
    source_row_count: 0,
    source_interval_count: 0,
    source_max_timestamp: null,
    latest_update_timestamp: null,
  };
}

async function loadConstraintRows(
  sourceTable: string,
  selectedDate: string,
  terms: string[],
  limit: number,
): Promise<FlatConstraintRow[]> {
  return queryWithStatementTimeout<FlatConstraintRow>(
    `
      with source_rows as (
        select
          coalesce(nullif(trim(monitored_facility), ''), 'UNKNOWN') as monitored_facility,
          coalesce(nullif(trim(contingency_facility), ''), 'ACTUAL') as contingency_facility,
          (extract(hour from datetime_beginning_ept)::int + 1) as he,
          abs(shadow_price::float8) as abs_shadow_price
        from ${sourceTable}
        where shadow_price is not null
          and datetime_beginning_ept >= $1::date::timestamp
          and datetime_beginning_ept < ($1::date + interval '1 day')::timestamp
          and (
            cardinality($2::text[]) = 0
            or not exists (
              select 1
              from unnest($2::text[]) as term(value)
              where concat_ws(' ', monitored_facility, contingency_facility) not ilike ('%' || term.value || '%')
            )
          )
      ),
      hourly as (
        select
          monitored_facility,
          contingency_facility,
          he,
          sum(abs_shadow_price)::float8 as hour_value,
          count(*)::int as interval_count,
          max(abs_shadow_price)::float8 as hour_max_shadow_price
        from source_rows
        group by monitored_facility, contingency_facility, he
      ),
      totals as (
        select
          monitored_facility,
          contingency_facility,
          sum(hour_value)::float8 as total_value,
          sum(interval_count)::int as total_intervals,
          max(hour_max_shadow_price)::float8 as total_max_shadow_price
        from hourly
        group by monitored_facility, contingency_facility
      ),
      limited as (
        select
          *,
          row_number() over (
            order by total_value desc nulls last,
                     total_intervals desc,
                     monitored_facility,
                     contingency_facility
          ) as rank
        from totals
        order by total_value desc nulls last,
                 total_intervals desc,
                 monitored_facility,
                 contingency_facility
        limit $3::int
      )
      select
        limited.rank,
        hourly.monitored_facility,
        hourly.contingency_facility,
        hourly.he,
        hourly.hour_value,
        hourly.interval_count,
        hourly.hour_max_shadow_price,
        limited.total_value,
        limited.total_intervals,
        limited.total_max_shadow_price
      from limited
      join hourly
        on hourly.monitored_facility = limited.monitored_facility
       and hourly.contingency_facility = limited.contingency_facility
      order by limited.rank, hourly.he
    `,
    [selectedDate, terms, limit],
    QUERY_TIMEOUT,
  );
}

function emptyHourValues() {
  return Array.from({ length: 24 }, (_, index) => ({
    he: index + 1,
    value: null,
    intervalCount: 0,
  }));
}

function buildRows(flatRows: FlatConstraintRow[]): PjmConstraintRow[] {
  const rowsByKey = new Map<string, PjmConstraintRow>();

  for (const row of flatRows) {
    const monitoredFacility = row.monitored_facility ?? "UNKNOWN";
    const contingencyFacility = row.contingency_facility ?? "ACTUAL";
    const key = `${monitoredFacility}\u0000${contingencyFacility}`;
    const he = Math.trunc(toNumber(row.he));
    let grouped = rowsByKey.get(key);

    if (!grouped) {
      grouped = {
        rank: Math.trunc(toNumber(row.rank)),
        monitoredFacility,
        contingencyFacility,
        totalValue: toNumber(row.total_value),
        bindingIntervals: Math.trunc(toNumber(row.total_intervals)),
        maxShadowPrice: toNumber(row.total_max_shadow_price),
        hours: emptyHourValues(),
      };
      rowsByKey.set(key, grouped);
    }

    if (he >= 1 && he <= 24) {
      grouped.hours[he - 1] = {
        he,
        value: toNumber(row.hour_value),
        intervalCount: Math.trunc(toNumber(row.interval_count)),
      };
    }
  }

  return Array.from(rowsByKey.values()).sort((left, right) => left.rank - right.rank);
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const market = parseMarket(searchParams.get("market"));
  const sourceTable = SOURCE_TABLE_BY_MARKET[market];
  const limit = parseLimit(searchParams.get("limit"));
  const terms = searchTerms(searchParams.get("search"));
  const search = terms.join(" ");
  const refresh = searchParams.get("refresh") === "1";
  const metric = "abs-shadow-price";
  const metricLabel = "Daily hourly-equivalent absolute shadow price by HE";

  const bounds = await loadBounds(sourceTable);
  const selectedDate = parseDate(searchParams.get("date")) ?? bounds.latest_date;

  if (!selectedDate) {
    const payload: PjmConstraintsPayload = {
      iso: "pjm",
      source: "PJM Data Miner constraint feeds",
      summary: {
        market,
        mode: "daily",
        sourceTable,
        metric,
        metricLabel,
        selectedDate: null,
        latestDate: null,
        availableDates: [],
        sourceMaxTimestamp: null,
        latestUpdateTimestamp: null,
        sourceRowCount: 0,
        sourceIntervalCount: 0,
        rowCount: 0,
        bindingIntervals: 0,
        totalValue: 0,
        maxHourlyValue: 0,
        maxTotalValue: 0,
        limit,
        truncated: false,
        search,
      },
      rows: [],
    };
    return {
      payload,
      headers: { "Cache-Control": refresh ? "no-store" : CACHE_HEADER },
      rowCount: 0,
      dataAsOf: null,
    };
  }

  const [periodSummary, flatRows] = await Promise.all([
    loadPeriodSummary(sourceTable, selectedDate),
    loadConstraintRows(sourceTable, selectedDate, terms, limit),
  ]);
  const rows = buildRows(flatRows);
  const totalValue = rows.reduce((sum, row) => sum + row.totalValue, 0);
  const bindingIntervals = rows.reduce((sum, row) => sum + row.bindingIntervals, 0);
  const maxHourlyValue = rows.reduce(
    (maxValue, row) =>
      Math.max(maxValue, ...row.hours.map((hour) => hour.value ?? 0)),
    0,
  );
  const maxTotalValue = rows.reduce((maxValue, row) => Math.max(maxValue, row.totalValue), 0);
  const sourceRowCount = Math.trunc(toNumber(periodSummary.source_row_count));
  const payload: PjmConstraintsPayload = {
    iso: "pjm",
    source: "PJM Data Miner constraint feeds",
    summary: {
      market,
      mode: "daily",
      sourceTable,
      metric,
      metricLabel,
      selectedDate,
      latestDate: bounds.latest_date,
      availableDates: bounds.available_dates ?? [],
      sourceMaxTimestamp: periodSummary.source_max_timestamp,
      latestUpdateTimestamp: periodSummary.latest_update_timestamp,
      sourceRowCount,
      sourceIntervalCount: Math.trunc(toNumber(periodSummary.source_interval_count)),
      rowCount: rows.length,
      bindingIntervals,
      totalValue,
      maxHourlyValue,
      maxTotalValue,
      limit,
      truncated: rows.length >= limit && sourceRowCount > rows.length,
      search,
    },
    rows,
  };

  return {
    payload,
    headers: { "Cache-Control": refresh ? "no-store" : CACHE_HEADER },
    rowCount: rows.length,
    dataAsOf: periodSummary.latest_update_timestamp ?? periodSummary.source_max_timestamp,
  };
});
