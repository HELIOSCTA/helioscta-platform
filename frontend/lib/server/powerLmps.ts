import "server-only";

import { query } from "@/lib/server/db";
import {
  bindPromotedSql,
  readPjmDaPromotedSql,
} from "@/lib/server/pjmDaPromotedSql";
import {
  DEFAULT_POWER_LMP_METRIC_MODE,
  DEFAULT_POWER_LMP_SPARK_HEAT_RATE,
  defaultPowerLmpGasHubForIso,
  isPowerLmpGasHubAllowedForIso,
  normalizePowerLmpSparkHeatRate,
  parsePowerLmpSparkHeatRate,
  type PowerLmpGasHubKey,
  type PowerLmpMetricMode,
  parsePowerLmpGasHubKey,
  parsePjmHeatRateGasHubKey,
  parsePowerLmpMetricMode,
  powerLmpGasHubConfig,
} from "@/lib/powerLmpHeatRate";
import { NERC_OFF_PEAK_CALENDAR } from "@/lib/tradingCalendars";

export type PowerIso = "pjm" | "ercot" | "isone" | "caiso" | "miso" | "spp" | "nyiso";
export type PowerLmpProduct = "da" | "rt";
export type RtLmpSource = "verified" | "unverified";
export type ComponentKey = "energy" | "congestion" | "loss" | "total";
export type PowerSettlesDashboardComponent = "total" | "energy" | "congestion" | "loss";
export type { PowerLmpGasHubKey, PowerLmpMetricMode };
export {
  parsePowerLmpGasHubKey as parsePowerLmpGasHub,
  parsePjmHeatRateGasHubKey as parsePjmHeatRateGasHub,
  parsePowerLmpMetricMode as parsePowerLmpMetric,
  parsePowerLmpSparkHeatRate as parsePowerSettlesSparkHeatRate,
};

const PJM_HUBS = [
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

const ERCOT_HUBS = ["HB_NORTH", "HB_SOUTH", "HB_WEST", "HB_HOUSTON"] as const;
const ISONE_HUBS = [".H.INTERNAL_HUB"] as const;
const CAISO_HUBS = ["TH_SP15_GEN-APND", "TH_NP15_GEN-APND"] as const;
const MISO_HUBS = [
  "INDIANA.HUB",
  "ARKANSAS.HUB",
  "ILLINOIS.HUB",
  "LOUISIANA.HUB",
  "MICHIGAN.HUB",
  "MINN.HUB",
  "TEXAS.HUB",
] as const;
const SPP_HUBS = ["SPPNORTH_HUB", "SPPSOUTH_HUB"] as const;
const NYISO_HUBS = [
  "WEST",
  "GENESE",
  "CENTRL",
  "NORTH",
  "MHK VL",
  "CAPITL",
  "HUD VL",
  "MILLWD",
  "DUNWOD",
  "N.Y.C.",
  "LONGIL",
] as const;
const PJM_DASHBOARD_HUBS = PJM_HUBS;
const ERCOT_DASHBOARD_HUBS = ERCOT_HUBS;
const ISONE_DASHBOARD_HUBS = ISONE_HUBS;
const CAISO_DASHBOARD_HUBS = CAISO_HUBS;
const MISO_DASHBOARD_HUBS = MISO_HUBS;
const SPP_DASHBOARD_HUBS = SPP_HUBS;
const NYISO_DASHBOARD_HUBS = NYISO_HUBS;
export const POWER_SETTLES_DASHBOARD_DEFAULT_RT_SOURCE: RtLmpSource = "verified";

interface IsoConfig {
  iso: PowerIso;
  label: string;
  defaultHub: string;
  hubs: readonly string[];
  dashboardHubs: readonly string[];
  supportsComponents: boolean;
}

const ISO_CONFIGS: Record<PowerIso, IsoConfig> = {
  pjm: {
    iso: "pjm",
    label: "PJM",
    defaultHub: "WESTERN HUB",
    hubs: PJM_HUBS,
    dashboardHubs: PJM_DASHBOARD_HUBS,
    supportsComponents: true,
  },
  ercot: {
    iso: "ercot",
    label: "ERCOT",
    defaultHub: "HB_NORTH",
    hubs: ERCOT_HUBS,
    dashboardHubs: ERCOT_DASHBOARD_HUBS,
    supportsComponents: false,
  },
  isone: {
    iso: "isone",
    label: "ISO-NE",
    defaultHub: ".H.INTERNAL_HUB",
    hubs: ISONE_HUBS,
    dashboardHubs: ISONE_DASHBOARD_HUBS,
    supportsComponents: true,
  },
  caiso: {
    iso: "caiso",
    label: "CAISO",
    defaultHub: "TH_SP15_GEN-APND",
    hubs: CAISO_HUBS,
    dashboardHubs: CAISO_DASHBOARD_HUBS,
    supportsComponents: true,
  },
  miso: {
    iso: "miso",
    label: "MISO",
    defaultHub: "INDIANA.HUB",
    hubs: MISO_HUBS,
    dashboardHubs: MISO_DASHBOARD_HUBS,
    supportsComponents: true,
  },
  spp: {
    iso: "spp",
    label: "SPP",
    defaultHub: "SPPNORTH_HUB",
    hubs: SPP_HUBS,
    dashboardHubs: SPP_DASHBOARD_HUBS,
    supportsComponents: true,
  },
  nyiso: {
    iso: "nyiso",
    label: "NYISO",
    defaultHub: "N.Y.C.",
    hubs: NYISO_HUBS,
    dashboardHubs: NYISO_DASHBOARD_HUBS,
    supportsComponents: true,
  },
};

const POWER_SETTLES_DASHBOARD_ISOS: PowerIso[] = [
  "pjm",
  "ercot",
  "isone",
  "caiso",
  "miso",
  "spp",
  "nyiso",
];
export const POWER_SETTLES_EMAIL_REPORT_ISOS: PowerIso[] = [
  ...POWER_SETTLES_DASHBOARD_ISOS,
];
const POWER_SETTLES_DEFAULT_TIME_ZONE = "America/Denver";

const PEAK_WINDOW_BY_ISO: Record<PowerIso, { start: number; end: number }> = {
  pjm: { start: 8, end: 23 },
  ercot: { start: 7, end: 22 },
  isone: { start: 8, end: 23 },
  caiso: { start: 7, end: 22 },
  miso: { start: 7, end: 22 },
  spp: { start: 7, end: 22 },
  nyiso: { start: 8, end: 23 },
};

const POWER_LMP_MARKET_TIMEZONE_BY_ISO: Record<PowerIso, string> = {
  pjm: "America/New_York",
  ercot: "America/Chicago",
  isone: "America/New_York",
  caiso: "America/Los_Angeles",
  miso: "America/Chicago",
  spp: "America/Chicago",
  nyiso: "America/New_York",
};

interface LmpRow {
  datetime_beginning_ept: string;
  hub: string;
  hour_ending: number;
  system_energy: number | string | null;
  total: number | string | null;
  congestion: number | string | null;
  marginal_loss: number | string | null;
  as_of: string | null;
  gas_metadata?: PowerLmpHeatRateGasHourMetadata | null;
}

interface HourRow {
  market_date: string;
  hour_ending: number;
  value: number | string | null;
  as_of: string | null;
}

export interface PowerLmpHeatRateGasHourMetadata {
  date: string;
  hourEnding: number;
  gasDay: string | null;
  tradeDate: string | null;
  gasHub: PowerLmpGasHubKey;
  gasHubLabel: string;
  gasSymbol: string;
  gasMetadataStatus: string;
  gasReviewStatus: string;
  gasSourceHubName: string | null;
  gasPrice: number | null;
  gasPriceSource: string | null;
  latestTradeDate: string | null;
  updatedAt: string | null;
  contractDatesUpdatedAt: string | null;
  sourceTable: "ice_python_next_day_gas";
}

export interface PowerLmpHeatRateMetadata {
  units: "MMBtu/MWh";
  gasHub: PowerLmpGasHubKey;
  gasHubLabel: string;
  gasSymbol: string;
  gasMetadataStatus: string;
  gasReviewStatus: string;
  gasPriceColumn: string;
  sourceTable: "ice_python_next_day_gas";
  latestGasDay: string | null;
  latestTradeDate: string | null;
  latestAsOf: string | null;
  missingGasHourCount: number;
  hourly: PowerLmpHeatRateGasHourMetadata[];
}

export type PjmHeatRateGasHourMetadata = PowerLmpHeatRateGasHourMetadata;
export type PjmHeatRateMetadata = PowerLmpHeatRateMetadata;

type PowerSettlesDashboardStatus = "ok" | "partial" | "missing";
export type PowerSettlesDashboardRtSourceStatus = "requested" | "fallback" | "single-source";

interface HourlyValueSet {
  values: Array<number | null>;
  asOf: string | null;
}

export interface PowerSettlesDashboardProductSummary {
  flatAvg: number | null;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  peakHour: number | null;
  peakPrice: number | null;
  observationCount: number;
}

export interface PowerSettlesDashboardInputSummary {
  gasHub: PowerLmpGasHubKey;
  gasHubLabel: string;
  gasSymbol: string;
  gasMetadataStatus: string;
  gasReviewStatus: string;
  units: "MMBtu/MWh";
  sparkUnits: "$/MWh";
  sparkHeatRate: number;
  sourceTable: "ice_python_next_day_gas";
  latestGasDay: string | null;
  latestTradeDate: string | null;
  latestAsOf: string | null;
  gas: PowerSettlesDashboardProductSummary;
  daHeatRate: PowerSettlesDashboardProductSummary;
  rtHeatRate: PowerSettlesDashboardProductSummary;
  daSpark: PowerSettlesDashboardProductSummary;
  rtSpark: PowerSettlesDashboardProductSummary;
}

export interface PowerSettlesDashboardIsoRow {
  iso: PowerIso;
  isoLabel: string;
  hub: string;
  effectiveComponent: PowerSettlesDashboardComponent;
  effectiveRtSource: RtLmpSource;
  rtSourceStatus: PowerSettlesDashboardRtSourceStatus;
  targetDate: string | null;
  latestDaDate: string | null;
  latestRtDate: string | null;
  daAsOf: string | null;
  rtAsOf: string | null;
  dataAsOf: string | null;
  sourceTables: {
    da: string;
    rt: string;
  };
  status: PowerSettlesDashboardStatus;
  statusDetail: string;
  detailUrl: string | null;
  products: {
    da: PowerSettlesDashboardProductSummary;
    rt: PowerSettlesDashboardProductSummary;
    dart: PowerSettlesDashboardProductSummary;
  };
  inputs?: PowerSettlesDashboardInputSummary | null;
}

export interface PowerSettlesDashboardPayload {
  component: PowerSettlesDashboardComponent;
  rtSource: RtLmpSource;
  lookbackDays: number;
  sparkHeatRate: number;
  requestedDate: string | null;
  defaultDate: string;
  datePolicy: "requested" | "default-yesterday";
  rows: PowerSettlesDashboardIsoRow[];
  summary: {
    isoCount: number;
    completeIsoCount: number;
    partialIsoCount: number;
    missingIsoCount: number;
    hubCount: number;
    completeHubCount: number;
    partialHubCount: number;
    missingHubCount: number;
    unverifiedFallbackHubCount: number;
    latestAsOf: string | null;
  };
  calendarMetadata?: {
    calendarId: string;
    label: string;
    source: string | null;
  };
}

export function parsePowerIso(raw: string | null): PowerIso {
  if (
    raw === "ercot" ||
    raw === "isone" ||
    raw === "caiso" ||
    raw === "miso" ||
    raw === "spp" ||
    raw === "nyiso"
  ) {
    return raw;
  }
  return "pjm";
}

export function parsePowerProduct(raw: string | null): PowerLmpProduct {
  return raw === "rt" ? "rt" : "da";
}

export function parseRtSource(raw: string | null): RtLmpSource {
  return raw === "verified" ? "verified" : "unverified";
}

export function parsePowerSettlesRtSource(raw: string | null): RtLmpSource {
  return raw === "unverified" ? "unverified" : POWER_SETTLES_DASHBOARD_DEFAULT_RT_SOURCE;
}

export function parsePowerSettlesComponent(raw: string | null): PowerSettlesDashboardComponent {
  if (raw === "energy" || raw === "congestion" || raw === "loss") return raw;
  return "total";
}

export function parseDate(raw: string | null): string | null {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function calendarDatePartsInTimeZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
  };
}

