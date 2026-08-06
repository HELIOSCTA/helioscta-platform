import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isWeatherDevEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

const CACHE_TTL_MS = 5 * 60 * 1000;
const FRESH_CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/weather/wsi-wdd-forecast-changes",
  cacheHeader: FRESH_CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "WSI weighted degree-day forecast change tables",
  p95TargetMs: 1800,
  freshnessSource: "weather.wsi_daily_weighted_degree_day_forecasts.updated_at",
} as const;

const ALLOWED_REGIONS = [
  "CONUS",
  "EAST",
  "MIDWEST",
  "SOUTHCENTRAL",
  "MOUNTAIN",
  "PACIFIC",
  "GASCONSEAST",
  "GASCONSWEST",
  "GASPRODUCING",
] as const;
const ALLOWED_METRICS = [
  "tdd",
  "gas_hdd",
  "gas_cdd",
  "oil_hdd",
  "oil_cdd",
  "electric_hdd",
  "electric_cdd",
  "population_hdd",
  "population_cdd",
] as const;
const ALLOWED_MODELS = [
  "WSI",
  "GFS_OP",
  "GFS_ENS",
  "ECMWF_OP",
  "ECMWF_ENS",
  "AIFS",
  "AIFS_ENS",
] as const;
const ALLOWED_CYCLES = ["latest", "00Z", "12Z"] as const;
const ALLOWED_PERIOD_MODES = ["dayBuckets", "eiaWeeks"] as const;
const CHANGE_HOURS = [6, 12, 18, 24, 30, 36, 48, 72] as const;
const EXPECTED_DAY_COUNT = 15;
const SOURCE_CYCLE_SQL =
  "COALESCE(NULLIF(TRIM(model_run_cycle), ''), NULLIF(TRIM(source_init_cycle), ''))";
const NORMALIZED_SOURCE_CYCLE_SQL = `UPPER(REGEXP_REPLACE(${SOURCE_CYCLE_SQL}, '[^A-Za-z0-9]+', '', 'g'))`;
const CANONICAL_SOURCE_CYCLE_SQL = `
      CASE
        WHEN ${NORMALIZED_SOURCE_CYCLE_SQL} IN ('0', '00', '0Z', '00Z', 'FIRST', 'FIRSTFORECAST', 'FIRSTRUN', 'PRIMARY') THEN '00Z'
        WHEN ${NORMALIZED_SOURCE_CYCLE_SQL} IN ('12', '12Z', 'OTHER', 'OTHERFORECAST', 'OTHERRUN', 'SECOND', 'SECONDFORECAST', 'SECONDRUN', 'INTRADAY') THEN '12Z'
        ELSE ${SOURCE_CYCLE_SQL}
      END
`;

type WddRegion = (typeof ALLOWED_REGIONS)[number];
type WddMetric = (typeof ALLOWED_METRICS)[number];
type WddModel = (typeof ALLOWED_MODELS)[number];
type WddCycle = (typeof ALLOWED_CYCLES)[number];
type WddPeriodMode = (typeof ALLOWED_PERIOD_MODES)[number];
type IssueStatus = "complete" | "partial" | "missing";
type WddSourceMetric = Exclude<WddMetric, "tdd">;

interface IssueCandidateRow {
  model: WddModel;
  source_issue_key: string;
  issue_sort_at: string | null;
  source_issue_at_utc: string | null;
  scrape_run_at_utc: string | null;
  source_banner: string | null;
  source_model: string | null;
  source_init_at_utc: string | null;
  source_init_cycle: string | null;
  model_run_cycle: string | null;
  effective_cycle: string | null;
  forecast_start_date: string | null;
  forecast_end_date: string | null;
  forecast_day_count: number;
  metric_value_count: number;
  row_count: number;
  actual_metric_names: string[] | null;
  updated_at: string | null;
}

interface DetailRow {
  model: WddModel;
  source_issue_key: string;
  forecast_date: string;
  forecast_day: number | null;
  metric_name: string;
  metric_value: string | number | null;
  metric_unit: string | null;
}

interface NormalTableExistsRow {
  exists: boolean;
}

interface NormalRow {
  metric_name: WddSourceMetric;
  calendar_month: number;
  calendar_day: number;
  normal_value: string | number | null;
  lookback_years: number | null;
  normal_window_end_year: number | null;
  sample_year_count: number | null;
  sample_day_count: number | null;
  updated_at: string | null;
  source: "table" | "observations";
}

interface PriorYearActualRow {
  metric_name: WddSourceMetric;
  observation_date: string;
  calendar_month: number;
  calendar_day: number;
  metric_value: string | number | null;
  metric_unit: string | null;
  updated_at: string | null;
}

interface PriorYearDailyActual {
  forecastDate: string;
  observationDate: string | null;
  value: number | null;
  metricValueCount: number;
  expectedMetricValueCount: number;
  missingMetricNames: string[];
  updatedAt: string | null;
}

interface ModelIssueSummary {
  model: WddModel;
  status: IssueStatus;
  selectedIssueKey: string | null;
  selectionMode: "latest_complete" | "latest_partial" | "none";
  sourceIssueAtUtc: string | null;
  scrapeRunAtUtc: string | null;
  sourceBanner: string | null;
  sourceModel: string | null;
  sourceInitAtUtc: string | null;
  sourceInitCycle: string | null;
  modelRunCycle: string | null;
  effectiveCycle: string | null;
  cycleFallbackUsed: boolean;
  forecastStartDate: string | null;
  forecastEndDate: string | null;
  forecastDayCount: number;
  expectedDayCount: number;
  metricValueCount: number;
  expectedMetricValueCount: number;
  completenessPct: number;
  expectedMetricNames: string[];
  actualMetricNames: string[];
  missingMetricNames: string[];
  updatedAt: string | null;
}

interface WddModelCell {
  forecast: number | null;
  normal: number | null;
  normal10yr: number | null;
  normal30yr: number | null;
  normalBasis: "10yr" | "30yr" | null;
  vsNormal: number | null;
  change6h: number | null;
  change12h: number | null;
  change18h: number | null;
  change24h: number | null;
  change30h: number | null;
  change36h: number | null;
  change48h: number | null;
  change72h: number | null;
  dayCount?: number;
}

interface WddDailyRow {
  forecastDate: string;
  dateLabel: string;
  forecastDay: number;
  dayOfWeek: string;
  models: Record<string, WddModelCell>;
}

interface WddPeriodRow {
  periodKey: string;
  periodLabel: string;
  dateRange: string;
  dayCount: number;
  models: Record<string, WddModelCell>;
}

interface WddForecastRevisionTarget {
  key: string;
  label: string;
  dateRange: string;
  dayCount: number;
  forecastDates: string[];
  selectedForecast: number | null;
}

interface WddForecastRevisionPoint {
  targetKey: string;
  sourceIssueKey: string;
  issueSortAtUtc: string | null;
  sourceIssueAtUtc: string | null;
  scrapeRunAtUtc: string | null;
  sourceInitAtUtc: string | null;
  sourceInitCycle: string | null;
  modelRunCycle: string | null;
  effectiveCycle: string | null;
  cycleFallbackUsed: boolean;
  selected: boolean;
  forecast: number | null;
  coveredDayCount: number;
  expectedDayCount: number;
  coverageDates: string[];
}

interface WddForecastRevisionPayload {
  source: "weather.wsi_daily_weighted_degree_day_forecasts";
  sourceContract: {
    sourceSystem: "WSI Trader GetWeightedDegreeDayForecast";
    table: "weather.wsi_daily_weighted_degree_day_forecasts";
    grain: string;
    freshnessField: "updated_at";
    readRole: "helios_readonly";
  };
  filters: {
    region: WddRegion;
    metric: WddMetric;
    model: WddModel;
    models: WddModel[];
    cycle: WddCycle;
    periodMode: WddPeriodMode;
  };
  selectedIssue: ModelIssueSummary;
  targetMode: "dailyDates" | "eiaWeeks";
  targets: WddForecastRevisionTarget[];
  revisionsByTarget: Record<string, WddForecastRevisionPoint[]>;
  rowCounts: {
    rawRows: number;
    issueCount: number;
    targetCount: number;
  };
  asOf: {
    updatedAt: string | null;
    latestIssueAt: string | null;
  };
}

interface WsiReportRow {
  key: string;
  label: string;
  dateRange: string;
  dayCount: number;
  forecast: number | null;
  change12h: number | null;
  change24h: number | null;
  thermalChange12h: number | null;
  thermalChange24h: number | null;
  normal10yr: number | null;
  priorYear: number | null;
  vsNormal: number | null;
  vsPriorYear: number | null;
  thermalDeparture: number | null;
  priorYearDayCount: number;
}

interface WsiReportModelSpread {
  supportingModelCount: number;
  lowModel: WddModel | null;
  lowForecast: number | null;
  highModel: WddModel | null;
  highForecast: number | null;
  spread: number | null;
  supportingAverage: number | null;
  primaryVsSupportingAverage: number | null;
}

interface WsiReportModelChange {
  model: WddModel;
  status: IssueStatus;
  issueKey: string | null;
  issueAtUtc: string | null;
  scrapeRunAtUtc: string | null;
  cycle: string | null;
  completenessPct: number;
  forecastDayCount: number;
  expectedDayCount: number;
  forecast: number | null;
  vsWsiForecast: number | null;
  change12h: number | null;
  change24h: number | null;
  change48h: number | null;
  change72h: number | null;
  thermalVsWsiForecast: number | null;
  thermalChange12h: number | null;
  thermalChange24h: number | null;
  thermalChange48h: number | null;
  thermalChange72h: number | null;
}

interface WsiWeatherReport {
  primaryModel: "WSI";
  supportingModels: WddModel[];
  metricLabel: string;
  status: {
    issueKey: string | null;
    issueAtUtc: string | null;
    scrapeRunAtUtc: string | null;
    cycle: string | null;
    normalSource: WddForecastChangesPayload["normal"]["source"];
    normalBasis: WddForecastChangesPayload["normal"]["actualBasis"];
    normalUpdatedAt: string | null;
    priorYearCoverageDays: number;
    expectedPriorYearDays: number;
    completenessPct: number;
    forecastWindow: string;
    show12hChange: boolean;
  };
  headlines: string[];
  eiaWeeks: WsiReportRow[];
  dayBuckets: WsiReportRow[];
  modelChanges: WsiReportModelChange[];
  modelSpread: WsiReportModelSpread;
}

