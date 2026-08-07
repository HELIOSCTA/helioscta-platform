import { observedJsonRoute, type ObservedRouteResult } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import {
  buildWeatherNormalizedShapeSummary,
  parsePowerSeasonSelection,
  resolvePowerSeasonWindow,
  type PowerSeasonSelection,
  type ShapeSummaryStatus,
  type WeatherLoadPoint,
  type WeatherNormalizedShapeSummary,
} from "@/lib/pjmLoadGrowthSeasonSummary";
import { buildNercOffPeakDaysValuesSql } from "@/lib/tradingCalendars/calendars/pjmPower";
import type { CalendarDate } from "@/lib/tradingCalendars";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=900, stale-while-revalidate=300";
const DEFAULT_WEATHER_METRIC: WeatherMetric = "feelsLikeF";

const ROUTE_CONFIG = {
  route: "/api/pjm-load-growth-season-summary",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=900, stale-while-revalidate=300",
  owner: "frontend",
  purpose: "PJM forecast-area scan weather-normalized seasonal load-growth summary",
  p95TargetMs: 900,
  freshnessSource:
    "pjm.hrl_load_metered.updated_at, pjm.hrl_load_prelim.updated_at, weather.wsi_hourly_observed_temperatures.updated_at, code-owned NERC off-peak calendar",
} as const;

type WeatherMetric = "tempF" | "dewPointF" | "feelsLikeF";
type SqlLoadShape = "PK" | "OnPK" | "OffPk";
type PayloadLoadShape = "pk" | "onPk" | "offPk";
type Period = "current" | "last_year";

interface RegionPreset {
  region: string;
  loadArea: string;
  wxHub: string;
  weatherRegion: string;
  loadAreas: string[];
}

interface DailyShapeRow {
  region: string;
  load_area: string;
  station_id: string;
  weather_region: string;
  station_name: string | null;
  load_shape: SqlLoadShape;
  period: Period;
  operating_date: string;
  load_mw: number | string | null;
  weather_value: number | string | null;
  expected_source_area_count: number | string;
  min_source_area_count: number | string | null;
}

interface PayloadShapeSummary {
  status: ShapeSummaryStatus;
  normalizedCurrentMw: number | null;
  normalizedLastYearMw: number | null;
  deltaMw: number | null;
  deltaPct: number | null;
  currentFitDays: number;
  lastYearFitDays: number;
  evaluationDays: number;
  currentFitDegree: number | null;
  lastYearFitDegree: number | null;
  error: string | null;
}

const REGION_PRESETS: RegionPreset[] = [
  { region: "RTO", loadArea: "RTO", wxHub: "PJM", weatherRegion: "PJM", loadAreas: ["RTO"] },
  {
    region: "WEST",
    loadArea: "WEST",
    wxHub: "KPIT",
    weatherRegion: "PJM",
    loadAreas: ["AEP", "AP", "ATSI", "DAY", "DEOK", "DUQ", "EKPC"],
  },
  { region: "MIDATL", loadArea: "MIDATL", wxHub: "KPHL", weatherRegion: "PJM", loadAreas: ["MIDATL"] },
  { region: "BGE", loadArea: "BC", wxHub: "KBWI", weatherRegion: "PJM", loadAreas: ["BC"] },
  { region: "PEPCO", loadArea: "PEPCO", wxHub: "KDCA", weatherRegion: "PJM", loadAreas: ["PEPCO"] },
  { region: "SOUTH", loadArea: "SOUTH", wxHub: "KRIC", weatherRegion: "PJM", loadAreas: ["DOM"] },
];

const SHAPE_MAP: Array<{ sql: SqlLoadShape; key: PayloadLoadShape }> = [
  { sql: "PK", key: "pk" },
  { sql: "OnPK", key: "onPk" },
  { sql: "OffPk", key: "offPk" },
];

const WEATHER_METRIC_LABELS: Record<WeatherMetric, string> = {
  tempF: "Temp",
  dewPointF: "Dew Point",
  feelsLikeF: "Feels Like",
};

function parseIso(value: string | null): "PJM" | null {
  if (!value) return "PJM";
  return value.trim().toUpperCase() === "PJM" ? "PJM" : null;
}