export function defaultPowerSettlesDashboardDate(now = new Date()): string {
  const { year, month, day } = calendarDatePartsInTimeZone(
    now,
    POWER_SETTLES_DEFAULT_TIME_ZONE,
  );
  const localCalendarDate = new Date(Date.UTC(year, month - 1, day));
  localCalendarDate.setUTCDate(localCalendarDate.getUTCDate() - 1);
  return localCalendarDate.toISOString().slice(0, 10);
}

export function parsePowerSettlesLookbackDays(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(Math.max(parsed, 1), 14);
}

function parseDateWithFallback(value: string | null, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function promotedSqlBody(sql: string): string {
  return sql.trim().replace(/;\s*$/, "");
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value !== null);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function emptyHours(): Array<number | null> {
  return Array.from({ length: 24 }, () => null);
}

function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  while (cursor <= stop) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function offsetIsoDate(value: string, days: number): string {
  const cursor = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime())) return value;
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

function inclusiveDayCount(start: string, end: string): number {
  const startTime = new Date(`${start}T00:00:00Z`).getTime();
  const endTime = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return 0;
  return Math.floor((endTime - startTime) / 86_400_000) + 1;
}

function maxStamp(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function gasHourKey(date: string, hourEnding: number): string {
  return `${date}|${hourEnding}`;
}

function isOnPeakHour(iso: PowerIso, hourEnding: number): boolean {
  const window = PEAK_WINDOW_BY_ISO[iso];
  return hourEnding >= window.start && hourEnding <= window.end;
}

function nercPowerDayMetadata(date: string): {
  isWeekend: boolean;
  isNercHoliday: boolean;
  holidayName: string | null;
  isNercOffPeakDay: boolean;
} {
  const isWeekend = NERC_OFF_PEAK_CALENDAR.isWeekend(date);
  const holiday = NERC_OFF_PEAK_CALENDAR.getHoliday(date);
  return {
    isWeekend,
    isNercHoliday: Boolean(holiday),
    holidayName: holiday?.name ?? null,
    isNercOffPeakDay: isWeekend || Boolean(holiday),
  };
}

interface PowerLmpHeatRateGasHourlyDbRow {
  date: string;
  hour_ending: number | string;
  gas_day: string | null;
  trade_date: string | null;
  hub_name: string | null;
  gas_price: number | string | null;
  price_basis: string | null;
  latest_trade_date: string | null;
  updated_at: string | null;
  contract_dates_updated_at: string | null;
}

function resolvePowerLmpHeatRateGasHub({
  iso,
  powerHub,
  gasHub,
}: {
  iso: PowerIso;
  powerHub?: string | null;
  gasHub?: PowerLmpGasHubKey | null;
}): { gasHub: PowerLmpGasHubKey; error: string | null } {
  const resolvedGasHub = gasHub ?? defaultPowerLmpGasHubForIso(iso, powerHub);
  if (isPowerLmpGasHubAllowedForIso(iso, resolvedGasHub)) {
    return { gasHub: resolvedGasHub, error: null };
  }
  const config = powerLmpGasHubConfig(resolvedGasHub);
  return {
    gasHub: resolvedGasHub,
    error: `${config.label} is not configured for ${ISO_CONFIGS[iso].label} heat-rate mode.`,
  };
}

async function powerLmpHeatRateGasHours({
  iso,
  startDate,
  endDate,
  gasHub,
}: {
  iso: PowerIso;
  startDate: string;
  endDate: string;
  gasHub: PowerLmpGasHubKey;
}): Promise<PowerLmpHeatRateGasHourMetadata[]> {
  const config = powerLmpGasHubConfig(gasHub);
  const gasStartDate = offsetIsoDate(startDate, -1);
  const dailyPromoted = bindPromotedSql(readPjmDaPromotedSql("ice_python_next_day_gas"), {
    start_date: gasStartDate,
    end_date: endDate,
  });
  const symbolParam = `$${dailyPromoted.values.length + 1}`;
  const timezoneParam = `$${dailyPromoted.values.length + 2}`;
  const startParam = `$${dailyPromoted.values.length + 3}`;
  const endParam = `$${dailyPromoted.values.length + 4}`;
  const rows = await query<PowerLmpHeatRateGasHourlyDbRow>(
    `
      with gas_daily as (
        ${promotedSqlBody(dailyPromoted.text)}
      ),
      market_hours as (
        select
          market_date::date as date,
          hour_ending::int as hour_ending,
          (
            market_date::timestamp
            + ((hour_ending::int - 1) * interval '1 hour')
          ) at time zone ${timezoneParam}::text at time zone 'America/Chicago' as central_local
        from generate_series(${startParam}::date, ${endParam}::date, interval '1 day') as d(market_date)
        cross join generate_series(1, 24) as h(hour_ending)
      ),
      hourly_gas_day as (
        select
          date,
          hour_ending,
          case
            when central_local::time >= time '09:00:00' then central_local::date
            else (central_local::date - interval '1 day')::date
          end as gas_day
        from market_hours
      )
      select
        h.date::date::text as date,
        h.hour_ending,
        h.gas_day::date::text as gas_day,
        gas_daily.trade_date::date::text as trade_date,
        gas_daily.hub_name,
        gas_daily.gas_price::float8 as gas_price,
        gas_daily.price_basis,
        gas_daily.latest_trade_date::date::text as latest_trade_date,
        to_char(gas_daily.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at,
        to_char(gas_daily.contract_dates_updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as contract_dates_updated_at
      from hourly_gas_day h
      left join gas_daily
        on gas_daily.gas_day = h.gas_day
       and gas_daily.symbol = ${symbolParam}::text
      order by h.date, h.hour_ending
    `,
    [
      ...dailyPromoted.values,
      config.symbol,
      POWER_LMP_MARKET_TIMEZONE_BY_ISO[iso],
      startDate,
      endDate,
    ],
  );

  return rows.map((row) => ({
    date: row.date,
    hourEnding: Number(row.hour_ending),
    gasDay: row.gas_day,
    tradeDate: row.trade_date,
    gasHub,
    gasHubLabel: config.label,
    gasSymbol: config.symbol,
    gasMetadataStatus: config.metadataStatus,
    gasReviewStatus: config.reviewStatus,
    gasSourceHubName: row.hub_name ?? config.label,
    gasPrice: toNumber(row.gas_price),
    gasPriceSource: row.price_basis,
    latestTradeDate: row.latest_trade_date,
    updatedAt: row.updated_at,
    contractDatesUpdatedAt: row.contract_dates_updated_at,
    sourceTable: "ice_python_next_day_gas",
  }));
}

function heatRateMetadata({
  gasHub,
  gasHours,
}: {
  gasHub: PowerLmpGasHubKey;
  gasHours: PowerLmpHeatRateGasHourMetadata[];
}): PowerLmpHeatRateMetadata {
  const config = powerLmpGasHubConfig(gasHub);
  return {
    units: "MMBtu/MWh",
    gasHub,
    gasHubLabel: config.label,
    gasSymbol: config.symbol,
    gasMetadataStatus: config.metadataStatus,
    gasReviewStatus: config.reviewStatus,
    gasPriceColumn: config.sqlColumn,
    sourceTable: "ice_python_next_day_gas",
    latestGasDay: maxStamp(gasHours.map((row) => row.gasDay)),
    latestTradeDate: maxStamp(gasHours.map((row) => row.latestTradeDate)),
    latestAsOf: maxStamp(gasHours.map((row) => row.updatedAt)),
    missingGasHourCount: gasHours.filter((row) => row.gasPrice === null).length,
    hourly: gasHours,
  };
}

function gasHoursByDateHour(
  gasHours: PowerLmpHeatRateGasHourMetadata[],
): Map<string, PowerLmpHeatRateGasHourMetadata> {
  return new Map(gasHours.map((row) => [gasHourKey(row.date, row.hourEnding), row] as const));
}

function divideByGas(value: number | string | null, gas: number | null): number | null {
  const numerator = toNumber(value);
  if (numerator === null || gas === null || gas === 0) return null;
  return numerator / gas;
}

function sparkSpreadValue(
  value: number | string | null,
  gas: number | null,
  sparkHeatRate: number,
): number | null {
  const lmp = toNumber(value);
  if (lmp === null || gas === null) return null;
  return lmp - gas * sparkHeatRate;
}

function gasHourlyValues(
  gasHoursByHour: Map<string, PowerLmpHeatRateGasHourMetadata>,
  date: string,
): Array<number | null> {
  return Array.from(
    { length: 24 },
    (_, index) => gasHoursByHour.get(gasHourKey(date, index + 1))?.gasPrice ?? null,
  );
}

function divideHourlyValuesByGas(
  values: Array<number | null>,
  gasValues: Array<number | null>,
): Array<number | null> {
  return values.map((value, index) => divideByGas(value, gasValues[index] ?? null));
}

function sparkHourlyValues(
  values: Array<number | null>,
  gasValues: Array<number | null>,
  sparkHeatRate: number,
): Array<number | null> {
  return values.map((value, index) =>
    sparkSpreadValue(value, gasValues[index] ?? null, sparkHeatRate),
  );
}

function buildPowerSettlesInputSummary({
  iso,
  targetDate,
  isNercOffPeakDay,
  gasHub,
  sparkHeatRate,
  gasHours,
  daValues,
  rtValues,
  daSparkValues,
  rtSparkValues,
}: {
  iso: PowerIso;
  targetDate: string;
  isNercOffPeakDay?: boolean;
  gasHub: PowerLmpGasHubKey;
  sparkHeatRate: number;
  gasHours: PowerLmpHeatRateGasHourMetadata[];
  daValues: Array<number | null>;
  rtValues: Array<number | null>;
  daSparkValues: Array<number | null>;
  rtSparkValues: Array<number | null>;
}): PowerSettlesDashboardInputSummary {
  const metadata = heatRateMetadata({ gasHub, gasHours });
  const gasValues = gasHourlyValues(gasHoursByDateHour(gasHours), targetDate);

  return {
    gasHub,
    gasHubLabel: metadata.gasHubLabel,
    gasSymbol: metadata.gasSymbol,
    gasMetadataStatus: metadata.gasMetadataStatus,
    gasReviewStatus: metadata.gasReviewStatus,
    units: metadata.units,
    sparkUnits: "$/MWh",
    sparkHeatRate,
    sourceTable: metadata.sourceTable,
    latestGasDay: metadata.latestGasDay,
    latestTradeDate: metadata.latestTradeDate,
    latestAsOf: metadata.latestAsOf,
    gas: productSummary(iso, gasValues, { isNercOffPeakDay }),
    daHeatRate: productSummary(iso, divideHourlyValuesByGas(daValues, gasValues), {
      isNercOffPeakDay,
    }),
    rtHeatRate: productSummary(iso, divideHourlyValuesByGas(rtValues, gasValues), {
      isNercOffPeakDay,
    }),
    daSpark: productSummary(iso, sparkHourlyValues(daSparkValues, gasValues, sparkHeatRate), {
      isNercOffPeakDay,
    }),
    rtSpark: productSummary(iso, sparkHourlyValues(rtSparkValues, gasValues, sparkHeatRate), {
      isNercOffPeakDay,
    }),
  };
}

function applyHeatRateToLmpRows(
  rows: LmpRow[],
  gasHoursByDateHour: Map<string, PowerLmpHeatRateGasHourMetadata>,
): LmpRow[] {
  return rows.map((row) => {
    const gas = gasHoursByDateHour.get(
      gasHourKey(row.datetime_beginning_ept.slice(0, 10), Number(row.hour_ending)),
    );
    const gasPrice = gas?.gasPrice ?? null;
    return {
      ...row,
      system_energy: divideByGas(row.system_energy, gasPrice),
      total: divideByGas(row.total, gasPrice),
      congestion: divideByGas(row.congestion, gasPrice),
      marginal_loss: divideByGas(row.marginal_loss, gasPrice),
      as_of: maxStamp([row.as_of, gas?.updatedAt ?? null]),
      gas_metadata: gas ?? null,
    };
  });
}

function applyHeatRateToHourRows(
  rows: HourRow[],
  gasHoursByDateHour: Map<string, PowerLmpHeatRateGasHourMetadata>,
): HourRow[] {
  return rows.map((row) => {
    const gas = gasHoursByDateHour.get(gasHourKey(row.market_date, Number(row.hour_ending)));
    return {
      ...row,
      value: divideByGas(row.value, gas?.gasPrice ?? null),
      as_of: maxStamp([row.as_of, gas?.updatedAt ?? null]),
    };
  });
}

function applySparkSpreadToHourRows(
  rows: HourRow[],
  gasHoursByDateHour: Map<string, PowerLmpHeatRateGasHourMetadata>,
  sparkHeatRate: number,
): HourRow[] {
  return rows.map((row) => {
    const gas = gasHoursByDateHour.get(gasHourKey(row.market_date, Number(row.hour_ending)));
    return {
      ...row,
      value: sparkSpreadValue(row.value, gas?.gasPrice ?? null, sparkHeatRate),
      as_of: maxStamp([row.as_of, gas?.updatedAt ?? null]),
    };
  });
}

function summarizeHub(iso: PowerIso, hub: string, rows: LmpRow[]) {
  const hourly = rows.map((row) => {
    const item = {
      hourEnding: Number(row.hour_ending),
      datetimeBeginningEpt: row.datetime_beginning_ept,
      total: toNumber(row.total),
      systemEnergy: toNumber(row.system_energy),
      congestion: toNumber(row.congestion),
      marginalLoss: toNumber(row.marginal_loss),
    };
    return row.gas_metadata ? { ...item, gasMetadata: row.gas_metadata } : item;
  });
  const onPeak = hourly.filter((row) => isOnPeakHour(iso, row.hourEnding));
  const offPeak = hourly.filter((row) => !isOnPeakHour(iso, row.hourEnding));
  const peak = hourly.reduce<(typeof hourly)[number] | null>((best, row) => {
    if (row.total === null) return best;
    return !best || best.total === null || row.total > best.total ? row : best;
  }, null);
  return {
    hub,
    onPeakAvg: avg(onPeak.map((row) => row.total)),
    offPeakAvg: avg(offPeak.map((row) => row.total)),
    flatAvg: avg(hourly.map((row) => row.total)),
    peakHour: peak?.hourEnding ?? null,
    peakPrice: peak?.total ?? null,
    hourly,
  };
}

function pjmRtTable(rtSource: RtLmpSource) {
  return rtSource === "verified"
    ? {
        sourceTable: "pjm.rt_hrl_lmps",
        currentFilter: "and row_is_current = true",
        energyExpr: "system_energy_price_rt",
      }
    : {
        sourceTable: "pjm.rt_unverified_hrl_lmps",
        currentFilter: "",
        energyExpr: "(total_lmp_rt - congestion_price_rt - marginal_loss_price_rt)",
      };
}

function isoneRtTable(rtSource: RtLmpSource) {
  return rtSource === "verified"
    ? {
        sourceTable: "isone.rt_hrl_lmps_final",
        latestColumn: "date",
        hubColumn: "location_name",
        hubFilter: "and location_type = 'HUB'",
        totalColumn: "locational_marginal_price",
        energyColumn: "energy_component",
        congestionColumn: "congestion_component",
        lossColumn: "marginal_loss_component",
      }
    : {
        sourceTable: "isone.rt_hrl_lmps_prelim",
        latestColumn: "date",
        hubColumn: "location",
        hubFilter: "",
        totalColumn: "lmp",
        energyColumn: "energy",
        congestionColumn: "congestion",
        lossColumn: "loss",
      };
}

function misoRtTable(rtSource: RtLmpSource) {
  return rtSource === "verified"
    ? {
        sourceTable: "miso.rt_lmps_final",
        marketRunId: "RTM",
      }
    : {
        sourceTable: "miso.rt_lmps_prelim",
        marketRunId: "RTM",
      };
}

function sppRtTable(rtSource: RtLmpSource) {
  void rtSource;
  return {
    sourceTable: "spp.rt_lmps_prelim",
    marketRunId: "RTBM",
  };
}

function nyisoRtTable(rtSource: RtLmpSource) {
  void rtSource;
  return {
    sourceTable: "nyiso.rt_lmps_prelim",
    marketRunId: "RTD",
  };
}

function sourceTableFor({
  iso,
  product,
  rtSource,
}: {
  iso: PowerIso;
  product: PowerLmpProduct;
  rtSource: RtLmpSource;
}): string {
  if (product === "da") {
    if (iso === "pjm") return "pjm.da_hrl_lmps";
    if (iso === "ercot") return "ercot.dam_stlmnt_pnt_prices";
    if (iso === "caiso") return "caiso.da_lmps";
    if (iso === "miso") return "miso.da_lmps";
    if (iso === "spp") return "spp.da_lmps";
    if (iso === "nyiso") return "nyiso.da_lmps";
    return "isone.da_hrl_lmps";
  }

  if (iso === "pjm") return pjmRtTable(rtSource).sourceTable;
  if (iso === "ercot") return "ercot.settlement_point_prices";
  if (iso === "caiso") return "caiso.rt_lmps";
  if (iso === "miso") return misoRtTable(rtSource).sourceTable;
  if (iso === "spp") return sppRtTable(rtSource).sourceTable;
  if (iso === "nyiso") return nyisoRtTable(rtSource).sourceTable;
  return isoneRtTable(rtSource).sourceTable;
}

async function latestDate({
  iso,
  product,
  rtSource,
  hubs,
}: {
  iso: PowerIso;
  product: PowerLmpProduct;
  rtSource: RtLmpSource;
  hubs: readonly string[];
}): Promise<string | null> {
  if (iso === "pjm" && product === "da") {
    const rows = await query<{ target_date: string | null }>(
      `
        select max(datetime_beginning_ept::date)::text as target_date
        from pjm.da_hrl_lmps
        where row_is_current = true
          and pnode_name = any($1::text[])
      `,
      [hubs],
    );
    return rows[0]?.target_date ?? null;
  }
  if (iso === "pjm") {
    const rt = pjmRtTable(rtSource);
    const rows = await query<{ target_date: string | null }>(
      `
        select max(datetime_beginning_ept::date)::text as target_date
        from ${rt.sourceTable}
        where pnode_name = any($1::text[])
          ${rt.currentFilter}
      `,
      [hubs],
    );
    return rows[0]?.target_date ?? null;
  }
  if (iso === "ercot" && product === "da") {
    const rows = await query<{ target_date: string | null }>(
      `
        select max(deliverydate)::text as target_date
        from ercot.dam_stlmnt_pnt_prices
        where settlementpoint = any($1::text[])
      `,
      [hubs],
    );
    return rows[0]?.target_date ?? null;
  }
  if (iso === "ercot") {
    const rows = await query<{ target_date: string | null }>(
      `
        select max(deliverydate)::text as target_date
        from ercot.settlement_point_prices
        where settlementpoint = any($1::text[])
      `,
      [hubs],
    );
    return rows[0]?.target_date ?? null;
  }
  if (iso === "caiso") {
    const sourceTable = product === "da" ? "caiso.da_lmps" : "caiso.rt_lmps";
    const marketRunId = product === "da" ? "DAM" : "RTM";
    const rows = await query<{ target_date: string | null }>(
      `
        select max(operating_date)::text as target_date
        from ${sourceTable}
        where node_id = any($1::text[])
          and market_run_id = $2
      `,
      [hubs, marketRunId],
    );
    return rows[0]?.target_date ?? null;
  }
  if (iso === "miso") {
    const rt = misoRtTable(rtSource);
    const sourceTable = product === "da" ? "miso.da_lmps" : rt.sourceTable;
    const marketRunId = product === "da" ? "DAM" : rt.marketRunId;
    const rows = await query<{ target_date: string | null }>(
      `
        select max(operating_date)::text as target_date
        from ${sourceTable}
        where node_id = any($1::text[])
          and market_run_id = $2
      `,
      [hubs, marketRunId],
    );
    return rows[0]?.target_date ?? null;
  }
  if (iso === "spp") {
    const rt = sppRtTable(rtSource);
    const sourceTable = product === "da" ? "spp.da_lmps" : rt.sourceTable;
    const marketRunId = product === "da" ? "DAM" : rt.marketRunId;
    const rows = await query<{ target_date: string | null }>(
      `
        select max(operating_date)::text as target_date
        from ${sourceTable}
        where node_id = any($1::text[])
          and market_run_id = $2
      `,
      [hubs, marketRunId],
    );
    return rows[0]?.target_date ?? null;
  }
  if (iso === "nyiso") {
    const rt = nyisoRtTable(rtSource);
    const sourceTable = product === "da" ? "nyiso.da_lmps" : rt.sourceTable;
    const marketRunId = product === "da" ? "DAM" : rt.marketRunId;
    const rows = await query<{ target_date: string | null }>(
      `
        select max(operating_date)::text as target_date
        from ${sourceTable}
        where node_id = any($1::text[])
          and market_run_id = $2
      `,
      [hubs, marketRunId],
    );
    return rows[0]?.target_date ?? null;
  }
  if (product === "da") {
    const rows = await query<{ target_date: string | null }>(
      `
        select max(date)::text as target_date
        from isone.da_hrl_lmps
        where location_name = any($1::text[])
          and location_type = 'HUB'
      `,
      [hubs],
    );
    return rows[0]?.target_date ?? null;
  }

  const rt = isoneRtTable(rtSource);
  const rows = await query<{ target_date: string | null }>(
    `
      select max(${rt.latestColumn})::text as target_date
      from ${rt.sourceTable}
      where ${rt.hubColumn} = any($1::text[])
        ${rt.hubFilter}
    `,
    [hubs],
  );
  return rows[0]?.target_date ?? null;
}

async function lmpRows({
  iso,
  product,
  rtSource,
  targetDate,
  hubs,
}: {
  iso: PowerIso;
  product: PowerLmpProduct;
  rtSource: RtLmpSource;
  targetDate: string;
  hubs: readonly string[];
}): Promise<LmpRow[]> {
  if (iso === "pjm" && product === "da") {
    return query<LmpRow>(
      `
        select
          to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
          pnode_name as hub,
          (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
          system_energy_price_da as system_energy,
          total_lmp_da as total,
          congestion_price_da as congestion,
          marginal_loss_price_da as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from pjm.da_hrl_lmps
        where row_is_current = true
          and datetime_beginning_ept::date = $1::date
          and pnode_name = any($2::text[])
        order by array_position($2::text[], pnode_name), datetime_beginning_ept
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "pjm") {
    const rt = pjmRtTable(rtSource);
    return query<LmpRow>(
      `
        select
          to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
          pnode_name as hub,
          (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
          ${rt.energyExpr}::float8 as system_energy,
          total_lmp_rt::float8 as total,
          congestion_price_rt::float8 as congestion,
          marginal_loss_price_rt::float8 as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable}
        where datetime_beginning_ept::date = $1::date
          and pnode_name = any($2::text[])
          ${rt.currentFilter}
        order by array_position($2::text[], pnode_name), datetime_beginning_ept
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "ercot" && product === "da") {
    return query<LmpRow>(
      `
        select
          to_char(
            deliverydate::timestamp + ((hourending - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          settlementpoint as hub,
          hourending as hour_ending,
          null::double precision as system_energy,
          settlementpointprice as total,
          null::double precision as congestion,
          null::double precision as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ercot.dam_stlmnt_pnt_prices
        where deliverydate = $1::date
          and settlementpoint = any($2::text[])
        order by array_position($2::text[], settlementpoint), hourending
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "ercot") {
    return query<LmpRow>(
      `
        select
          to_char(
            deliverydate::timestamp + ((deliveryhour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          settlementpoint as hub,
          deliveryhour as hour_ending,
          null::double precision as system_energy,
          avg(settlementpointprice)::float8 as total,
          null::double precision as congestion,
          null::double precision as marginal_loss,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ercot.settlement_point_prices
        where deliverydate = $1::date
          and settlementpoint = any($2::text[])
        group by deliverydate, deliveryhour, settlementpoint
        order by array_position($2::text[], settlementpoint), deliveryhour
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "caiso" && product === "da") {
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          energy_component as system_energy,
          locational_marginal_price as total,
          congestion_component as congestion,
          loss_component as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from caiso.da_lmps
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = 'DAM'
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "caiso") {
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          avg(energy_component)::float8 as system_energy,
          avg(locational_marginal_price)::float8 as total,
          avg(congestion_component)::float8 as congestion,
          avg(loss_component)::float8 as marginal_loss,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from caiso.rt_lmps
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = 'RTM'
        group by operating_date, operating_hour, node_id
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "miso" && product === "da") {
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          energy_component as system_energy,
          locational_marginal_price as total,
          congestion_component as congestion,
          loss_component as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from miso.da_lmps
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = 'DAM'
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "miso") {
    const rt = misoRtTable(rtSource);
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          avg(energy_component)::float8 as system_energy,
          avg(locational_marginal_price)::float8 as total,
          avg(congestion_component)::float8 as congestion,
          avg(loss_component)::float8 as marginal_loss,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable}
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = $3
        group by operating_date, operating_hour, node_id
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs, rt.marketRunId],
    );
  }
  if (iso === "spp" && product === "da") {
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          energy_component as system_energy,
          locational_marginal_price as total,
          congestion_component as congestion,
          loss_component as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from spp.da_lmps
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = 'DAM'
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "spp") {
    const rt = sppRtTable(rtSource);
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          avg(energy_component)::float8 as system_energy,
          avg(locational_marginal_price)::float8 as total,
          avg(congestion_component)::float8 as congestion,
          avg(loss_component)::float8 as marginal_loss,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable}
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = $3
        group by operating_date, operating_hour, node_id
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs, rt.marketRunId],
    );
  }
  if (iso === "nyiso" && product === "da") {
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          energy_component as system_energy,
          locational_marginal_price as total,
          congestion_component as congestion,
          loss_component as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from nyiso.da_lmps
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = 'DAM'
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "nyiso") {
    const rt = nyisoRtTable(rtSource);
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          avg(energy_component)::float8 as system_energy,
          avg(locational_marginal_price)::float8 as total,
          avg(congestion_component)::float8 as congestion,
          avg(loss_component)::float8 as marginal_loss,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable}
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = $3
        group by operating_date, operating_hour, node_id
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs, rt.marketRunId],
    );
  }
  if (product === "da") {
    return query<LmpRow>(
      `
        select
          to_char(
            date::timestamp + ((hour_ending - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          location_name as hub,
          hour_ending,
          energy_component as system_energy,
          locational_marginal_price as total,
          congestion_component as congestion,
          marginal_loss_component as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from isone.da_hrl_lmps
        where date = $1::date
          and location_name = any($2::text[])
          and location_type = 'HUB'
        order by array_position($2::text[], location_name), hour_ending
      `,
      [targetDate, hubs],
    );
  }

  const rt = isoneRtTable(rtSource);
  return query<LmpRow>(
    `
      select
        to_char(
          date::timestamp + ((hour_ending - 1) * interval '1 hour'),
          'YYYY-MM-DD"T"HH24:MI:SS'
        ) as datetime_beginning_ept,
        ${rt.hubColumn} as hub,
        hour_ending,
        ${rt.energyColumn} as system_energy,
        ${rt.totalColumn} as total,
        ${rt.congestionColumn} as congestion,
        ${rt.lossColumn} as marginal_loss,
        to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
      from ${rt.sourceTable}
      where date = $1::date
        and ${rt.hubColumn} = any($2::text[])
        ${rt.hubFilter}
      order by array_position($2::text[], ${rt.hubColumn}), hour_ending
    `,
    [targetDate, hubs],
  );
}