interface WddForecastChangesPayload {
  source: "weather.wsi_daily_weighted_degree_day_forecasts";
  sourceContract: {
    sourceSystem: "WSI Trader GetWeightedDegreeDayForecast";
    table: "weather.wsi_daily_weighted_degree_day_forecasts";
    grain: string;
    freshnessField: "updated_at";
    readRole: "helios_readonly";
  };
  filters: {
    region: WddRegion;
    metric: WddMetric;
    models: WddModel[];
    cycle: WddCycle;
    periodMode: WddPeriodMode;
  };
  allowedFilters: {
    regions: readonly WddRegion[];
    metrics: readonly WddMetric[];
    models: readonly WddModel[];
    cycles: readonly WddCycle[];
    periodModes: readonly WddPeriodMode[];
  };
  metricColumns: {
    forecast: WddMetric;
    normal10yr: string;
    normal30yr: string;
    vsNormal: string;
    wsi24hChange: string;
    modelRunChanges: string[];
  };
  normal: {
    preferredBasis: "10yr";
    actualBasis: "10yr" | "30yr" | "mixed" | "missing";
    source: "table" | "observations" | "forecast_30yr" | "mixed" | "none";
    tableExists: boolean;
    rowCount: number;
    lookbackYears: number;
    normalWindowEndYear: number | null;
    minSampleYearCount: number | null;
    maxSampleYearCount: number | null;
    updatedAt: string | null;
  };
  modelIssues: ModelIssueSummary[];
  dailyRows: WddDailyRow[];
  periodRows: WddPeriodRow[];
  rowCounts: {
    rawRows: number;
    dailyRows: number;
    periodRows: number;
    selectedModelCount: number;
  };
  asOf: {
    updatedAt: string | null;
    latestIssueAt: string | null;
  };
  report?: WsiWeatherReport;
}

const RESPONSE_CACHE = new Map<
  string,
  { expiresAt: number; payload: WddForecastChangesPayload }
>();
const REVISION_RESPONSE_CACHE = new Map<
  string,
  { expiresAt: number; payload: WddForecastRevisionPayload }
>();

const ISSUE_CANDIDATES_SQL = `
  SELECT
    model::text AS model,
    source_issue_key,
    to_char(
      MAX(COALESCE(source_issue_at_utc, scrape_run_at_utc)) AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS"Z"'
    ) AS issue_sort_at,
    to_char(
      MAX(source_issue_at_utc) AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS"Z"'
    ) AS source_issue_at_utc,
    to_char(
      MAX(scrape_run_at_utc) AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS"Z"'
    ) AS scrape_run_at_utc,
    MAX(source_banner) AS source_banner,
    MAX(source_model) AS source_model,
    to_char(
      MAX(source_init_at_utc) AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS"Z"'
    ) AS source_init_at_utc,
    MAX(source_init_cycle) AS source_init_cycle,
    MAX(model_run_cycle) AS model_run_cycle,
    MAX(${CANONICAL_SOURCE_CYCLE_SQL}) AS effective_cycle,
    to_char(MIN(forecast_date), 'YYYY-MM-DD') AS forecast_start_date,
    to_char(MAX(forecast_date), 'YYYY-MM-DD') AS forecast_end_date,
    COUNT(DISTINCT forecast_date)
      FILTER (WHERE metric_name = ANY($3::text[]) AND metric_value IS NOT NULL)::int AS forecast_day_count,
    COUNT(*)
      FILTER (WHERE metric_name = ANY($4::text[]) AND metric_value IS NOT NULL)::int AS metric_value_count,
    COUNT(*)::int AS row_count,
    COALESCE(
      ARRAY_AGG(DISTINCT metric_name ORDER BY metric_name)
        FILTER (WHERE metric_name = ANY($4::text[]) AND metric_value IS NOT NULL),
      ARRAY[]::text[]
    ) AS actual_metric_names,
    to_char(
      MAX(updated_at) AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS"Z"'
    ) AS updated_at
  FROM weather.wsi_daily_weighted_degree_day_forecasts
  WHERE request_region = 'NA'
    AND entity_id = $1::text
    AND model = ANY($2::text[])
    AND forecast_type = 'Daily'
    AND bias_corrected = false
    AND metric_name = ANY($4::text[])
    AND COALESCE(source_issue_at_utc, scrape_run_at_utc) >= NOW() - INTERVAL '45 days'
    AND (
      $5::text = 'latest'
      OR ${CANONICAL_SOURCE_CYCLE_SQL} = $5::text
      OR (${SOURCE_CYCLE_SQL} IS NULL)
    )
  GROUP BY model, source_issue_key
  ORDER BY model, MAX(COALESCE(source_issue_at_utc, scrape_run_at_utc)) DESC
`;

const DETAIL_ROWS_SQL = `
  SELECT
    model::text AS model,
    source_issue_key,
    to_char(forecast_date, 'YYYY-MM-DD') AS forecast_date,
    forecast_day,
    metric_name,
    metric_value,
    metric_unit
  FROM weather.wsi_daily_weighted_degree_day_forecasts
  WHERE request_region = 'NA'
    AND entity_id = $1::text
    AND model = ANY($2::text[])
    AND source_issue_key = ANY($3::text[])
    AND forecast_type = 'Daily'
    AND bias_corrected = false
    AND metric_name = ANY($4::text[])
  ORDER BY forecast_date, model, metric_name
`;

const NORMAL_TABLE_EXISTS_SQL = `
  SELECT to_regclass('weather.wsi_daily_weighted_degree_day_10yr_normals') IS NOT NULL AS exists
`;

const NORMAL_TABLE_ROWS_SQL = `
  SELECT DISTINCT ON (metric_name, calendar_month, calendar_day)
    metric_name::text AS metric_name,
    calendar_month::int AS calendar_month,
    calendar_day::int AS calendar_day,
    normal_value,
    lookback_years,
    normal_window_end_year,
    sample_year_count,
    sample_day_count,
    to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
    'table'::text AS source
  FROM weather.wsi_daily_weighted_degree_day_10yr_normals
  WHERE request_region = 'NA'
    AND entity_id = $1::text
    AND metric_name = ANY($2::text[])
    AND lookback_years = 10
  ORDER BY metric_name, calendar_month, calendar_day, normal_window_end_year DESC, updated_at DESC
`;

const OBSERVED_10YR_NORMAL_ROWS_SQL = `
  WITH bounds AS (
    SELECT
      (EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) AS normal_window_end_year,
      (EXTRACT(YEAR FROM CURRENT_DATE)::int - 10) AS sample_start_year
  )
  SELECT
    metric_name::text AS metric_name,
    EXTRACT(MONTH FROM observation_date)::int AS calendar_month,
    EXTRACT(DAY FROM observation_date)::int AS calendar_day,
    AVG(metric_value)::double precision AS normal_value,
    10::int AS lookback_years,
    MAX(bounds.normal_window_end_year)::int AS normal_window_end_year,
    COUNT(DISTINCT EXTRACT(YEAR FROM observation_date))::int AS sample_year_count,
    COUNT(*)::int AS sample_day_count,
    to_char(MAX(updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
    'observations'::text AS source
  FROM weather.wsi_daily_weighted_degree_day_observations
  CROSS JOIN bounds
  WHERE source_product_id = 'HISTORICAL_WEIGHTED_DEGREEDAYS'
    AND request_region = 'NA'
    AND entity_id = $1::text
    AND metric_name = ANY($2::text[])
    AND observation_date >= make_date(bounds.sample_start_year, 1, 1)
    AND observation_date < make_date(bounds.normal_window_end_year + 1, 1, 1)
    AND NOT (
      EXTRACT(MONTH FROM observation_date)::int = 2
      AND EXTRACT(DAY FROM observation_date)::int = 29
    )
  GROUP BY
    metric_name,
    EXTRACT(MONTH FROM observation_date)::int,
    EXTRACT(DAY FROM observation_date)::int
  ORDER BY calendar_month, calendar_day
`;

const PRIOR_YEAR_ACTUAL_ROWS_SQL = `
  SELECT
    metric_name::text AS metric_name,
    to_char(observation_date, 'YYYY-MM-DD') AS observation_date,
    EXTRACT(MONTH FROM observation_date)::int AS calendar_month,
    EXTRACT(DAY FROM observation_date)::int AS calendar_day,
    metric_value,
    metric_unit,
    to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
  FROM weather.wsi_daily_weighted_degree_day_observations
  WHERE source_product_id = 'HISTORICAL_WEIGHTED_DEGREEDAYS'
    AND request_region = 'NA'
    AND entity_id = $1::text
    AND metric_name = ANY($2::text[])
    AND observation_date = ANY($3::date[])
    AND NOT (
      EXTRACT(MONTH FROM observation_date)::int = 2
      AND EXTRACT(DAY FROM observation_date)::int = 29
    )
  ORDER BY observation_date, metric_name
`;

function isOneOf<T extends readonly string[]>(
  value: string,
  allowed: T,
): value is T[number] {
  return (allowed as readonly string[]).includes(value);
}

function parseRegion(raw: string | null): WddRegion | null {
  const value = raw?.trim().toUpperCase() || "CONUS";
  return isOneOf(value, ALLOWED_REGIONS) ? value : null;
}

function seasonalDefaultMetric(): WddMetric {
  const month = new Date().getUTCMonth() + 1;
  return month >= 4 && month <= 10 ? "population_cdd" : "gas_hdd";
}

function parseMetric(raw: string | null): WddMetric | null {
  const value = raw?.trim().toLowerCase() || seasonalDefaultMetric();
  return isOneOf(value, ALLOWED_METRICS) ? value : null;
}

function parseCycle(raw: string | null): WddCycle | null {
  const value = raw?.trim();
  if (!value) return "latest";
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]+/g, "");
  if (normalized === "LATEST") return "latest";
  if (
    normalized === "0" ||
    normalized === "00" ||
    normalized === "0Z" ||
    normalized === "00Z" ||
    normalized === "FIRST" ||
    normalized === "FIRSTFORECAST" ||
    normalized === "FIRSTRUN" ||
    normalized === "PRIMARY"
  ) {
    return "00Z";
  }
  if (
    normalized === "12" ||
    normalized === "12Z" ||
    normalized === "OTHER" ||
    normalized === "OTHERFORECAST" ||
    normalized === "OTHERRUN" ||
    normalized === "SECOND" ||
    normalized === "SECONDFORECAST" ||
    normalized === "SECONDRUN" ||
    normalized === "INTRADAY"
  ) {
    return "12Z";
  }
  return null;
}

function parsePeriodMode(raw: string | null): WddPeriodMode | null {
  const value = raw?.trim();
  if (!value) return "dayBuckets";
  if (value === "dayBuckets" || value.toLowerCase() === "daybuckets") return "dayBuckets";
  if (value === "eiaWeeks" || value.toLowerCase() === "eiaweeks") return "eiaWeeks";
  return null;
}

function parseModels(raw: string | null): { models: WddModel[]; invalid: string[] } {
  if (!raw?.trim()) {
    return { models: [...ALLOWED_MODELS], invalid: [] };
  }

  const models: WddModel[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(",")) {
    const value = part.trim().toUpperCase();
    if (!value) continue;
    if (isOneOf(value, ALLOWED_MODELS)) {
      if (!models.includes(value)) models.push(value);
    } else {
      invalid.push(part.trim());
    }
  }
  return { models, invalid };
}

