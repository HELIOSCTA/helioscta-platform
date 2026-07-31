import {
  observedJsonRoute,
  type ObservedRouteResult,
} from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import { localOnlyObservedNotFound } from "@/lib/server/localOnlyApi";
import {
  getCachedRouteValue,
  normalizedSearchCacheKey,
  routeCacheHeaders,
} from "@/lib/server/routeCache";
import {
  EIA_DEFAULT_HEAT_RATE_MMBTU_PER_MWH,
  EIA_GENERATION_SEASON_OPTIONS,
  EIA_GENERATION_SOURCE_TABLE,
  EIA_REGION_DATA_SOURCE_TABLE,
  EIA_WEATHER_DEGREE_DAY_SOURCE_TABLE,
  getEiaGenerationRegion,
  type EiaGenerationDailyRow,
  type EiaGenerationKpi,
  type EiaGenerationMonthlyPayload,
  type EiaGenerationMetricKey,
  type EiaGenerationPayload,
  type EiaGenerationRegionalHealthItem,
  type EiaGenerationRegionalModelingPayload,
  type EiaGenerationRegionalModelRow,
  type EiaGenerationRegionConfig,
  type EiaGenerationSeason,
  type EiaGenerationYoyMtdPayload,
  type EiaGenerationYoyStackRow,
  type EiaGenerationWeatherBucket,
  type EiaGenerationWeatherPoint,
  type EiaGenerationWeatherSeasonData,
} from "@/lib/eiaGeneration";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_TTL_SECONDS = 300;
const CACHE_HEADER = `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=60`;
const TABLE_LOOKBACK_DAYS = 15;
const KPI_LOOKBACK_DAYS = 30;
const HOURS_PER_DAY = 24;
const WEATHER_START_DATE = "2019-01-01";
const MAX_HISTORICAL_WEATHER_POINTS = 600;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type WeatherMetricName = "electric_cdd" | "electric_hdd";

const ROUTE_CONFIG = {
  route: "/api/eia-generation",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60, process-cache=300",
  owner: "frontend",
  purpose: "Local-dev EIA-930 daily generation, demand, and weather dashboard",
  p95TargetMs: 1_500,
  freshnessSource:
    "eia.eia_930_daily_generation_by_fuel + eia.eia_930_daily_region_data scrape_run_at_utc",
} as const;

const KPI_CONFIG: Array<{
  key: EiaGenerationMetricKey;
  label: string;
  valueKey: keyof EiaGenerationDailyRow;
}> = [
  { key: "gas", label: "Gas % Thermal", valueKey: "gasThermalPct" },
  { key: "coal", label: "Coal %", valueKey: "coalSharePct" },
  { key: "nuke", label: "Nuke %", valueKey: "nukeSharePct" },
  { key: "hydro", label: "Hydro %", valueKey: "hydroSharePct" },
  { key: "wind", label: "Wind %", valueKey: "windSharePct" },
  { key: "solar", label: "Solar %", valueKey: "solarSharePct" },
  { key: "other", label: "Other %", valueKey: "otherSharePct" },
];

interface SourceMetaRow {
  row_count: number | string;
  min_period: string | null;
  max_period: string | null;
  latest_scrape_run_at: string | null;
  latest_update_at: string | null;
  respondent_name: string | null;
  fueltype_count: number | string;
  timezone_count: number | string;
}

interface RegionMetaRow {
  row_count: number | string;
  min_period: string | null;
  max_period: string | null;
  latest_scrape_run_at: string | null;
  latest_update_at: string | null;
  respondent_name: string | null;
  type_count: number | string;
  timezone_count: number | string;
}

interface FuelDbRow {
  period: string;
  respondent_name: string | null;
  fueltype: string;
  type_name: string | null;
  timezone: string;
  value: number | string | null;
  value_units: string | null;
  scrape_run_at_utc: string | null;
  updated_at: string | null;
}

interface RegionDbRow {
  period: string;
  type: string;
  type_name: string | null;
  timezone: string;
  value: number | string | null;
  value_units: string | null;
  scrape_run_at_utc: string | null;
  updated_at: string | null;
}

interface WeatherDbRow {
  observation_date: string;
  entity_id: string;
  metric_name: WeatherMetricName;
  metric_value: number | string | null;
  metric_unit: string | null;
  scrape_run_at_utc: string | null;
  updated_at: string | null;
}

interface DailyAccumulator {
  date: string;
  respondentName: string | null;
  gasMw: number | null;
  coalMw: number | null;
  nukeMw: number | null;
  hydroMw: number | null;
  windMw: number | null;
  solarMw: number | null;
  otherMw: number | null;
  netGenerationMw: number | null;
}

interface RegionMetrics {
  date: string;
  demandMw: number | null;
  netGenerationMw: number | null;
  asOf: string | null;
}

function parseIsoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
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

function pct(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return round((numerator / denominator) * 100, 2);
}

function addValue(current: number | null, value: number | null): number | null {
  if (value === null) return current;
  return (current ?? 0) + value;
}

function subDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - days);
  return parsed.toISOString().slice(0, 10);
}

function priorYearDate(date: string, priorYear: number): string {
  return `${priorYear}-${date.slice(5)}`;
}

