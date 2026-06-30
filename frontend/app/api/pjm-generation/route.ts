import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isGenerationDevEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/pjm-generation",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "PJM generation fuel mix and capacity context",
  p95TargetMs: 1_500,
  freshnessSource:
    "pjm.gen_by_fuel.updated_at, pjm.day_gen_capacity.updated_at, pjm.rt_and_self_ecomax.updated_at",
} as const;

interface AvailableDateRow {
  operating_date: string;
}

interface SourceFreshnessRow {
  source_table: string;
  row_count: number | string;
  min_ept: string | null;
  max_ept: string | null;
  latest_update_at: string | null;
}

interface HourlyDbRow {
  hour_ept: string;
  hour_utc: string;
  hour_beginning: number | string;
  total_generation_mw: number | string | null;
  renewable_mw: number | string | null;
  nonrenewable_mw: number | string | null;
  fuels: unknown;
  eco_max: number | string | null;
  emerg_max: number | string | null;
  total_committed: number | string | null;
  rt_ecomax: number | string | null;
  conf_disclaimer: string | null;
  self_ecomax: number | string | null;
}

interface FuelSummaryDbRow {
  fuel_type: string;
  is_renewable: boolean | null;
  hourly_rows: number | string;
  avg_mw: number | string | null;
  min_mw: number | string | null;
  max_mw: number | string | null;
  total_mwh: number | string | null;
  avg_share: number | string | null;
}

interface FuelHour {
  fuelType: string;
  mw: number | null;
  share: number | null;
  isRenewable: boolean | null;
}

interface HourlyGenerationRow {
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

function parseDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: unknown): number {
  const parsed = toNumber(value);
  return parsed === null ? 0 : Math.trunc(parsed);
}