function parseReport(raw: string | null): boolean {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true";
}

function parseRevisions(raw: string | null): boolean {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true";
}

function sourceMetricsForMetric(metric: WddMetric): WddSourceMetric[] {
  return metric === "tdd" ? ["population_cdd", "gas_hdd"] : [metric];
}

function allMetricNamesForSourceMetric(metric: WddSourceMetric): string[] {
  return Array.from(
    new Set([
      metric,
      `${metric}_normal_30yr`,
      `${metric}_dfn_30yr`,
      `${metric}_difference`,
      ...CHANGE_HOURS.map((hour) => `${metric}_${hour}hr_difference`),
    ]),
  );
}

function allMetricNames(metric: WddMetric): string[] {
  return Array.from(
    new Set(sourceMetricsForMetric(metric).flatMap(allMetricNamesForSourceMetric)),
  );
}

function expectedMetricNamesForSourceMetric(
  model: WddModel,
  metric: WddSourceMetric,
): string[] {
  if (model === "WSI") {
    return [
      metric,
      `${metric}_normal_30yr`,
      `${metric}_difference`,
      `${metric}_dfn_30yr`,
    ];
  }
  return [
    metric,
    `${metric}_dfn_30yr`,
    `${metric}_6hr_difference`,
    `${metric}_12hr_difference`,
    `${metric}_18hr_difference`,
    `${metric}_24hr_difference`,
    `${metric}_30hr_difference`,
    `${metric}_36hr_difference`,
    `${metric}_normal_30yr`,
  ];
}

