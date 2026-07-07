import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isNercHoliday, isNercOffPeakDay, isPjmPowerOnPeakHour } from "@/lib/tradingCalendars";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const DEFAULT_LOCATION = "WESTERN HUB";
const DEFAULT_MONTH = 6;
const DEFAULT_START_YEAR = 2020;
const MIN_YEAR = 2014;
const MAX_YEAR_SPAN = 12;
const DEFAULT_SCARCITY_LIMIT = 25;

const ROUTE_CONFIG = {
  route: "/api/pjm-historical-settlements",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "PJM historical hourly settlement sheet",
  p95TargetMs: 2_500,
  freshnessSource: "pjm.da_hrl_lmps, pjm.rt_hrl_lmps, or pjm.rt_unverified_hrl_lmps updated_at",
} as const;

const LOCATIONS = [
  "WESTERN HUB",
  "PJM-RTO",
  "AECO",
  "AEP",
  "AEP-DAYTON HUB",
  "AEP GEN HUB",
  "APS",
  "ATSI",
  "ATSI GEN HUB",
  "BGE",
  "CHICAGO GEN HUB",
  "CHICAGO HUB",
  "COMED",
  "DAY",
  "DEOK",
  "DOM",
  "DOMINION HUB",
  "DPL",
  "DUQ",
  "EASTERN HUB",
  "EKPC",
  "JCPL",
  "METED",
  "MID-ATL/APS",
  "NEW JERSEY HUB",
  "N ILLINOIS HUB",
  "OHIO HUB",
  "OVEC",
  "PECO",
  "PENELEC",
  "PEPCO",
  "PPL",
  "PSEG",
  "RECO",
  "WEST INT HUB",
] as const;

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

type Market = "RT_VERIFIED" | "RT_UNVERIFIED" | "DA" | "DART";
type ComponentKey = "total" | "energy" | "congestion" | "loss";
type ViewMode = "single" | "spread";
type TermPeriod = "all" | "5x16" | "7x16" | "7x8" | "wrap" | "7x24";
type LocationName = (typeof LOCATIONS)[number];
type ValueMap = Record<string, number | null>;
type CountMap = Record<string, number>;

interface SourceRow {
  datetime_beginning_ept: string;
  market_date: string;
  year: number;
  iso_dow: number;
  hour_ending: number;
  total_price: number | string | null;
  energy_price: number | string | null;
  congestion_price: number | string | null;
  loss_price: number | string | null;
  as_of: string | null;
}

interface NormalizedRow {
  datetimeBeginningEpt: string;
  date: string;
  year: number;
  isoDow: number;
  hourEnding: number;
  isNercOffPeakDay: boolean;
  isNercHoliday: boolean;
  total: number | null;
  energy: number | null;
  congestion: number | null;
  loss: number | null;
  selectedPrice: number | null;
  asOf: string | null;
}

interface SettlementBlock {
  key: string;
  label: string;
  code: string;
  description: string;
  values: ValueMap;
  counts: CountMap;
  mean: number | null;
  median: number | null;
}

interface HourlyBreakdownRow {
  hourEnding: number;
  values: ValueMap;
  counts: CountMap;
  mean: number | null;
  median: number | null;
}

interface ScarcityHourRow {
  rank: number;
  date: string;
  datetimeBeginningEpt: string;
  year: number;
  hourEnding: number;
  price: number | null;
  total: number | null;
  energy: number | null;
  congestion: number | null;
  loss: number | null;
}

interface Payload {
  iso: "pjm";
  market: Market;
  component: ComponentKey;
  location: string;
  month: number;
  monthLabel: string;
  startYear: number;
  endYear: number;
  years: number[];
  sourceTable: string;
  asOf: string | null;
  rowCount: number;
  minDate: string | null;
  maxDate: string | null;
  settlementBlocks: SettlementBlock[];
  hourlyBreakdown: HourlyBreakdownRow[];
  scarcityHours: ScarcityHourRow[];
  metadata: {
    availableLocations: readonly string[];
    holidayAdjustment: string;
    maxYearSpan: number;
    scarcityLimit: number;
    view: ViewMode;
    period: TermPeriod;
    periodDefinition: string;
    spread?: {
      fromLocation: LocationName;
      toLocation: LocationName;
      formula: string;
    };
  };
}