function round(value: number | null, digits = 1): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function avg(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function maxValue(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length ? Math.max(...numbers) : null;
}

function maxStamp(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function isoOrText(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function normalizeFuel(value: unknown): FuelHour | null {
  if (!value || typeof value !== "object") return null;
  const item = value as {
    fuelType?: unknown;
    mw?: unknown;
    share?: unknown;
    isRenewable?: unknown;
  };
  if (typeof item.fuelType !== "string" || !item.fuelType.trim()) return null;
  return {
    fuelType: item.fuelType,
    mw: round(toNumber(item.mw)),
    share: round(toNumber(item.share), 2),
    isRenewable: typeof item.isRenewable === "boolean" ? item.isRenewable : null,
  };
}

function normalizeHourly(row: HourlyDbRow): HourlyGenerationRow {
  const totalGenerationMw = toNumber(row.total_generation_mw);
  const renewableMw = toNumber(row.renewable_mw);
  const fuelRows = Array.isArray(row.fuels) ? row.fuels.map(normalizeFuel).filter(Boolean) : [];
  const disclaimer = row.conf_disclaimer?.trim() || null;

  return {
    hourEpt: row.hour_ept,
    hourUtc: row.hour_utc,
    hourBeginning: toInteger(row.hour_beginning),
    totalGenerationMw: round(totalGenerationMw),
    renewableMw: round(renewableMw),
    nonrenewableMw: round(toNumber(row.nonrenewable_mw)),
    renewableSharePct:
      totalGenerationMw && renewableMw !== null ? round((renewableMw / totalGenerationMw) * 100, 2) : null,
    fuels: fuelRows as FuelHour[],
    ecoMaxMw: round(toNumber(row.eco_max)),
    emergencyMaxMw: round(toNumber(row.emerg_max)),
    totalCommittedMw: round(toNumber(row.total_committed)),
    rtEcomaxMw: round(toNumber(row.rt_ecomax)),
    rtEcomaxSuppressed: toNumber(row.rt_ecomax) === null && Boolean(disclaimer),
    confidentialityDisclaimer: disclaimer,
    selfScheduledEcomaxMw: round(toNumber(row.self_ecomax)),
  };
}

function sourceFreshness(rows: SourceFreshnessRow[]) {
  return rows.map((row) => ({
    sourceTable: row.source_table,
    rowCount: toInteger(row.row_count),
    minEpt: row.min_ept,
    maxEpt: row.max_ept,
    latestUpdateAt: isoOrText(row.latest_update_at),
  }));
}

function emptyPayload({
  requestedDate,
  selectedDate,
  availableDates,
  freshness,
}: {
  requestedDate: string | null;
  selectedDate: string | null;
  availableDates: string[];
  freshness: ReturnType<typeof sourceFreshness>;
}) {
  return {
    iso: "pjm",
    source: "PJM Data Miner Generation",
    requestedDate,
    selectedDate,
    latestCommonDate: availableDates[0] ?? null,
    availableDates,
    asOf: maxStamp(freshness.map((row) => row.latestUpdateAt)),
    freshness,
    summary: {
      hourCount: 0,
      fuelCount: 0,
      avgGenerationMw: null,
      peakGenerationMw: null,
      peakGenerationHourEpt: null,
      avgRenewableSharePct: null,
      avgEcoMaxMw: null,
      avgEmergencyMaxMw: null,
      avgTotalCommittedMw: null,
      avgRtEcomaxMw: null,
      avgSelfScheduledEcomaxMw: null,
      avgGenerationToEcoMaxPct: null,
      avgGenerationToCommittedPct: null,
      rtEcomaxAvailableHours: 0,
      rtEcomaxSuppressedHours: 0,
    },
    hourly: [],
    fuelSummary: [],
    metadata: {
      dateSelection: "Dates require at least 23 hourly timestamps in all three source feeds.",
      units: "MW for hourly values and average MW for daily summaries.",
    },
  };
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const requestedDate = parseDate(searchParams.get("date"));

  const [availableRows, freshnessRows] = await Promise.all([
    query<AvailableDateRow>(`
      with sched_dates as (
        select
          datetime_beginning_ept::date as operating_date
        from pjm.rt_and_self_ecomax
        group by 1
        having count(distinct datetime_beginning_utc) >= 23
        order by 1 desc
        limit 180
      ),
      date_bounds as (
        select
          min(operating_date) as start_date,
          max(operating_date) as end_date
        from sched_dates
      ),
      gen_dates as (
        select
          g.datetime_beginning_ept::date as operating_date
        from pjm.gen_by_fuel g
        cross join date_bounds b
        where g.datetime_beginning_ept >= b.start_date::timestamp
          and g.datetime_beginning_ept < (b.end_date + interval '1 day')::timestamp
        group by 1
        having count(distinct g.datetime_beginning_utc) >= 23
      ),
      capacity_dates as (
        select
          c.bid_datetime_beginning_ept::date as operating_date
        from pjm.day_gen_capacity c
        cross join date_bounds b
        where c.bid_datetime_beginning_ept >= b.start_date::timestamp
          and c.bid_datetime_beginning_ept < (b.end_date + interval '1 day')::timestamp
        group by 1
        having count(distinct c.bid_datetime_beginning_utc) >= 23
      )
      select to_char(s.operating_date, 'YYYY-MM-DD') as operating_date
      from sched_dates s
      inner join gen_dates g using (operating_date)
      inner join capacity_dates c using (operating_date)
      order by s.operating_date desc
    `),
    query<SourceFreshnessRow>(`
      select
        'pjm.gen_by_fuel' as source_table,
        count(*) as row_count,
        to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as min_ept,
        to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as max_ept,
        max(updated_at)::text as latest_update_at
      from pjm.gen_by_fuel
      union all
      select
        'pjm.day_gen_capacity' as source_table,
        count(*) as row_count,
        to_char(min(bid_datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as min_ept,
        to_char(max(bid_datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as max_ept,
        max(updated_at)::text as latest_update_at
      from pjm.day_gen_capacity
      union all
      select
        'pjm.rt_and_self_ecomax' as source_table,
        count(*) as row_count,
        to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as min_ept,
        to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as max_ept,
        max(updated_at)::text as latest_update_at
      from pjm.rt_and_self_ecomax
    `),
  ]);

  const availableDates = availableRows.map((row) => row.operating_date);
  const selectedDate =
    requestedDate && availableDates.includes(requestedDate)
      ? requestedDate
      : availableDates[0] ?? null;
  const freshness = sourceFreshness(freshnessRows);

  if (!selectedDate) {
    const payload = emptyPayload({
      requestedDate,
      selectedDate,
      availableDates,
      freshness,
    });
    return {
      payload,
      headers: { "Cache-Control": CACHE_HEADER },
      rowCount: 0,
      dataAsOf: payload.asOf,
    };
  }

  const [hourlyRows, fuelRows] = await Promise.all([
    query<HourlyDbRow>(
      `
        with fuel_hourly as (
          select
            datetime_beginning_utc,
            min(datetime_beginning_ept) as datetime_beginning_ept,
            sum(coalesce(mw, 0))::float8 as total_generation_mw,
            coalesce(sum(mw) filter (where is_renewable is true), 0)::float8 as renewable_mw,
            coalesce(sum(mw) filter (where is_renewable is not true), 0)::float8 as nonrenewable_mw,
            jsonb_agg(
              jsonb_build_object(
                'fuelType', fuel_type,
                'mw', mw,
                'share', fuel_percentage_of_total,
                'isRenewable', is_renewable
              )
              order by fuel_type
            ) as fuels
          from pjm.gen_by_fuel
          where datetime_beginning_ept::date = $1::date
          group by datetime_beginning_utc
        )
        select
          to_char(f.datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as hour_ept,
          to_char(f.datetime_beginning_utc, 'YYYY-MM-DD"T"HH24:MI:SS') as hour_utc,
          extract(hour from f.datetime_beginning_ept)::int as hour_beginning,
          f.total_generation_mw,
          f.renewable_mw,
          f.nonrenewable_mw,
          f.fuels,
          c.eco_max::float8 as eco_max,
          c.emerg_max::float8 as emerg_max,
          c.total_committed::float8 as total_committed,
          s.rt_ecomax::float8 as rt_ecomax,
          s.conf_disclaimer,
          s.self_ecomax::float8 as self_ecomax
        from fuel_hourly f
        left join pjm.day_gen_capacity c
          on c.bid_datetime_beginning_utc = f.datetime_beginning_utc
        left join pjm.rt_and_self_ecomax s
          on s.datetime_beginning_utc = f.datetime_beginning_utc
        order by f.datetime_beginning_ept
      `,
      [selectedDate],
    ),
    query<FuelSummaryDbRow>(
      `
        select
          fuel_type,
          bool_or(is_renewable) as is_renewable,
          count(*) as hourly_rows,
          avg(mw)::float8 as avg_mw,
          min(mw)::float8 as min_mw,
          max(mw)::float8 as max_mw,
          sum(mw)::float8 as total_mwh,
          avg(fuel_percentage_of_total)::float8 as avg_share
        from pjm.gen_by_fuel
        where datetime_beginning_ept::date = $1::date
        group by fuel_type
        order by avg(mw) desc nulls last, fuel_type
      `,
      [selectedDate],
    ),
  ]);

  const hourly = hourlyRows.map(normalizeHourly);
  const peakGenerationMw = maxValue(hourly.map((row) => row.totalGenerationMw));
  const peakRow = hourly.find((row) => row.totalGenerationMw === peakGenerationMw) ?? null;
  const asOf = maxStamp(freshness.map((row) => row.latestUpdateAt));
  const fuelSummary = fuelRows.map((row) => ({
    fuelType: row.fuel_type,
    isRenewable: row.is_renewable,
    hourlyRows: toInteger(row.hourly_rows),
    avgMw: round(toNumber(row.avg_mw)),
    minMw: round(toNumber(row.min_mw)),
    maxMw: round(toNumber(row.max_mw)),
    totalMwh: round(toNumber(row.total_mwh)),
    avgSharePct: round(toNumber(row.avg_share), 2),
  }));

  const payload = {
    iso: "pjm",
    source: "PJM Data Miner Generation",
    requestedDate,
    selectedDate,
    latestCommonDate: availableDates[0] ?? null,
    availableDates,
    asOf,
    freshness,
    summary: {
      hourCount: hourly.length,
      fuelCount: fuelSummary.length,
      avgGenerationMw: round(avg(hourly.map((row) => row.totalGenerationMw))),
      peakGenerationMw: round(peakGenerationMw),
      peakGenerationHourEpt: peakRow?.hourEpt ?? null,
      avgRenewableSharePct: round(avg(hourly.map((row) => row.renewableSharePct)), 2),
      avgEcoMaxMw: round(avg(hourly.map((row) => row.ecoMaxMw))),
      avgEmergencyMaxMw: round(avg(hourly.map((row) => row.emergencyMaxMw))),
      avgTotalCommittedMw: round(avg(hourly.map((row) => row.totalCommittedMw))),
      avgRtEcomaxMw: round(avg(hourly.map((row) => row.rtEcomaxMw))),
      avgSelfScheduledEcomaxMw: round(avg(hourly.map((row) => row.selfScheduledEcomaxMw))),
      avgGenerationToEcoMaxPct: round(
        avg(
          hourly.map((row) =>
            row.totalGenerationMw !== null && row.ecoMaxMw
              ? (row.totalGenerationMw / row.ecoMaxMw) * 100
              : null,
          ),
        ),
        2,
      ),
      avgGenerationToCommittedPct: round(
        avg(
          hourly.map((row) =>
            row.totalGenerationMw !== null && row.totalCommittedMw
              ? (row.totalGenerationMw / row.totalCommittedMw) * 100
              : null,
          ),
        ),
        2,
      ),
      rtEcomaxAvailableHours: hourly.filter((row) => row.rtEcomaxMw !== null).length,
      rtEcomaxSuppressedHours: hourly.filter((row) => row.rtEcomaxSuppressed).length,
    },
    hourly,
    fuelSummary,
    metadata: {
      dateSelection: "Dates require at least 23 hourly timestamps in all three source feeds.",
      units: "MW for hourly values and average MW for daily summaries.",
      capacityDefinitions: {
        economicMax:
          "Total economic megawatts offered into the Energy Market from cost-based offers; does not reflect outages and excludes emergency units.",
        emergencyMax:
          "Total emergency megawatts offered into the Energy Market from cost-based offers; does not reflect outages and includes emergency units.",
        totalCommitted:
          "Committed installed capacity from the RPM Capacity Market, including Fixed Resource Requirement units.",
      },
    },
  };

  return {
    payload,
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: hourly.length,
    dataAsOf: asOf,
  };
});

export async function GET(request: Request): Promise<Response> {
  if (!isGenerationDevEnabled()) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return observedGET(request);
}
