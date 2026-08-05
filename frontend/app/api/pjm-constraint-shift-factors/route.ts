import { observedJsonRoute } from "@/lib/server/apiObservability";
import { queryWithStatementTimeout } from "@/lib/server/db";
import { loadPjmShiftFactorModel } from "@/lib/server/pjmNetworkShiftFactors";
import {
  buildOutagePreviewForConstraint,
  linkedConstraintFromSource,
  loadTransmissionOutageImpactUniverse,
} from "@/lib/server/pjmTransmissionOutageImpacts";
import type {
  PjmConstraintShiftFactorHourValue,
  PjmConstraintShiftFactorRow,
  PjmConstraintShiftFactorsPayload,
} from "@/lib/pjmConstraintShiftFactorsTypes";
import type { PjmConstraintMarket } from "@/lib/pjmConstraintsTypes";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;
const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=300, stale-if-error=900";
const QUERY_TIMEOUT = {
  statementTimeoutMs: 18_000,
  queryTimeoutMs: 22_000,
};
const ROUTE_CONFIG = {
  route: "/api/pjm-constraint-shift-factors",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=300, stale-if-error=900",
  owner: "frontend",
  purpose: "PJM modelled Western Hub shift factors for DA and RT constraints",
  p95TargetMs: 4_000,
  freshnessSource: "pjm.da_marginal_value / pjm.rt_marginal_value / frontend RAW model",
} as const;

const SOURCE_TABLE_BY_MARKET: Record<PjmConstraintMarket, string> = {
  da: "pjm.da_marginal_value",
  rt: "pjm.rt_marginal_value",
};

interface BoundsRow {
  latest_date: string | null;
  available_dates: string[] | null;
}

interface SourceSummaryRow {
  source_row_count: number | string;
  latest_update_timestamp: string | null;
}

interface WesternHubBusRow {
  bus_pnode_name: string;
  bus_pnode_factor: number | string;
}

interface ConstraintSourceRow {
  rank: number | string;
  monitored_facility: string | null;
  contingency_facility: string | null;
  interval_count: number | string;
  total_abs_shadow_price: number | string | null;
  average_shadow_price: number | string | null;
  max_abs_shadow_price: number | string | null;
  hours: ConstraintSourceHour[] | string | null;
}