function expectedMetricNamesForModel(model: WddModel, metric: WddMetric): string[] {
  return Array.from(
    new Set(
      sourceMetricsForMetric(metric).flatMap((sourceMetric) =>
        expectedMetricNamesForSourceMetric(model, sourceMetric),
      ),
    ),
  );
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toInt(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function maxStamp(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function dayOfWeek(dateString: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${dateString}T00:00:00Z`));
}

function dayDateLabel(dateString: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "2-digit",
  }).formatToParts(new Date(`${dateString}T00:00:00Z`));
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return [weekday, `${month}-${day}`].filter(Boolean).join(" ");
}

function dateRangeLabel(rows: WddDailyRow[]): string {
  if (!rows.length) return "--";
  const first = rows[0]?.forecastDate ?? "";
  const last = rows[rows.length - 1]?.forecastDate ?? first;
  return first === last ? dayDateLabel(first) : `${dayDateLabel(first)} to ${dayDateLabel(last)}`;
}

function fridayWeekEnding(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDay();
  const offset = (5 - day + 7) % 7;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function cyclePriority(candidate: IssueCandidateRow, cycle: WddCycle): number {
  if (cycle === "latest") return 0;
  if (candidate.effective_cycle === cycle) return 0;
  if (!candidate.effective_cycle) return 1;
  return 2;
}

function completenessForCandidate(
  candidate: IssueCandidateRow,
  model: WddModel,
  metric: WddMetric,
): {
  complete: boolean;
  expectedMetricNames: string[];
  actualMetricNames: string[];
  missingMetricNames: string[];
  expectedMetricValueCount: number;
  completenessPct: number;
} {
  const expectedMetricNames = expectedMetricNamesForModel(model, metric);
  const actualMetricNames = candidate.actual_metric_names ?? [];
  const actualMetricSet = new Set(actualMetricNames);
  const missingMetricNames = expectedMetricNames.filter((name) => !actualMetricSet.has(name));
  const expectedMetricValueCount = EXPECTED_DAY_COUNT * expectedMetricNames.length;
  const valueCompleteness =
    expectedMetricValueCount > 0
      ? Math.min(1, candidate.metric_value_count / expectedMetricValueCount)
      : 0;
  const dayCompleteness = Math.min(1, candidate.forecast_day_count / EXPECTED_DAY_COUNT);
  const completenessPct = Math.round(Math.min(valueCompleteness, dayCompleteness) * 100);
  return {
    complete:
      candidate.forecast_day_count >= EXPECTED_DAY_COUNT &&
      candidate.metric_value_count >= expectedMetricValueCount &&
      missingMetricNames.length === 0,
    expectedMetricNames,
    actualMetricNames,
    missingMetricNames,
    expectedMetricValueCount,
    completenessPct,
  };
}

function summarizeCandidate(
  candidate: IssueCandidateRow,
  model: WddModel,
  metric: WddMetric,
  cycle: WddCycle,
): ModelIssueSummary {
  const completeness = completenessForCandidate(candidate, model, metric);
  const status = completeness.complete ? "complete" : "partial";
  return {
    model,
    status,
    selectedIssueKey: candidate.source_issue_key,
    selectionMode: completeness.complete ? "latest_complete" : "latest_partial",
    sourceIssueAtUtc: candidate.source_issue_at_utc,
    scrapeRunAtUtc: candidate.scrape_run_at_utc,
    sourceBanner: candidate.source_banner,
    sourceModel: candidate.source_model,
    sourceInitAtUtc: candidate.source_init_at_utc,
    sourceInitCycle: candidate.source_init_cycle,
    modelRunCycle: candidate.model_run_cycle,
    effectiveCycle: candidate.effective_cycle,
    cycleFallbackUsed: cycle !== "latest" && !candidate.effective_cycle,
    forecastStartDate: candidate.forecast_start_date,
    forecastEndDate: candidate.forecast_end_date,
    forecastDayCount: candidate.forecast_day_count,
    expectedDayCount: EXPECTED_DAY_COUNT,
    metricValueCount: candidate.metric_value_count,
    expectedMetricValueCount: completeness.expectedMetricValueCount,
    completenessPct: completeness.completenessPct,
    expectedMetricNames: completeness.expectedMetricNames,
    actualMetricNames: completeness.actualMetricNames,
    missingMetricNames: completeness.missingMetricNames,
    updatedAt: candidate.updated_at,
  };
}

function missingModelSummary(model: WddModel, metric: WddMetric): ModelIssueSummary {
  const expectedMetricNames = expectedMetricNamesForModel(model, metric);
  return {
    model,
    status: "missing",
    selectedIssueKey: null,
    selectionMode: "none",
    sourceIssueAtUtc: null,
    scrapeRunAtUtc: null,
    sourceBanner: null,
    sourceModel: null,
    sourceInitAtUtc: null,
    sourceInitCycle: null,
    modelRunCycle: null,
    effectiveCycle: null,
    cycleFallbackUsed: false,
    forecastStartDate: null,
    forecastEndDate: null,
    forecastDayCount: 0,
    expectedDayCount: EXPECTED_DAY_COUNT,
    metricValueCount: 0,
    expectedMetricValueCount: EXPECTED_DAY_COUNT * expectedMetricNames.length,
    completenessPct: 0,
    expectedMetricNames,
    actualMetricNames: [],
    missingMetricNames: expectedMetricNames,
    updatedAt: null,
  };
}

function selectModelIssue(
  candidates: IssueCandidateRow[],
  model: WddModel,
  metric: WddMetric,
  cycle: WddCycle,
): ModelIssueSummary {
  const withPriority = candidates
    .map((candidate) => ({ candidate, priority: cyclePriority(candidate, cycle) }))
    .filter((item) => item.priority < 2);
  if (!withPriority.length) return missingModelSummary(model, metric);

  const lowestPriority = Math.min(...withPriority.map((item) => item.priority));
  const priorityCandidates = withPriority
    .filter((item) => item.priority === lowestPriority)
    .map((item) => item.candidate);
  const completeCandidates = priorityCandidates.filter((candidate) =>
    completenessForCandidate(candidate, model, metric).complete,
  );
  const selectedPool = completeCandidates.length ? completeCandidates : priorityCandidates;
  const selected = [...selectedPool].sort((left, right) =>
    (right.issue_sort_at ?? "").localeCompare(left.issue_sort_at ?? ""),
  )[0];

  return selected ? summarizeCandidate(selected, model, metric, cycle) : missingModelSummary(model, metric);
}

function metricValueMap(rows: DetailRow[]): Map<string, number | null> {
  const values = new Map<string, number | null>();
  for (const row of rows) {
    values.set(row.metric_name, toNumber(row.metric_value));
  }
  return values;
}

function calendarDayKey(month: number, day: number): string {
  return `${month}-${day}`;
}

function calendarDayKeyForDate(dateString: string): string {
  return calendarDayKey(Number(dateString.slice(5, 7)), Number(dateString.slice(8, 10)));
}

async function loadNormalRows(
  region: WddRegion,
  metric: WddMetric,
): Promise<{ tableExists: boolean; rows: NormalRow[] }> {
  const sourceMetrics = sourceMetricsForMetric(metric);
  const expectedRowCount = sourceMetrics.length * 365;
  const existsRows = await query<NormalTableExistsRow>(NORMAL_TABLE_EXISTS_SQL);
  const tableExists = existsRows[0]?.exists === true;

  if (tableExists) {
    const tableRows = await query<NormalRow>(NORMAL_TABLE_ROWS_SQL, [region, sourceMetrics]);
    if (tableRows.length >= expectedRowCount) return { tableExists, rows: tableRows };
  }

  const observationRows = await query<NormalRow>(OBSERVED_10YR_NORMAL_ROWS_SQL, [
    region,
    sourceMetrics,
  ]);
  return { tableExists, rows: observationRows };
}

function normalRowsByMetricCalendarDay(rows: NormalRow[]): Map<string, NormalRow> {
  return new Map(
    rows.map((row) => [
      `${row.metric_name}::${calendarDayKey(Number(row.calendar_month), Number(row.calendar_day))}`,
      row,
    ]),
  );
}

function priorYearObservationDate(forecastDate: string): string | null {
  const year = Number(forecastDate.slice(0, 4));
  const month = forecastDate.slice(5, 7);
  const day = forecastDate.slice(8, 10);
  if (!Number.isFinite(year) || (month === "02" && day === "29")) return null;
  return `${year - 1}-${month}-${day}`;
}

async function loadPriorYearActualRows(
  region: WddRegion,
  metric: WddMetric,
  dailyRows: WddDailyRow[],
): Promise<PriorYearActualRow[]> {
  const sourceMetrics = sourceMetricsForMetric(metric);
  const priorYearDates = Array.from(
    new Set(
      dailyRows
        .map((row) => priorYearObservationDate(row.forecastDate))
        .filter((date): date is string => Boolean(date)),
    ),
  );
  if (!priorYearDates.length) return [];

  return query<PriorYearActualRow>(PRIOR_YEAR_ACTUAL_ROWS_SQL, [
    region,
    sourceMetrics,
    priorYearDates,
  ]);
}

function priorYearRowsByDateMetric(rows: PriorYearActualRow[]): Map<string, PriorYearActualRow> {
  return new Map(rows.map((row) => [`${row.observation_date}::${row.metric_name}`, row]));
}

function buildPriorYearDailyActuals(
  dailyRows: WddDailyRow[],
  metric: WddMetric,
  actualRows: PriorYearActualRow[],
): Map<string, PriorYearDailyActual> {
  const sourceMetrics = sourceMetricsForMetric(metric);
  const actualsByDateMetric = priorYearRowsByDateMetric(actualRows);
  const actualsByForecastDate = new Map<string, PriorYearDailyActual>();

  for (const row of dailyRows) {
    const observationDate = priorYearObservationDate(row.forecastDate);
    const matchedRows = observationDate
      ? sourceMetrics.map((sourceMetric) =>
          actualsByDateMetric.get(`${observationDate}::${sourceMetric}`),
        )
      : [];
    const values = matchedRows.map((actualRow) => toNumber(actualRow?.metric_value));
    const value = observationDate ? sumRequired(values) : null;
    const missingMetricNames = sourceMetrics.filter((sourceMetric, index) => {
      const actualRow = matchedRows[index];
      return !actualRow || toNumber(actualRow.metric_value) === null;
    });
    const updatedAt = matchedRows.reduce<string | null>(
      (latest, actualRow) => maxStamp(latest, actualRow?.updated_at ?? null),
      null,
    );

    actualsByForecastDate.set(row.forecastDate, {
      forecastDate: row.forecastDate,
      observationDate,
      value,
      metricValueCount: values.filter((item): item is number => item !== null).length,
      expectedMetricValueCount: observationDate ? sourceMetrics.length : 0,
      missingMetricNames,
      updatedAt,
    });
  }

  return actualsByForecastDate;
}

function normalSummary(
  rows: NormalRow[],
  tableExists: boolean,
  dailyRows: WddDailyRow[],
): WddForecastChangesPayload["normal"] {
  const cells = dailyRows.flatMap((row) => Object.values(row.models));
  const basisSet = new Set(cells.map((cell) => cell.normalBasis).filter(Boolean));
  const basis =
    basisSet.size === 1
      ? (Array.from(basisSet)[0] as "10yr" | "30yr")
      : basisSet.size > 1
        ? "mixed"
        : "missing";
  const sources = new Set(rows.map((row) => row.source));
  const source =
    basis === "10yr" && sources.size === 1
      ? (Array.from(sources)[0] as "table" | "observations")
      : basis === "10yr"
        ? "mixed"
        : basis === "30yr"
          ? "forecast_30yr"
          : "none";
  const sampleYearCounts = rows
    .map((row) => toInt(row.sample_year_count))
    .filter((value) => value > 0);
  const normalWindowEndYears = rows
    .map((row) => toInt(row.normal_window_end_year))
    .filter((value) => value > 0);
  const updatedAt = rows.reduce<string | null>(
    (latest, row) => maxStamp(latest, row.updated_at),
    null,
  );
  return {
    preferredBasis: "10yr",
    actualBasis: basis,
    source,
    tableExists,
    rowCount: rows.length,
    lookbackYears: 10,
    normalWindowEndYear: normalWindowEndYears.length
      ? Math.max(...normalWindowEndYears)
      : null,
    minSampleYearCount: sampleYearCounts.length ? Math.min(...sampleYearCounts) : null,
    maxSampleYearCount: sampleYearCounts.length ? Math.max(...sampleYearCounts) : null,
    updatedAt,
  };
}

function changeMetricName(metric: WddSourceMetric, hour: number): string {
  return `${metric}_${hour}hr_difference`;
}

function sumRequired(values: Array<number | null | undefined>): number | null {
  if (!values.length) return null;
  const numericValues: number[] = [];
  for (const value of values) {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    numericValues.push(value);
  }
  return roundOne(numericValues.reduce((total, value) => total + value, 0));
}

function summedSourceMetricValue(
  values: Map<string, number | null>,
  sourceMetrics: WddSourceMetric[],
  metricNameForSource: (metric: WddSourceMetric) => string,
): number | null {
  return sumRequired(
    sourceMetrics.map((sourceMetric) => values.get(metricNameForSource(sourceMetric)) ?? null),
  );
}

function normalValueFromRows(
  rows: NormalRow[],
  sourceMetrics: WddSourceMetric[],
): number | null {
  const valuesByMetric = new Map<WddSourceMetric, number | null>();
  for (const row of rows) {
    valuesByMetric.set(row.metric_name, toNumber(row.normal_value));
  }
  return sumRequired(sourceMetrics.map((sourceMetric) => valuesByMetric.get(sourceMetric)));
}

function metricColumnExpression(metric: WddMetric, suffix = ""): string {
  return sourceMetricsForMetric(metric)
    .map((sourceMetric) => `${sourceMetric}${suffix}`)
    .join(" + ");
}

function normal10yrColumnExpression(metric: WddMetric): string {
  return sourceMetricsForMetric(metric)
    .map((sourceMetric) => `weather.wsi_daily_weighted_degree_day_10yr_normals.${sourceMetric}`)
    .join(" + ");
}

function changeColumnExpression(metric: WddMetric, hour: number): string {
  return sourceMetricsForMetric(metric)
    .map((sourceMetric) => changeMetricName(sourceMetric, hour))
    .join(" + ");
}

function buildCell(
  model: WddModel,
  metric: WddMetric,
  rows: DetailRow[],
  normalRows: NormalRow[],
): WddModelCell {
  const values = metricValueMap(rows);
  const sourceMetrics = sourceMetricsForMetric(metric);
  const forecast = summedSourceMetricValue(values, sourceMetrics, (sourceMetric) => sourceMetric);
  const normal10yr = normalValueFromRows(normalRows, sourceMetrics);
  const normal30yr = summedSourceMetricValue(
    values,
    sourceMetrics,
    (sourceMetric) => `${sourceMetric}_normal_30yr`,
  );
  const dfnValue = summedSourceMetricValue(
    values,
    sourceMetrics,
    (sourceMetric) => `${sourceMetric}_dfn_30yr`,
  );
  const normal = normal10yr ?? normal30yr;
  const normalBasis = normal10yr !== null ? "10yr" : normal30yr !== null ? "30yr" : null;
  const vsNormal =
    forecast !== null && normal !== null
      ? roundOne(forecast - normal)
      : normalBasis === "30yr"
        ? dfnValue
        : null;
  const wsiChange = summedSourceMetricValue(
    values,
    sourceMetrics,
    (sourceMetric) => `${sourceMetric}_difference`,
  );
  const modelRunChange = (hour: number) =>
    summedSourceMetricValue(values, sourceMetrics, (sourceMetric) =>
      changeMetricName(sourceMetric, hour),
    );

  return {
    forecast,
    normal,
    normal10yr,
    normal30yr,
    normalBasis,
    vsNormal,
    change6h:
      model === "WSI"
        ? null
        : modelRunChange(6),
    change12h: modelRunChange(12),
    change18h:
      model === "WSI"
        ? null
        : modelRunChange(18),
    change24h:
      model === "WSI"
        ? wsiChange
        : modelRunChange(24),
    change30h:
      model === "WSI"
        ? null
        : modelRunChange(30),
    change36h:
      model === "WSI"
        ? null
        : modelRunChange(36),
    change48h: modelRunChange(48),
    change72h: modelRunChange(72),
  };
}

function sumNullable(values: Array<number | null | undefined>): number | null {
  const finiteValues = values.filter(
    (value): value is number => value !== null && value !== undefined && Number.isFinite(value),
  );
  if (!finiteValues.length) return null;
  return roundOne(finiteValues.reduce((total, value) => total + value, 0));
}

function aggregateModelCell(rows: WddDailyRow[], model: WddModel): WddModelCell {
  const cells = rows.map((row) => row.models[model]).filter((cell): cell is WddModelCell => !!cell);
  const basisSet = new Set(cells.map((cell) => cell.normalBasis).filter(Boolean));
  const normalBasis =
    basisSet.size === 1 ? (Array.from(basisSet)[0] as "10yr" | "30yr") : null;
  return {
    forecast: sumNullable(cells.map((cell) => cell.forecast)),
    normal: sumNullable(cells.map((cell) => cell.normal)),
    normal10yr: sumNullable(cells.map((cell) => cell.normal10yr)),
    normal30yr: sumNullable(cells.map((cell) => cell.normal30yr)),
    normalBasis,
    vsNormal: sumNullable(cells.map((cell) => cell.vsNormal)),
    change6h: sumNullable(cells.map((cell) => cell.change6h)),
    change12h: sumNullable(cells.map((cell) => cell.change12h)),
    change18h: sumNullable(cells.map((cell) => cell.change18h)),
    change24h: sumNullable(cells.map((cell) => cell.change24h)),
    change30h: sumNullable(cells.map((cell) => cell.change30h)),
    change36h: sumNullable(cells.map((cell) => cell.change36h)),
    change48h: sumNullable(cells.map((cell) => cell.change48h)),
    change72h: sumNullable(cells.map((cell) => cell.change72h)),
    dayCount: cells.filter((cell) => cell.forecast !== null).length,
  };
}

function aggregatePeriod(
  periodKey: string,
  periodLabel: string,
  rows: WddDailyRow[],
  models: WddModel[],
): WddPeriodRow {
  return {
    periodKey,
    periodLabel,
    dateRange: dateRangeLabel(rows),
    dayCount: rows.length,
    models: Object.fromEntries(
      models.map((model) => [model, aggregateModelCell(rows, model)]),
    ),
  };
}

function buildDayBucketPeriods(rows: WddDailyRow[], models: WddModel[]): WddPeriodRow[] {
  const buckets = [
    { key: "days-1-5", label: "Days 1-5", rows: rows.filter((row) => row.forecastDay >= 1 && row.forecastDay <= 5) },
    { key: "days-6-10", label: "Days 6-10", rows: rows.filter((row) => row.forecastDay >= 6 && row.forecastDay <= 10) },
    { key: "days-11-15", label: "Days 11-15", rows: rows.filter((row) => row.forecastDay >= 11 && row.forecastDay <= 15) },
    { key: "total", label: "Total", rows },
  ];
  return buckets.map((bucket) => aggregatePeriod(bucket.key, bucket.label, bucket.rows, models));
}

function buildEiaWeekPeriods(rows: WddDailyRow[], models: WddModel[]): WddPeriodRow[] {
  const grouped = new Map<string, WddDailyRow[]>();
  for (const row of rows) {
    const weekEnding = fridayWeekEnding(row.forecastDate);
    grouped.set(weekEnding, [...(grouped.get(weekEnding) ?? []), row]);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekEnding, weekRows]) =>
      aggregatePeriod(
        `eia-we-${weekEnding}`,
        `WE ${dayDateLabel(weekEnding)} (${weekRows.length}d)`,
        weekRows,
        models,
      ),
    );
}

function buildDailyRows(
  detailRows: DetailRow[],
  modelIssues: ModelIssueSummary[],
  metric: WddMetric,
  models: WddModel[],
  normalRows: NormalRow[],
): WddDailyRow[] {
  const selectedIssueByModel = new Map(
    modelIssues
      .filter((issue) => issue.selectedIssueKey)
      .map((issue) => [issue.model, issue.selectedIssueKey]),
  );
  const rowsByDateModel = new Map<string, DetailRow[]>();
  const forecastDayByDate = new Map<string, number>();
  const sourceMetrics = sourceMetricsForMetric(metric);
  const normalsByDay = normalRowsByMetricCalendarDay(normalRows);

  for (const row of detailRows) {
    if (selectedIssueByModel.get(row.model) !== row.source_issue_key) continue;
    const key = `${row.forecast_date}::${row.model}`;
    rowsByDateModel.set(key, [...(rowsByDateModel.get(key) ?? []), row]);
    const forecastDay = row.forecast_day === null ? null : toInt(row.forecast_day);
    if (forecastDay && !forecastDayByDate.has(row.forecast_date)) {
      forecastDayByDate.set(row.forecast_date, forecastDay);
    }
  }

  const forecastDates = Array.from(
    new Set(
      Array.from(rowsByDateModel.keys()).map((key) => key.split("::", 1)[0]).filter(Boolean),
    ),
  )
    .sort((left, right) => left.localeCompare(right))
    .slice(0, EXPECTED_DAY_COUNT);

  return forecastDates.map((forecastDate, index) => {
    const normalDayKey = calendarDayKeyForDate(forecastDate);
    const normalRowsForDate = sourceMetrics
      .map((sourceMetric) => normalsByDay.get(`${sourceMetric}::${normalDayKey}`))
      .filter((row): row is NormalRow => Boolean(row));

    return {
      forecastDate,
      dateLabel: dayDateLabel(forecastDate),
      forecastDay: forecastDayByDate.get(forecastDate) ?? index + 1,
      dayOfWeek: dayOfWeek(forecastDate),
      models: Object.fromEntries(
        models.map((model) => [
          model,
          buildCell(
            model,
            metric,
            rowsByDateModel.get(`${forecastDate}::${model}`) ?? [],
            normalRowsForDate,
          ),
        ]),
      ),
    };
  });
}

function forecastValueFromDetailRows(rows: DetailRow[], metric: WddMetric): number | null {
  const values = metricValueMap(rows);
  const sourceMetrics = sourceMetricsForMetric(metric);
  return summedSourceMetricValue(values, sourceMetrics, (sourceMetric) => sourceMetric);
}

function buildDailyRevisionTargets(
  dailyRows: WddDailyRow[],
  model: WddModel,
): WddForecastRevisionTarget[] {
  return dailyRows.map((row) => ({
    key: row.forecastDate,
    label: row.dateLabel,
    dateRange: row.forecastDate,
    dayCount: 1,
    forecastDates: [row.forecastDate],
    selectedForecast: row.models[model]?.forecast ?? null,
  }));
}

function buildEiaWeekRevisionTargets(
  dailyRows: WddDailyRow[],
  model: WddModel,
): WddForecastRevisionTarget[] {
  const grouped = new Map<string, WddDailyRow[]>();
  for (const row of dailyRows) {
    const weekEnding = fridayWeekEnding(row.forecastDate);
    grouped.set(weekEnding, [...(grouped.get(weekEnding) ?? []), row]);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekEnding, weekRows]) => {
      const period = aggregatePeriod(
        `eia-we-${weekEnding}`,
        `WE ${dayDateLabel(weekEnding)} (${weekRows.length}d)`,
        weekRows,
        [model],
      );
      return {
        key: period.periodKey,
        label: period.periodLabel,
        dateRange: period.dateRange,
        dayCount: period.dayCount,
        forecastDates: weekRows.map((row) => row.forecastDate),
        selectedForecast: period.models[model]?.forecast ?? null,
      };
    });
}

function revisionCandidatesForCycle(
  candidates: IssueCandidateRow[],
  cycle: WddCycle,
): IssueCandidateRow[] {
  if (cycle === "latest") return candidates;

  const withPriority = candidates
    .map((candidate) => ({ candidate, priority: cyclePriority(candidate, cycle) }))
    .filter((item) => item.priority < 2);
  const hasExactCycle = withPriority.some((item) => item.priority === 0);
  const selectedPriority = hasExactCycle ? 0 : 1;
  return withPriority
    .filter((item) => item.priority === selectedPriority)
    .map((item) => item.candidate);
}

function issueSortStamp(candidate: IssueCandidateRow): string {
  return (
    candidate.issue_sort_at ??
    candidate.source_issue_at_utc ??
    candidate.scrape_run_at_utc ??
    candidate.source_issue_key
  );
}

function buildRevisionsByTarget({
  candidates,
  detailRows,
  targets,
  metric,
  model,
  cycle,
  selectedIssueKey,
}: {
  candidates: IssueCandidateRow[];
  detailRows: DetailRow[];
  targets: WddForecastRevisionTarget[];
  metric: WddMetric;
  model: WddModel;
  cycle: WddCycle;
  selectedIssueKey: string | null;
}): Record<string, WddForecastRevisionPoint[]> {
  const rowsByIssueDate = new Map<string, DetailRow[]>();
  for (const row of detailRows) {
    if (row.model !== model) continue;
    const key = `${row.source_issue_key}::${row.forecast_date}`;
    rowsByIssueDate.set(key, [...(rowsByIssueDate.get(key) ?? []), row]);
  }

  const pointsByTarget: Record<string, WddForecastRevisionPoint[]> = {};
  const revisionCandidates = revisionCandidatesForCycle(candidates, cycle);

  for (const target of targets) {
    const points: WddForecastRevisionPoint[] = [];
    for (const candidate of revisionCandidates) {
      const values: number[] = [];
      const coverageDates: string[] = [];

      for (const forecastDate of target.forecastDates) {
        const value = forecastValueFromDetailRows(
          rowsByIssueDate.get(`${candidate.source_issue_key}::${forecastDate}`) ?? [],
          metric,
        );
        if (value === null) continue;
        values.push(value);
        coverageDates.push(forecastDate);
      }

      const forecast = sumNullable(values);
      if (forecast === null) continue;

      points.push({
        targetKey: target.key,
        sourceIssueKey: candidate.source_issue_key,
        issueSortAtUtc: candidate.issue_sort_at,
        sourceIssueAtUtc: candidate.source_issue_at_utc,
        scrapeRunAtUtc: candidate.scrape_run_at_utc,
        sourceInitAtUtc: candidate.source_init_at_utc,
        sourceInitCycle: candidate.source_init_cycle,
        modelRunCycle: candidate.model_run_cycle,
        effectiveCycle: candidate.effective_cycle,
        cycleFallbackUsed: cycle !== "latest" && !candidate.effective_cycle,
        selected: candidate.source_issue_key === selectedIssueKey,
        forecast,
        coveredDayCount: coverageDates.length,
        expectedDayCount: target.dayCount,
        coverageDates,
      });
    }

    points.sort((left, right) =>
      (left.issueSortAtUtc ?? left.sourceIssueAtUtc ?? left.scrapeRunAtUtc ?? "").localeCompare(
        right.issueSortAtUtc ?? right.sourceIssueAtUtc ?? right.scrapeRunAtUtc ?? "",
      ),
    );
    pointsByTarget[target.key] = points;
  }

  return pointsByTarget;
}

async function buildForecastRevisionPayload({
  region,
  metric,
  model,
  cycle,
  periodMode,
}: {
  region: WddRegion;
  metric: WddMetric;
  model: WddModel;
  cycle: WddCycle;
  periodMode: WddPeriodMode;
}): Promise<WddForecastRevisionPayload> {
  const models = [model];
  const sourceMetrics = sourceMetricsForMetric(metric);
  const metricNames = allMetricNames(metric);
  const candidateRows = await query<IssueCandidateRow>(ISSUE_CANDIDATES_SQL, [
    region,
    models,
    sourceMetrics,
    metricNames,
    cycle,
  ]);
  const sortedCandidates = [...candidateRows].sort((left, right) =>
    issueSortStamp(right).localeCompare(issueSortStamp(left)),
  );
  const selectedIssue = selectModelIssue(sortedCandidates, model, metric, cycle);
  const issueKeys = Array.from(new Set(sortedCandidates.map((candidate) => candidate.source_issue_key)));
  const detailRows = issueKeys.length
    ? await query<DetailRow>(DETAIL_ROWS_SQL, [region, models, issueKeys, metricNames])
    : [];
  const dailyRows = buildDailyRows(detailRows, [selectedIssue], metric, models, []);
  const targets =
    periodMode === "eiaWeeks"
      ? buildEiaWeekRevisionTargets(dailyRows, model)
      : buildDailyRevisionTargets(dailyRows, model);
  const revisionsByTarget = buildRevisionsByTarget({
    candidates: sortedCandidates,
    detailRows,
    targets,
    metric,
    model,
    cycle,
    selectedIssueKey: selectedIssue.selectedIssueKey,
  });
  const latestIssueAt = selectedIssue.sourceIssueAtUtc ?? selectedIssue.scrapeRunAtUtc;
  const updatedAt = sortedCandidates.reduce<string | null>(
    (latest, candidate) => maxStamp(latest, candidate.updated_at),
    selectedIssue.updatedAt,
  );

  return {
    source: "weather.wsi_daily_weighted_degree_day_forecasts",
    sourceContract: {
      sourceSystem: "WSI Trader GetWeightedDegreeDayForecast",
      table: "weather.wsi_daily_weighted_degree_day_forecasts",
      grain:
        "source_issue_key x model x forecast_type x request_region x entity_id x forecast_date x metric_name",
      freshnessField: "updated_at",
      readRole: "helios_readonly",
    },
    filters: {
      region,
      metric,
      model,
      models,
      cycle,
      periodMode,
    },
    selectedIssue,
    targetMode: periodMode === "eiaWeeks" ? "eiaWeeks" : "dailyDates",
    targets,
    revisionsByTarget,
    rowCounts: {
      rawRows: detailRows.length,
      issueCount: sortedCandidates.length,
      targetCount: targets.length,
    },
    asOf: {
      updatedAt,
      latestIssueAt,
    },
  };
}

function payloadDataAsOf(payload: WddForecastChangesPayload): string | null {
  const issueAsOf = payload.modelIssues.reduce<string | null>(
    (latest, issue) => maxStamp(latest, issue.updatedAt),
    null,
  );
  return maxStamp(issueAsOf, payload.normal.updatedAt);
}

function payloadLatestIssueAt(payload: WddForecastChangesPayload): string | null {
  return payload.modelIssues.reduce<string | null>(
    (latest, issue) => maxStamp(latest, issue.sourceIssueAtUtc ?? issue.scrapeRunAtUtc),
    null,
  );
}

function metricLabel(metric: WddMetric): string {
  if (metric === "tdd") return "TDD";
  if (metric === "gas_hdd") return "Gas HDD";
  if (metric === "gas_cdd") return "Gas CDD";
  if (metric === "oil_hdd") return "Oil HDD";
  if (metric === "oil_cdd") return "Oil CDD";
  if (metric === "electric_hdd") return "Electric HDD";
  if (metric === "electric_cdd") return "Electric CDD";
  if (metric === "population_hdd") return "Pop HDD";
  return "Pop CDD";
}

function fmtReportNumber(value: number | null, signed = false): string {
  if (value === null || !Number.isFinite(value)) return "--";
  const rounded = Math.round(value * 10) / 10;
  const prefix = signed && rounded > 0 ? "+" : "";
  return `${prefix}${rounded.toLocaleString("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}`;
}

function thermalDirectionLabel(thermalDeparture: number | null): string {
  if (thermalDeparture === null || !Number.isFinite(thermalDeparture)) return "direction unavailable";
  if (Math.abs(thermalDeparture) < 0.05) return "near normal";
  return thermalDeparture > 0 ? "warmer" : "colder";
}

function thermalDepartureForMetric(metric: WddMetric, vsNormal: number | null): number | null {
  if (vsNormal === null || !Number.isFinite(vsNormal)) return null;
  if (metric.endsWith("_hdd")) return roundOne(-vsNormal);
  return roundOne(vsNormal);
}

function selectedWsiDetailRowsByDate(
  detailRows: DetailRow[],
  modelIssues: ModelIssueSummary[],
): Map<string, DetailRow[]> {
  const wsiIssueKey = modelIssues.find((issue) => issue.model === "WSI")?.selectedIssueKey;
  const rowsByDate = new Map<string, DetailRow[]>();
  if (!wsiIssueKey) return rowsByDate;

  for (const row of detailRows) {
    if (row.model !== "WSI" || row.source_issue_key !== wsiIssueKey) continue;
    rowsByDate.set(row.forecast_date, [...(rowsByDate.get(row.forecast_date) ?? []), row]);
  }
  return rowsByDate;
}

function buildWsiSourceChangeByDate(
  detailRows: DetailRow[],
  modelIssues: ModelIssueSummary[],
  metric: WddMetric,
  hour: number,
): Map<string, number | null> {
  const rowsByDate = selectedWsiDetailRowsByDate(detailRows, modelIssues);
  const valuesByDate = new Map<string, number | null>();
  const sourceMetrics = sourceMetricsForMetric(metric);

  for (const [forecastDate, rows] of rowsByDate.entries()) {
    const values = metricValueMap(rows);
    valuesByDate.set(
      forecastDate,
      summedSourceMetricValue(values, sourceMetrics, (sourceMetric) =>
        changeMetricName(sourceMetric, hour),
      ),
    );
  }

  return valuesByDate;
}

function buildTddThermalDepartureByDate(
  detailRows: DetailRow[],
  modelIssues: ModelIssueSummary[],
  normalRows: NormalRow[],
): Map<string, number | null> {
  const rowsByDate = selectedWsiDetailRowsByDate(detailRows, modelIssues);
  const normalsByDay = normalRowsByMetricCalendarDay(normalRows);
  const thermalByDate = new Map<string, number | null>();

  for (const [forecastDate, rows] of rowsByDate.entries()) {
    const normalDayKey = calendarDayKeyForDate(forecastDate);
    const normalRowsForDate = (["population_cdd", "gas_hdd"] as WddSourceMetric[])
      .map((sourceMetric) => normalsByDay.get(`${sourceMetric}::${normalDayKey}`))
      .filter((row): row is NormalRow => Boolean(row));
    const cddCell = buildCell("WSI", "population_cdd", rows, normalRowsForDate);
    const hddCell = buildCell("WSI", "gas_hdd", rows, normalRowsForDate);

    thermalByDate.set(
      forecastDate,
      cddCell.vsNormal !== null && hddCell.vsNormal !== null
        ? roundOne(cddCell.vsNormal - hddCell.vsNormal)
        : null,
    );
  }

  return thermalByDate;
}

function buildWsiTddThermalChangeByDate(
  detailRows: DetailRow[],
  modelIssues: ModelIssueSummary[],
  hour: 12 | 24,
): Map<string, number | null> {
  const rowsByDate = selectedWsiDetailRowsByDate(detailRows, modelIssues);
  const thermalByDate = new Map<string, number | null>();

  for (const [forecastDate, rows] of rowsByDate.entries()) {
    thermalByDate.set(
      forecastDate,
      tddThermalValueFromRows(
        rows,
        (sourceMetric) =>
          hour === 24
            ? `${sourceMetric}_difference`
            : changeMetricName(sourceMetric, hour),
      ),
    );
  }

  return thermalByDate;
}

function buildReportRow({
  key,
  label,
  rows,
  metric,
  priorYearByDate,
  change12hByDate,
  tddThermalByDate,
  tddThermalChange12hByDate,
  tddThermalChange24hByDate,
}: {
  key: string;
  label: string;
  rows: WddDailyRow[];
  metric: WddMetric;
  priorYearByDate: Map<string, PriorYearDailyActual>;
  change12hByDate: Map<string, number | null>;
  tddThermalByDate: Map<string, number | null>;
  tddThermalChange12hByDate: Map<string, number | null>;
  tddThermalChange24hByDate: Map<string, number | null>;
}): WsiReportRow {
  const cell = aggregateModelCell(rows, "WSI");
  const forecast = cell.forecast;
  const change24h = cell.change24h;
  const normal10yr = cell.normal10yr;
  const vsNormal =
    forecast !== null && normal10yr !== null ? roundOne(forecast - normal10yr) : null;
  const priorYearActuals = rows.map((row) => priorYearByDate.get(row.forecastDate));
  const priorYearDayCount = priorYearActuals.filter(
    (actual) => actual?.value !== null && actual?.value !== undefined,
  ).length;
  const priorYear = sumNullable(priorYearActuals.map((actual) => actual?.value));
  const vsPriorYear =
    forecast !== null && priorYear !== null && priorYearDayCount === rows.length
      ? roundOne(forecast - priorYear)
      : null;
  const change12h = sumNullable(rows.map((row) => change12hByDate.get(row.forecastDate)));
  const thermalDeparture =
    metric === "tdd"
      ? sumNullable(rows.map((row) => tddThermalByDate.get(row.forecastDate)))
      : thermalDepartureForMetric(metric, vsNormal);
  const thermalChange12h =
    metric === "tdd"
      ? sumNullable(rows.map((row) => tddThermalChange12hByDate.get(row.forecastDate)))
      : thermalDepartureForMetric(metric, change12h);
  const thermalChange24h =
    metric === "tdd"
      ? sumNullable(rows.map((row) => tddThermalChange24hByDate.get(row.forecastDate)))
      : thermalDepartureForMetric(metric, change24h);

  return {
    key,
    label,
    dateRange: dateRangeLabel(rows),
    dayCount: rows.length,
    forecast,
    change12h,
    change24h,
    thermalChange12h,
    thermalChange24h,
    normal10yr,
    priorYear,
    vsNormal,
    vsPriorYear,
    thermalDeparture,
    priorYearDayCount,
  };
}

function buildReportEiaWeekRows({
  dailyRows,
  metric,
  priorYearByDate,
  change12hByDate,
  tddThermalByDate,
  tddThermalChange12hByDate,
  tddThermalChange24hByDate,
}: {
  dailyRows: WddDailyRow[];
  metric: WddMetric;
  priorYearByDate: Map<string, PriorYearDailyActual>;
  change12hByDate: Map<string, number | null>;
  tddThermalByDate: Map<string, number | null>;
  tddThermalChange12hByDate: Map<string, number | null>;
  tddThermalChange24hByDate: Map<string, number | null>;
}): WsiReportRow[] {
  const grouped = new Map<string, WddDailyRow[]>();
  for (const row of dailyRows) {
    const weekEnding = fridayWeekEnding(row.forecastDate);
    grouped.set(weekEnding, [...(grouped.get(weekEnding) ?? []), row]);
  }

  const weekRows = Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekEnding, rows]) =>
      buildReportRow({
        key: `eia-we-${weekEnding}`,
        label: `WE ${dayDateLabel(weekEnding)}`,
        rows,
        metric,
        priorYearByDate,
        change12hByDate,
        tddThermalByDate,
        tddThermalChange12hByDate,
        tddThermalChange24hByDate,
      }),
    );

  return [
    ...weekRows,
    buildReportRow({
      key: "total",
      label: "Total",
      rows: dailyRows,
      metric,
      priorYearByDate,
      change12hByDate,
      tddThermalByDate,
      tddThermalChange12hByDate,
      tddThermalChange24hByDate,
    }),
  ];
}

function buildReportDayBucketRows({
  dailyRows,
  metric,
  priorYearByDate,
  change12hByDate,
  tddThermalByDate,
  tddThermalChange12hByDate,
  tddThermalChange24hByDate,
}: {
  dailyRows: WddDailyRow[];
  metric: WddMetric;
  priorYearByDate: Map<string, PriorYearDailyActual>;
  change12hByDate: Map<string, number | null>;
  tddThermalByDate: Map<string, number | null>;
  tddThermalChange12hByDate: Map<string, number | null>;
  tddThermalChange24hByDate: Map<string, number | null>;
}): WsiReportRow[] {
  const buckets = [
    {
      key: "days-1-5",
      label: "Days 1-5",
      rows: dailyRows.filter((row) => row.forecastDay >= 1 && row.forecastDay <= 5),
    },
    {
      key: "days-6-10",
      label: "Days 6-10",
      rows: dailyRows.filter((row) => row.forecastDay >= 6 && row.forecastDay <= 10),
    },
    {
      key: "days-11-15",
      label: "Days 11-15",
      rows: dailyRows.filter((row) => row.forecastDay >= 11 && row.forecastDay <= 15),
    },
    { key: "total", label: "Total", rows: dailyRows },
  ];

  return buckets.map((bucket) =>
    buildReportRow({
      key: bucket.key,
      label: bucket.label,
      rows: bucket.rows,
      metric,
      priorYearByDate,
      change12hByDate,
      tddThermalByDate,
      tddThermalChange12hByDate,
      tddThermalChange24hByDate,
    }),
  );
}

function buildModelSpread(
  dailyRows: WddDailyRow[],
  models: WddModel[],
): WsiReportModelSpread {
  const supportingValues: Array<{ model: WddModel; forecast: number }> = [];
  for (const model of models) {
    if (model === "WSI") continue;
    const forecast = aggregateModelCell(dailyRows, model).forecast;
    if (forecast !== null) supportingValues.push({ model, forecast });
  }

  if (!supportingValues.length) {
    return {
      supportingModelCount: 0,
      lowModel: null,
      lowForecast: null,
      highModel: null,
      highForecast: null,
      spread: null,
      supportingAverage: null,
      primaryVsSupportingAverage: null,
    };
  }

  const sorted = [...supportingValues].sort((left, right) => left.forecast - right.forecast);
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  const supportingAverage = roundOne(
    supportingValues.reduce((total, item) => total + item.forecast, 0) / supportingValues.length,
  );
  const primaryForecast = aggregateModelCell(dailyRows, "WSI").forecast;

  return {
    supportingModelCount: supportingValues.length,
    lowModel: low.model,
    lowForecast: low.forecast,
    highModel: high.model,
    highForecast: high.forecast,
    spread: roundOne(high.forecast - low.forecast),
    supportingAverage,
    primaryVsSupportingAverage:
      primaryForecast !== null ? roundOne(primaryForecast - supportingAverage) : null,
  };
}

function selectedDetailRowsByModelDate(
  detailRows: DetailRow[],
  modelIssues: ModelIssueSummary[],
): Map<string, DetailRow[]> {
  const selectedIssueByModel = new Map(
    modelIssues
      .filter((issue) => issue.selectedIssueKey)
      .map((issue) => [issue.model, issue.selectedIssueKey]),
  );
  const rowsByModelDate = new Map<string, DetailRow[]>();

  for (const row of detailRows) {
    if (selectedIssueByModel.get(row.model) !== row.source_issue_key) continue;
    const key = `${row.model}::${row.forecast_date}`;
    rowsByModelDate.set(key, [...(rowsByModelDate.get(key) ?? []), row]);
  }

  return rowsByModelDate;
}

function tddThermalValueFromRows(
  rows: DetailRow[],
  metricNameForSource: (sourceMetric: WddSourceMetric) => string,
): number | null {
  const values = metricValueMap(rows);
  const cdd = values.get(metricNameForSource("population_cdd")) ?? null;
  const hdd = values.get(metricNameForSource("gas_hdd")) ?? null;
  if (cdd === null || hdd === null || !Number.isFinite(cdd) || !Number.isFinite(hdd)) {
    return null;
  }
  return roundOne(cdd - hdd);
}

function modelTddThermalForecastTotal(
  rowsByModelDate: Map<string, DetailRow[]>,
  dailyRows: WddDailyRow[],
  model: WddModel,
): number | null {
  return sumNullable(
    dailyRows.map((row) =>
      tddThermalValueFromRows(
        rowsByModelDate.get(`${model}::${row.forecastDate}`) ?? [],
        (sourceMetric) => sourceMetric,
      ),
    ),
  );
}

function modelTddThermalChangeTotal(
  rowsByModelDate: Map<string, DetailRow[]>,
  dailyRows: WddDailyRow[],
  model: WddModel,
  hour: 12 | 24 | 48 | 72,
): number | null {
  return sumNullable(
    dailyRows.map((row) =>
      tddThermalValueFromRows(
        rowsByModelDate.get(`${model}::${row.forecastDate}`) ?? [],
        (sourceMetric) =>
          model === "WSI" && hour === 24
            ? `${sourceMetric}_difference`
            : changeMetricName(sourceMetric, hour),
      ),
    ),
  );
}

function modelIssueCycle(issue: ModelIssueSummary): string | null {
  return issue.effectiveCycle ?? issue.modelRunCycle ?? issue.sourceInitCycle;
}

function buildModelChangeRows({
  dailyRows,
  models,
  modelIssues,
  metric,
  detailRows,
}: {
  dailyRows: WddDailyRow[];
  models: WddModel[];
  modelIssues: ModelIssueSummary[];
  metric: WddMetric;
  detailRows: DetailRow[];
}): WsiReportModelChange[] {
  const issuesByModel = new Map(modelIssues.map((issue) => [issue.model, issue]));
  const wsiForecast = aggregateModelCell(dailyRows, "WSI").forecast;
  const rowsByModelDate =
    metric === "tdd" ? selectedDetailRowsByModelDate(detailRows, modelIssues) : null;
  const wsiTddThermalForecast =
    rowsByModelDate !== null
      ? modelTddThermalForecastTotal(rowsByModelDate, dailyRows, "WSI")
      : null;

  return models.map((model) => {
    const issue = issuesByModel.get(model) ?? missingModelSummary(model, metric);
    const cell = aggregateModelCell(dailyRows, model);
    const vsWsiForecast =
      cell.forecast !== null && wsiForecast !== null
        ? roundOne(cell.forecast - wsiForecast)
        : null;
    const modelTddThermalForecast =
      rowsByModelDate !== null
        ? modelTddThermalForecastTotal(rowsByModelDate, dailyRows, model)
        : null;
    const thermalVsWsiForecast =
      metric === "tdd"
        ? modelTddThermalForecast !== null && wsiTddThermalForecast !== null
          ? roundOne(modelTddThermalForecast - wsiTddThermalForecast)
          : null
        : thermalDepartureForMetric(metric, vsWsiForecast);
    const thermalChange = (value: number | null, hour: 12 | 24 | 48 | 72) =>
      metric === "tdd" && rowsByModelDate !== null
        ? modelTddThermalChangeTotal(rowsByModelDate, dailyRows, model, hour)
        : thermalDepartureForMetric(metric, value);

    return {
      model,
      status: issue.status,
      issueKey: issue.selectedIssueKey,
      issueAtUtc: issue.sourceIssueAtUtc,
      scrapeRunAtUtc: issue.scrapeRunAtUtc,
      cycle: modelIssueCycle(issue),
      completenessPct: issue.completenessPct,
      forecastDayCount: issue.forecastDayCount,
      expectedDayCount: issue.expectedDayCount,
      forecast: cell.forecast,
      vsWsiForecast,
      change12h: cell.change12h,
      change24h: cell.change24h,
      change48h: cell.change48h,
      change72h: cell.change72h,
      thermalVsWsiForecast,
      thermalChange12h: thermalChange(cell.change12h, 12),
      thermalChange24h: thermalChange(cell.change24h, 24),
      thermalChange48h: thermalChange(cell.change48h, 48),
      thermalChange72h: thermalChange(cell.change72h, 72),
    };
  });
}

function buildReportHeadlines(
  metric: WddMetric,
  total: WsiReportRow,
  eiaWeeks: WsiReportRow[],
  modelSpread: WsiReportModelSpread,
): string[] {
  const label = metricLabel(metric);
  const headlines: string[] = [];

  headlines.push(
    total.forecast !== null && total.normal10yr !== null && total.vsNormal !== null
      ? `15-day WSI ${label} is ${fmtReportNumber(total.forecast)} vs ${fmtReportNumber(
          total.normal10yr,
        )} 10yr normal (${fmtReportNumber(total.vsNormal, true)}, ${thermalDirectionLabel(
          total.thermalDeparture,
        )}).`
      : `15-day WSI ${label} total or 10yr normal is unavailable for the selected issue.`,
  );

  headlines.push(
    total.change24h !== null
      ? `WSI 15-day total changed ${fmtReportNumber(
          total.change24h,
          true,
        )} ${label} versus the prior issue.`
      : "WSI 24h issue-over-issue change is not available for the selected issue.",
  );

  const eiaWeekExtremes = eiaWeeks
    .filter((row) => row.key !== "total" && row.thermalDeparture !== null)
    .sort(
      (left, right) =>
        Math.abs(right.thermalDeparture ?? 0) - Math.abs(left.thermalDeparture ?? 0),
    );
  const extremeWeek = eiaWeekExtremes[0];
  if (extremeWeek) {
    const thermalDirection =
      Math.abs(extremeWeek.thermalDeparture ?? 0) < 0.05
        ? "nearest-normal"
        : (extremeWeek.thermalDeparture ?? 0) > 0
          ? "warmest"
          : "coldest";
    headlines.push(
      `${extremeWeek.label} is the ${thermalDirection} EIA week versus normal at ${fmtReportNumber(
        extremeWeek.vsNormal,
        true,
      )} ${label} vs 10yr (${extremeWeek.dateRange}).`,
    );
  } else {
    headlines.push("EIA week 10yr-normal departure is unavailable for the selected issue.");
  }

  if (total.vsPriorYear !== null) {
    headlines.push(
      `Current WSI 15-day forecast is ${fmtReportNumber(
        total.vsPriorYear,
        true,
      )} ${label} versus prior-year actual (${total.priorYearDayCount}/${total.dayCount} matched days).`,
    );
  } else if (total.priorYear !== null) {
    headlines.push(
      `Prior-year actual coverage is partial at ${total.priorYearDayCount}/${total.dayCount} matched days, so the full 15-day prior-year comparison is withheld.`,
    );
  } else {
    headlines.push("Prior-year actuals are unavailable for the 15-day forecast window.");
  }

  if (
    modelSpread.lowModel &&
    modelSpread.highModel &&
    modelSpread.lowForecast !== null &&
    modelSpread.highForecast !== null &&
    modelSpread.spread !== null
  ) {
    const averageClause =
      modelSpread.primaryVsSupportingAverage !== null
        ? `; WSI is ${fmtReportNumber(
            modelSpread.primaryVsSupportingAverage,
            true,
          )} vs their average`
        : "";
    headlines.push(
      `Supporting models span ${modelSpread.lowModel} ${fmtReportNumber(
        modelSpread.lowForecast,
      )} to ${modelSpread.highModel} ${fmtReportNumber(
        modelSpread.highForecast,
      )} ${label} (spread ${fmtReportNumber(modelSpread.spread)})${averageClause}.`,
    );
  } else {
    headlines.push("Supporting model spread is unavailable for the selected issue.");
  }

  return headlines;
}

function buildWeatherReport({
  metric,
  models,
  normal,
  modelIssues,
  dailyRows,
  detailRows,
  normalRows,
  priorYearRows,
}: {
  metric: WddMetric;
  models: WddModel[];
  normal: WddForecastChangesPayload["normal"];
  modelIssues: ModelIssueSummary[];
  dailyRows: WddDailyRow[];
  detailRows: DetailRow[];
  normalRows: NormalRow[];
  priorYearRows: PriorYearActualRow[];
}): WsiWeatherReport {
  const primaryIssue = modelIssues.find((issue) => issue.model === "WSI") ?? missingModelSummary("WSI", metric);
  const priorYearByDate = buildPriorYearDailyActuals(dailyRows, metric, priorYearRows);
  const expectedPriorYearDays = dailyRows.filter((row) =>
    Boolean(priorYearObservationDate(row.forecastDate)),
  ).length;
  const priorYearCoverageDays = Array.from(priorYearByDate.values()).filter(
    (actual) => actual.value !== null,
  ).length;
  const change12hByDate = buildWsiSourceChangeByDate(detailRows, modelIssues, metric, 12);
  const tddThermalByDate =
    metric === "tdd"
      ? buildTddThermalDepartureByDate(detailRows, modelIssues, normalRows)
      : new Map<string, number | null>();
  const tddThermalChange12hByDate =
    metric === "tdd"
      ? buildWsiTddThermalChangeByDate(detailRows, modelIssues, 12)
      : new Map<string, number | null>();
  const tddThermalChange24hByDate =
    metric === "tdd"
      ? buildWsiTddThermalChangeByDate(detailRows, modelIssues, 24)
      : new Map<string, number | null>();
  const reportRowContext = {
    dailyRows,
    metric,
    priorYearByDate,
    change12hByDate,
    tddThermalByDate,
    tddThermalChange12hByDate,
    tddThermalChange24hByDate,
  };
  const eiaWeeks = buildReportEiaWeekRows(reportRowContext);
  const dayBuckets = buildReportDayBucketRows(reportRowContext);
  const total = dayBuckets.find((row) => row.key === "total") ?? buildReportRow({
    key: "total",
    label: "Total",
    rows: dailyRows,
    metric,
    priorYearByDate,
    change12hByDate,
    tddThermalByDate,
    tddThermalChange12hByDate,
    tddThermalChange24hByDate,
  });
  const show12hChange = [...eiaWeeks, ...dayBuckets].some((row) => row.change12h !== null);
  const modelSpread = buildModelSpread(dailyRows, models);
  const modelChanges = buildModelChangeRows({
    dailyRows,
    models,
    modelIssues,
    metric,
    detailRows,
  });

  return {
    primaryModel: "WSI",
    supportingModels: models.filter((model) => model !== "WSI"),
    metricLabel: metricLabel(metric),
    status: {
      issueKey: primaryIssue.selectedIssueKey,
      issueAtUtc: primaryIssue.sourceIssueAtUtc,
      scrapeRunAtUtc: primaryIssue.scrapeRunAtUtc,
      cycle: modelIssueCycle(primaryIssue),
      normalSource: normal.source,
      normalBasis: normal.actualBasis,
      normalUpdatedAt: normal.updatedAt,
      priorYearCoverageDays,
      expectedPriorYearDays,
      completenessPct: primaryIssue.completenessPct,
      forecastWindow: dateRangeLabel(dailyRows),
      show12hChange,
    },
    headlines: buildReportHeadlines(metric, total, eiaWeeks, modelSpread),
    eiaWeeks,
    dayBuckets,
    modelChanges,
    modelSpread,
  };
}

function errorResult(message: string, status = 400) {
  return {
    payload: {
      error: message,
      allowedFilters: {
        regions: ALLOWED_REGIONS,
        metrics: ALLOWED_METRICS,
        models: ALLOWED_MODELS,
        cycles: ALLOWED_CYCLES,
        periodModes: ALLOWED_PERIOD_MODES,
      },
    },
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Weather-Wsi-Wdd-Forecast-Changes-Cache": "ERROR",
    },
    rowCount: 0,
    dataAsOf: null,
  };
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const reportRequested = parseReport(searchParams.get("report"));
  const revisionsRequested = parseRevisions(searchParams.get("revisions"));
  if (reportRequested && revisionsRequested) {
    return errorResult("Use either report=1 or revisions=1, not both.");
  }
  const region = parseRegion(searchParams.get("region"));
  if (!region) return errorResult("Invalid region. Use one promoted WDD entity.");
  const metric = parseMetric(searchParams.get("metric"));
  if (!metric) return errorResult("Invalid metric. Use one promoted WDD metric family.");
  const cycle = parseCycle(searchParams.get("cycle"));
  if (!cycle) return errorResult("Invalid cycle. Use latest, 00Z, or 12Z.");
  const requestedPeriodMode = parsePeriodMode(searchParams.get("periodMode"));
  if (!requestedPeriodMode) return errorResult("Invalid periodMode. Use dayBuckets or eiaWeeks.");
  const periodMode = reportRequested ? "eiaWeeks" : requestedPeriodMode;
  const { models: parsedModels, invalid } = parseModels(searchParams.get("models"));
  if (invalid.length) return errorResult(`Invalid models: ${invalid.join(", ")}`);
  if (!parsedModels.length) return errorResult("At least one model is required.");
  const models = reportRequested
    ? [...ALLOWED_MODELS]
    : revisionsRequested
      ? [parsedModels[0] ?? "WSI"]
      : parsedModels;

  const refresh = searchParams.get("refresh") === "1";
  const sourceMetrics = sourceMetricsForMetric(metric);
  const metricNames = allMetricNames(metric);
  const cacheKey = [
    "weather-wsi-wdd-forecast-changes",
    reportRequested ? "report" : revisionsRequested ? "revisions" : "table",
    region,
    metric,
    models.join(","),
    cycle,
    periodMode,
  ].join(":");

  if (revisionsRequested) {
    if (!refresh) {
      const cached = REVISION_RESPONSE_CACHE.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return {
          payload: cached.payload,
          headers: {
            "Cache-Control": FRESH_CACHE_HEADER,
            "X-Weather-Wsi-Wdd-Forecast-Changes-Cache": "HIT",
          },
          rowCount: cached.payload.rowCounts.rawRows,
          dataAsOf: cached.payload.asOf.updatedAt,
        };
      }
    }

    try {
      const payload = await buildForecastRevisionPayload({
        region,
        metric,
        model: models[0] ?? "WSI",
        cycle,
        periodMode,
      });

      REVISION_RESPONSE_CACHE.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        payload,
      });

      return {
        payload,
        headers: {
          "Cache-Control": FRESH_CACHE_HEADER,
          "X-Weather-Wsi-Wdd-Forecast-Changes-Cache": "MISS",
        },
        rowCount: payload.rowCounts.rawRows,
        dataAsOf: payload.asOf.updatedAt,
      };
    } catch (error) {
      console.error("[weather-wsi-wdd-forecast-changes] revision DB query failed:", error);
      return {
        payload: { error: "Failed to fetch WSI WDD forecast revision rows" },
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          "X-Weather-Wsi-Wdd-Forecast-Changes-Cache": "ERROR",
        },
        rowCount: 0,
        dataAsOf: null,
      };
    }
  }

  if (!refresh) {
    const cached = RESPONSE_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        payload: cached.payload,
        headers: {
          "Cache-Control": FRESH_CACHE_HEADER,
          "X-Weather-Wsi-Wdd-Forecast-Changes-Cache": "HIT",
        },
        rowCount: cached.payload.rowCounts.rawRows,
        dataAsOf: payloadDataAsOf(cached.payload),
      };
    }
  }

  try {
    const candidateRows = await query<IssueCandidateRow>(ISSUE_CANDIDATES_SQL, [
      region,
      models,
      sourceMetrics,
      metricNames,
      cycle,
    ]);
    const candidatesByModel = new Map<WddModel, IssueCandidateRow[]>();
    for (const candidate of candidateRows) {
      candidatesByModel.set(candidate.model, [
        ...(candidatesByModel.get(candidate.model) ?? []),
        candidate,
      ]);
    }

    const modelIssues = models.map((model) =>
      selectModelIssue(candidatesByModel.get(model) ?? [], model, metric, cycle),
    );
    const selectedIssueKeys = Array.from(
      new Set(
        modelIssues
          .map((issue) => issue.selectedIssueKey)
          .filter((issueKey): issueKey is string => !!issueKey),
      ),
    );
    const detailRows = selectedIssueKeys.length
      ? await query<DetailRow>(DETAIL_ROWS_SQL, [region, models, selectedIssueKeys, metricNames])
      : [];
    const { tableExists, rows: normalRows } = await loadNormalRows(region, metric);
    const dailyRows = buildDailyRows(detailRows, modelIssues, metric, models, normalRows);
    const priorYearRows = reportRequested
      ? await loadPriorYearActualRows(region, metric, dailyRows)
      : [];
    const periodRows =
      periodMode === "eiaWeeks"
        ? buildEiaWeekPeriods(dailyRows, models)
        : buildDayBucketPeriods(dailyRows, models);
    const normal = normalSummary(normalRows, tableExists, dailyRows);

    const payload: WddForecastChangesPayload = {
      source: "weather.wsi_daily_weighted_degree_day_forecasts",
      sourceContract: {
        sourceSystem: "WSI Trader GetWeightedDegreeDayForecast",
        table: "weather.wsi_daily_weighted_degree_day_forecasts",
        grain:
          "source_issue_key x model x forecast_type x request_region x entity_id x forecast_date x metric_name",
        freshnessField: "updated_at",
        readRole: "helios_readonly",
      },
      filters: {
        region,
        metric,
        models,
        cycle,
        periodMode,
      },
      allowedFilters: {
        regions: ALLOWED_REGIONS,
        metrics: ALLOWED_METRICS,
        models: ALLOWED_MODELS,
        cycles: ALLOWED_CYCLES,
        periodModes: ALLOWED_PERIOD_MODES,
      },
      metricColumns: {
        forecast: metric,
        normal10yr: normal10yrColumnExpression(metric),
        normal30yr: metricColumnExpression(metric, "_normal_30yr"),
        vsNormal:
          normal.actualBasis === "10yr"
            ? `${metricColumnExpression(metric)} - 10yr_normal`
            : metricColumnExpression(metric, "_dfn_30yr"),
        wsi24hChange: metricColumnExpression(metric, "_difference"),
        modelRunChanges: CHANGE_HOURS.map((hour) => changeColumnExpression(metric, hour)),
      },
      normal,
      modelIssues,
      dailyRows,
      periodRows,
      rowCounts: {
        rawRows: detailRows.length,
        dailyRows: dailyRows.length,
        periodRows: periodRows.length,
        selectedModelCount: models.length,
      },
      asOf: {
        updatedAt: null,
        latestIssueAt: null,
      },
    };
    payload.asOf.updatedAt = payloadDataAsOf(payload);
    payload.asOf.latestIssueAt = payloadLatestIssueAt(payload);
    if (reportRequested) {
      payload.report = buildWeatherReport({
        metric,
        models,
        normal,
        modelIssues,
        dailyRows,
        detailRows,
        normalRows,
        priorYearRows,
      });
    }

    RESPONSE_CACHE.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload,
    });

    return {
      payload,
      headers: {
        "Cache-Control": FRESH_CACHE_HEADER,
        "X-Weather-Wsi-Wdd-Forecast-Changes-Cache": "MISS",
      },
      rowCount: payload.rowCounts.rawRows,
      dataAsOf: payload.asOf.updatedAt,
    };
  } catch (error) {
    console.error("[weather-wsi-wdd-forecast-changes] DB query failed:", error);
    return {
      payload: { error: "Failed to fetch WSI WDD forecast change rows" },
      status: 500,
      headers: {
        "Cache-Control": "no-store",
        "X-Weather-Wsi-Wdd-Forecast-Changes-Cache": "ERROR",
      },
      rowCount: 0,
      dataAsOf: null,
    };
  }
});

export async function GET(request: Request): Promise<Response> {
  if (!isWeatherDevEnabled()) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return observedGET(request);
}