function parseWeatherMetric(value: string | null): WeatherMetric {
  if (value === "tempF" || value === "dewPointF" || value === "feelsLikeF") return value;
  return DEFAULT_WEATHER_METRIC;
}

function parseAsOfDate(value: string | null): CalendarDate | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInt(value: unknown): number {
  return Math.trunc(toNumber(value) ?? 0);
}

function calendarYear(value: CalendarDate): number {
  return Number(value.slice(0, 4));
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildRegionPresetsSql(): string {
  const rows = REGION_PRESETS.map((preset, index) => {
    const loadAreas = preset.loadAreas.map(sqlText).join(", ");
    return `    (${index + 1}, ${sqlText(preset.region)}, ${sqlText(preset.loadArea)}, ${sqlText(
      preset.wxHub,
    )}, ${sqlText(preset.weatherRegion)}, ARRAY[${loadAreas}]::text[])`;
  }).join(",\n");

  return `
  SELECT *
  FROM (
    VALUES
${rows}
  ) AS t(sort_order, region, load_area, station_id, weather_region, load_areas)`;
}

function buildDailyShapeSql(holidayValuesSql: string): string {
  return `
WITH params AS (
  SELECT
    $1::date AS current_start,
    $2::date AS current_end_exclusive,
    $3::date AS last_year_start,
    $4::date AS last_year_end_exclusive,
    $5::text AS weather_metric
),
region_presets AS (
${buildRegionPresetsSql()}
),
nerc_holidays AS (
${holidayValuesSql}
),
load_candidates AS (
  SELECT
    preset.sort_order,
    preset.region,
    preset.load_area,
    preset.station_id,
    preset.weather_region,
    cardinality(preset.load_areas) AS expected_source_area_count,
    m.load_area AS source_load_area,
    'current'::text AS period,
    m.datetime_beginning_ept::date AS operating_date,
    m.datetime_beginning_ept,
    m.mw::float8 AS load_mw,
    1 AS priority
  FROM pjm.hrl_load_metered m
  CROSS JOIN params p
  JOIN region_presets preset
    ON m.load_area = ANY(preset.load_areas)
  WHERE m.is_verified = false
    AND m.datetime_beginning_ept >= p.current_start
    AND m.datetime_beginning_ept < p.current_end_exclusive
  UNION ALL
  SELECT
    preset.sort_order,
    preset.region,
    preset.load_area,
    preset.station_id,
    preset.weather_region,
    cardinality(preset.load_areas) AS expected_source_area_count,
    m.load_area AS source_load_area,
    'last_year'::text AS period,
    m.datetime_beginning_ept::date AS operating_date,
    m.datetime_beginning_ept,
    m.mw::float8 AS load_mw,
    1 AS priority
  FROM pjm.hrl_load_metered m
  CROSS JOIN params p
  JOIN region_presets preset
    ON m.load_area = ANY(preset.load_areas)
  WHERE m.is_verified = false
    AND m.datetime_beginning_ept >= p.last_year_start
    AND m.datetime_beginning_ept < p.last_year_end_exclusive
  UNION ALL
  SELECT
    preset.sort_order,
    preset.region,
    preset.load_area,
    preset.station_id,
    preset.weather_region,
    cardinality(preset.load_areas) AS expected_source_area_count,
    prelim.load_area AS source_load_area,
    'current'::text AS period,
    prelim.datetime_beginning_ept::date AS operating_date,
    prelim.datetime_beginning_ept,
    prelim.prelim_load_avg_hourly::float8 AS load_mw,
    3 AS priority
  FROM pjm.hrl_load_prelim prelim
  CROSS JOIN params p
  JOIN region_presets preset
    ON prelim.load_area = ANY(preset.load_areas)
  WHERE prelim.datetime_beginning_ept >= p.current_start
    AND prelim.datetime_beginning_ept < p.current_end_exclusive
  UNION ALL
  SELECT
    preset.sort_order,
    preset.region,
    preset.load_area,
    preset.station_id,
    preset.weather_region,
    cardinality(preset.load_areas) AS expected_source_area_count,
    prelim.load_area AS source_load_area,
    'last_year'::text AS period,
    prelim.datetime_beginning_ept::date AS operating_date,
    prelim.datetime_beginning_ept,
    prelim.prelim_load_avg_hourly::float8 AS load_mw,
    3 AS priority
  FROM pjm.hrl_load_prelim prelim
  CROSS JOIN params p
  JOIN region_presets preset
    ON prelim.load_area = ANY(preset.load_areas)
  WHERE prelim.datetime_beginning_ept >= p.last_year_start
    AND prelim.datetime_beginning_ept < p.last_year_end_exclusive
),
load_hourly AS (
  SELECT
    sort_order,
    region,
    load_area,
    station_id,
    weather_region,
    expected_source_area_count,
    period,
    operating_date,
    datetime_beginning_ept,
    SUM(load_mw) AS load_mw,
    COUNT(DISTINCT source_load_area) AS source_area_count
  FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY region, source_load_area, period, operating_date, datetime_beginning_ept
        ORDER BY priority
      ) AS rn
    FROM load_candidates
  ) ranked
  WHERE rn = 1
  GROUP BY
    sort_order,
    region,
    load_area,
    station_id,
    weather_region,
    expected_source_area_count,
    period,
    operating_date,
    datetime_beginning_ept
),
weather_hourly AS (
  SELECT
    preset.region,
    preset.station_id,
    preset.weather_region,
    'current'::text AS period,
    wobs.observation_time_local::date AS operating_date,
    wobs.observation_time_local,
    MAX(wobs.station_name) AS station_name,
    AVG(
      CASE p.weather_metric
        WHEN 'dewPointF' THEN wobs.dew_point_f::float8
        WHEN 'feelsLikeF' THEN wobs.feels_like_f::float8
        ELSE wobs.temp_f::float8
      END
    ) AS weather_value
  FROM weather.wsi_hourly_observed_temperatures wobs
  CROSS JOIN params p
  JOIN region_presets preset
    ON wobs.station_id = preset.station_id
   AND wobs.region = preset.weather_region
  WHERE wobs.observation_time_local >= p.current_start
    AND wobs.observation_time_local < p.current_end_exclusive
  GROUP BY
    preset.region,
    preset.station_id,
    preset.weather_region,
    wobs.observation_time_local::date,
    wobs.observation_time_local
  UNION ALL
  SELECT
    preset.region,
    preset.station_id,
    preset.weather_region,
    'last_year'::text AS period,
    wobs.observation_time_local::date AS operating_date,
    wobs.observation_time_local,
    MAX(wobs.station_name) AS station_name,
    AVG(
      CASE p.weather_metric
        WHEN 'dewPointF' THEN wobs.dew_point_f::float8
        WHEN 'feelsLikeF' THEN wobs.feels_like_f::float8
        ELSE wobs.temp_f::float8
      END
    ) AS weather_value
  FROM weather.wsi_hourly_observed_temperatures wobs
  CROSS JOIN params p
  JOIN region_presets preset
    ON wobs.station_id = preset.station_id
   AND wobs.region = preset.weather_region
  WHERE wobs.observation_time_local >= p.last_year_start
    AND wobs.observation_time_local < p.last_year_end_exclusive
  GROUP BY
    preset.region,
    preset.station_id,
    preset.weather_region,
    wobs.observation_time_local::date,
    wobs.observation_time_local
),
joined_hourly AS (
  SELECT
    l.sort_order,
    l.region,
    l.load_area,
    l.station_id,
    l.weather_region,
    l.expected_source_area_count,
    l.source_area_count,
    l.period,
    l.operating_date,
    l.datetime_beginning_ept,
    EXTRACT(hour FROM l.datetime_beginning_ept)::int + 1 AS hour_ending,
    EXTRACT(isodow FROM l.datetime_beginning_ept)::int AS iso_dow,
    l.load_mw,
    w.station_name,
    w.weather_value,
    holiday.holiday_date IS NOT NULL AS is_nerc_holiday
  FROM load_hourly l
  JOIN weather_hourly w
    ON w.region = l.region
   AND w.station_id = l.station_id
   AND w.weather_region = l.weather_region
   AND w.period = l.period
   AND w.observation_time_local = l.datetime_beginning_ept
  LEFT JOIN nerc_holidays holiday
    ON holiday.holiday_date = l.operating_date
),
classified_hourly AS (
  SELECT
    *,
    hour_ending BETWEEN 8 AND 23
      AND iso_dow BETWEEN 1 AND 5
      AND NOT is_nerc_holiday AS is_onpeak
  FROM joined_hourly
),
pk_daily AS (
  SELECT
    sort_order,
    region,
    load_area,
    station_id,
    weather_region,
    station_name,
    'PK'::text AS load_shape,
    period,
    operating_date,
    load_mw,
    weather_value,
    expected_source_area_count,
    source_area_count AS min_source_area_count
  FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY region, period, operating_date
        ORDER BY load_mw DESC NULLS LAST, datetime_beginning_ept
      ) AS peak_rank
    FROM classified_hourly
  ) ranked
  WHERE peak_rank = 1
),
shape_hourly AS (
  SELECT
    *,
    'OnPK'::text AS load_shape
  FROM classified_hourly
  WHERE is_onpeak
  UNION ALL
  SELECT
    *,
    'OffPk'::text AS load_shape
  FROM classified_hourly
  WHERE NOT is_onpeak
),
average_daily AS (
  SELECT
    sort_order,
    region,
    load_area,
    station_id,
    weather_region,
    MAX(station_name) AS station_name,
    load_shape,
    period,
    operating_date,
    AVG(load_mw) AS load_mw,
    AVG(weather_value) AS weather_value,
    MAX(expected_source_area_count) AS expected_source_area_count,
    MIN(source_area_count) AS min_source_area_count
  FROM shape_hourly
  GROUP BY
    sort_order,
    region,
    load_area,
    station_id,
    weather_region,
    load_shape,
    period,
    operating_date
),
daily_shapes AS (
  SELECT * FROM pk_daily
  UNION ALL
  SELECT * FROM average_daily
)
SELECT
  region,
  load_area,
  station_id,
  weather_region,
  station_name,
  load_shape,
  period,
  to_char(operating_date, 'YYYY-MM-DD') AS operating_date,
  load_mw,
  weather_value,
  expected_source_area_count,
  min_source_area_count
FROM daily_shapes
ORDER BY sort_order, load_shape, period, operating_date
`;
}

function statusRank(status: ShapeSummaryStatus): number {
  if (status === "missing") return 2;
  if (status === "partial") return 1;
  return 0;
}

function rowStatus(shapes: PayloadShapeSummary[]): ShapeSummaryStatus {
  if (shapes.every((shape) => shape.status === "missing")) return "missing";
  return shapes.some((shape) => shape.status !== "ok") ? "partial" : "ok";
}

function withCompletenessWarnings(
  summary: WeatherNormalizedShapeSummary,
  rows: DailyShapeRow[],
): PayloadShapeSummary {
  const expectedSourceAreaCount = Math.max(...rows.map((row) => toInt(row.expected_source_area_count)), 0);
  const observedSourceAreaCounts = rows
    .map((row) => toNumber(row.min_source_area_count))
    .filter((value): value is number => value !== null);
  const minSourceAreaCount = observedSourceAreaCounts.length ? Math.min(...observedSourceAreaCounts) : null;
  const completenessWarning =
    minSourceAreaCount !== null && expectedSourceAreaCount > 1 && minSourceAreaCount < expectedSourceAreaCount
      ? `Load area member coverage reached ${minSourceAreaCount}/${expectedSourceAreaCount}`
      : null;

  return {
    status: completenessWarning && summary.status === "ok" ? "partial" : summary.status,
    normalizedCurrentMw: summary.normalizedCurrentMw,
    normalizedLastYearMw: summary.normalizedLastYearMw,
    deltaMw: summary.deltaMw,
    deltaPct: summary.deltaPct,
    currentFitDays: summary.currentFitDays,
    lastYearFitDays: summary.lastYearFitDays,
    evaluationDays: summary.evaluationDays,
    currentFitDegree: summary.currentFitDegree,
    lastYearFitDegree: summary.lastYearFitDegree,
    error: [summary.error, completenessWarning].filter(Boolean).join("; ") || null,
  };
}

function pointFromRow(row: DailyShapeRow): WeatherLoadPoint {
  return {
    date: row.operating_date,
    weatherValue: toNumber(row.weather_value),
    loadMw: toNumber(row.load_mw),
  };
}

function stationNameForRows(rows: DailyShapeRow[], fallback: string): string {
  return rows.find((row) => row.station_name)?.station_name ?? fallback;
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request): Promise<ObservedRouteResult> => {
  const { searchParams } = new URL(request.url);
  const iso = parseIso(searchParams.get("iso"));
  if (!iso) {
    return {
      status: 400,
      payload: { error: "Unsupported ISO. Only PJM is available for this route." },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
      dataAsOf: null,
    };
  }

  const requestedSeason: PowerSeasonSelection = parsePowerSeasonSelection(searchParams.get("season"));
  const weatherMetric = parseWeatherMetric(searchParams.get("weatherMetric"));
  const asOfDate = parseAsOfDate(searchParams.get("asOfDate"));
  const seasonWindow = asOfDate
    ? resolvePowerSeasonWindow(requestedSeason, asOfDate)
    : resolvePowerSeasonWindow(requestedSeason);
  const holidayValuesSql = buildNercOffPeakDaysValuesSql(
    Math.min(calendarYear(seasonWindow.lastYearStart), calendarYear(seasonWindow.currentStart)),
    Math.max(calendarYear(seasonWindow.lastYearEnd), calendarYear(seasonWindow.currentEnd)),
  );

  const dailyRows = await query<DailyShapeRow>(
    buildDailyShapeSql(holidayValuesSql),
    [
      seasonWindow.currentStart,
      seasonWindow.currentEndExclusive,
      seasonWindow.lastYearStart,
      seasonWindow.lastYearEndExclusive,
      weatherMetric,
    ],
  );

  const rows = REGION_PRESETS.map((preset) => {
    const regionRows = dailyRows.filter((row) => row.region === preset.region);
    const shapes = Object.fromEntries(
      SHAPE_MAP.map(({ sql, key }) => {
        const shapeRows = regionRows.filter((row) => row.load_shape === sql);
        const currentPoints = shapeRows
          .filter((row) => row.period === "current")
          .map(pointFromRow);
        const lastYearPoints = shapeRows
          .filter((row) => row.period === "last_year")
          .map(pointFromRow);
        const summary = withCompletenessWarnings(
          buildWeatherNormalizedShapeSummary(currentPoints, lastYearPoints),
          shapeRows,
        );

        return [key, summary];
      }),
    ) as Record<PayloadLoadShape, PayloadShapeSummary>;
    const shapeList = SHAPE_MAP.map(({ key }) => shapes[key]);
    const status = rowStatus(shapeList);
    const error = shapeList
      .filter((shape) => shape.error)
      .sort((left, right) => statusRank(right.status) - statusRank(left.status))
      .map((shape) => shape.error)
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .join("; ");

    return {
      region: preset.region,
      loadArea: preset.loadArea,
      wxHub: preset.wxHub,
      stationId: preset.wxHub,
      stationName: stationNameForRows(regionRows, preset.wxHub),
      status,
      error: error || null,
      shapes,
    };
  });

  return {
    payload: {
      iso,
      source: "pjm.hrl_load_metered is_verified=false fallback pjm.hrl_load_prelim + weather.wsi_hourly_observed_temperatures",
      selected: {
        season: seasonWindow.season,
        requestedSeason: seasonWindow.requestedSeason,
        seasonLabel: seasonWindow.label,
        weatherMetric,
        weatherMetricLabel: WEATHER_METRIC_LABELS[weatherMetric],
        asOfDate: seasonWindow.asOfDate,
      },
      windows: {
        cy: {
          start: seasonWindow.currentStart,
          end: seasonWindow.currentEnd,
          endExclusive: seasonWindow.currentEndExclusive,
        },
        ly: {
          start: seasonWindow.lastYearStart,
          end: seasonWindow.lastYearEnd,
          endExclusive: seasonWindow.lastYearEndExclusive,
        },
      },
      rows,
      summary: {
        rowCount: rows.length,
        okRowCount: rows.filter((row) => row.status === "ok").length,
        partialRowCount: rows.filter((row) => row.status === "partial").length,
        missingRowCount: rows.filter((row) => row.status === "missing").length,
      },
    },
    headers: {
      "Cache-Control": CACHE_HEADER,
      "X-Pjm-Load-Growth-Season-Summary-Cache": "MISS",
    },
    rowCount: dailyRows.length,
    dataAsOf: seasonWindow.currentEnd,
  };
});
