import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=120, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/ops/readiness",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=120, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "Backend data availability readiness for dashboard freshness",
  p95TargetMs: 500,
  freshnessSource: "ops.data_availability_events.updated_at",
} as const;

const MONITORED_DATASETS = [
  {
    dataset: "pjm_da_hrl_lmps",
    label: "PJM DA LMPs",
    staleAfterHours: 36,
    missingStatus: "missing",
  },
  {
    dataset: "pjm_rt_fivemin_hrl_lmps",
    label: "PJM RT verified five-minute LMPs",
    staleAfterHours: 36,
    missingStatus: "missing",
  },
  {
    dataset: "ercot_dam_stlmnt_pnt_prices",
    label: "ERCOT DAM settlement point prices",
    staleAfterHours: 36,
    missingStatus: "missing",
  },
  {
    dataset: "ercot_settlement_point_prices",
    label: "ERCOT RT settlement point prices",
    staleAfterHours: 6,
    missingStatus: "missing",
  },
] as const;

interface AvailabilityRow {
  event_key: string;
  dataset: string;
  source_system: string;
  availability_type: string;
  business_date: string | null;
  window_start: string | null;
  window_end: string | null;
  scope: string | null;
  grain: string | null;
  source_table: string | null;
  row_count: number | null;
  completeness_status: string;
  created_at: string;
  updated_at: string;
}

function hoursSince(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return null;
  return Math.round(((Date.now() - parsed) / 3_600_000) * 10) / 10;
}

function readinessStatus(
  row: AvailabilityRow | undefined,
  staleAfterHours: number,
  missingStatus: string,
): "current" | "stale" | "missing" | "degraded" {
  if (!row) return missingStatus as "missing";
  if (row.completeness_status && row.completeness_status !== "complete") return "degraded";
  const ageHours = hoursSince(row.updated_at);
  if (ageHours !== null && ageHours > staleAfterHours) return "stale";
  return "current";
}

function maxStamp(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async () => {
  const datasetNames = MONITORED_DATASETS.map((item) => item.dataset);
  const rows = await query<AvailabilityRow>(
    `
      with ranked as (
        select
          event_key,
          dataset,
          source_system,
          availability_type,
          business_date::text as business_date,
          to_char(window_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as window_start,
          to_char(window_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as window_end,
          scope,
          grain,
          source_table,
          row_count,
          completeness_status,
          to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
          to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at,
          row_number() over (
            partition by dataset
            order by
              coalesce(business_date, window_end::date, updated_at::date) desc,
              updated_at desc
          ) as rn
        from ops.data_availability_events
        where availability_type = 'data_ready'
          and dataset = any($1::text[])
      )
      select
        event_key,
        dataset,
        source_system,
        availability_type,
        business_date,
        window_start,
        window_end,
        scope,
        grain,
        source_table,
        row_count,
        completeness_status,
        created_at,
        updated_at
      from ranked
      where rn = 1
      order by dataset
    `,
    [datasetNames],
  );
  const byDataset = new Map(rows.map((row) => [row.dataset, row]));
  const datasets = MONITORED_DATASETS.map((config) => {
    const row = byDataset.get(config.dataset);
    return {
      dataset: config.dataset,
      label: config.label,
      status: readinessStatus(row, config.staleAfterHours, config.missingStatus),
      staleAfterHours: config.staleAfterHours,
      ageHours: hoursSince(row?.updated_at ?? null),
      latestEvent: row ?? null,
    };
  });
  const overallStatus = datasets.some((item) => item.status === "missing")
    ? "missing"
    : datasets.some((item) => item.status === "degraded")
      ? "degraded"
      : datasets.some((item) => item.status === "stale")
        ? "stale"
        : "current";
  const dataAsOf = maxStamp(rows.map((row) => row.updated_at));

  return {
    payload: {
      overallStatus,
      generatedAt: new Date().toISOString(),
      rowCount: rows.length,
      datasets,
    },
    headers: { "Cache-Control": CACHE_HEADER, "X-Helios-Ops-Readiness-Cache": "MISS" },
    rowCount: rows.length,
    dataAsOf,
  };
});
