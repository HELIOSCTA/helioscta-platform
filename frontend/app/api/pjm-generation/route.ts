import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isGenerationDevEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const DEFAULT_LOOKBACK_DAYS = 7;
const LEGACY_DATE_LOOKBACK_DAYS = 1;
const MAX_LOOKBACK_DAYS = 31;
const TOTAL_FUEL_TYPE = "Total";

const ROUTE_CONFIG = {
  route: "/api/pjm-generation",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "PJM generation fuel mix levels, ramps, and capacity context",
  p95TargetMs: 1_500,
  freshnessSource:
    "pjm.gen_by_fuel.updated_at, pjm.day_gen_capacity.updated_at, pjm.rt_and_self_ecomax.updated_at",
} as const;

interface AvailableDateRow {
  operating_date: string;
  hour_count: number | string;
  is_complete: boolean | string;
}

interface SourceFreshnessRow {
  source_table: string;
  row_count: number | string;
  min_ept: string | null;
  max_ept: string | null;
  latest_update_at: string | null;
}

interface HourlyDbRow {
  operating_date: string;
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
  operatingDate: string;
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

interface DailyFuelSummaryRow {
  date: string;
  fuelType: string;
  hourlyRows: number;
  flatAvgMw: number | null;
  onPeakAvgMw: number | null;
  offPeakAvgMw: number | null;
  minMw: number | null;
  maxMw: number | null;
  totalMwh: number | null;
  avgSharePct: number | null;
  maxUpRampMw: number | null;
  maxDownRampMw: number | null;
}

interface RampRow {
  date: string;
  hourEpt: string;
  hourBeginning: number;
  hourEnding: number;
  fuelType: string;
  rampMw: number | null;
}

interface DateCoverage {
  date: string;
  hourCount: number;
  isComplete: boolean;
}

function parseDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseLookbackDays(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), MAX_LOOKBACK_DAYS);
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

function sum(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  if (!numbers.length) return null;
  return numbers.reduce((total, value) => total + value, 0);
}

function minValue(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length ? Math.min(...numbers) : null;
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

function toBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "t" || value === "1";
}

function shareToPct(value: number | null): number | null {
  if (value === null) return null;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function hourEnding(hourBeginning: number): number {
  return (hourBeginning % 24) + 1;
}

function isOnPeak(hour: number): boolean {
  return hour >= 8 && hour <= 23;
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
    share: round(shareToPct(toNumber(item.share)), 2),
    isRenewable: typeof item.isRenewable === "boolean" ? item.isRenewable : null,
  };
}