export async function buildPowerLmpsPayload({
  iso,
  product,
  rtSource,
  requestedDate,
  powerHub = null,
  metric = DEFAULT_POWER_LMP_METRIC_MODE,
  gasHub = null,
}: {
  iso: PowerIso;
  product: PowerLmpProduct;
  rtSource: RtLmpSource;
  requestedDate: string | null;
  powerHub?: string | null;
  metric?: PowerLmpMetricMode;
  gasHub?: PowerLmpGasHubKey | null;
}) {
  const config = ISO_CONFIGS[iso];
  if (metric === "spark-spread") {
    return {
      status: 400,
      payload: { error: "metric=spark-spread is only supported by /api/power-lmp-settles." },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
      dataAsOf: null,
    };
  }
  const latest = await latestDate({ iso, product, rtSource, hubs: config.hubs });
  const targetDate = requestedDate ?? latest;
  if (!targetDate) {
    return {
      status: 404,
      payload: { error: `No ${config.label} ${product.toUpperCase()} LMP data is available` },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
      dataAsOf: null,
    };
  }

  let rows = await lmpRows({ iso, product, rtSource, targetDate, hubs: config.hubs });
  let metadata: PowerLmpHeatRateMetadata | null = null;
  let resolvedGasHub: PowerLmpGasHubKey | null = null;
  if (metric === "heat-rate") {
    const resolved = resolvePowerLmpHeatRateGasHub({
      iso,
      powerHub: powerHub ?? config.defaultHub,
      gasHub,
    });
    if (resolved.error) {
      return {
        status: 400,
        payload: { error: resolved.error },
        headers: { "Cache-Control": "no-store" },
        rowCount: 0,
        dataAsOf: null,
      };
    }
    resolvedGasHub = resolved.gasHub;
    const gasHours = await powerLmpHeatRateGasHours({
      iso,
      startDate: targetDate,
      endDate: targetDate,
      gasHub: resolvedGasHub,
    });
    rows = applyHeatRateToLmpRows(rows, gasHoursByDateHour(gasHours));
    metadata = heatRateMetadata({ gasHub: resolvedGasHub, gasHours });
  }

  const asOf = maxStamp(rows.map((row) => row.as_of));
  const lmpSource = sourceTableFor({ iso, product, rtSource });
  const source =
    metric === "heat-rate" ? `${lmpSource} / ice_python_next_day_gas` : lmpSource;
  const payload = {
    iso,
    isoLabel: config.label,
    defaultHub: config.defaultHub,
    ...(resolvedGasHub ? { defaultGasHub: resolvedGasHub } : {}),
    supportsComponents: config.supportsComponents,
    targetDate,
    latestDate: latest,
    asOf,
    source,
    rtSource: product === "rt" ? rtSource : undefined,
    hubs: config.hubs.map((hub) =>
      summarizeHub(
        iso,
        hub,
        rows.filter((row) => row.hub === hub),
      ),
    ),
    ...(metadata
      ? {
          metricMode: metric,
          units: metadata.units,
          heatRateMetadata: metadata,
        }
      : {}),
  };

  return {
    payload,
    rowCount: rows.length,
    dataAsOf: asOf,
  };
}