const BLOCKS = [
  {
    key: "5x16",
    label: "5x16",
    code: "5X16",
    description: "NERC business-day HE 8-23",
    matches: (row: NormalizedRow) => periodMatches("5x16", row),
  },
  {
    key: "7x16",
    label: "7x16",
    code: "7X16",
    description: "All days HE 8-23",
    matches: (row: NormalizedRow) => periodMatches("7x16", row),
  },
  {
    key: "7x8",
    label: "7x8",
    code: "7X8",
    description: "All days HE 1-7 and HE 24",
    matches: (row: NormalizedRow) => periodMatches("7x8", row),
  },
  {
    key: "wrap",
    label: "Wrap",
    code: "WRAP",
    description: "7x8 plus NERC off-peak day HE 8-23",
    matches: (row: NormalizedRow) => periodMatches("wrap", row),
  },
  {
    key: "7x24",
    label: "7x24",
    code: "7X24",
    description: "All hours",
    matches: (row: NormalizedRow) => periodMatches("7x24", row),
  },
] as const;

function parseMarket(value: string | null, rtSource: string | null): Market {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "DA" || normalized === "DART") return normalized;
  if (normalized === "RT_UNVERIFIED" || normalized === "RT UNVERIFIED" || normalized === "UNVERIFIED_RT") {
    return "RT_UNVERIFIED";
  }
  if (rtSource?.trim().toLowerCase() === "unverified") return "RT_UNVERIFIED";
  return "RT_VERIFIED";
}

function parseView(value: string | null): ViewMode {
  return value?.trim().toLowerCase() === "spread" ? "spread" : "single";
}

function parsePeriod(value: string | null): TermPeriod {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "all") return "all";
  if (normalized === "7x16" || normalized === "sevenbysixteen") return "7x16";
  if (normalized === "7x8" || normalized === "sevenbyeight") return "7x8";
  if (normalized === "wrap" || normalized === "offpeak" || normalized === "off-peak") return "wrap";
  if (normalized === "7x24" || normalized === "flat" || normalized === "sevenbytwentyfour") return "7x24";
  return "5x16";
}

function parseComponent(value: string | null): ComponentKey {
  if (value === "energy" || value === "congestion" || value === "loss") return value;
  return "total";
}

function parseMonth(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : DEFAULT_MONTH;
}

function parseYear(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function parseScarcityLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed)) return DEFAULT_SCARCITY_LIMIT;
  return Math.min(Math.max(parsed, 5), 100);
}

function parseLocation(value: string | null): LocationName {
  return LOCATIONS.find((location) => location === value) ?? DEFAULT_LOCATION;
}

function clampYear(value: number): number {
  const currentYear = new Date().getUTCFullYear();
  return Math.min(Math.max(value, MIN_YEAR), currentYear);
}