interface ConstraintSourceHour {
  he: number | string;
  shadow_price: number | string | null;
  interval_count: number | string | null;
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

function parseIncludeOutagePreview(value: string | null): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function outagePreviewSearchParams(searchParams: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(searchParams);
  params.delete("search");
  params.delete("includeOutagePreview");
  return params;
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

function emptyHours(): PjmConstraintShiftFactorHourValue[] {
  return Array.from({ length: 24 }, (_, index) => ({
    he: index + 1,
    shadowPrice: null,
    estimatedWesternHubImpact: null,
    intervalCount: 0,
  }));
}

function parseSourceHours(value: ConstraintSourceRow["hours"]): ConstraintSourceHour[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

async function loadSourceSummary(
  sourceTable: string,
  selectedDate: string,
): Promise<SourceSummaryRow> {
  const [row] = await queryWithStatementTimeout<SourceSummaryRow>(
    `
      select
        count(*)::int as source_row_count,
        to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SSOF') as latest_update_timestamp
      from ${sourceTable}
      where shadow_price is not null
        and datetime_beginning_ept >= $1::date::timestamp
        and datetime_beginning_ept < ($1::date + interval '1 day')::timestamp
    `,
    [selectedDate],
    QUERY_TIMEOUT,
  );

  return row ?? { source_row_count: 0, latest_update_timestamp: null };
}

async function loadWesternHubBuses(selectedDate: string): Promise<WesternHubBusRow[]> {
  return queryWithStatementTimeout<WesternHubBusRow>(
    `
      with selected as (
        select
          bus_pnode_name,
          bus_pnode_factor
        from pjm.agg_definitions
        where agg_pnode_name = 'WESTERN HUB'
          and effective_date_ept <= $1::date
          and terminate_date_ept > $1::date
      ),
      fallback_active as (
        select
          bus_pnode_name,
          bus_pnode_factor
        from pjm.agg_definitions
        where agg_pnode_name = 'WESTERN HUB'
          and terminate_date_ept = DATE '9999-12-31'
          and not exists (select 1 from selected)
      )
      select *
      from selected
      union all
      select *
      from fallback_active
    `,
    [selectedDate],
    QUERY_TIMEOUT,
  );
}

async function loadConstraintRows(
  sourceTable: string,
  selectedDate: string,
  terms: string[],
  limit: number,
): Promise<ConstraintSourceRow[]> {
  return queryWithStatementTimeout<ConstraintSourceRow>(
    `
      with source_rows as (
        select
          coalesce(nullif(trim(monitored_facility), ''), 'UNKNOWN') as monitored_facility,
          coalesce(nullif(trim(contingency_facility), ''), 'ACTUAL') as contingency_facility,
          (extract(hour from datetime_beginning_ept)::int + 1) as he,
          shadow_price::float8 as shadow_price
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
          avg(shadow_price)::float8 as shadow_price,
          count(*)::int as interval_count
        from source_rows
        group by monitored_facility, contingency_facility, he
      ),
      totals as (
        select
          monitored_facility,
          contingency_facility,
          count(*)::int as interval_count,
          sum(abs(shadow_price))::float8 as total_abs_shadow_price,
          avg(shadow_price)::float8 as average_shadow_price,
          max(abs(shadow_price))::float8 as max_abs_shadow_price
        from source_rows
        group by monitored_facility, contingency_facility
      )
      select
        row_number() over (
          order by total_abs_shadow_price desc nulls last,
                   interval_count desc,
                   monitored_facility,
                   contingency_facility
        ) as rank,
        monitored_facility,
        contingency_facility,
        interval_count,
        total_abs_shadow_price,
        average_shadow_price,
        max_abs_shadow_price,
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'he', hourly.he,
                'shadow_price', hourly.shadow_price,
                'interval_count', hourly.interval_count
              )
              order by hourly.he
            )
            from hourly
            where hourly.monitored_facility = totals.monitored_facility
              and hourly.contingency_facility = totals.contingency_facility
          ),
          '[]'::jsonb
        ) as hours
      from totals
      order by total_abs_shadow_price desc nulls last,
               interval_count desc,
               monitored_facility,
               contingency_facility
      limit $3::int
    `,
    [selectedDate, terms, limit],
    QUERY_TIMEOUT,
  );
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const market = parseMarket(searchParams.get("market"));
  const sourceTable = SOURCE_TABLE_BY_MARKET[market];
  const limit = parseLimit(searchParams.get("limit"));
  const terms = searchTerms(searchParams.get("search"));
  const search = terms.join(" ");
  const refresh = searchParams.get("refresh") === "1";
  const includeOutagePreview = parseIncludeOutagePreview(
    searchParams.get("includeOutagePreview"),
  );
  const bounds = await loadBounds(sourceTable);
  const selectedDate = parseDate(searchParams.get("date")) ?? bounds.latest_date;

  if (!selectedDate) {
    const emptyPayload: PjmConstraintShiftFactorsPayload = {
      iso: "pjm",
      source: "PJM marginal value feeds and RAW network model",
      summary: {
        market,
        selectedDate: null,
        latestDate: null,
        availableDates: [],
        sourceTable,
        sourceRowCount: 0,
        rowCount: 0,
        matchedConstraintCount: 0,
        maxAbsHourlyEstimatedWesternHubImpact: 0,
        maxAbsHourlyShadowPrice: 0,
        maxAbsEstimatedWesternHubImpact: 0,
        model: (await loadPjmShiftFactorModel([])).summary,
        limit,
        truncated: false,
        search,
        latestUpdateTimestamp: null,
      },
      rows: [],
    };
    return {
      payload: emptyPayload,
      headers: { "Cache-Control": refresh ? "no-store" : CACHE_HEADER },
      rowCount: 0,
      dataAsOf: null,
    };
  }

  const [sourceSummary, westernHubRows, constraintRows] = await Promise.all([
    loadSourceSummary(sourceTable, selectedDate),
    loadWesternHubBuses(selectedDate),
    loadConstraintRows(sourceTable, selectedDate, terms, limit),
  ]);
  const model = await loadPjmShiftFactorModel(
    westernHubRows.map((row) => ({
      busPnodeName: row.bus_pnode_name,
      busPnodeFactor: toNumber(row.bus_pnode_factor),
    })),
  );
  const previewUniverse = includeOutagePreview
    ? await loadTransmissionOutageImpactUniverse(outagePreviewSearchParams(searchParams))
    : null;

  const rows: PjmConstraintShiftFactorRow[] = constraintRows.map((row) => {
    const monitoredFacility = row.monitored_facility ?? "UNKNOWN";
    const averageShadowPrice = toNumber(row.average_shadow_price);
    const estimate = model.estimateForFacility(monitoredFacility, averageShadowPrice);
    const hours = emptyHours();
    for (const hour of parseSourceHours(row.hours)) {
      const he = Math.trunc(toNumber(hour.he));
      if (he < 1 || he > 24) continue;
      const shadowPrice =
        hour.shadow_price === null || hour.shadow_price === undefined
          ? null
          : toNumber(hour.shadow_price);
      hours[he - 1] = {
        he,
        shadowPrice,
        estimatedWesternHubImpact:
          shadowPrice !== null && estimate.shiftFactor !== null
            ? shadowPrice * estimate.shiftFactor
            : null,
        intervalCount: Math.trunc(toNumber(hour.interval_count)),
      };
    }
    return {
      rank: Math.trunc(toNumber(row.rank)),
      monitoredFacility,
      contingencyFacility: row.contingency_facility ?? "ACTUAL",
      intervalCount: Math.trunc(toNumber(row.interval_count)),
      totalAbsShadowPrice: toNumber(row.total_abs_shadow_price),
      averageShadowPrice,
      maxAbsShadowPrice: toNumber(row.max_abs_shadow_price),
      ...estimate,
      outagePreview: previewUniverse
        ? buildOutagePreviewForConstraint(
            previewUniverse.filteredRows,
            linkedConstraintFromSource({
              monitoredFacility,
              matchedBranchKey: estimate.matchedBranchKey,
              matchedBranchName: estimate.matchedBranchName,
              fromBusName: estimate.fromBusName,
              toBusName: estimate.toBusName,
              circuitId: estimate.circuitId,
            }),
            previewUniverse.model.scoreBranchNeighborhood,
          )
        : null,
      hours,
    };
  });
  const matchedConstraintCount = rows.filter(
    (row) => row.matchStatus === "matched" || row.matchStatus === "ambiguous",
  ).length;
  const sourceRowCount = Math.trunc(toNumber(sourceSummary.source_row_count));
  const maxAbsHourlyEstimatedWesternHubImpact = Math.max(
    0,
    ...rows.flatMap((row) =>
      row.hours.map((hour) => Math.abs(hour.estimatedWesternHubImpact ?? 0)),
    ),
  );
  const maxAbsHourlyShadowPrice = Math.max(
    0,
    ...rows.flatMap((row) => row.hours.map((hour) => Math.abs(hour.shadowPrice ?? 0))),
  );
  const maxAbsEstimatedWesternHubImpact = Math.max(
    0,
    ...rows.map((row) => Math.abs(row.estimatedWesternHubImpact ?? 0)),
  );
  const payload: PjmConstraintShiftFactorsPayload = {
    iso: "pjm",
    source: "PJM marginal value feeds and RAW network model",
    summary: {
      market,
      selectedDate,
      latestDate: bounds.latest_date,
      availableDates: bounds.available_dates ?? [],
      sourceTable,
      sourceRowCount,
      rowCount: rows.length,
      matchedConstraintCount,
      maxAbsHourlyEstimatedWesternHubImpact,
      maxAbsHourlyShadowPrice,
      maxAbsEstimatedWesternHubImpact,
      model: {
        ...model.summary,
        westernHubBusCount: westernHubRows.length,
      },
      limit,
      truncated: rows.length >= limit && sourceRowCount > rows.length,
      search,
      latestUpdateTimestamp: sourceSummary.latest_update_timestamp,
    },
    rows,
  };

  return {
    payload,
    headers: { "Cache-Control": refresh ? "no-store" : CACHE_HEADER },
    rowCount: rows.length,
    dataAsOf: sourceSummary.latest_update_timestamp,
  };
});
