import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isDaModelDevEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const maxDuration = 30;

const DET_TABLE = "meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly";
const ENS_TABLE = "meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly";
const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=120";
const ROUTE_CONFIG = {
  route: "/api/pjm-da-model",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=120",
  owner: "frontend",
  purpose: "Meteologica Western Hub DA price forecast with actual DA LMP",
  p95TargetMs: 1_000,
  freshnessSource:
    "meteologica Western Hub DA price forecast deterministic and ECMWF ENS issue_date, pjm.da_hrl_lmps.updated_at",
} as const;

type SeriesLabel = "Actual DA" | "Det" | "ENS Avg" | "ENS Bottom" | "ENS Top";
type RowKind = "series" | "dispersion";

interface TableCheckRow {
  det_table: string | null;
  ens_table: string | null;
}

interface DateRow {
  forecast_date: string;
}

interface ForecastSqlRow {
  hour_ending: number | string | null;
  forecast_datetime: string | null;
  det_issue_utc: string | null;
  ens_issue_utc: string | null;
  actual_datetime_ept: string | null;
  actual_as_of: string | null;
  actual_da_lmp: number | string | null;
  da_price_deterministic: number | string | null;
  da_price_ens_average: number | string | null;
  da_price_ens_bottom: number | string | null;
  da_price_ens_top: number | string | null;
  member_values: unknown;
}

interface PjmDaModelHourly {
  hourEnding: number;
  forecastDatetime: string | null;
  actualDatetimeEpt: string | null;
  actualDaLmp: number | null;
  pointForecast: number | null;
  ensAvg: number | null;
  ensBottom: number | null;
  ensTop: number | null;
  membersP25: number | null;
  membersP75: number | null;
}

interface PjmDaModelTableRow {
  key: string;
  label: string;
  kind: RowKind;
  values: Array<number | null>;
  onPeak: number | null;
  offPeak: number | null;
  flat: number | null;
}

const SERIES_ORDER: readonly SeriesLabel[] = [
  "Actual DA",
  "Det",
  "ENS Avg",
  "ENS Bottom",
  "ENS Top",
];
const HOURS = Array.from({ length: 24 }, (_, index) => index + 1);
const ONPEAK_HOURS = HOURS.filter((hour) => hour >= 8 && hour <= 23);
const OFFPEAK_HOURS = HOURS.filter((hour) => hour < 8 || hour > 23);