function componentExpr({
  iso,
  market,
  component,
  prefix,
  rtSource,
}: {
  iso: PowerIso;
  market: PowerLmpProduct;
  component: ComponentKey;
  prefix: string;
  rtSource: RtLmpSource;
}): string {
  if (iso === "ercot") return `${prefix}.price`;
  if (iso === "caiso" || iso === "miso" || iso === "spp" || iso === "nyiso") {
    if (component === "energy") return `${prefix}.energy_component`;
    if (component === "congestion") return `${prefix}.congestion_component`;
    if (component === "loss") return `${prefix}.loss_component`;
    return `${prefix}.locational_marginal_price`;
  }
  if (iso === "pjm") {
    const suffix = market === "da" ? "da" : "rt";
    if (market === "rt" && component === "energy") {
      return rtSource === "verified"
        ? `${prefix}.system_energy_price_rt`
        : `(${prefix}.total_lmp_rt - ${prefix}.congestion_price_rt - ${prefix}.marginal_loss_price_rt)`;
    }
    if (component === "energy") return `${prefix}.system_energy_price_${suffix}`;
    if (component === "congestion") return `${prefix}.congestion_price_${suffix}`;
    if (component === "loss") return `${prefix}.marginal_loss_price_${suffix}`;
    return `${prefix}.total_lmp_${suffix}`;
  }
  if (market === "rt" && rtSource === "unverified") {
    if (component === "energy") return `${prefix}.energy`;
    if (component === "congestion") return `${prefix}.congestion`;
    if (component === "loss") return `${prefix}.loss`;
    return `${prefix}.lmp`;
  }
  if (component === "energy") return `${prefix}.energy_component`;
  if (component === "congestion") return `${prefix}.congestion_component`;
  if (component === "loss") return `${prefix}.marginal_loss_component`;
  return `${prefix}.locational_marginal_price`;
}