function normalizeHourly(row: HourlyDbRow): HourlyGenerationRow {
  const totalGenerationMw = toNumber(row.total_generation_mw);
  const renewableMw = toNumber(row.renewable_mw);
  const fuelRows = Array.isArray(row.fuels) ? row.fuels.map(normalizeFuel).filter(Boolean) : [];
  const disclaimer = row.conf_disclaimer?.trim() || null;

  return {
    operatingDate: row.operating_date,
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

function normalizeDateCoverage(rows: AvailableDateRow[]): DateCoverage[] {
  return rows.map((row) => ({
    date: row.operating_date,
    hourCount: toInteger(row.hour_count),
    isComplete: toBoolean(row.is_complete),
  }));
}

function valueForFuel(row: HourlyGenerationRow, fuelType: string): number | null {
  if (fuelType === TOTAL_FUEL_TYPE) return row.totalGenerationMw;
  return row.fuels.find((fuel) => fuel.fuelType === fuelType)?.mw ?? null;
}

function shareForFuel(row: HourlyGenerationRow, fuelType: string): number | null {
  if (fuelType === TOTAL_FUEL_TYPE) return row.totalGenerationMw === null ? null : 100;
  const fuel = row.fuels.find((item) => item.fuelType === fuelType);
  if (!fuel) return null;
  if (fuel.share !== null) return fuel.share;
  if (fuel.mw === null || !row.totalGenerationMw) return null;
  return (fuel.mw / row.totalGenerationMw) * 100;
}

function selectedDatesForLookback(
  availableDates: string[],
  selectedEndDate: string | null,
  lookbackDays: number,
): string[] {
  if (!selectedEndDate) return [];
  return availableDates
    .filter((date) => date <= selectedEndDate)
    .slice(0, lookbackDays)
    .reverse();
}

function groupHourlyByDate(hourly: HourlyGenerationRow[]): Map<string, HourlyGenerationRow[]> {
  const byDate = new Map<string, HourlyGenerationRow[]>();
  for (const row of hourly) {
    const rows = byDate.get(row.operatingDate) ?? [];
    rows.push(row);
    byDate.set(row.operatingDate, rows);
  }
  for (const rows of byDate.values()) {
    rows.sort((first, second) => first.hourEpt.localeCompare(second.hourEpt));
  }
  return byDate;
}

function buildRampRows(
  hourly: HourlyGenerationRow[],
  selectedDates: string[],
  fuelTypes: string[],
): RampRow[] {
  const byDate = groupHourlyByDate(hourly);
  const rampRows: RampRow[] = [];
  const fuelsWithTotal = [TOTAL_FUEL_TYPE, ...fuelTypes];

  for (const date of selectedDates) {
    const rows = byDate.get(date) ?? [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const previous = rows[index - 1];
      for (const fuelType of fuelsWithTotal) {
        const value = valueForFuel(row, fuelType);
        const previousValue = previous ? valueForFuel(previous, fuelType) : null;
        rampRows.push({
          date,
          hourEpt: row.hourEpt,
          hourBeginning: row.hourBeginning,
          hourEnding: hourEnding(row.hourBeginning),
          fuelType,
          rampMw: value === null || previousValue === null ? null : round(value - previousValue),
        });
      }
    }
  }

  return rampRows;
}

function buildDailySummary(
  hourly: HourlyGenerationRow[],
  selectedDates: string[],
  fuelTypes: string[],
  rampRows: RampRow[],
): DailyFuelSummaryRow[] {
  const byDate = groupHourlyByDate(hourly);
  const rampByDateFuel = new Map<string, number[]>();
  for (const ramp of rampRows) {
    if (ramp.rampMw === null) continue;
    const key = `${ramp.date}|${ramp.fuelType}`;
    const values = rampByDateFuel.get(key) ?? [];
    values.push(ramp.rampMw);
    rampByDateFuel.set(key, values);
  }

  const fuelsWithTotal = [TOTAL_FUEL_TYPE, ...fuelTypes];
  const dailyRows: DailyFuelSummaryRow[] = [];

  for (const date of selectedDates) {
    const rows = byDate.get(date) ?? [];
    for (const fuelType of fuelsWithTotal) {
      const entries = rows
        .map((row) => ({
          hourEnding: hourEnding(row.hourBeginning),
          value: valueForFuel(row, fuelType),
          share: shareForFuel(row, fuelType),
        }))
        .filter((entry) => entry.value !== null);
      const allValues = entries.map((entry) => entry.value);
      const onPeakValues = entries
        .filter((entry) => isOnPeak(entry.hourEnding))
        .map((entry) => entry.value);
      const offPeakValues = entries
        .filter((entry) => !isOnPeak(entry.hourEnding))
        .map((entry) => entry.value);
      const rampValues = rampByDateFuel.get(`${date}|${fuelType}`) ?? [];

      dailyRows.push({
        date,
        fuelType,
        hourlyRows: entries.length,
        flatAvgMw: round(avg(allValues)),
        onPeakAvgMw: round(avg(onPeakValues)),
        offPeakAvgMw: round(avg(offPeakValues)),
        minMw: round(minValue(allValues)),
        maxMw: round(maxValue(allValues)),
        totalMwh: round(sum(allValues)),
        avgSharePct: round(avg(entries.map((entry) => entry.share)), 2),
        maxUpRampMw: round(maxValue(rampValues)),
        maxDownRampMw: round(minValue(rampValues)),
      });
    }
  }

  return dailyRows;
}

function emptyPayload({
  requestedDate,
  selectedDate,
  selectedDates,
  lookbackDays,
  availableDates,
  availableDateCoverage,
  freshness,
}: {
  requestedDate: string | null;
  selectedDate: string | null;
  selectedDates: string[];
  lookbackDays: number;
  availableDates: string[];
  availableDateCoverage: DateCoverage[];
  freshness: ReturnType<typeof sourceFreshness>;
}) {
  return {
    iso: "pjm",
    source: "PJM Data Miner Generation",
    requestedDate,
    selectedDate,
    selectedStartDate: selectedDates[0] ?? null,
    selectedDates,
    lookbackDays,
    latestCommonDate: availableDates[0] ?? null,
    availableDates,
    availableDateCoverage,
    selectedDateCoverage: null,
    fuelTypes: [],
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
    dailySummary: [],
    rampRows: [],
    metadata: {
      dateSelection:
        "Historical dates require at least 23 hourly timestamps in pjm.gen_by_fuel. The latest fuel-mix operating day is included even when partial. Capacity and scheduled-generation overlays are nonblocking.",
      units: "MW for hourly values, MW/hr for ramps, and average MW for daily summaries.",
    },
  };
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const legacyDateOnly =
    Boolean(searchParams.get("date")) &&
    !searchParams.has("endDate") &&
    !searchParams.has("lookbackDays");
  const requestedDate = parseDate(searchParams.get("endDate")) ?? parseDate(searchParams.get("date"));
  const lookbackDays = parseLookbackDays(
    searchParams.get("lookbackDays"),
    legacyDateOnly ? LEGACY_DATE_LOOKBACK_DAYS : DEFAULT_LOOKBACK_DAYS,
  );

  const [availableRows, freshnessRows] = await Promise.all([
    query<AvailableDateRow>(`
      with date_counts as (
        select
          datetime_beginning_ept::date as operating_date,
          count(distinct datetime_beginning_utc) as hour_count
        from pjm.gen_by_fuel
        group by datetime_beginning_ept::date
      ),
      latest_date as (
        select max(operating_date) as operating_date
        from date_counts
      )
      select
        to_char(d.operating_date, 'YYYY-MM-DD') as operating_date,
        d.hour_count,
        (d.hour_count >= 23) as is_complete
      from date_counts d
      cross join latest_date l
      where d.hour_count >= 23
        or d.operating_date = l.operating_date
      order by d.operating_date desc
      limit 240
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

  const availableDateCoverage = normalizeDateCoverage(availableRows);
  const availableDates = availableDateCoverage.map((row) => row.date);
  const selectedDate =
    requestedDate && availableDates.includes(requestedDate)
      ? requestedDate
      : requestedDate
        ? availableDates.find((date) => date <= requestedDate) ?? availableDates.at(-1) ?? null
        : availableDates[0] ?? null;
  const selectedDates = selectedDatesForLookback(availableDates, selectedDate, lookbackDays);
  const selectedDateCoverage = selectedDate
    ? availableDateCoverage.find((row) => row.date === selectedDate) ?? null
    : null;
  const freshness = sourceFreshness(freshnessRows);

  if (!selectedDate || !selectedDates.length) {
    const payload = emptyPayload({
      requestedDate,
      selectedDate,
      selectedDates,
      lookbackDays,
      availableDates,
      availableDateCoverage,
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
            to_char(min(datetime_beginning_ept)::date, 'YYYY-MM-DD') as operating_date,
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
          where datetime_beginning_ept::date = any($1::date[])
          group by datetime_beginning_utc
        )
        select
          f.operating_date,
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
      [selectedDates],
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
        where datetime_beginning_ept::date = any($1::date[])
        group by fuel_type
        order by avg(mw) desc nulls last, fuel_type
      `,
      [selectedDates],
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
    avgSharePct: round(shareToPct(toNumber(row.avg_share)), 2),
  }));
  const fuelTypes = fuelSummary.map((row) => row.fuelType);
  const rampRows = buildRampRows(hourly, selectedDates, fuelTypes);
  const dailySummary = buildDailySummary(hourly, selectedDates, fuelTypes, rampRows);

  const payload = {
    iso: "pjm",
    source: "PJM Data Miner Generation",
    requestedDate,
    selectedDate,
    selectedStartDate: selectedDates[0] ?? null,
    selectedDates,
    lookbackDays,
    latestCommonDate: availableDates[0] ?? null,
    availableDates,
    availableDateCoverage,
    selectedDateCoverage,
    fuelTypes: [TOTAL_FUEL_TYPE, ...fuelTypes],
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
    dailySummary,
    rampRows,
    metadata: {
      dateSelection:
        "Historical dates require at least 23 hourly timestamps in pjm.gen_by_fuel. The latest fuel-mix operating day is included even when partial. Capacity and scheduled-generation overlays are nonblocking.",
      units: "MW for hourly values, MW/hr for ramps, and average MW for daily summaries.",
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
