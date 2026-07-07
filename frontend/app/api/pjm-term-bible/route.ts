import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { buildNercOffPeakDaysValuesSql } from "@/lib/tradingCalendars";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const DEFAULT_HUB = "WESTERN HUB";
const MIN_YEAR = 2014;
const MAX_YEAR_SPAN = 20;

const ROUTE_CONFIG = {
  route: "/api/pjm-term-bible",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "PJM historical LMP term-bible monthly and daily settlement analytics",
  p95TargetMs: 2_500,
  freshnessSource: "pjm.da_hrl_lmps, pjm.rt_hrl_lmps, or pjm.rt_unverified_hrl_lmps updated_at",
} as const;

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

type HubName = (typeof REPORT_HUBS)[number];
type LmpProduct = "da" | "rt";
type RtLmpSource = "verified" | "unverified";
type LmpComponent = "total" | "energy" | "congestion" | "loss";
type TermPeriod = "5x16" | "7x16" | "7x8" | "wrap" | "7x24";
type SourceTable = "pjm.da_hrl_lmps" | "pjm.rt_hrl_lmps" | "pjm.rt_unverified_hrl_lmps";

interface PayloadRow {
  payload: PjmTermBiblePayload | null;
}

interface PjmTermBiblePayload {
  product: LmpProduct;
  rtSource: RtLmpSource;
  component: LmpComponent;
  period: TermPeriod;
  pnodeName: string;
  sourceTable: SourceTable;
  startYear: number;
  endYear: number;
  detailMonth: number;
  minDate: string | null;
  maxDate: string | null;
  asOf: string | null;
  monthly: unknown[];
  monthlyStats: unknown[];
  yearlyStats: unknown[];
  dailyValues: unknown[];
  nercHolidays: unknown[];
  metadata: {
    holidayAdjustment: string;
    periodDefinition: string;
    availableHubs: readonly string[];
    maxYearSpan: number;
  };
}

function parseProduct(value: string | null): LmpProduct {
  return value === "da" ? "da" : "rt";
}

function parseRtSource(value: string | null): RtLmpSource {
  return value === "unverified" ? "unverified" : "verified";
}

function parseComponent(value: string | null): LmpComponent {
  if (value === "energy" || value === "congestion" || value === "loss") return value;
  return "total";
}

function parsePeriod(value: string | null): TermPeriod {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "7x16" || normalized === "sevenbysixteen") return "7x16";
  if (normalized === "7x8" || normalized === "sevenbyeight") return "7x8";
  if (normalized === "wrap" || normalized === "offpeak" || normalized === "off-peak") return "wrap";
  if (normalized === "7x24" || normalized === "flat" || normalized === "sevenbytwentyfour") return "7x24";
  return "5x16";
}

function parseMonth(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12
    ? parsed
    : new Date().getUTCMonth() + 1;
}