async function settleRows({
  iso,
  market,
  rtSource,
  startDate,
  endDate,
  hub,
  component,
}: {
  iso: PowerIso;
  market: PowerLmpProduct;
  rtSource: RtLmpSource;
  startDate: string;
  endDate: string;
  hub: string;
  component: ComponentKey;
}): Promise<HourRow[]> {
  if (iso === "pjm" && market === "da") {
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          datetime_beginning_ept::date::text as market_date,
          (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
          ${value}::float8 as value,
          to_char(max(updated_at) over (partition by datetime_beginning_ept::date), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from pjm.da_hrl_lmps as lmps
        where row_is_current = true
          and pnode_name = $1
          and datetime_beginning_ept::date between $2::date and $3::date
        order by datetime_beginning_ept
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "pjm") {
    const rt = pjmRtTable(rtSource);
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          datetime_beginning_ept::date::text as market_date,
          (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
          ${value}::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable} as lmps
        where pnode_name = $1
          and datetime_beginning_ept::date between $2::date and $3::date
          ${rt.currentFilter}
        order by datetime_beginning_ept::date, extract(hour from datetime_beginning_ept)
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "ercot" && market === "da") {
    return query<HourRow>(
      `
        select
          deliverydate::text as market_date,
          hourending as hour_ending,
          settlementpointprice::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ercot.dam_stlmnt_pnt_prices
        where settlementpoint = $1
          and deliverydate between $2::date and $3::date
        order by deliverydate, hourending
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "ercot") {
    return query<HourRow>(
      `
        select
          deliverydate::text as market_date,
          deliveryhour as hour_ending,
          avg(settlementpointprice)::float8 as value,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ercot.settlement_point_prices
        where settlementpoint = $1
          and deliverydate between $2::date and $3::date
        group by deliverydate, deliveryhour
        order by deliverydate, deliveryhour
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "caiso" && market === "da") {
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          ${value}::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from caiso.da_lmps as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = 'DAM'
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "caiso") {
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          avg(${value})::float8 as value,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from caiso.rt_lmps as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = 'RTM'
        group by operating_date, operating_hour
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "miso" && market === "da") {
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          ${value}::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from miso.da_lmps as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = 'DAM'
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "miso") {
    const rt = misoRtTable(rtSource);
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          avg(${value})::float8 as value,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable} as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = $4
        group by operating_date, operating_hour
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate, rt.marketRunId],
    );
  }
  if (iso === "spp" && market === "da") {
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          ${value}::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from spp.da_lmps as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = 'DAM'
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "spp") {
    const rt = sppRtTable(rtSource);
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          avg(${value})::float8 as value,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable} as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = $4
        group by operating_date, operating_hour
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate, rt.marketRunId],
    );
  }
  if (iso === "nyiso" && market === "da") {
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          ${value}::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from nyiso.da_lmps as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = 'DAM'
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "nyiso") {
    const rt = nyisoRtTable(rtSource);
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          avg(${value})::float8 as value,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable} as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = $4
        group by operating_date, operating_hour
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate, rt.marketRunId],
    );
  }
  if (market === "da") {
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          date::text as market_date,
          hour_ending,
          ${value}::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from isone.da_hrl_lmps as lmps
        where location_name = $1
          and location_type = 'HUB'
          and date between $2::date and $3::date
        order by date, hour_ending
      `,
      [hub, startDate, endDate],
    );
  }
  const rt = isoneRtTable(rtSource);
  const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
  return query<HourRow>(
    `
      select
        date::text as market_date,
        hour_ending,
        ${value}::float8 as value,
        to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
      from ${rt.sourceTable} as lmps
      where ${rt.hubColumn} = $1
        ${rt.hubFilter}
        and date between $2::date and $3::date
      order by date, hour_ending
    `,
    [hub, startDate, endDate],
  );
}

function productSummary(
  iso: PowerIso,
  values: Array<number | null>,
  options: { isNercOffPeakDay?: boolean } = {},
): PowerSettlesDashboardProductSummary {
  const observed = values.filter((value): value is number => value !== null);
  const useNercOffPeakDay = iso === "pjm" && options.isNercOffPeakDay === true;
  const onPeakValues = useNercOffPeakDay
    ? []
    : values.filter((_, index) => isOnPeakHour(iso, index + 1));
  const offPeakValues = useNercOffPeakDay
    ? values
    : values.filter((_, index) => !isOnPeakHour(iso, index + 1));
  let peakHour: number | null = null;
  let peakPrice: number | null = null;

  values.forEach((value, index) => {
    if (value === null) return;
    if (peakPrice === null || value > peakPrice) {
      peakPrice = value;
      peakHour = index + 1;
    }
  });

  return {
    flatAvg: avg(values),
    onPeakAvg: avg(onPeakValues),
    offPeakAvg: avg(offPeakValues),
    peakHour,
    peakPrice,
    observationCount: observed.length,
  };
}

function dashboardComponentValue(
  row: LmpRow,
  component: PowerSettlesDashboardComponent,
): number | null {
  if (component === "energy") return toNumber(row.system_energy);
  if (component === "congestion") return toNumber(row.congestion);
  if (component === "loss") return toNumber(row.marginal_loss);
  return toNumber(row.total);
}

function dashboardHourlyValuesByHub({
  rows,
  hubs,
  component,
}: {
  rows: LmpRow[];
  hubs: readonly string[];
  component: PowerSettlesDashboardComponent;
}): Map<string, HourlyValueSet> {
  const byHub = new Map<string, HourlyValueSet>();
  for (const hub of hubs) {
    byHub.set(hub, { values: emptyHours(), asOf: null });
  }

  for (const row of rows) {
    const hub = row.hub;
    const item = byHub.get(hub);
    if (!item) continue;
    const hourIndex = Number(row.hour_ending) - 1;
    if (hourIndex >= 0 && hourIndex < 24) {
      item.values[hourIndex] = dashboardComponentValue(row, component);
    }
    item.asOf = maxStamp([item.asOf, row.as_of]);
  }

  return byHub;
}

function subtractHourlyValues(
  left: Array<number | null>,
  right: Array<number | null>,
): Array<number | null> {
  return left.map((value, index) => {
    const compareValue = right[index] ?? null;
    return value === null || compareValue === null ? null : value - compareValue;
  });
}

function emptyProductSummary(): PowerSettlesDashboardProductSummary {
  return {
    flatAvg: null,
    onPeakAvg: null,
    offPeakAvg: null,
    peakHour: null,
    peakPrice: null,
    observationCount: 0,
  };
}

function normalizeDashboardComponentForIso(
  iso: PowerIso,
  component: PowerSettlesDashboardComponent,
): PowerSettlesDashboardComponent {
  return ISO_CONFIGS[iso].supportsComponents ? component : "total";
}

function dashboardStatus({
  targetDate,
  da,
  rt,
}: {
  targetDate: string | null;
  da: PowerSettlesDashboardProductSummary;
  rt: PowerSettlesDashboardProductSummary;
}): { status: PowerSettlesDashboardStatus; detail: string } {
  if (!targetDate) {
    return { status: "missing", detail: "No DA/RT date is available for the default hub." };
  }
  if (da.observationCount === 0 && rt.observationCount === 0) {
    return { status: "missing", detail: "No DA or RT hourly values were returned for the selected date." };
  }
  if (da.observationCount < 24 || rt.observationCount < 24) {
    return {
      status: "partial",
      detail: `DA ${da.observationCount}/24 hours, RT ${rt.observationCount}/24 hours.`,
    };
  }
  return { status: "ok", detail: "DA and RT both returned 24 hourly values." };
}

function powerSettlesDetailUrl({
  iso,
  targetDate,
  hub,
  rtSource,
  component,
}: {
  iso: PowerIso;
  targetDate: string | null;
  hub: string;
  rtSource: RtLmpSource;
  component: PowerSettlesDashboardComponent;
}): string | null {
  if (!targetDate) return null;
  const params = new URLSearchParams({
    section: "pjm-da-lmps",
    iso,
    view: "daily-settles",
    product: "dart",
    date: targetDate,
    hub,
    source: rtSource,
    component,
    refresh: "1",
  });
  return `/?${params.toString()}`;
}

function dashboardRtSourceStatus({
  iso,
  requestedRtSource,
  effectiveRtSource,
}: {
  iso: PowerIso;
  requestedRtSource: RtLmpSource;
  effectiveRtSource: RtLmpSource;
}): PowerSettlesDashboardRtSourceStatus {
  if (hasSinglePromotedRtSource(iso)) return "single-source";
  if (requestedRtSource === "verified" && effectiveRtSource === "unverified") return "fallback";
  return "requested";
}

function hasSinglePromotedRtSource(iso: PowerIso): boolean {
  return iso === "ercot" || iso === "caiso" || iso === "spp" || iso === "nyiso";
}

async function buildPowerSettlesDashboardIsoRows({
  iso,
  requestedDate,
  rtSource,
  component,
  sparkHeatRate,
  defaultDate,
}: {
  iso: PowerIso;
  requestedDate: string | null;
  rtSource: RtLmpSource;
  component: PowerSettlesDashboardComponent;
  sparkHeatRate: number;
  defaultDate: string;
}): Promise<PowerSettlesDashboardIsoRow[]> {
  const config = ISO_CONFIGS[iso];
  const hubs = config.dashboardHubs;
  const effectiveComponent = normalizeDashboardComponentForIso(iso, component);
  const targetDate = requestedDate ?? defaultDate;
  const [latestDaDate, latestRtDate] = await Promise.all([
    latestDate({ iso, product: "da", rtSource, hubs }),
    latestDate({ iso, product: "rt", rtSource, hubs }),
  ]);

  if (!targetDate) {
    const effectiveRtSource: RtLmpSource = hasSinglePromotedRtSource(iso)
      ? "unverified"
      : rtSource;
    return hubs.map((hub) => ({
      iso,
      isoLabel: config.label,
      hub,
      effectiveComponent,
      effectiveRtSource,
      rtSourceStatus: dashboardRtSourceStatus({
        iso,
        requestedRtSource: rtSource,
        effectiveRtSource,
      }),
      targetDate: null,
      latestDaDate,
      latestRtDate,
      daAsOf: null,
      rtAsOf: null,
      dataAsOf: null,
      sourceTables: {
        da: sourceTableFor({ iso, product: "da", rtSource }),
        rt: sourceTableFor({ iso, product: "rt", rtSource: effectiveRtSource }),
      },
      status: "missing",
      statusDetail: "No latest DA/RT date could be resolved for the dashboard hub.",
      detailUrl: null,
      products: {
        da: emptyProductSummary(),
        rt: emptyProductSummary(),
        dart: emptyProductSummary(),
      },
    }));
  }

  const [daRows, requestedRtRows] = await Promise.all([
    lmpRows({
      iso,
      product: "da",
      rtSource,
      targetDate,
      hubs,
    }),
    lmpRows({
      iso,
      product: "rt",
      rtSource,
      targetDate,
      hubs,
    }),
  ]);
  const daByHub = dashboardHourlyValuesByHub({
    rows: daRows,
    hubs,
    component: effectiveComponent,
  });
  const totalDaByHub =
    effectiveComponent === "total"
      ? daByHub
      : dashboardHourlyValuesByHub({
          rows: daRows,
          hubs,
          component: "total",
        });
  const requestedRtByHub = dashboardHourlyValuesByHub({
    rows: requestedRtRows,
    hubs,
    component: effectiveComponent,
  });
  const totalRequestedRtByHub =
    effectiveComponent === "total"
      ? requestedRtByHub
      : dashboardHourlyValuesByHub({
          rows: requestedRtRows,
          hubs,
          component: "total",
        });

  let fallbackRtByHub: Map<string, HourlyValueSet> | null = null;
  let totalFallbackRtByHub: Map<string, HourlyValueSet> | null = null;
  let fallbackLatestRtDate: string | null = null;
  const canFallbackToUnverified =
    rtSource === "verified" && (iso === "pjm" || iso === "isone" || iso === "miso");
  if (canFallbackToUnverified) {
    const needsFallback = hubs.some((hub) => {
      const requestedRt = requestedRtByHub.get(hub) ?? { values: emptyHours(), asOf: null };
      return productSummary(iso, requestedRt.values).observationCount < 24;
    });

    if (needsFallback) {
      const [fallbackRtRows, nextFallbackLatestRtDate] = await Promise.all([
        lmpRows({
          iso,
          product: "rt",
          rtSource: "unverified",
          targetDate,
          hubs,
        }),
        latestDate({ iso, product: "rt", rtSource: "unverified", hubs }),
      ]);
      fallbackRtByHub = dashboardHourlyValuesByHub({
        rows: fallbackRtRows,
        hubs,
        component: effectiveComponent,
      });
      totalFallbackRtByHub =
        effectiveComponent === "total"
          ? fallbackRtByHub
          : dashboardHourlyValuesByHub({
              rows: fallbackRtRows,
              hubs,
              component: "total",
            });
      fallbackLatestRtDate = nextFallbackLatestRtDate;
    }
  }

  const gasHubKeys = Array.from(
    new Set(hubs.map((hub) => defaultPowerLmpGasHubForIso(iso, hub))),
  );
  const gasHoursByHub = new Map<PowerLmpGasHubKey, PowerLmpHeatRateGasHourMetadata[]>(
    await Promise.all(
      gasHubKeys.map(async (gasHub) => [
        gasHub,
        await powerLmpHeatRateGasHours({
          iso,
          startDate: targetDate,
          endDate: targetDate,
          gasHub,
        }),
      ] as const),
    ),
  );

  return hubs.map((hub) => {
    const nercDay = nercPowerDayMetadata(targetDate);
    const summaryOptions = {
      isNercOffPeakDay: iso === "pjm" ? nercDay.isNercOffPeakDay : false,
    };
    const targetDa = daByHub.get(hub) ?? { values: emptyHours(), asOf: null };
    const requestedRt = requestedRtByHub.get(hub) ?? { values: emptyHours(), asOf: null };
    const requestedRtSummary = productSummary(iso, requestedRt.values, summaryOptions);
    const fallbackRt = fallbackRtByHub?.get(hub) ?? null;
    const fallbackRtSummary = fallbackRt ? productSummary(iso, fallbackRt.values, summaryOptions) : null;
    const useFallback =
      fallbackRt !== null &&
      fallbackRtSummary !== null &&
      fallbackRtSummary.observationCount > requestedRtSummary.observationCount;
    const targetRt: HourlyValueSet = useFallback && fallbackRt ? fallbackRt : requestedRt;
    const totalDa = totalDaByHub.get(hub) ?? { values: emptyHours(), asOf: null };
    const totalRequestedRt = totalRequestedRtByHub.get(hub) ?? {
      values: emptyHours(),
      asOf: null,
    };
    const totalFallbackRt = totalFallbackRtByHub?.get(hub) ?? null;
    const targetSparkRt: HourlyValueSet =
      useFallback && totalFallbackRt ? totalFallbackRt : totalRequestedRt;
    const effectiveRtSource: RtLmpSource =
      hasSinglePromotedRtSource(iso) || useFallback ? "unverified" : rtSource;
    const rt = useFallback && fallbackRtSummary ? fallbackRtSummary : requestedRtSummary;
    const da = productSummary(iso, targetDa.values, summaryOptions);
    const dart = productSummary(
      iso,
      subtractHourlyValues(targetDa.values, targetRt.values),
      summaryOptions,
    );
    const gasHub = defaultPowerLmpGasHubForIso(iso, hub);
    const inputs = buildPowerSettlesInputSummary({
      iso,
      targetDate,
      isNercOffPeakDay: summaryOptions.isNercOffPeakDay,
      gasHub,
      sparkHeatRate,
      gasHours: gasHoursByHub.get(gasHub) ?? [],
      daValues: targetDa.values,
      rtValues: targetRt.values,
      daSparkValues: totalDa.values,
      rtSparkValues: targetSparkRt.values,
    });
    const { status, detail } = dashboardStatus({ targetDate, da, rt });
    const dataAsOf = maxStamp([targetDa.asOf, targetRt.asOf, inputs.latestAsOf]);
    const rtSourceStatus = dashboardRtSourceStatus({
      iso,
      requestedRtSource: rtSource,
      effectiveRtSource,
    });
    const statusNotes = [detail];
    if (rtSourceStatus === "fallback") {
      statusNotes.push(
        "Preferred RT was unavailable or less complete for this hub, so the preliminary/unverified RT source is shown.",
      );
    }
    if (summaryOptions.isNercOffPeakDay && nercDay.holidayName) {
      statusNotes.push(
        `${nercDay.holidayName} is treated as a NERC off-peak day for PJM summaries.`,
      );
    }
    const statusDetail = statusNotes.join(" ");

    return {
      iso,
      isoLabel: config.label,
      hub,
      effectiveComponent,
      effectiveRtSource,
      rtSourceStatus,
      targetDate,
      latestDaDate,
      latestRtDate: useFallback ? fallbackLatestRtDate : latestRtDate,
      daAsOf: targetDa.asOf,
      rtAsOf: targetRt.asOf,
      dataAsOf,
      sourceTables: {
        da: sourceTableFor({ iso, product: "da", rtSource }),
        rt: sourceTableFor({ iso, product: "rt", rtSource: effectiveRtSource }),
      },
      status,
      statusDetail,
      detailUrl: powerSettlesDetailUrl({
        iso,
        targetDate,
        hub,
        rtSource: effectiveRtSource,
        component: effectiveComponent,
      }),
      products: {
        da,
        rt,
        dart,
      },
      inputs,
    };
  });
}

export async function buildPowerSettlesDashboardPayload({
  requestedDate,
  lookbackDays,
  rtSource,
  component,
  sparkHeatRate = DEFAULT_POWER_LMP_SPARK_HEAT_RATE,
  dashboardIsos = POWER_SETTLES_DASHBOARD_ISOS,
}: {
  requestedDate: string | null;
  lookbackDays: number;
  rtSource: RtLmpSource;
  component: PowerSettlesDashboardComponent;
  sparkHeatRate?: number;
  dashboardIsos?: readonly PowerIso[];
}) {
  const normalizedLookbackDays = Number.isFinite(lookbackDays) ? Math.trunc(lookbackDays) : 7;
  const boundedLookbackDays = Math.min(Math.max(normalizedLookbackDays, 1), 14);
  const normalizedSparkHeatRate = normalizePowerLmpSparkHeatRate(sparkHeatRate);
  const defaultDate = defaultPowerSettlesDashboardDate();
  const reportIsos = dashboardIsos.length > 0 ? dashboardIsos : POWER_SETTLES_DASHBOARD_ISOS;
  const rowGroups = await Promise.all(
    reportIsos.map((iso) =>
      buildPowerSettlesDashboardIsoRows({
        iso,
        requestedDate,
        rtSource,
        component,
        sparkHeatRate: normalizedSparkHeatRate,
        defaultDate,
      }),
    ),
  );
  const rows = rowGroups.flat();
  const isoStatuses = reportIsos.map((iso) => {
    const isoRows = rows.filter((row) => row.iso === iso);
    if (isoRows.length > 0 && isoRows.every((row) => row.status === "ok")) return "ok";
    if (isoRows.some((row) => row.status !== "missing")) return "partial";
    return "missing";
  });
  const latestAsOf = maxStamp(rows.map((row) => row.dataAsOf));
  const payload: PowerSettlesDashboardPayload = {
    component,
    rtSource,
    lookbackDays: boundedLookbackDays,
    sparkHeatRate: normalizedSparkHeatRate,
    requestedDate,
    defaultDate,
    datePolicy: requestedDate ? "requested" : "default-yesterday",
    rows,
    summary: {
      isoCount: reportIsos.length,
      completeIsoCount: isoStatuses.filter((status) => status === "ok").length,
      partialIsoCount: isoStatuses.filter((status) => status === "partial").length,
      missingIsoCount: isoStatuses.filter((status) => status === "missing").length,
      hubCount: rows.length,
      completeHubCount: rows.filter((row) => row.status === "ok").length,
      partialHubCount: rows.filter((row) => row.status === "partial").length,
      missingHubCount: rows.filter((row) => row.status === "missing").length,
      unverifiedFallbackHubCount: rows.filter((row) => row.rtSourceStatus === "fallback").length,
      latestAsOf,
    },
    calendarMetadata: {
      calendarId: NERC_OFF_PEAK_CALENDAR.calendarId,
      label: NERC_OFF_PEAK_CALENDAR.label,
      source: NERC_OFF_PEAK_CALENDAR.source ?? null,
    },
  };

  return {
    payload,
    rowCount: rows.length,
    dataAsOf: latestAsOf,
  };
}

export async function buildPowerLmpSettlesPayload({
  iso,
  start,
  end,
  hub,
  component,
  rtSource,
  metric = DEFAULT_POWER_LMP_METRIC_MODE,
  gasHub = null,
  sparkHeatRate = DEFAULT_POWER_LMP_SPARK_HEAT_RATE,
}: {
  iso: PowerIso;
  start: string | null;
  end: string | null;
  hub: string | null;
  component: ComponentKey;
  rtSource: RtLmpSource;
  metric?: PowerLmpMetricMode;
  gasHub?: PowerLmpGasHubKey | null;
  sparkHeatRate?: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const startDate = parseDateWithFallback(start, today);
  const endDate = parseDateWithFallback(end, startDate);
  const config = ISO_CONFIGS[iso];
  const selectedHub = hub && config.hubs.includes(hub) ? hub : config.defaultHub;
  const selectedComponent =
    metric === "spark-spread" ? "total" : config.supportsComponents ? component : "total";
  const normalizedSparkHeatRate = normalizePowerLmpSparkHeatRate(sparkHeatRate);
  const dayCount = inclusiveDayCount(startDate, endDate);

  if (dayCount < 1) {
    return {
      status: 400,
      payload: { error: "end must be on or after start" },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
      dataAsOf: null,
    };
  }

  let [daRows, rtRows] = await Promise.all([
    settleRows({
      iso,
      market: "da",
      rtSource,
      startDate,
      endDate,
      hub: selectedHub,
      component: selectedComponent,
    }),
    settleRows({
      iso,
      market: "rt",
      rtSource,
      startDate,
      endDate,
      hub: selectedHub,
      component: selectedComponent,
    }),
  ]);
  let metadata: PowerLmpHeatRateMetadata | null = null;
  let resolvedGasHub: PowerLmpGasHubKey | null = null;
  if (metric === "heat-rate" || metric === "spark-spread") {
    const resolved = resolvePowerLmpHeatRateGasHub({
      iso,
      powerHub: selectedHub,
      gasHub,
    });
    if (resolved.error) {
      return {
        status: 400,
        payload: { error: resolved.error },
        headers: { "Cache-Control": "no-store" },
        rowCount: 0,
        dataAsOf: null,
      };
    }
    resolvedGasHub = resolved.gasHub;
    const gasHours = await powerLmpHeatRateGasHours({
      iso,
      startDate,
      endDate,
      gasHub: resolvedGasHub,
    });
    const byDateHour = gasHoursByDateHour(gasHours);
    if (metric === "heat-rate") {
      daRows = applyHeatRateToHourRows(daRows, byDateHour);
      rtRows = applyHeatRateToHourRows(rtRows, byDateHour);
    } else {
      daRows = applySparkSpreadToHourRows(daRows, byDateHour, normalizedSparkHeatRate);
      rtRows = applySparkSpreadToHourRows(rtRows, byDateHour, normalizedSparkHeatRate);
    }
    metadata = heatRateMetadata({ gasHub: resolvedGasHub, gasHours });
  }

  const daByDate = new Map<string, { values: Array<number | null>; asOf: string | null }>();
  const rtByDate = new Map<string, { values: Array<number | null>; asOf: string | null }>();
  for (const row of daRows) {
    const item = daByDate.get(row.market_date) ?? { values: emptyHours(), asOf: null };
    item.values[Number(row.hour_ending) - 1] = toNumber(row.value);
    item.asOf = maxStamp([item.asOf, row.as_of]);
    daByDate.set(row.market_date, item);
  }
  for (const row of rtRows) {
    const item = rtByDate.get(row.market_date) ?? { values: emptyHours(), asOf: null };
    item.values[Number(row.hour_ending) - 1] = toNumber(row.value);
    item.asOf = maxStamp([item.asOf, row.as_of]);
    rtByDate.set(row.market_date, item);
  }

  const rows = dateRange(startDate, endDate).map((date) => {
    const nercDay = nercPowerDayMetadata(date);
    const da = daByDate.get(date);
    const rt = rtByDate.get(date);
    const gasHourly =
      metadata?.hourly.filter((row) => row.date === date).sort((a, b) => a.hourEnding - b.hourEnding) ??
      undefined;
    return {
      date,
      hub: selectedHub,
      isWeekend: nercDay.isWeekend,
      isNercHoliday: nercDay.isNercHoliday,
      holidayName: nercDay.holidayName,
      daHourly: da?.values ?? emptyHours(),
      rtHourly: rt?.values ?? emptyHours(),
      daAsOf: da?.asOf ?? null,
      rtAsOf: rt?.asOf ?? null,
      ...(gasHourly ? { gasHourly } : {}),
    };
  });
  const latestAsOf = maxStamp(rows.flatMap((row) => [row.daAsOf, row.rtAsOf]));
  const source = sourceTableFor({ iso, product: "da", rtSource });
  const payload = {
    iso,
    isoLabel: config.label,
    startDate,
    endDate,
    hub: selectedHub,
    ...(resolvedGasHub ? { defaultGasHub: resolvedGasHub } : {}),
    component: selectedComponent,
    rtSource,
    calendarMetadata: {
      calendarId: NERC_OFF_PEAK_CALENDAR.calendarId,
      label: NERC_OFF_PEAK_CALENDAR.label,
      source: NERC_OFF_PEAK_CALENDAR.source ?? null,
    },
    rowCount: rows.length,
    summary: {
      rowCount: rows.length,
      latestDate: rows.at(-1)?.date ?? null,
      latestAsOf,
    },
    rows,
    ...(metadata
      ? {
          metricMode: metric,
          units: metric === "spark-spread" ? "$/MWh" : metadata.units,
          ...(metric === "spark-spread" ? { sparkHeatRate: normalizedSparkHeatRate } : {}),
          source: `${source} / ${sourceTableFor({ iso, product: "rt", rtSource })} / ice_python_next_day_gas`,
          heatRateMetadata: metadata,
        }
      : {}),
  };

  return {
    payload,
    rowCount: rows.length,
    dataAsOf: latestAsOf,
  };
}