function maxStamp(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function minDate(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(0) ?? null;
}

function valueForKpi(row: EiaGenerationDailyRow | undefined, key: keyof EiaGenerationDailyRow): number | null {
  const value = row?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bucketForFuel(fueltype: string): keyof Pick<
  DailyAccumulator,
  "gasMw" | "coalMw" | "nukeMw" | "hydroMw" | "windMw" | "solarMw" | "otherMw"
> {
  if (fueltype === "NG") return "gasMw";
  if (fueltype === "COL") return "coalMw";
  if (fueltype === "NUC") return "nukeMw";
  if (fueltype === "WAT") return "hydroMw";
  if (fueltype === "WND" || fueltype === "WNB") return "windMw";
  if (fueltype === "SUN" || fueltype === "SNB") return "solarMw";
  return "otherMw";
}

function metricForSeason(season: EiaGenerationSeason): {
  metricName: WeatherMetricName;
  metricLabel: string;
} {
  return season === "summer"
    ? { metricName: "electric_cdd", metricLabel: "Electric CDD" }
    : { metricName: "electric_hdd", metricLabel: "Electric HDD" };
}

function parseSeason(value: string | null): EiaGenerationSeason | null {
  return value === "summer" || value === "winter" ? value : null;
}

function seasonOption(season: EiaGenerationSeason) {
  return EIA_GENERATION_SEASON_OPTIONS.find((option) => option.key === season);
}

function seasonMonths(season: EiaGenerationSeason): number[] {
  return seasonOption(season)?.months ?? [];
}

function seasonForDate(date: string): EiaGenerationSeason {
  const month = Number.parseInt(date.slice(5, 7), 10);
  return seasonIncludesMonth("winter", month) ? "winter" : "summer";
}

function seasonDayIndex(season: EiaGenerationSeason, monthDay: string): number {
  const month = Number.parseInt(monthDay.slice(0, 2), 10);
  const day = Number.parseInt(monthDay.slice(3, 5), 10);
  const monthIndex = seasonMonths(season).indexOf(month);
  return (monthIndex === -1 ? month : monthIndex) * 40 + day;
}

function buildPendingWeatherSeason({
  season,
  region,
  currentYear,
  priorYear,
  message,
}: {
  season: EiaGenerationSeason;
  region: EiaGenerationRegionConfig;
  currentYear: number | null;
  priorYear: number | null;
  message: string;
}): EiaGenerationWeatherSeasonData {
  const { metricName, metricLabel } = metricForSeason(season);
  return {
    season,
    status: "source_pending",
    entityId: region.weatherEntity,
    entityLabel: region.weatherEntityLabel,
    metricName,
    metricLabel,
    currentYear,
    priorYear,
    historicalPoints: [],
    currentPoints: [],
    priorPoints: [],
    bucketMedians: [],
    anomalyRows: [],
    currentAvgAnomalyMw: null,
    priorAvgAnomalyMw: null,
    message,
  };
}

function buildPendingWeatherBySeason(
  region: EiaGenerationRegionConfig,
  message: string,
  currentYear: number | null = null,
  priorYear: number | null = null,
): Record<EiaGenerationSeason, EiaGenerationWeatherSeasonData> {
  return {
    summer: buildPendingWeatherSeason({
      season: "summer",
      region,
      currentYear,
      priorYear,
      message,
    }),
    winter: buildPendingWeatherSeason({
      season: "winter",
      region,
      currentYear,
      priorYear,
      message,
    }),
  };
}

function buildMonthlyPayload({
  daily,
  currentYear,
  priorYear,
}: {
  daily: EiaGenerationDailyRow[];
  currentYear: number | null;
  priorYear: number | null;
}): EiaGenerationMonthlyPayload {
  const rows = MONTH_LABELS.map((month, index) => {
    const monthNumber = index + 1;
    const currentRows =
      currentYear === null
        ? []
        : daily.filter((row) => row.year === currentYear && row.month === monthNumber);
    const maxCurrentDay = currentRows.length
      ? Math.max(...currentRows.map((row) => row.day))
      : 0;
    const priorRows =
      priorYear === null || maxCurrentDay === 0
        ? []
        : daily.filter(
            (row) =>
              row.year === priorYear &&
              row.month === monthNumber &&
              row.day <= maxCurrentDay,
          );
    const demandMw = avgDailyValue(currentRows, (row) => row.demandMw);
    const priorDemandMw = avgDailyValue(priorRows, (row) => row.demandMw);
    const netGenerationMw = avgDailyValue(currentRows, (row) => row.netGenerationMw);
    const priorNetGenerationMw = avgDailyValue(priorRows, (row) => row.netGenerationMw);
    const gasMw = avgDailyValue(currentRows, (row) => row.gasMw);
    const priorGasMw = avgDailyValue(priorRows, (row) => row.gasMw);
    const coalMw = avgDailyValue(currentRows, (row) => row.coalMw);
    const priorCoalMw = avgDailyValue(priorRows, (row) => row.coalMw);
    const nukeMw = avgDailyValue(currentRows, (row) => row.nukeMw);
    const hydroMw = avgDailyValue(currentRows, (row) => row.hydroMw);
    const priorHydroMw = avgDailyValue(priorRows, (row) => row.hydroMw);
    const windMw = avgDailyValue(currentRows, (row) => row.windMw);
    const priorWindMw = avgDailyValue(priorRows, (row) => row.windMw);
    const solarMw = avgDailyValue(currentRows, (row) => row.solarMw);
    const priorSolarMw = avgDailyValue(priorRows, (row) => row.solarMw);
    const otherMw = avgDailyValue(currentRows, (row) => row.otherMw);
    const renewableMw = avgDailyValue(currentRows, (row) =>
      dailyFuelSum(row, ["hydroMw", "windMw", "solarMw"]),
    );
    const priorRenewableMw = avgDailyValue(priorRows, (row) =>
      dailyFuelSum(row, ["hydroMw", "windMw", "solarMw"]),
    );
    const gasSharePct = pct(gasMw, netGenerationMw);
    const priorGasSharePct = pct(priorGasMw, priorNetGenerationMw);

    return {
      month,
      monthNumber,
      currentYear,
      priorYear,
      currentDayCount: currentRows.length,
      priorDayCount: priorRows.length,
      demandMw,
      priorDemandMw,
      demandDeltaMw:
        demandMw === null || priorDemandMw === null ? null : round(demandMw - priorDemandMw),
      netGenerationMw,
      priorNetGenerationMw,
      netGenerationDeltaMw:
        netGenerationMw === null || priorNetGenerationMw === null
          ? null
          : round(netGenerationMw - priorNetGenerationMw),
      gasMw,
      priorGasMw,
      gasDeltaMw: gasMw === null || priorGasMw === null ? null : round(gasMw - priorGasMw),
      coalMw,
      priorCoalMw,
      coalDeltaMw: coalMw === null || priorCoalMw === null ? null : round(coalMw - priorCoalMw),
      nukeMw,
      hydroMw,
      priorHydroMw,
      hydroDeltaMw:
        hydroMw === null || priorHydroMw === null ? null : round(hydroMw - priorHydroMw),
      windMw,
      priorWindMw,
      windDeltaMw: windMw === null || priorWindMw === null ? null : round(windMw - priorWindMw),
      solarMw,
      priorSolarMw,
      solarDeltaMw:
        solarMw === null || priorSolarMw === null ? null : round(solarMw - priorSolarMw),
      otherMw,
      renewableMw,
      priorRenewableMw,
      renewableDeltaMw:
        renewableMw === null || priorRenewableMw === null
          ? null
          : round(renewableMw - priorRenewableMw),
      gasSharePct,
      priorGasSharePct,
      gasShareDeltaPctPoint:
        gasSharePct === null || priorGasSharePct === null
          ? null
          : round(gasSharePct - priorGasSharePct, 1),
      gasThermalPct: pct(gasMw, sum([gasMw, coalMw])),
      priorGasThermalPct: pct(priorGasMw, sum([priorGasMw, priorCoalMw])),
      coalSharePct: pct(coalMw, netGenerationMw),
      nukeSharePct: pct(nukeMw, netGenerationMw),
      hydroSharePct: pct(hydroMw, netGenerationMw),
      windSharePct: pct(windMw, netGenerationMw),
      solarSharePct: pct(solarMw, netGenerationMw),
      otherSharePct: pct(otherMw, netGenerationMw),
      renewableSharePct: pct(renewableMw, netGenerationMw),
      priorRenewableSharePct: pct(priorRenewableMw, priorNetGenerationMw),
    };
  });

  const hasRows = rows.some((row) => row.currentDayCount > 0);
  return {
    status: hasRows ? "available" : "source_pending",
    aggregationGrain:
      "month x respondent; monthly values are averages of daily average MW rows",
    rows,
    message: hasRows ? null : "No current-year EIA-930 generation rows are available.",
  };
}

function buildRegionalModelingPayload({
  daily,
  currentYear,
}: {
  daily: EiaGenerationDailyRow[];
  currentYear: number | null;
}): EiaGenerationRegionalModelingPayload {
  const modelRows: EiaGenerationRegionalModelRow[] = MONTH_LABELS.map((month, index) => {
    const monthNumber = index + 1;
    const rows =
      currentYear === null
        ? []
        : daily.filter((row) => row.year === currentYear && row.month === monthNumber);
    const demandMw = avgDailyValue(rows, (row) => row.demandMw);
    const netGenerationMw = avgDailyValue(rows, (row) => row.netGenerationMw);
    const gasMw = avgDailyValue(rows, (row) => row.gasMw);
    const coalMw = avgDailyValue(rows, (row) => row.coalMw);
    const thermalMw = avgDailyValue(rows, (row) => dailyFuelSum(row, ["gasMw", "coalMw"]));
    const nuclearHydroMw = avgDailyValue(rows, (row) => dailyFuelSum(row, ["nukeMw", "hydroMw"]));
    const renewableMw = avgDailyValue(rows, (row) => dailyFuelSum(row, ["windMw", "solarMw"]));
    const residualMw =
      demandMw === null || netGenerationMw === null ? null : round(demandMw - netGenerationMw);
    const gasBurnBcfd = bcfdFromGasMw(gasMw);
    const monthlyGasBcf = sumBcf(rows);
    const annualizedGasBcf =
      monthlyGasBcf === null || !currentYear
        ? null
        : round((monthlyGasBcf / Math.max(rows.length, 1)) * 365, 1);

    return {
      month,
      monthNumber,
      demandMw,
      netGenerationMw,
      gasMw,
      coalMw,
      thermalMw,
      nuclearHydroMw,
      renewableMw,
      residualMw,
      gasBurnBcfd,
      monthlyGasBcf,
      annualizedGasBcf,
      days: rows.length,
      status: rows.length && gasMw !== null ? "available" : "source_pending",
    };
  });

  const currentRows =
    currentYear === null ? [] : daily.filter((row) => row.year === currentYear);
  const regionMissingInputs = currentRows.filter(
    (row) => row.demandMw === null || row.netGenerationMw === null,
  ).length;
  const criticalMissingInputs = currentRows.filter((row) => row.gasMw === null).length;
  const coalGasZeroFallbacks = currentRows.filter(
    (row) => row.gasMw === 0 || row.coalMw === 0,
  ).length;
  const health: EiaGenerationRegionalHealthItem[] = [
    {
      key: "region_missing_inputs",
      label: "Region Missing Inputs",
      value: regionMissingInputs,
      unit: "count",
      status: regionMissingInputs > 0 ? "warning" : "ok",
      detail: "Current-year rows missing EIA demand or net generation.",
    },
    {
      key: "region_critical_missing",
      label: "Region Critical Missing",
      value: criticalMissingInputs,
      unit: "count",
      status: criticalMissingInputs > 0 ? "warning" : "ok",
      detail: "Current-year rows missing gas generation needed for Bcf/d conversion.",
    },
    {
      key: "coal_gas_zero_fallbacks",
      label: "Coal/Gas Zero Fallbacks",
      value: coalGasZeroFallbacks,
      unit: "count",
      status: coalGasZeroFallbacks > 0 ? "warning" : "ok",
      detail: "Rows where coal or gas is zero. No fallback value is applied.",
    },
    {
      key: "thermal_bcfd_fallbacks",
      label: "Thermal + Bcfd Fallbacks",
      value: "Source pending",
      unit: "status",
      status: "source_pending",
      detail: "EA defaults, snapshot release, and persisted heat-rate overrides are not promoted yet.",
    },
  ];

  const hasModelRows = modelRows.some((row) => row.status === "available");
  return {
    status: hasModelRows ? "available" : "source_pending",
    defaultHeatRateMmbtuPerMwh: EIA_DEFAULT_HEAT_RATE_MMBTU_PER_MWH,
    heatRateSourceStatus: "default",
    heatRateFormula:
      "gas_avg_mw x heat_rate_mmbtu_per_mwh x 24 / 1,000,000 = bcf_per_day",
    snapshotReleaseAt: null,
    snapshotStatus: "source_pending",
    health,
    powerBalanceRows: modelRows,
    gasDemandRows: modelRows,
    tradingViewRows: modelRows,
    message:
      "Gas burn is derived from EIA gas generation and the dashboard default heat rate. EA defaults, snapshot release values, and persisted overrides remain source-pending.",
  };
}

function buildYoyMtdPayload({
  daily,
  selectedDate,
  currentYear,
  priorYear,
}: {
  daily: EiaGenerationDailyRow[];
  selectedDate: string | null;
  currentYear: number | null;
  priorYear: number | null;
}): EiaGenerationYoyMtdPayload {
  if (!selectedDate || !currentYear || !priorYear) {
    return {
      status: "source_pending",
      selectedMonth: null,
      selectedDay: null,
      heatRateMmbtuPerMwh: EIA_DEFAULT_HEAT_RATE_MMBTU_PER_MWH,
      kpis: [],
      cumulativePath: [],
      attribution: [],
      dailyDeltas: [],
      stackRows: [],
      monthEndProjectionBcf: null,
      message: "No selected EIA date is available for MTD calculations.",
    };
  }

  const selectedMonth = Number.parseInt(selectedDate.slice(5, 7), 10);
  const selectedDay = Number.parseInt(selectedDate.slice(8, 10), 10);
  const currentRows = daily.filter(
    (row) => row.year === currentYear && row.month === selectedMonth && row.day <= selectedDay,
  );
  const priorRows = daily.filter(
    (row) => row.year === priorYear && row.month === selectedMonth && row.day <= selectedDay,
  );
  const priorFullMonthRows = daily.filter(
    (row) => row.year === priorYear && row.month === selectedMonth,
  );
  const currentByDay = new Map(currentRows.map((row) => [row.day, row]));
  const priorByDay = new Map(priorRows.map((row) => [row.day, row]));

  let currentCumulative = 0;
  let priorCumulative = 0;
  const cumulativePath = Array.from({ length: selectedDay }, (_, index) => {
    const day = index + 1;
    const currentRow = currentByDay.get(day);
    const priorRow = priorByDay.get(day);
    const currentBcfd = currentRow ? bcfForDailyRow(currentRow) : null;
    const priorBcfd = priorRow ? bcfForDailyRow(priorRow) : null;
    if (currentBcfd !== null) currentCumulative += currentBcfd;
    if (priorBcfd !== null) priorCumulative += priorBcfd;
    return {
      day,
      currentDate: currentRow?.date ?? null,
      priorDate: priorRow?.date ?? null,
      currentBcfd,
      priorBcfd,
      deltaBcfd:
        currentBcfd === null || priorBcfd === null ? null : round(currentBcfd - priorBcfd, 3),
      currentCumulativeBcf: currentBcfd === null ? null : round(currentCumulative, 2),
      priorCumulativeBcf: priorBcfd === null ? null : round(priorCumulative, 2),
      deltaCumulativeBcf:
        currentBcfd === null || priorBcfd === null
          ? null
          : round(currentCumulative - priorCumulative, 2),
    };
  });

  const currentAvgBcfd = round(avg(currentRows.map((row) => bcfForDailyRow(row))), 3);
  const priorAvgBcfd = round(avg(priorRows.map((row) => bcfForDailyRow(row))), 3);
  const currentTotalBcf = sumBcf(currentRows);
  const priorTotalBcf = sumBcf(priorRows);
  const monthDays = daysInMonth(currentYear, selectedMonth);
  const monthEndProjectionBcf =
    currentTotalBcf === null || !currentRows.length
      ? null
      : round((currentTotalBcf / currentRows.length) * monthDays, 2);
  const priorFullMonthBcf = sumBcf(priorFullMonthRows);
  const deltaAvgBcfd =
    currentAvgBcfd === null || priorAvgBcfd === null ? null : round(currentAvgBcfd - priorAvgBcfd, 3);
  const demandDeltaMw = round(
    (avg(currentRows.map((row) => row.demandMw)) ?? 0) -
      (avg(priorRows.map((row) => row.demandMw)) ?? 0),
  );
  const coalMwDelta = round(
    (avg(currentRows.map((row) => row.coalMw)) ?? 0) -
      (avg(priorRows.map((row) => row.coalMw)) ?? 0),
  );
  const windSolarDeltaMw = round(
    (avg(currentRows.map((row) => dailyFuelSum(row, ["windMw", "solarMw"]))) ?? 0) -
      (avg(priorRows.map((row) => dailyFuelSum(row, ["windMw", "solarMw"]))) ?? 0),
  );
  const nukeHydroDeltaMw = round(
    (avg(currentRows.map((row) => dailyFuelSum(row, ["nukeMw", "hydroMw"]))) ?? 0) -
      (avg(priorRows.map((row) => dailyFuelSum(row, ["nukeMw", "hydroMw"]))) ?? 0),
  );

  const stackValue = (
    selector: (row: EiaGenerationDailyRow) => number | null,
    unit: EiaGenerationYoyStackRow["unit"],
  ): Pick<EiaGenerationYoyStackRow, "unit" | "current" | "prior" | "delta" | "status"> => {
    const current = round(avg(currentRows.map(selector)), unit === "pct" || unit === "bcfd" ? 3 : 1);
    const prior = round(avg(priorRows.map(selector)), unit === "pct" || unit === "bcfd" ? 3 : 1);
    return {
      unit,
      current,
      prior,
      delta: current === null || prior === null ? null : round(current - prior, unit === "pct" || unit === "bcfd" ? 3 : 1),
      status: statusForValues([current, prior]),
    };
  };

  return {
    status: currentAvgBcfd !== null && priorAvgBcfd !== null ? "available" : "source_pending",
    selectedMonth,
    selectedDay,
    heatRateMmbtuPerMwh: EIA_DEFAULT_HEAT_RATE_MMBTU_PER_MWH,
    kpis: [
      {
        key: "currentAvgBcfd",
        label: "CY MTD Avg Bcf/d",
        unit: "bcfd",
        current: currentAvgBcfd,
        prior: null,
        delta: null,
        status: currentAvgBcfd === null ? "source_pending" : "available",
      },
      {
        key: "priorAvgBcfd",
        label: "LY MTD Avg Bcf/d",
        unit: "bcfd",
        current: priorAvgBcfd,
        prior: null,
        delta: null,
        status: priorAvgBcfd === null ? "source_pending" : "available",
      },
      {
        key: "deltaAvgBcfd",
        label: "YoY Delta Bcf/d",
        unit: "bcfd",
        current: currentAvgBcfd,
        prior: priorAvgBcfd,
        delta: deltaAvgBcfd,
        status: deltaAvgBcfd === null ? "source_pending" : "available",
      },
      {
        key: "currentTotalBcf",
        label: "CY MTD Total Bcf",
        unit: "bcf",
        current: currentTotalBcf,
        prior: null,
        delta: null,
        status: currentTotalBcf === null ? "source_pending" : "available",
      },
      {
        key: "priorTotalBcf",
        label: "LY MTD Total Bcf",
        unit: "bcf",
        current: priorTotalBcf,
        prior: null,
        delta: null,
        status: priorTotalBcf === null ? "source_pending" : "available",
      },
      {
        key: "monthEndProjectionDeltaBcf",
        label: "Month-End Projection vs LY",
        unit: "bcf",
        current: monthEndProjectionBcf,
        prior: priorFullMonthBcf,
        delta:
          monthEndProjectionBcf === null || priorFullMonthBcf === null
            ? null
            : round(monthEndProjectionBcf - priorFullMonthBcf, 2),
        status:
          monthEndProjectionBcf === null || priorFullMonthBcf === null
            ? "source_pending"
            : "available",
      },
    ],
    cumulativePath,
    attribution: [
      {
        key: "load",
        label: "Load",
        valueBcfd: null,
        status: "source_pending",
        detail: `Demand delta: ${demandDeltaMw === null ? "pending" : `${demandDeltaMw} MW`}. Conversion attribution model not promoted.`,
      },
      {
        key: "renewables",
        label: "Renewables",
        valueBcfd: null,
        status: "source_pending",
        detail: `Wind + solar delta: ${windSolarDeltaMw === null ? "pending" : `${windSolarDeltaMw} MW`}. Gas displacement model not promoted.`,
      },
      {
        key: "coal_switch",
        label: "Coal Switch",
        valueBcfd: null,
        status: "source_pending",
        detail: `Coal delta: ${coalMwDelta === null ? "pending" : `${coalMwDelta} MW`}. Coal-to-gas switching model not promoted.`,
      },
      {
        key: "nuke_hydro",
        label: "Nuke + Hydro",
        valueBcfd: null,
        status: "source_pending",
        detail: `Nuclear + hydro delta: ${nukeHydroDeltaMw === null ? "pending" : `${nukeHydroDeltaMw} MW`}. Attribution model not promoted.`,
      },
      {
        key: "residual",
        label: "Residual",
        valueBcfd: deltaAvgBcfd,
        status: deltaAvgBcfd === null ? "source_pending" : "available",
        detail: "Actual YoY gas burn delta after source-pending attribution components.",
      },
    ],
    dailyDeltas: cumulativePath,
    stackRows: [
      {
        section: "Gas Burn",
        metric: "Avg Bcf/d",
        ...stackValue((row) => bcfForDailyRow(row), "bcfd"),
      },
      {
        section: "Gas Burn",
        metric: "Total Bcf",
        unit: "bcf",
        current: currentTotalBcf,
        prior: priorTotalBcf,
        delta: currentTotalBcf === null || priorTotalBcf === null ? null : round(currentTotalBcf - priorTotalBcf, 2),
        status: statusForValues([currentTotalBcf, priorTotalBcf]),
      },
      {
        section: "Demand",
        metric: "Avg Demand MW",
        ...stackValue((row) => row.demandMw, "mw"),
      },
      {
        section: "Supply",
        metric: "Net Gen MW",
        ...stackValue((row) => row.netGenerationMw, "mw"),
      },
      {
        section: "Supply",
        metric: "Gas MW",
        ...stackValue((row) => row.gasMw, "mw"),
      },
      {
        section: "Supply",
        metric: "Coal MW",
        ...stackValue((row) => row.coalMw, "mw"),
      },
      {
        section: "Supply",
        metric: "Wind + Solar MW",
        ...stackValue((row) => dailyFuelSum(row, ["windMw", "solarMw"]), "mw"),
      },
      {
        section: "Supply",
        metric: "Nuke + Hydro MW",
        ...stackValue((row) => dailyFuelSum(row, ["nukeMw", "hydroMw"]), "mw"),
      },
      {
        section: "Supply",
        metric: "Gas % Thermal",
        ...stackValue((row) => row.gasThermalPct, "pct"),
      },
    ],
    monthEndProjectionBcf,
    message:
      "Gas burn MTD is derived from EIA gas generation and the dashboard default heat rate. Load, renewables, coal-switch, and nuke/hydro attribution components remain source-pending until a promoted attribution model exists.",
  };
}

function buildEmptyPayload({
  region,
  requestedDate,
  meta,
}: {
  region: EiaGenerationRegionConfig;
  requestedDate: string | null;
  meta: SourceMetaRow | undefined;
}): EiaGenerationPayload {
  const rowCount = toInteger(meta?.row_count);
  return {
    product: "eia-generation",
    source: "EIA-930 daily generation and region data",
    region,
    requestedDate,
    selectedDate: null,
    latestDate: meta?.max_period ?? null,
    currentYear: null,
    priorYear: null,
    asOf: maxStamp([meta?.latest_scrape_run_at ?? null, meta?.latest_update_at ?? null]),
    currentTable: [],
    priorTable: [],
    daily: [],
    kpis: KPI_CONFIG.map((item) => ({
      key: item.key,
      label: item.label,
      valuePct: null,
      deltaPctPoint: null,
      sparkline: [],
    })),
    monthly: buildMonthlyPayload({
      daily: [],
      currentYear: null,
      priorYear: null,
    }),
    regionalModeling: buildRegionalModelingPayload({
      daily: [],
      currentYear: null,
    }),
    yoyMtd: buildYoyMtdPayload({
      daily: [],
      selectedDate: null,
      currentYear: null,
      priorYear: null,
    }),
    freshness: {
      sourceTable: `${EIA_GENERATION_SOURCE_TABLE} + ${EIA_REGION_DATA_SOURCE_TABLE}`,
      sourceSystem: "EIA Open Data API v2 / electricity/rto daily endpoints",
      rowCount,
      minPeriod: meta?.min_period ?? null,
      maxPeriod: meta?.max_period ?? null,
      latestScrapeRunAt: meta?.latest_scrape_run_at ?? null,
      latestUpdateAt: meta?.latest_update_at ?? null,
      respondent: region.respondent,
      respondentName: meta?.respondent_name ?? region.name,
      selectedTimezone: region.preferredTimezone,
      rawGrain:
        "generation: period x respondent x fueltype x timezone; demand: period x respondent x type x timezone",
      presentationGrain: "period x respondent after preferred-timezone selection",
      units: "Source values are daily MWh; dashboard values are daily average MW.",
    },
    weatherBySeason: buildPendingWeatherBySeason(
      region,
      "EIA generation rows are not available for this region.",
    ),
    demandStatus: "source_pending",
    weatherStatus: "source_pending",
    metadata: {
      fuelValueUnit: "megawatthours",
      dashboardValueUnit: "average_mw",
      conversion: "daily_mwh_divided_by_24",
      thermalDefinition: "gas_plus_coal",
      sourceContract:
        "EIA-930 daily generation by fuel is joined to EIA-930 daily region demand/net generation by preferred timezone.",
      demandSourceTable: EIA_REGION_DATA_SOURCE_TABLE,
      weatherSourceTable: EIA_WEATHER_DEGREE_DAY_SOURCE_TABLE,
      weatherMappingContract:
        "WSI broad electric degree-day entities are mapped explicitly per dashboard region.",
      missingSources: [
        "EIA-930 daily region demand rows",
        "Weather response rows",
      ],
    },
  };
}

function aggregateRegionMetrics(rows: RegionDbRow[]): Map<string, RegionMetrics> {
  const byDate = new Map<string, RegionMetrics>();

  for (const row of rows) {
    const valueMwh = toNumber(row.value);
    const avgMw = valueMwh === null ? null : valueMwh / HOURS_PER_DAY;
    const current =
      byDate.get(row.period) ??
      {
        date: row.period,
        demandMw: null,
        netGenerationMw: null,
        asOf: null,
      };

    if (row.type === "D") current.demandMw = avgMw;
    if (row.type === "NG") current.netGenerationMw = avgMw;
    current.asOf = maxStamp([current.asOf, row.scrape_run_at_utc, row.updated_at]);
    byDate.set(row.period, current);
  }

  return byDate;
}

function aggregateDaily(
  rows: FuelDbRow[],
  regionMetrics: Map<string, RegionMetrics>,
): EiaGenerationDailyRow[] {
  const byDate = new Map<string, DailyAccumulator>();

  for (const row of rows) {
    const valueMwh = toNumber(row.value);
    const avgMw = valueMwh === null ? null : valueMwh / HOURS_PER_DAY;
    const accumulator =
      byDate.get(row.period) ??
      {
        date: row.period,
        respondentName: row.respondent_name,
        gasMw: null,
        coalMw: null,
        nukeMw: null,
        hydroMw: null,
        windMw: null,
        solarMw: null,
        otherMw: null,
        netGenerationMw: null,
      };

    const bucket = bucketForFuel(row.fueltype);
    accumulator[bucket] = addValue(accumulator[bucket], avgMw);
    accumulator.netGenerationMw = addValue(accumulator.netGenerationMw, avgMw);
    byDate.set(row.period, accumulator);
  }

  return Array.from(byDate.values())
    .map((row) => {
      const year = Number.parseInt(row.date.slice(0, 4), 10);
      const month = Number.parseInt(row.date.slice(5, 7), 10);
      const day = Number.parseInt(row.date.slice(8, 10), 10);
      const thermalMw = addValue(row.gasMw, row.coalMw);
      const regionValues = regionMetrics.get(row.date);
      const demandMw = round(regionValues?.demandMw ?? null);
      const netGenerationMw = round(regionValues?.netGenerationMw ?? row.netGenerationMw);
      const gasMw = round(row.gasMw);
      const coalMw = round(row.coalMw);
      const nukeMw = round(row.nukeMw);
      const hydroMw = round(row.hydroMw);
      const windMw = round(row.windMw);
      const solarMw = round(row.solarMw);
      const otherMw = round(row.otherMw);

      return {
        date: row.date,
        year,
        month,
        day,
        monthDay: row.date.slice(5),
        demandMw,
        netGenerationMw,
        gasMw,
        coalMw,
        nukeMw,
        hydroMw,
        windMw,
        solarMw,
        otherMw,
        gasSharePct: pct(gasMw, netGenerationMw),
        gasThermalPct: pct(gasMw, round(thermalMw)),
        thermalSharePct: pct(round(thermalMw), netGenerationMw),
        coalSharePct: pct(coalMw, netGenerationMw),
        coalThermalPct: pct(coalMw, round(thermalMw)),
        nukeSharePct: pct(nukeMw, netGenerationMw),
        hydroSharePct: pct(hydroMw, netGenerationMw),
        windSharePct: pct(windMw, netGenerationMw),
        solarSharePct: pct(solarMw, netGenerationMw),
        otherSharePct: pct(otherMw, netGenerationMw),
      };
    })
    .sort((first, second) => first.date.localeCompare(second.date));
}

function buildKpis({
  daily,
  currentYear,
  priorYear,
  selectedDate,
}: {
  daily: EiaGenerationDailyRow[];
  currentYear: number;
  priorYear: number;
  selectedDate: string;
}): EiaGenerationKpi[] {
  const dailyByDate = new Map(daily.map((row) => [row.date, row]));
  const latestRow = dailyByDate.get(selectedDate);
  const priorRow = dailyByDate.get(priorYearDate(selectedDate, priorYear));
  const sparklineStartDate = subDays(selectedDate, KPI_LOOKBACK_DAYS - 1);
  const currentSparkRows = daily.filter(
    (row) => row.year === currentYear && row.date >= sparklineStartDate && row.date <= selectedDate,
  );

  return KPI_CONFIG.map((item) => {
    const valuePct = valueForKpi(latestRow, item.valueKey);
    const priorValuePct = valueForKpi(priorRow, item.valueKey);
    return {
      key: item.key,
      label: item.label,
      valuePct,
      deltaPctPoint:
        valuePct === null || priorValuePct === null ? null : round(valuePct - priorValuePct, 1),
      sparkline: currentSparkRows.map((row) => ({
        date: row.date,
        valuePct: valueForKpi(row, item.valueKey),
      })),
    };
  });
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((first, second) => first - second);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

function avg(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function sum(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  if (!numbers.length) return null;
  return numbers.reduce((total, value) => total + value, 0);
}

function daysInMonth(year: number, monthNumber: number): number {
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function dailyFuelSum(
  row: EiaGenerationDailyRow,
  keys: Array<keyof Pick<
    EiaGenerationDailyRow,
    "gasMw" | "coalMw" | "nukeMw" | "hydroMw" | "windMw" | "solarMw" | "otherMw"
  >>,
): number | null {
  return sum(keys.map((key) => row[key]));
}

function avgDailyValue(
  rows: EiaGenerationDailyRow[],
  selector: (row: EiaGenerationDailyRow) => number | null,
  digits = 1,
): number | null {
  return round(avg(rows.map(selector)), digits);
}

function bcfdFromGasMw(
  gasMw: number | null,
  heatRateMmbtuPerMwh = EIA_DEFAULT_HEAT_RATE_MMBTU_PER_MWH,
): number | null {
  if (gasMw === null) return null;
  return round((gasMw * heatRateMmbtuPerMwh * HOURS_PER_DAY) / 1_000_000, 3);
}

function bcfForDailyRow(
  row: EiaGenerationDailyRow,
  heatRateMmbtuPerMwh = EIA_DEFAULT_HEAT_RATE_MMBTU_PER_MWH,
): number | null {
  return bcfdFromGasMw(row.gasMw, heatRateMmbtuPerMwh);
}

function sumBcf(
  rows: EiaGenerationDailyRow[],
  heatRateMmbtuPerMwh = EIA_DEFAULT_HEAT_RATE_MMBTU_PER_MWH,
): number | null {
  return round(sum(rows.map((row) => bcfForDailyRow(row, heatRateMmbtuPerMwh))), 2);
}

function statusForValues(values: Array<number | null>): "available" | "source_pending" {
  return values.every((value) => value !== null) ? "available" : "source_pending";
}

function seasonIncludesMonth(season: EiaGenerationSeason, month: number): boolean {
  return (
    EIA_GENERATION_SEASON_OPTIONS.find((option) => option.key === season)?.months.includes(month) ??
    false
  );
}

function nearestBucketMedian(
  bucketMedians: EiaGenerationWeatherBucket[],
  weatherBucket: number,
): number | null {
  if (!bucketMedians.length) return null;
  return bucketMedians.reduce((best, candidate) =>
    Math.abs(candidate.weatherBucket - weatherBucket) <
    Math.abs(best.weatherBucket - weatherBucket)
      ? candidate
      : best,
  ).historicalMedianDemandMw;
}

function sampleWeatherPoints(
  points: EiaGenerationWeatherPoint[],
  maxPoints = MAX_HISTORICAL_WEATHER_POINTS,
): EiaGenerationWeatherPoint[] {
  if (points.length <= maxPoints) return points;
  const stride = points.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, index) => points[Math.floor(index * stride)])
    .filter((point): point is EiaGenerationWeatherPoint => Boolean(point));
}

function buildWeatherSeason({
  season,
  region,
  selectedDate,
  currentYear,
  priorYear,
  regionMetrics,
  weatherRows,
  weatherTableAvailable,
}: {
  season: EiaGenerationSeason;
  region: EiaGenerationRegionConfig;
  selectedDate: string;
  currentYear: number;
  priorYear: number;
  regionMetrics: Map<string, RegionMetrics>;
  weatherRows: WeatherDbRow[];
  weatherTableAvailable: boolean;
}): EiaGenerationWeatherSeasonData {
  const { metricName, metricLabel } = metricForSeason(season);
  if (!region.weatherEntity) {
    return buildPendingWeatherSeason({
      season,
      region,
      currentYear,
      priorYear,
      message: "No WSI weather entity is mapped for this dashboard region.",
    });
  }
  if (!weatherTableAvailable) {
    return buildPendingWeatherSeason({
      season,
      region,
      currentYear,
      priorYear,
      message: `${EIA_WEATHER_DEGREE_DAY_SOURCE_TABLE} is not deployed.`,
    });
  }

  const weatherByDate = new Map(
    weatherRows
      .filter((row) => row.metric_name === metricName)
      .map((row) => [row.observation_date, toNumber(row.metric_value)]),
  );
  const points: EiaGenerationWeatherPoint[] = [];

  for (const [date, demandValues] of regionMetrics) {
    const demandMw = demandValues.demandMw;
    const weatherValue = weatherByDate.get(date);
    if (demandMw === null || weatherValue === null || weatherValue === undefined) {
      continue;
    }

    const year = Number.parseInt(date.slice(0, 4), 10);
    const month = Number.parseInt(date.slice(5, 7), 10);
    if (!seasonIncludesMonth(season, month)) continue;
    const weatherBucket = Math.round(weatherValue);
    points.push({
      date,
      year,
      monthDay: date.slice(5),
      weatherValue: round(weatherValue, 1) ?? weatherValue,
      demandMw: round(demandMw) ?? demandMw,
      weatherBucket,
      baselineDemandMw: null,
      demandAnomalyMw: null,
    });
  }

  const historicalRaw = points.filter((point) => point.year < priorYear);
  const grouped = new Map<number, number[]>();
  for (const point of historicalRaw) {
    const values = grouped.get(point.weatherBucket) ?? [];
    values.push(point.demandMw);
    grouped.set(point.weatherBucket, values);
  }

  const bucketMedians = Array.from(grouped.entries())
    .map(([weatherBucket, values]) => {
      const historicalMedianDemandMw = median(values);
      return historicalMedianDemandMw === null
        ? null
        : {
            weatherBucket,
            weatherValue: weatherBucket,
            historicalMedianDemandMw: round(historicalMedianDemandMw) ?? historicalMedianDemandMw,
            sampleSize: values.length,
          };
    })
    .filter((row): row is EiaGenerationWeatherBucket => row !== null)
    .sort((first, second) => first.weatherBucket - second.weatherBucket);

  if (!bucketMedians.length) {
    return buildPendingWeatherSeason({
      season,
      region,
      currentYear,
      priorYear,
      message: `No historical ${metricLabel} buckets are available for ${region.weatherEntity}.`,
    });
  }

  const attachBaseline = (point: EiaGenerationWeatherPoint): EiaGenerationWeatherPoint => {
    const baselineDemandMw = nearestBucketMedian(bucketMedians, point.weatherBucket);
    const demandAnomalyMw =
      baselineDemandMw === null ? null : round(point.demandMw - baselineDemandMw);
    return {
      ...point,
      baselineDemandMw,
      demandAnomalyMw,
    };
  };

  const priorLimit = priorYearDate(selectedDate, priorYear);
  const historicalPoints = historicalRaw.map(attachBaseline);
  const currentPoints = points
    .filter((point) => point.year === currentYear && point.date <= selectedDate)
    .map(attachBaseline);
  const priorPoints = points
    .filter((point) => point.year === priorYear && point.date <= priorLimit)
    .map(attachBaseline);
  const currentByDay = new Map(currentPoints.map((point) => [point.monthDay, point]));
  const priorByDay = new Map(priorPoints.map((point) => [point.monthDay, point]));
  const anomalyRows = Array.from(new Set([...currentByDay.keys(), ...priorByDay.keys()]))
    .map((monthDay) => ({
      monthDay,
      seasonDayIndex: seasonDayIndex(season, monthDay),
      current: currentByDay.get(monthDay)?.demandAnomalyMw ?? null,
      prior: priorByDay.get(monthDay)?.demandAnomalyMw ?? null,
    }))
    .sort((first, second) => first.seasonDayIndex - second.seasonDayIndex);

  if (!currentPoints.length && !priorPoints.length) {
    return buildPendingWeatherSeason({
      season,
      region,
      currentYear,
      priorYear,
      message: `No current or prior ${season} demand rows are available for weather adjustment.`,
    });
  }

  return {
    season,
    status: "available",
    entityId: region.weatherEntity,
    entityLabel: region.weatherEntityLabel,
    metricName,
    metricLabel,
    currentYear,
    priorYear,
    historicalPoints: sampleWeatherPoints(historicalPoints),
    currentPoints,
    priorPoints,
    bucketMedians,
    anomalyRows,
    currentAvgAnomalyMw: round(avg(currentPoints.map((point) => point.demandAnomalyMw))),
    priorAvgAnomalyMw: round(avg(priorPoints.map((point) => point.demandAnomalyMw))),
    message: null,
  };
}

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await query<{ exists: string | null }>(
    "select to_regclass($1::text)::text as exists",
    [tableName],
  );
  return Boolean(rows[0]?.exists);
}

async function loadPayload(request: Request): Promise<ObservedRouteResult> {
  const { searchParams } = new URL(request.url);
  const region = getEiaGenerationRegion(searchParams.get("region"));
  const requestedDate = parseIsoDate(searchParams.get("date") ?? searchParams.get("endDate"));
  const requestedSeason = parseSeason(searchParams.get("season"));

  const [regionTableAvailable, weatherTableAvailable] = await Promise.all([
    tableExists(EIA_REGION_DATA_SOURCE_TABLE),
    tableExists(EIA_WEATHER_DEGREE_DAY_SOURCE_TABLE),
  ]);

  const [metaRows, regionMetaRows] = await Promise.all([
    query<SourceMetaRow>(
      `
        select
          count(*) as row_count,
          to_char(min(period), 'YYYY-MM-DD') as min_period,
          to_char(max(period), 'YYYY-MM-DD') as max_period,
          max(scrape_run_at_utc)::text as latest_scrape_run_at,
          max(updated_at)::text as latest_update_at,
          coalesce(max(respondent_name), '') as respondent_name,
          count(distinct fueltype) as fueltype_count,
          count(distinct timezone) as timezone_count
        from eia.eia_930_daily_generation_by_fuel
        where respondent = $1
      `,
      [region.respondent],
    ),
    regionTableAvailable
      ? query<RegionMetaRow>(
        `
          select
            count(*) as row_count,
            to_char(min(period), 'YYYY-MM-DD') as min_period,
            to_char(max(period), 'YYYY-MM-DD') as max_period,
            max(scrape_run_at_utc)::text as latest_scrape_run_at,
            max(updated_at)::text as latest_update_at,
            coalesce(max(respondent_name), '') as respondent_name,
            count(distinct type) as type_count,
            count(distinct timezone) as timezone_count
          from eia.eia_930_daily_region_data
          where respondent = $1
        `,
        [region.respondent],
      )
      : Promise.resolve<RegionMetaRow[]>([]),
  ]);
  const meta = metaRows[0];
  const regionMeta = regionMetaRows[0];
  const fuelLatestDate = meta?.max_period ?? null;
  const regionLatestDate = regionMeta && toInteger(regionMeta.row_count) > 0
    ? regionMeta.max_period
    : null;
  const latestDate = regionLatestDate
    ? minDate([fuelLatestDate, regionLatestDate])
    : fuelLatestDate;

  if (!latestDate) {
    const payload = buildEmptyPayload({ region, requestedDate, meta });
    return {
      payload,
      headers: { "Cache-Control": CACHE_HEADER },
      rowCount: 0,
      dataAsOf: payload.asOf,
    };
  }

  const selectedDate =
    requestedDate && requestedDate <= latestDate
      ? requestedDate
      : latestDate;
  const currentYear = Number.parseInt(selectedDate.slice(0, 4), 10);
  const priorYear = currentYear - 1;
  const fuelStartDate = `${priorYear}-01-01`;
  const selectedSeason = requestedSeason ?? seasonForDate(selectedDate);
  const selectedSeasonMonths = seasonMonths(selectedSeason);
  const selectedWeatherMetric = metricForSeason(selectedSeason).metricName;

  const fuelRowsPromise = query<FuelDbRow>(
    `
      with ranked as (
        select
          period,
          respondent_name,
          fueltype,
          type_name,
          timezone,
          value,
          value_units,
          scrape_run_at_utc,
          updated_at,
          row_number() over (
            partition by period, respondent, fueltype
            order by
              case
                when timezone = $4 then 0
                when timezone = 'Eastern' then 1
                when timezone = 'Central' then 2
                when timezone = 'Pacific' then 3
                when timezone = 'Mountain' then 4
                when timezone = 'Arizona' then 5
                else 9
              end,
              timezone
          ) as timezone_rank
        from eia.eia_930_daily_generation_by_fuel
        where respondent = $1
          and period between $2::date and $3::date
      )
      select
        to_char(period, 'YYYY-MM-DD') as period,
        respondent_name,
        fueltype,
        type_name,
        timezone,
        value,
        value_units,
        scrape_run_at_utc::text,
        updated_at::text
      from ranked
      where timezone_rank = 1
      order by period, fueltype
    `,
    [region.respondent, fuelStartDate, selectedDate, region.preferredTimezone],
  );

  const dashboardRegionRowsPromise = regionTableAvailable
    ? query<RegionDbRow>(
        `
          with ranked as (
            select
              period,
              type,
              type_name,
              timezone,
              value,
              value_units,
              scrape_run_at_utc,
              updated_at,
              row_number() over (
                partition by period, respondent, type
                order by
                  case
                    when timezone = $5 then 0
                    when timezone = 'Eastern' then 1
                    when timezone = 'Central' then 2
                    when timezone = 'Pacific' then 3
                    when timezone = 'Mountain' then 4
                    when timezone = 'Arizona' then 5
                    else 9
                  end,
                  timezone
              ) as timezone_rank
            from eia.eia_930_daily_region_data
            where respondent = $1
              and period between $2::date and $3::date
              and type = any($4::text[])
          )
          select
            to_char(period, 'YYYY-MM-DD') as period,
            type,
            type_name,
            timezone,
            value,
            value_units,
            scrape_run_at_utc::text,
            updated_at::text
          from ranked
          where timezone_rank = 1
          order by period, type
        `,
        [
          region.respondent,
          fuelStartDate,
          selectedDate,
          ["D", "NG"],
          region.preferredTimezone,
        ],
      )
    : Promise.resolve<RegionDbRow[]>([]);
  const weatherRegionRowsPromise = regionTableAvailable && weatherTableAvailable && region.weatherEntity
    ? query<RegionDbRow>(
        `
          with ranked as (
            select
              period,
              type,
              type_name,
              timezone,
              value,
              value_units,
              scrape_run_at_utc,
              updated_at,
              row_number() over (
                partition by period, respondent, type
                order by
                  case
                    when timezone = $5 then 0
                    when timezone = 'Eastern' then 1
                    when timezone = 'Central' then 2
                    when timezone = 'Pacific' then 3
                    when timezone = 'Mountain' then 4
                    when timezone = 'Arizona' then 5
                    else 9
                  end,
                  timezone
              ) as timezone_rank
            from eia.eia_930_daily_region_data
            where respondent = $1
              and period between $2::date and $3::date
              and type = 'D'
              and extract(month from period)::int = any($4::int[])
          )
          select
            to_char(period, 'YYYY-MM-DD') as period,
            type,
            type_name,
            timezone,
            value,
            value_units,
            scrape_run_at_utc::text,
            updated_at::text
          from ranked
          where timezone_rank = 1
          order by period, type
        `,
        [
          region.respondent,
          WEATHER_START_DATE,
          selectedDate,
          selectedSeasonMonths,
          region.preferredTimezone,
        ],
      )
    : Promise.resolve<RegionDbRow[]>([]);

  const weatherRowsPromise = weatherTableAvailable && region.weatherEntity
    ? query<WeatherDbRow>(
        `
          with ranked as (
            select
              observation_date,
              entity_id,
              metric_name,
              metric_value,
              metric_unit,
              scrape_run_at_utc,
              updated_at,
              row_number() over (
                partition by entity_id, observation_date, metric_name
                order by updated_at desc, scrape_run_at_utc desc
              ) as metric_rank
            from weather.wsi_daily_weighted_degree_day_observations
            where entity_id = $1
              and metric_name = $2
              and observation_date between $3::date and $4::date
              and extract(month from observation_date)::int = any($5::int[])
          )
          select
            to_char(observation_date, 'YYYY-MM-DD') as observation_date,
            entity_id,
            metric_name,
            metric_value,
            metric_unit,
            scrape_run_at_utc::text,
            updated_at::text
          from ranked
          where metric_rank = 1
          order by observation_date, metric_name
        `,
        [
          region.weatherEntity,
          selectedWeatherMetric,
          WEATHER_START_DATE,
          selectedDate,
          selectedSeasonMonths,
        ],
      )
    : Promise.resolve<WeatherDbRow[]>([]);

  const [
    fuelRows,
    dashboardRegionRows,
    weatherRegionRows,
    weatherRows,
  ] = await Promise.all([
    fuelRowsPromise,
    dashboardRegionRowsPromise,
    weatherRegionRowsPromise,
    weatherRowsPromise,
  ]);

  const dashboardRegionMetrics = aggregateRegionMetrics(dashboardRegionRows);
  const demandAvailable = Array.from(dashboardRegionMetrics.values()).some(
    (row) => row.demandMw !== null,
  );
  const weatherRegionMetrics = aggregateRegionMetrics(weatherRegionRows);

  const daily = aggregateDaily(fuelRows, dashboardRegionMetrics);
  const dailyByDate = new Map(daily.map((row) => [row.date, row]));
  const currentRows = daily
    .filter((row) => row.year === currentYear && row.date <= selectedDate)
    .sort((first, second) => second.date.localeCompare(first.date));
  const currentTable = currentRows.slice(0, TABLE_LOOKBACK_DAYS);
  const priorTable = currentTable
    .map((row) => dailyByDate.get(priorYearDate(row.date, priorYear)))
    .filter((row): row is EiaGenerationDailyRow => Boolean(row));
  const asOf = maxStamp([
    ...fuelRows.flatMap((row) => [row.scrape_run_at_utc, row.updated_at]),
    ...dashboardRegionRows.flatMap((row) => [row.scrape_run_at_utc, row.updated_at]),
    ...weatherRegionRows.flatMap((row) => [row.scrape_run_at_utc, row.updated_at]),
    ...weatherRows.flatMap((row) => [row.scrape_run_at_utc, row.updated_at]),
  ]);
  const weatherBySeason: Record<EiaGenerationSeason, EiaGenerationWeatherSeasonData> = {
    summer:
      selectedSeason === "summer"
        ? buildWeatherSeason({
            season: "summer",
            region,
            selectedDate,
            currentYear,
            priorYear,
            regionMetrics: weatherRegionMetrics,
            weatherRows,
            weatherTableAvailable,
          })
        : buildPendingWeatherSeason({
            season: "summer",
            region,
            currentYear,
            priorYear,
            message: "Summer weather payload was not requested.",
          }),
    winter:
      selectedSeason === "winter"
        ? buildWeatherSeason({
            season: "winter",
            region,
            selectedDate,
            currentYear,
            priorYear,
            regionMetrics: weatherRegionMetrics,
            weatherRows,
            weatherTableAvailable,
          })
        : buildPendingWeatherSeason({
            season: "winter",
            region,
            currentYear,
            priorYear,
            message: "Winter weather payload was not requested.",
          }),
  };
  const weatherStatus = weatherBySeason[selectedSeason].status === "available"
    ? "available"
    : "source_pending";
  const missingSources = [
    ...(demandAvailable ? [] : ["EIA-930 daily region demand rows"]),
    ...(weatherStatus === "available" ? [] : ["Weather response rows"]),
  ];

  const payload: EiaGenerationPayload = {
    product: "eia-generation",
    source: "EIA-930 daily generation and region data",
    region,
    requestedDate,
    selectedDate,
    latestDate,
    currentYear,
    priorYear,
    asOf,
    currentTable,
    priorTable,
    daily,
    kpis: buildKpis({ daily, currentYear, priorYear, selectedDate }),
    monthly: buildMonthlyPayload({ daily, currentYear, priorYear }),
    regionalModeling: buildRegionalModelingPayload({ daily, currentYear }),
    yoyMtd: buildYoyMtdPayload({ daily, selectedDate, currentYear, priorYear }),
    freshness: {
      sourceTable: `${EIA_GENERATION_SOURCE_TABLE} + ${EIA_REGION_DATA_SOURCE_TABLE}`,
      sourceSystem: "EIA Open Data API v2 / electricity/rto daily endpoints",
      rowCount: toInteger(meta?.row_count) + toInteger(regionMeta?.row_count),
      minPeriod: meta?.min_period ?? null,
      maxPeriod: latestDate,
      latestScrapeRunAt: maxStamp([
        meta?.latest_scrape_run_at,
        regionMeta?.latest_scrape_run_at,
      ]),
      latestUpdateAt: maxStamp([
        meta?.latest_update_at,
        regionMeta?.latest_update_at,
      ]),
      respondent: region.respondent,
      respondentName: meta?.respondent_name || regionMeta?.respondent_name || region.name,
      selectedTimezone: region.preferredTimezone,
      rawGrain:
        "generation: period x respondent x fueltype x timezone; demand: period x respondent x type x timezone",
      presentationGrain: "period x respondent after preferred-timezone selection",
      units: "Source values are daily MWh; dashboard values are daily average MW.",
    },
    weatherBySeason,
    demandStatus: demandAvailable ? "available" : "source_pending",
    weatherStatus,
    metadata: {
      fuelValueUnit: "megawatthours",
      dashboardValueUnit: "average_mw",
      conversion: "daily_mwh_divided_by_24",
      thermalDefinition: "gas_plus_coal",
      sourceContract:
        "EIA-930 daily generation by fuel is joined to EIA-930 daily region demand/net generation by preferred timezone.",
      demandSourceTable: EIA_REGION_DATA_SOURCE_TABLE,
      weatherSourceTable: EIA_WEATHER_DEGREE_DAY_SOURCE_TABLE,
      weatherMappingContract:
        "WSI broad electric degree-day entities are mapped explicitly per dashboard region.",
      missingSources,
    },
  };

  return {
    payload,
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount:
      fuelRows.length +
      dashboardRegionRows.length +
      weatherRegionRows.length +
      weatherRows.length,
    dataAsOf: asOf,
  };
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  if (!isLocalOnlyFeatureEnabled()) {
    return localOnlyObservedNotFound();
  }

  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";
  const key = normalizedSearchCacheKey(searchParams);

  const { value, cacheStatus } = await getCachedRouteValue<ObservedRouteResult>({
    namespace: "eia-generation",
    key,
    ttlMs: CACHE_TTL_SECONDS * 1000,
    staleIfErrorMs: CACHE_TTL_SECONDS * 1000,
    forceRefresh,
    load: () => loadPayload(request),
  });

  return {
    ...value,
    headers: {
      ...(value.headers ?? {}),
      "Cache-Control": forceRefresh ? "no-store" : CACHE_HEADER,
      "X-Helios-Cache-Policy": forceRefresh
        ? "no-store"
        : "s-maxage=300, stale-while-revalidate=60, process-cache=300",
      ...routeCacheHeaders(cacheStatus),
    },
  };
});