function parseDate(raw: string | null): string | null {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function parseCutoff(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,3})?(?:Z)?$/);
  if (!match) return null;
  const [, datePart, hour, minute, second = "00"] = match;
  const parsed = new Date(`${datePart}T${hour}:${minute}:${second}Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (
    parsed.getUTCFullYear() !== Number(datePart.slice(0, 4)) ||
    parsed.getUTCMonth() + 1 !== Number(datePart.slice(5, 7)) ||
    parsed.getUTCDate() !== Number(datePart.slice(8, 10)) ||
    parsed.getUTCHours() !== Number(hour) ||
    parsed.getUTCMinutes() !== Number(minute) ||
    parsed.getUTCSeconds() !== Number(second)
  ) {
    return null;
  }
  return `${datePart}T${hour}:${minute}:${second}`;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInt(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function isoLocal(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(" ", "T").slice(0, 19);
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value !== null);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(toNumber).filter((entry): entry is number => entry !== null);
}

function summarize(
  values: Array<number | null>,
): Pick<PjmDaModelTableRow, "flat" | "offPeak" | "onPeak"> {
  return {
    onPeak: avg(ONPEAK_HOURS.map((hour) => values[hour - 1] ?? null)),
    offPeak: avg(OFFPEAK_HOURS.map((hour) => values[hour - 1] ?? null)),
    flat: avg(values),
  };
}

function hourlyValues(
  hourly: PjmDaModelHourly[],
  series: SeriesLabel,
): Array<number | null> {
  return hourly.map((entry) => {
    if (series === "Actual DA") return entry.actualDaLmp;
    if (series === "Det") return entry.pointForecast;
    if (series === "ENS Avg") return entry.ensAvg;
    if (series === "ENS Bottom") return entry.ensBottom;
    return entry.ensTop;
  });
}

function buildRow(
  key: string,
  label: string,
  kind: RowKind,
  values: Array<number | null>,
): PjmDaModelTableRow {
  return {
    key,
    label,
    kind,
    values,
    ...summarize(values),
  };
}

function subtract(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

function buildRows(hourly: PjmDaModelHourly[]): PjmDaModelTableRow[] {
  const seriesRows = SERIES_ORDER.map((series) =>
    buildRow(series, series, "series", hourlyValues(hourly, series)),
  );

  return [
    ...seriesRows,
    buildRow(
      "Width",
      "Width",
      "dispersion",
      hourly.map((entry) => subtract(entry.ensTop, entry.ensBottom)),
    ),
    buildRow(
      "IQR",
      "IQR",
      "dispersion",
      hourly.map((entry) => subtract(entry.membersP75, entry.membersP25)),
    ),
  ];
}

function emptyPayload(
  targetDate: string | null,
  availableTargetDates: string[] = [],
  cutoffUtc: string | null = null,
) {
  return {
    iso: "pjm",
    source: "Meteologica Western Hub DA price forecast source tables",
    sourceContract: `${DET_TABLE} + ${ENS_TABLE}`,
    targetDate,
    defaultTargetDate: availableTargetDates[0] ?? null,
    availableTargetDates,
    cutoffUtc,
    hub: "WESTERN HUB",
    detIssueUtc: null,
    ensIssueUtc: null,
    actualAsOf: null,
    asOf: null,
    headlineOnPeak: null,
    hourly: [],
    rows: [],
  };
}

function memberArraySql(): string {
  return `array_remove(array[
    ens_00_price::float8, ens_01_price::float8, ens_02_price::float8,
    ens_03_price::float8, ens_04_price::float8, ens_05_price::float8,
    ens_06_price::float8, ens_07_price::float8, ens_08_price::float8,
    ens_09_price::float8, ens_10_price::float8, ens_11_price::float8,
    ens_12_price::float8, ens_13_price::float8, ens_14_price::float8,
    ens_15_price::float8, ens_16_price::float8, ens_17_price::float8,
    ens_18_price::float8, ens_19_price::float8, ens_20_price::float8,
    ens_21_price::float8, ens_22_price::float8, ens_23_price::float8,
    ens_24_price::float8, ens_25_price::float8, ens_26_price::float8,
    ens_27_price::float8, ens_28_price::float8, ens_29_price::float8,
    ens_30_price::float8, ens_31_price::float8, ens_32_price::float8,
    ens_33_price::float8, ens_34_price::float8, ens_35_price::float8,
    ens_36_price::float8, ens_37_price::float8, ens_38_price::float8,
    ens_39_price::float8, ens_40_price::float8, ens_41_price::float8,
    ens_42_price::float8, ens_43_price::float8, ens_44_price::float8,
    ens_45_price::float8, ens_46_price::float8, ens_47_price::float8,
    ens_48_price::float8, ens_49_price::float8, ens_50_price::float8
  ], null)`;
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const requestedDate = parseDate(searchParams.get("date"));
  const cutoffUtc = parseCutoff(searchParams.get("cutoff"));

  const [tableCheck] = await query<TableCheckRow>(
    `
      select
        to_regclass($1)::text as det_table,
        to_regclass($2)::text as ens_table
    `,
    [DET_TABLE, ENS_TABLE],
  );

  if (!tableCheck?.det_table || !tableCheck.ens_table) {
    return {
      payload: emptyPayload(requestedDate, [], cutoffUtc),
      headers: { "Cache-Control": CACHE_HEADER },
      rowCount: 0,
      dataAsOf: new Date().toISOString(),
    };
  }

  const availableDateRows = await query<DateRow>(
    `
      with dates as (
        select forecast_period_start::date as forecast_date
        from meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly
        where forecast_period_start::date >= current_date
          and ($1::timestamp is null or issue_date <= $1::timestamp)
        union
        select forecast_period_start::date as forecast_date
        from meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly
        where forecast_period_start::date >= current_date
          and ($1::timestamp is null or issue_date <= $1::timestamp)
      )
      select forecast_date::text as forecast_date
      from dates
      group by forecast_date
      order by forecast_date
      limit 60
    `,
    [cutoffUtc],
  );
  const availableTargetDates = availableDateRows.map((row) => row.forecast_date);
  const targetDate = requestedDate ?? availableTargetDates[0] ?? null;

  if (!targetDate) {
    return {
      payload: emptyPayload(null, availableTargetDates, cutoffUtc),
      headers: { "Cache-Control": CACHE_HEADER },
      rowCount: 0,
      dataAsOf: new Date().toISOString(),
    };
  }

  const forecastRows = await query<ForecastSqlRow>(
    `
      with target as (
        select $1::date as target_date, $2::timestamp as cutoff_utc
      ),
      det_issue as (
        select max(issue_date) as issue_date
        from meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly d
        join target t on d.forecast_period_start::date = t.target_date
        where t.cutoff_utc is null or d.issue_date <= t.cutoff_utc
      ),
      ens_issue as (
        select max(issue_date) as issue_date
        from meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly e
        join target t on e.forecast_period_start::date = t.target_date
        where t.cutoff_utc is null or e.issue_date <= t.cutoff_utc
      ),
      det as (
        select
          extract(hour from d.forecast_period_start)::int + 1 as hour_ending,
          to_char(d.forecast_period_start, 'YYYY-MM-DD"T"HH24:MI:SS') as forecast_datetime,
          to_char(d.issue_date, 'YYYY-MM-DD"T"HH24:MI:SS') as det_issue_utc,
          d.day_ahead_price::float8 as da_price_deterministic
        from meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly d
        join target t on d.forecast_period_start::date = t.target_date
        join det_issue i on d.issue_date = i.issue_date
      ),
      ens as (
        select
          extract(hour from e.forecast_period_start)::int + 1 as hour_ending,
          to_char(e.forecast_period_start, 'YYYY-MM-DD"T"HH24:MI:SS') as forecast_datetime,
          to_char(e.issue_date, 'YYYY-MM-DD"T"HH24:MI:SS') as ens_issue_utc,
          e.average_price::float8 as da_price_ens_average,
          e.bottom_price::float8 as da_price_ens_bottom,
          e.top_price::float8 as da_price_ens_top,
          ${memberArraySql()} as member_values
        from meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly e
        join target t on e.forecast_period_start::date = t.target_date
        join ens_issue i on e.issue_date = i.issue_date
      ),
      actual as (
        select
          extract(hour from a.datetime_beginning_ept)::int + 1 as hour_ending,
          to_char(a.datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as actual_datetime_ept,
          to_char(a.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as actual_as_of,
          a.total_lmp_da::float8 as actual_da_lmp
        from pjm.da_hrl_lmps a
        join target t on a.datetime_beginning_ept::date = t.target_date
        where a.row_is_current = true
          and a.pnode_name = 'WESTERN HUB'
      )
      select
        coalesce(d.hour_ending, e.hour_ending, a.hour_ending) as hour_ending,
        coalesce(d.forecast_datetime, e.forecast_datetime) as forecast_datetime,
        d.det_issue_utc,
        e.ens_issue_utc,
        a.actual_datetime_ept,
        a.actual_as_of,
        a.actual_da_lmp,
        d.da_price_deterministic,
        e.da_price_ens_average,
        e.da_price_ens_bottom,
        e.da_price_ens_top,
        e.member_values
      from det d
      full outer join ens e on d.hour_ending = e.hour_ending
      full outer join actual a on coalesce(d.hour_ending, e.hour_ending) = a.hour_ending
      order by coalesce(d.hour_ending, e.hour_ending, a.hour_ending)
    `,
    [targetDate, cutoffUtc],
  );

  const byHour = new Map<number, ForecastSqlRow>();
  for (const row of forecastRows) {
    const hour = toInt(row.hour_ending);
    if (hour !== null && hour >= 1 && hour <= 24) byHour.set(hour, row);
  }

  const hourly: PjmDaModelHourly[] = HOURS.map((hourEnding) => {
    const row = byHour.get(hourEnding);
    const members = numberArray(row?.member_values);
    return {
      hourEnding,
      forecastDatetime: isoLocal(row?.forecast_datetime),
      actualDatetimeEpt: isoLocal(row?.actual_datetime_ept),
      actualDaLmp: toNumber(row?.actual_da_lmp),
      pointForecast: toNumber(row?.da_price_deterministic),
      ensAvg: toNumber(row?.da_price_ens_average),
      ensBottom: toNumber(row?.da_price_ens_bottom),
      ensTop: toNumber(row?.da_price_ens_top),
      membersP25: quantile(members, 0.25),
      membersP75: quantile(members, 0.75),
    };
  });
  const rows = forecastRows.length > 0 ? buildRows(hourly) : [];
  const detIssueUtc = isoLocal(forecastRows.find((row) => row.det_issue_utc)?.det_issue_utc);
  const ensIssueUtc = isoLocal(forecastRows.find((row) => row.ens_issue_utc)?.ens_issue_utc);
  const actualAsOf = forecastRows.reduce<string | null>((best, row) => {
    const asOfValue = isoLocal(row.actual_as_of);
    return asOfValue && (!best || asOfValue > best) ? asOfValue : best;
  }, null);
  const asOf =
    [detIssueUtc, ensIssueUtc, actualAsOf]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const headlineOnPeak = rows.find((row) => row.key === "Det")?.onPeak ?? null;

  return {
    payload: {
      iso: "pjm",
      source: "Meteologica Western Hub DA price forecast source tables + PJM DA LMPs",
      sourceContract: `${DET_TABLE} + ${ENS_TABLE} + pjm.da_hrl_lmps`,
      targetDate,
      defaultTargetDate: availableTargetDates[0] ?? null,
      availableTargetDates,
      cutoffUtc,
      hub: "WESTERN HUB",
      detIssueUtc,
      ensIssueUtc,
      actualAsOf,
      asOf,
      headlineOnPeak,
      hourly,
      rows,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: forecastRows.length,
    dataAsOf: asOf ?? new Date().toISOString(),
  };
});

export async function GET(request: Request): Promise<Response> {
  if (!isDaModelDevEnabled()) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return observedGET(request);
}