function yearsBetween(startYear: number, endYear: number): number[] {
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

function sourceTable(market: Market): string {
  if (market === "DA") return "pjm.da_hrl_lmps";
  if (market === "DART") return "pjm.da_hrl_lmps - pjm.rt_hrl_lmps";
  if (market === "RT_UNVERIFIED") return "pjm.rt_unverified_hrl_lmps";
  return "pjm.rt_hrl_lmps";
}

function sourceSql(market: Market): string {
  if (market === "DA") {
    return `
      SELECT
        to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') AS datetime_beginning_ept,
        datetime_beginning_ept::date::text AS market_date,
        EXTRACT(YEAR FROM datetime_beginning_ept)::integer AS year,
        EXTRACT(ISODOW FROM datetime_beginning_ept)::integer AS iso_dow,
        EXTRACT(HOUR FROM datetime_beginning_ept)::integer + 1 AS hour_ending,
        total_lmp_da::double precision AS total_price,
        system_energy_price_da::double precision AS energy_price,
        congestion_price_da::double precision AS congestion_price,
        marginal_loss_price_da::double precision AS loss_price,
        to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS as_of
      FROM pjm.da_hrl_lmps
      WHERE pnode_name = $1
        AND row_is_current = true
        AND datetime_beginning_ept >= make_date($2::integer, 1, 1)::timestamp
        AND datetime_beginning_ept < make_date($3::integer + 1, 1, 1)::timestamp
        AND EXTRACT(MONTH FROM datetime_beginning_ept)::integer = $4
      ORDER BY datetime_beginning_ept
    `;
  }

  if (market === "DART") {
    return `
      SELECT
        to_char(da.datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') AS datetime_beginning_ept,
        da.datetime_beginning_ept::date::text AS market_date,
        EXTRACT(YEAR FROM da.datetime_beginning_ept)::integer AS year,
        EXTRACT(ISODOW FROM da.datetime_beginning_ept)::integer AS iso_dow,
        EXTRACT(HOUR FROM da.datetime_beginning_ept)::integer + 1 AS hour_ending,
        (da.total_lmp_da - rt.total_lmp_rt)::double precision AS total_price,
        (da.system_energy_price_da - rt.system_energy_price_rt)::double precision AS energy_price,
        (da.congestion_price_da - rt.congestion_price_rt)::double precision AS congestion_price,
        (da.marginal_loss_price_da - rt.marginal_loss_price_rt)::double precision AS loss_price,
        to_char(greatest(da.updated_at, rt.updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') AS as_of
      FROM pjm.da_hrl_lmps da
      JOIN pjm.rt_hrl_lmps rt
        ON rt.datetime_beginning_utc = da.datetime_beginning_utc
       AND rt.pnode_name = da.pnode_name
       AND rt.row_is_current = true
      WHERE da.pnode_name = $1
        AND da.row_is_current = true
        AND da.datetime_beginning_ept >= make_date($2::integer, 1, 1)::timestamp
        AND da.datetime_beginning_ept < make_date($3::integer + 1, 1, 1)::timestamp
        AND EXTRACT(MONTH FROM da.datetime_beginning_ept)::integer = $4
      ORDER BY da.datetime_beginning_ept
    `;
  }

  if (market === "RT_UNVERIFIED") {
    return `
      SELECT
        to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') AS datetime_beginning_ept,
        datetime_beginning_ept::date::text AS market_date,
        EXTRACT(YEAR FROM datetime_beginning_ept)::integer AS year,
        EXTRACT(ISODOW FROM datetime_beginning_ept)::integer AS iso_dow,
        EXTRACT(HOUR FROM datetime_beginning_ept)::integer + 1 AS hour_ending,
        total_lmp_rt::double precision AS total_price,
        (total_lmp_rt - congestion_price_rt - marginal_loss_price_rt)::double precision AS energy_price,
        congestion_price_rt::double precision AS congestion_price,
        marginal_loss_price_rt::double precision AS loss_price,
        to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS as_of
      FROM pjm.rt_unverified_hrl_lmps
      WHERE pnode_name = $1
        AND datetime_beginning_ept >= make_date($2::integer, 1, 1)::timestamp
        AND datetime_beginning_ept < make_date($3::integer + 1, 1, 1)::timestamp
        AND EXTRACT(MONTH FROM datetime_beginning_ept)::integer = $4
      ORDER BY datetime_beginning_ept
    `;
  }

  return `
    SELECT
      to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') AS datetime_beginning_ept,
      datetime_beginning_ept::date::text AS market_date,
      EXTRACT(YEAR FROM datetime_beginning_ept)::integer AS year,
      EXTRACT(ISODOW FROM datetime_beginning_ept)::integer AS iso_dow,
      EXTRACT(HOUR FROM datetime_beginning_ept)::integer + 1 AS hour_ending,
      total_lmp_rt::double precision AS total_price,
      system_energy_price_rt::double precision AS energy_price,
      congestion_price_rt::double precision AS congestion_price,
      marginal_loss_price_rt::double precision AS loss_price,
      to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS as_of
    FROM pjm.rt_hrl_lmps
    WHERE pnode_name = $1
      AND row_is_current = true
      AND datetime_beginning_ept >= make_date($2::integer, 1, 1)::timestamp
      AND datetime_beginning_ept < make_date($3::integer + 1, 1, 1)::timestamp
      AND EXTRACT(MONTH FROM datetime_beginning_ept)::integer = $4
    ORDER BY datetime_beginning_ept
  `;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

function selectedValue(row: NormalizedRow, component: ComponentKey): number | null {
  if (component === "energy") return row.energy;
  if (component === "congestion") return row.congestion;
  if (component === "loss") return row.loss;
  return row.total;
}

function isOnPeak(row: NormalizedRow): boolean {
  return isPjmPowerOnPeakHour(row.date, row.hourEnding);
}

function periodMatches(period: TermPeriod, row: NormalizedRow): boolean {
  if (period === "all") return true;
  if (period === "5x16") return isOnPeak(row);
  if (period === "7x16") return row.hourEnding >= 8 && row.hourEnding <= 23;
  if (period === "7x8") return row.hourEnding < 8 || row.hourEnding > 23;
  if (period === "wrap") return row.hourEnding < 8 || row.hourEnding > 23 || row.isNercOffPeakDay;
  return true;
}

function periodDefinition(period: TermPeriod): string {
  if (period === "all") return "All settlement strips; hourly breakdown uses all hours";
  if (period === "5x16") return "NERC business-day HE8-23";
  if (period === "7x16") return "All days HE8-23; no holiday adjustment";
  if (period === "7x8") return "All days HE1-7 and HE24; no holiday adjustment";
  if (period === "wrap") return "7x8 plus NERC off-peak day HE8-23";
  return "All hours; no holiday adjustment";
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function groupedAverage(
  rows: NormalizedRow[],
  years: number[],
  predicate: (row: NormalizedRow) => boolean,
): { values: ValueMap; counts: CountMap; mean: number | null; median: number | null } {
  const values: ValueMap = {};
  const counts: CountMap = {};
  const yearlyValues: number[] = [];

  for (const year of years) {
    const prices = rows
      .filter((row) => row.year === year && predicate(row) && row.selectedPrice !== null)
      .map((row) => row.selectedPrice as number);
    counts[String(year)] = prices.length;
    values[String(year)] = round(average(prices));
    if (values[String(year)] !== null) yearlyValues.push(values[String(year)] as number);
  }

  return {
    values,
    counts,
    mean: round(average(yearlyValues)),
    median: round(median(yearlyValues)),
  };
}

function buildSettlementBlocks(rows: NormalizedRow[], years: number[], period: TermPeriod): SettlementBlock[] {
  const blocks = period === "all" ? BLOCKS : BLOCKS.filter((block) => block.key === period);
  return blocks.map((block) => ({
    key: block.key,
    label: block.label,
    code: block.code,
    description: block.description,
    ...groupedAverage(rows, years, block.matches),
  }));
}

function buildHourlyBreakdown(rows: NormalizedRow[], years: number[]): HourlyBreakdownRow[] {
  return Array.from({ length: 24 }, (_, index) => {
    const hourEnding = index + 1;
    return {
      hourEnding,
      ...groupedAverage(rows, years, (row) => row.hourEnding === hourEnding),
    };
  });
}

function buildScarcityHours(rows: NormalizedRow[], scarcityLimit: number): ScarcityHourRow[] {
  return rows
    .filter((row) => row.selectedPrice !== null)
    .sort((left, right) => (right.selectedPrice ?? -Infinity) - (left.selectedPrice ?? -Infinity))
    .slice(0, scarcityLimit)
    .map((row, index) => ({
      rank: index + 1,
      date: row.date,
      datetimeBeginningEpt: row.datetimeBeginningEpt,
      year: row.year,
      hourEnding: row.hourEnding,
      price: round(row.selectedPrice),
      total: round(row.total),
      energy: round(row.energy),
      congestion: round(row.congestion),
      loss: round(row.loss),
    }));
}

function normalizeRows(rows: SourceRow[], component: ComponentKey): NormalizedRow[] {
  return rows.map((row) => {
    const normalized = {
      datetimeBeginningEpt: row.datetime_beginning_ept,
      date: row.market_date,
      year: Number(row.year),
      isoDow: Number(row.iso_dow),
      hourEnding: Number(row.hour_ending),
      isNercOffPeakDay: isNercOffPeakDay(row.market_date),
      isNercHoliday: isNercHoliday(row.market_date),
      total: toNumber(row.total_price),
      energy: toNumber(row.energy_price),
      congestion: toNumber(row.congestion_price),
      loss: toNumber(row.loss_price),
      selectedPrice: null,
      asOf: row.as_of,
    };
    return {
      ...normalized,
      selectedPrice: selectedValue(normalized, component),
    };
  });
}

function subtractValues(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

function buildSpreadRows({
  fromRows,
  toRows,
  component,
}: {
  fromRows: NormalizedRow[];
  toRows: NormalizedRow[];
  component: ComponentKey;
}): NormalizedRow[] {
  const fromByTimestamp = new Map(fromRows.map((row) => [row.datetimeBeginningEpt, row]));
  return toRows
    .map((toRow) => {
      const fromRow = fromByTimestamp.get(toRow.datetimeBeginningEpt);
      if (!fromRow) return null;
      const normalized: NormalizedRow = {
        datetimeBeginningEpt: toRow.datetimeBeginningEpt,
        date: toRow.date,
        year: toRow.year,
        isoDow: toRow.isoDow,
        hourEnding: toRow.hourEnding,
        total: subtractValues(toRow.total, fromRow.total),
        energy: subtractValues(toRow.energy, fromRow.energy),
        congestion: subtractValues(toRow.congestion, fromRow.congestion),
        loss: subtractValues(toRow.loss, fromRow.loss),
        isNercOffPeakDay: toRow.isNercOffPeakDay,
        isNercHoliday: toRow.isNercHoliday,
        selectedPrice: null,
        asOf: maxString([toRow.asOf, fromRow.asOf]),
      };
      return {
        ...normalized,
        selectedPrice: selectedValue(normalized, component),
      };
    })
    .filter((row): row is NormalizedRow => Boolean(row));
}

function maxString(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function minString(values: string[]): string | null {
  return values.length ? [...values].sort()[0] : null;
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const market = parseMarket(searchParams.get("market"), searchParams.get("rtSource"));
  const view = parseView(searchParams.get("view"));
  const period = parsePeriod(searchParams.get("period") ?? searchParams.get("strip"));
  const component = parseComponent(searchParams.get("component"));
  const month = parseMonth(searchParams.get("month"));
  const location = parseLocation(searchParams.get("location") ?? searchParams.get("hub"));
  const fromLocation = parseLocation(searchParams.get("fromLocation") ?? searchParams.get("fromHub"));
  const toLocation = parseLocation(searchParams.get("toLocation") ?? searchParams.get("toHub"));
  const currentYear = new Date().getUTCFullYear();
  const requestedStartYear = clampYear(parseYear(searchParams.get("startYear"), DEFAULT_START_YEAR));
  const requestedEndYear = clampYear(parseYear(searchParams.get("endYear"), currentYear));
  const endYear = Math.max(requestedStartYear, requestedEndYear);
  const earliestStartYear = Math.max(MIN_YEAR, endYear - MAX_YEAR_SPAN + 1);
  const startYear = Math.min(endYear, Math.max(requestedStartYear, earliestStartYear));
  const years = yearsBetween(startYear, endYear);
  const scarcityLimit = parseScarcityLimit(searchParams.get("scarcityLimit"));

  const rows =
    view === "spread"
      ? buildSpreadRows({
          fromRows: normalizeRows(
            await query<SourceRow>(sourceSql(market), [
              fromLocation,
              startYear,
              endYear,
              month,
            ]),
            component,
          ),
          toRows: normalizeRows(
            await query<SourceRow>(sourceSql(market), [
              toLocation,
              startYear,
              endYear,
              month,
            ]),
            component,
          ),
          component,
        })
      : normalizeRows(
          await query<SourceRow>(sourceSql(market), [
            location,
            startYear,
            endYear,
            month,
          ]),
          component,
        );
  const periodRows = rows.filter((row) => periodMatches(period, row));

  if (!periodRows.length) {
    return {
      status: 404,
      payload: { error: "No PJM historical settlement rows are available for the selected filters" },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  const dates = periodRows.map((row) => row.date);
  const asOf = maxString(rows.map((row) => row.asOf));
  const payload: Payload = {
    iso: "pjm",
    market,
    component,
    location: view === "spread" ? `${toLocation} - ${fromLocation}` : location,
    month,
    monthLabel: MONTH_LABELS[month - 1],
    startYear,
    endYear,
    years,
    sourceTable: sourceTable(market),
    asOf,
    rowCount: periodRows.length,
    minDate: minString(dates),
    maxDate: maxString(dates),
    settlementBlocks: buildSettlementBlocks(rows, years, period),
    hourlyBreakdown: buildHourlyBreakdown(periodRows, years),
    scarcityHours: buildScarcityHours(periodRows, scarcityLimit),
    metadata: {
      availableLocations: LOCATIONS,
      holidayAdjustment: "NERC off-peak days are applied to 5x16 and wrap classifications.",
      maxYearSpan: MAX_YEAR_SPAN,
      scarcityLimit,
      view,
      period,
      periodDefinition: periodDefinition(period),
      ...(view === "spread"
        ? {
            spread: {
              fromLocation,
              toLocation,
              formula: `${toLocation} - ${fromLocation}`,
            },
          }
        : {}),
    },
  };

  return {
    payload,
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: periodRows.length,
    dataAsOf: asOf,
  };
});

export const GET = observedGET;