function parseYear(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function clampYear(value: number): number {
  const currentYear = new Date().getUTCFullYear();
  return Math.min(Math.max(value, MIN_YEAR), currentYear);
}

function parseHub(value: string | null): HubName {
  return REPORT_HUBS.find((hub) => hub === value) ?? DEFAULT_HUB;
}

function sourceTable(product: LmpProduct, rtSource: RtLmpSource): SourceTable {
  if (product === "da") return "pjm.da_hrl_lmps";
  return rtSource === "unverified" ? "pjm.rt_unverified_hrl_lmps" : "pjm.rt_hrl_lmps";
}

function componentExpression(
  product: LmpProduct,
  component: LmpComponent,
  rtSource: RtLmpSource,
): string {
  if (product === "da") {
    if (component === "energy") return "lmps.system_energy_price_da";
    if (component === "congestion") return "lmps.congestion_price_da";
    if (component === "loss") return "lmps.marginal_loss_price_da";
    return "lmps.total_lmp_da";
  }

  if (component === "energy" && rtSource === "unverified") {
    return "(lmps.total_lmp_rt - lmps.congestion_price_rt - lmps.marginal_loss_price_rt)";
  }
  if (component === "energy") return "lmps.system_energy_price_rt";
  if (component === "congestion") return "lmps.congestion_price_rt";
  if (component === "loss") return "lmps.marginal_loss_price_rt";
  return "lmps.total_lmp_rt";
}

function sourceHourlySql(
  product: LmpProduct,
  component: LmpComponent,
  rtSource: RtLmpSource,
): string {
  const valueExpression = componentExpression(product, component, rtSource);

  if (product === "da") {
    return `
      source_hourly AS (
        SELECT
          lmps.datetime_beginning_ept,
          lmps.datetime_beginning_ept::date AS market_date,
          ${valueExpression}::double precision AS value,
          lmps.updated_at AS as_of
        FROM pjm.da_hrl_lmps AS lmps
        CROSS JOIN params
        WHERE lmps.datetime_beginning_ept >= make_date(params.start_year, 1, 1)::timestamp
          AND lmps.datetime_beginning_ept < make_date(params.end_year + 1, 1, 1)::timestamp
          AND lmps.pnode_name = params.pnode_name
          AND lmps.row_is_current = true
      )
    `;
  }

  if (rtSource === "unverified") {
    return `
      source_hourly AS (
        SELECT
          lmps.datetime_beginning_ept,
          lmps.datetime_beginning_ept::date AS market_date,
          ${valueExpression}::double precision AS value,
          lmps.updated_at AS as_of
        FROM pjm.rt_unverified_hrl_lmps AS lmps
        CROSS JOIN params
        WHERE lmps.datetime_beginning_ept >= make_date(params.start_year, 1, 1)::timestamp
          AND lmps.datetime_beginning_ept < make_date(params.end_year + 1, 1, 1)::timestamp
          AND lmps.pnode_name = params.pnode_name
          AND lmps.type = 'HUB'
      )
    `;
  }

  return `
    source_hourly AS (
      SELECT
        lmps.datetime_beginning_ept,
        lmps.datetime_beginning_ept::date AS market_date,
        ${valueExpression}::double precision AS value,
        lmps.updated_at AS as_of
      FROM pjm.rt_hrl_lmps AS lmps
      CROSS JOIN params
      WHERE lmps.datetime_beginning_ept >= make_date(params.start_year, 1, 1)::timestamp
        AND lmps.datetime_beginning_ept < make_date(params.end_year + 1, 1, 1)::timestamp
        AND lmps.pnode_name = params.pnode_name
        AND lmps.row_is_current = true
    )
  `;
}

function periodDefinition(period: TermPeriod): string {
  if (period === "5x16") return "NERC business-day HE8-23";
  if (period === "7x16") return "All days HE8-23; no holiday adjustment";
  if (period === "7x8") return "All days HE1-7 and HE24; no holiday adjustment";
  if (period === "wrap") return "7x8 plus NERC off-peak day HE8-23";
  return "Flat daily average across all available hours";
}

function buildSql(
  product: LmpProduct,
  component: LmpComponent,
  rtSource: RtLmpSource,
  startYear: number,
  endYear: number,
): string {
  return `
    WITH params AS (
      SELECT
        $1::integer AS start_year,
        $2::integer AS end_year,
        $3::integer AS detail_month,
        $4::text AS period,
        $5::text AS pnode_name
    ),
    nerc_off_peak_days AS (
${buildNercOffPeakDaysValuesSql(startYear, endYear)}
    ),
    ${sourceHourlySql(product, component, rtSource)},
    daily AS (
      SELECT
        source_hourly.market_date,
        EXTRACT(YEAR FROM source_hourly.market_date)::integer AS year,
        EXTRACT(MONTH FROM source_hourly.market_date)::integer AS month,
        to_char(source_hourly.market_date, 'MM-DD') AS mm_dd,
        EXTRACT(ISODOW FROM source_hourly.market_date)::integer IN (6, 7) AS is_weekend,
        nerc_off_peak_days.holiday_date IS NOT NULL AS is_nerc_holiday,
        (
          EXTRACT(ISODOW FROM source_hourly.market_date)::integer IN (6, 7)
          OR nerc_off_peak_days.holiday_date IS NOT NULL
        ) AS is_off_peak_day,
        AVG(source_hourly.value) AS flat_value,
        AVG(source_hourly.value) FILTER (
          WHERE EXTRACT(HOUR FROM source_hourly.datetime_beginning_ept)::integer + 1 BETWEEN 8 AND 23
        ) AS raw_7x16_value,
        COUNT(source_hourly.value) FILTER (
          WHERE EXTRACT(HOUR FROM source_hourly.datetime_beginning_ept)::integer + 1 BETWEEN 8 AND 23
        ) AS raw_7x16_hour_count,
        AVG(source_hourly.value) FILTER (
          WHERE EXTRACT(HOUR FROM source_hourly.datetime_beginning_ept)::integer + 1 < 8
             OR EXTRACT(HOUR FROM source_hourly.datetime_beginning_ept)::integer + 1 > 23
        ) AS raw_7x8_value,
        COUNT(source_hourly.value) FILTER (
          WHERE EXTRACT(HOUR FROM source_hourly.datetime_beginning_ept)::integer + 1 < 8
             OR EXTRACT(HOUR FROM source_hourly.datetime_beginning_ept)::integer + 1 > 23
        ) AS raw_7x8_hour_count,
        COUNT(source_hourly.value) AS hourly_count,
        MAX(source_hourly.as_of) AS as_of
      FROM source_hourly
      LEFT JOIN nerc_off_peak_days
        ON nerc_off_peak_days.holiday_date = source_hourly.market_date
      GROUP BY source_hourly.market_date, nerc_off_peak_days.holiday_date
    ),
    selected_daily AS (
      SELECT
        daily.market_date,
        daily.year,
        daily.month,
        daily.mm_dd,
        daily.is_weekend,
        daily.is_nerc_holiday,
        daily.is_off_peak_day,
        CASE params.period
          WHEN '5x16' THEN CASE WHEN NOT daily.is_off_peak_day THEN daily.raw_7x16_hour_count ELSE 0 END
          WHEN '7x16' THEN daily.raw_7x16_hour_count
          WHEN '7x8' THEN daily.raw_7x8_hour_count
          WHEN 'wrap' THEN CASE WHEN daily.is_off_peak_day THEN daily.hourly_count ELSE daily.raw_7x8_hour_count END
          ELSE daily.hourly_count
        END AS hourly_count,
        daily.as_of,
        CASE params.period
          WHEN '5x16' THEN CASE WHEN NOT daily.is_off_peak_day THEN daily.raw_7x16_value END
          WHEN '7x16' THEN daily.raw_7x16_value
          WHEN '7x8' THEN daily.raw_7x8_value
          WHEN 'wrap' THEN CASE WHEN daily.is_off_peak_day THEN daily.flat_value ELSE daily.raw_7x8_value END
          ELSE daily.flat_value
        END AS term_value
      FROM daily
      CROSS JOIN params
    ),
    monthly AS (
      SELECT
        year,
        month,
        AVG(term_value) AS monthly_value,
        COUNT(term_value) AS priced_days
      FROM selected_daily
      WHERE term_value IS NOT NULL
      GROUP BY year, month
    ),
    monthly_stats AS (
      SELECT 'Mean'::text AS stat, month, AVG(monthly_value) AS value FROM monthly GROUP BY month
      UNION ALL
      SELECT 'Min'::text AS stat, month, MIN(monthly_value) AS value FROM monthly GROUP BY month
      UNION ALL
      SELECT 'Max'::text AS stat, month, MAX(monthly_value) AS value FROM monthly GROUP BY month
    ),
    yearly_stats AS (
      SELECT
        year,
        AVG(monthly_value) AS mean_value,
        MIN(monthly_value) AS min_value,
        MAX(monthly_value) AS max_value
      FROM monthly
      GROUP BY year
    ),
    source_summary AS (
      SELECT
        MIN(market_date)::text AS min_date,
        MAX(market_date)::text AS max_date,
        to_char(MAX(as_of), 'YYYY-MM-DD"T"HH24:MI:SS') AS as_of
      FROM selected_daily
    )
    SELECT json_build_object(
      'product', $6::text,
      'rtSource', $9::text,
      'component', $8::text,
      'period', $4::text,
      'pnodeName', $5::text,
      'sourceTable', $7::text,
      'startYear', $1::integer,
      'endYear', $2::integer,
      'detailMonth', $3::integer,
      'minDate', source_summary.min_date,
      'maxDate', source_summary.max_date,
      'asOf', source_summary.as_of,
      'monthly', COALESCE((
        SELECT json_agg(
          json_build_object(
            'year', year,
            'month', month,
            'value', ROUND(monthly_value::numeric, 2),
            'pricedDays', priced_days
          )
          ORDER BY year, month
        )
        FROM monthly
      ), '[]'::json),
      'monthlyStats', COALESCE((
        SELECT json_agg(
          json_build_object(
            'stat', stat,
            'month', month,
            'value', ROUND(value::numeric, 2)
          )
          ORDER BY CASE stat WHEN 'Mean' THEN 1 WHEN 'Min' THEN 2 ELSE 3 END, month
        )
        FROM monthly_stats
      ), '[]'::json),
      'yearlyStats', COALESCE((
        SELECT json_agg(
          json_build_object(
            'year', year,
            'mean', ROUND(mean_value::numeric, 2),
            'min', ROUND(min_value::numeric, 2),
            'max', ROUND(max_value::numeric, 2)
          )
          ORDER BY year
        )
        FROM yearly_stats
      ), '[]'::json),
      'dailyValues', COALESCE((
        SELECT json_agg(
          json_build_object(
            'date', market_date::text,
            'mmDd', mm_dd,
            'year', year,
            'value', ROUND(term_value::numeric, 2),
            'isWeekend', is_weekend,
            'isNercHoliday', is_nerc_holiday,
            'excludesPjmOnpeakSettle', false,
            'hourlyCount', hourly_count
          )
          ORDER BY mm_dd, year
        )
        FROM selected_daily
        CROSS JOIN params
        WHERE selected_daily.month = params.detail_month
          AND selected_daily.term_value IS NOT NULL
      ), '[]'::json),
      'nercHolidays', COALESCE((
        SELECT json_agg(
          json_build_object(
            'date', holiday_date::text,
            'name', holiday_name
          )
          ORDER BY holiday_date
        )
        FROM nerc_off_peak_days
        CROSS JOIN params
        WHERE holiday_date >= make_date(params.start_year, 1, 1)
          AND holiday_date < make_date(params.end_year + 1, 1, 1)
      ), '[]'::json),
      'metadata', json_build_object(
        'holidayAdjustment', 'NERC off-peak days are applied to 5x16 and wrap classifications.',
        'periodDefinition', $10::text,
        'availableHubs', $11::text[],
        'maxYearSpan', $12::integer
      )
    ) AS payload
    FROM source_summary;
  `;
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const product = parseProduct(searchParams.get("product"));
  const rtSource = parseRtSource(searchParams.get("rtSource"));
  const component = parseComponent(searchParams.get("component"));
  const period = parsePeriod(searchParams.get("period"));
  const hub = parseHub(searchParams.get("hub"));
  const detailMonth = parseMonth(searchParams.get("month"));
  const currentYear = new Date().getUTCFullYear();
  const defaultEndYear = currentYear;
  const defaultStartYear = defaultEndYear - 4;
  const requestedEndYear = clampYear(parseYear(searchParams.get("endYear"), defaultEndYear));
  const requestedStartYear = clampYear(parseYear(searchParams.get("startYear"), defaultStartYear));
  const endYear = Math.max(requestedStartYear, requestedEndYear);
  const earliestAllowedStartYear = Math.max(MIN_YEAR, endYear - MAX_YEAR_SPAN + 1);
  const startYear = Math.min(endYear, Math.max(requestedStartYear, earliestAllowedStartYear));
  const selectedSourceTable = sourceTable(product, rtSource);

  const rows = await query<PayloadRow>(buildSql(product, component, rtSource, startYear, endYear), [
    startYear,
    endYear,
    detailMonth,
    period,
    hub,
    product,
    selectedSourceTable,
    component,
    rtSource,
    periodDefinition(period),
    REPORT_HUBS,
    MAX_YEAR_SPAN,
  ]);
  const payload = rows[0]?.payload ?? null;

  if (!payload?.maxDate) {
    return {
      status: 404,
      payload: { error: "No PJM Term Bible data is available for the selected filters" },
      headers: { "Cache-Control": "no-store" },
    };
  }

  return {
    payload,
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: payload.dailyValues.length,
    dataAsOf: payload.asOf,
  };
});
