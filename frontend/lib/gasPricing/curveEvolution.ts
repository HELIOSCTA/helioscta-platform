import {
  DAILY_GAS_MARKETS,
  GAS_CURVE_MONTH_CODES,
  type DailyGasMarket,
} from "./dailyGasPriceView";

export type GasCurveEvolutionView = "gas-outright" | "cal-spread";

export interface GasCurveSettlementRow {
  symbol: string;
  trade_date: string | Date;
  value: number;
  updated_at?: string | Date | null;
}

export interface GasCurveEvolutionPoint {
  daysToExpiry: number;
  [year: string]: number | string | null;
}

export interface GasCurveEvolutionSnapshotPoint {
  tradeDate: string;
  daysToExpiry: number;
  value: number;
  nearValue: number;
  farValue: number | null;
  sourceSymbols: string[];
  formula: string;
  status: "latest" | "final";
  missingSymbols: string[];
}

export interface GasCurveEvolutionYearDiagnostic {
  rawRows: number;
  inHorizonRows: number;
  completePoints: number;
  missingSymbols: string[];
  reason: "complete" | "missing_symbols" | "outside_horizon" | "no_rows" | "no_contract";
}

export interface GasCurveEvolutionResponse {
  view: GasCurveEvolutionView;
  market: DailyGasMarket;
  gasStrip: string;
  gasNear: string;
  gasFar: string;
  stripLabel: string;
  years: number[];
  data: GasCurveEvolutionPoint[];
  seriesByYear: Record<string, GasCurveEvolutionSnapshotPoint[]>;
  latestByYear: Record<string, GasCurveEvolutionSnapshotPoint | null>;
  dataAvailability: Record<string, boolean>;
  yearDiagnostics: Record<string, GasCurveEvolutionYearDiagnostic>;
  metadata: {
    sourceTable: "ice_python.settlements";
    rowCount: number;
    valueCount: number;
    lastTradeDate: string | null;
    latestUpdatedAt: string | null;
    formula: string;
    noCalendarAssumption: true;
    noContract: boolean;
  };
}

const HENRY_FUTURES_PRODUCT = "HNG";
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MAX_DAYS_TO_EXPIRY = 1_100;

export const GAS_CURVE_STRIPS = ["F", "G", "H", "J", "K", "M", "N", "Q", "U", "V", "X", "Z"] as const;

const STRIP_TO_MONTH = new Map(
  Object.entries(GAS_CURVE_MONTH_CODES).map(([month, strip]) => [strip, Number(month)]),
);

const GAS_CURVE_MONTH_LABELS: Record<string, string> = {
  F: "Jan",
  G: "Feb",
  H: "Mar",
  J: "Apr",
  K: "May",
  M: "Jun",
  N: "Jul",
  Q: "Aug",
  U: "Sep",
  V: "Oct",
  X: "Nov",
  Z: "Dec",
};

interface GasCurveLegTarget {
  strip: string;
  year: number;
  sourceSymbols: string[];
  formula: string;
  referenceSymbol: string | null;
}

interface GasCurveYearTarget {
  year: number;
  near: GasCurveLegTarget | null;
  far: GasCurveLegTarget | null;
  sourceSymbols: string[];
  formula: string;
}

export function normalizeGasCurveEvolutionView(value: string | null | undefined): GasCurveEvolutionView {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "cal-spread" || normalized === "calendar" || normalized === "cal") {
    return "cal-spread";
  }
  return "gas-outright";
}

export function validGasCurveStrip(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  return (GAS_CURVE_STRIPS as readonly string[]).includes(normalized) ? normalized : null;
}

export function gasCurveStripLabel(strip: string): string {
  return GAS_CURVE_MONTH_LABELS[strip] ?? strip;
}

export function nextGasCurveStrip(strip: string): string {
  const index = (GAS_CURVE_STRIPS as readonly string[]).indexOf(strip);
  if (index === -1) return "F";
  return GAS_CURVE_STRIPS[(index + 1) % GAS_CURVE_STRIPS.length] ?? "F";
}

export function currentGasCurveStrip(referenceDate = new Date()): string {
  const currentMonthIndex = referenceDate.getUTCMonth();
  const currentYear = referenceDate.getUTCFullYear();
  const todayUtc = Date.UTC(currentYear, currentMonthIndex, referenceDate.getUTCDate());

  for (let offset = 0; offset < GAS_CURVE_STRIPS.length; offset += 1) {
    const candidateMonthIndex = currentMonthIndex + offset;
    const candidateYear = currentYear + Math.floor(candidateMonthIndex / GAS_CURVE_STRIPS.length);
    const candidateMonth = (candidateMonthIndex % GAS_CURVE_STRIPS.length) + 1;
    const expiry = thirdBusinessDayBeforeDeliveryMonth(candidateMonth, candidateYear);
    if (todayUtc <= expiry.getTime()) {
      return GAS_CURVE_STRIPS[candidateMonth - 1] ?? "F";
    }
  }

  return GAS_CURVE_STRIPS[currentMonthIndex] ?? "F";
}

export function defaultGasCurveYearWindow(referenceYear = new Date().getUTCFullYear()): {
  startYear: number;
  endYear: number;
  years: number[];
} {
  const startYear = referenceYear - 4;
  const endYear = referenceYear + 2;
  return { startYear, endYear, years: yearsBetween(startYear, endYear) };
}

export function yearsBetween(startYear: number, endYear: number): number[] {
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

export function resolveGasCurveMarket(value: string | null | undefined): DailyGasMarket {
  const requested = value?.trim().toLowerCase();
  const market = requested
    ? DAILY_GAS_MARKETS.find(
        (entry) =>
          entry.market.toLowerCase() === requested ||
          entry.shortLabel.toLowerCase() === requested ||
          entry.futuresProduct?.toLowerCase() === requested,
      )
    : null;
  return market ?? DAILY_GAS_MARKETS.find((entry) => entry.market === "Henry Hub") ?? DAILY_GAS_MARKETS[0];
}

export function futuresCapableGasMarkets(markets: DailyGasMarket[] = DAILY_GAS_MARKETS): DailyGasMarket[] {
  return markets.filter((market) => Boolean(market.futuresProduct));
}

export function buildGasCurveSettlementSymbols({
  market,
  view,
  gasStrip,
  gasNear,
  gasFar,
  years,
}: {
  market: DailyGasMarket;
  view: GasCurveEvolutionView;
  gasStrip: string;
  gasNear: string;
  gasFar: string;
  years: number[];
}): string[] {
  const symbols = new Set<string>();
  for (const target of buildYearTargets({ market, view, gasStrip, gasNear, gasFar, years })) {
    for (const symbol of target.sourceSymbols) symbols.add(symbol);
  }
  return [...symbols].sort();
}

export function buildGasCurveEvolutionData({
  rows,
  market,
  view,
  gasStrip,
  gasNear,
  gasFar,
  years,
  latestUpdatedAt = null,
}: {
  rows: GasCurveSettlementRow[];
  market: DailyGasMarket;
  view: GasCurveEvolutionView;
  gasStrip: string;
  gasNear: string;
  gasFar: string;
  years: number[];
  latestUpdatedAt?: string | null;
}): GasCurveEvolutionResponse {
  const targets = buildYearTargets({ market, view, gasStrip, gasNear, gasFar, years });
  const sourceBySymbolDate = new Map<string, Map<string, GasCurveSettlementRow>>();
  const observedFinalTradeTimeBySymbol = new Map<string, number>();
  let latestSourceTradeTime: number | null = null;
  let latestSourceTradeDate: string | null = null;

  for (const row of rows) {
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    const tradeDate = toDateKey(row.trade_date);
    const tradeTime = new Date(`${tradeDate}T00:00:00Z`).getTime();
    const symbolMap = getOrInitSymbolMap(sourceBySymbolDate, row.symbol);
    symbolMap.set(tradeDate, { ...row, value });
    const observed = observedFinalTradeTimeBySymbol.get(row.symbol);
    if (observed === undefined || tradeTime > observed) {
      observedFinalTradeTimeBySymbol.set(row.symbol, tradeTime);
    }
    if (latestSourceTradeTime === null || tradeTime > latestSourceTradeTime) {
      latestSourceTradeTime = tradeTime;
      latestSourceTradeDate = tradeDate;
    }
  }

  const dataAvailability: Record<string, boolean> = {};
  const seriesByYear: Record<string, GasCurveEvolutionSnapshotPoint[]> = {};
  const latestByYear: Record<string, GasCurveEvolutionSnapshotPoint | null> = {};
  const yearDiagnostics: Record<string, GasCurveEvolutionYearDiagnostic> = {};

  for (const target of targets) {
    const yearKey = String(target.year);
    dataAvailability[yearKey] = false;
    seriesByYear[yearKey] = [];
    latestByYear[yearKey] = null;

    if (!target.near || (view === "cal-spread" && !target.far)) {
      yearDiagnostics[yearKey] = {
        rawRows: 0,
        inHorizonRows: 0,
        completePoints: 0,
        missingSymbols: [],
        reason: "no_contract",
      };
      continue;
    }

    const rawRows = target.sourceSymbols.reduce(
      (sum, symbol) => sum + (sourceBySymbolDate.get(symbol)?.size ?? 0),
      0,
    );
    const missingSymbols = target.sourceSymbols.filter((symbol) => !sourceBySymbolDate.has(symbol));
    const candidateDates = candidateTradeDates(target.sourceSymbols, sourceBySymbolDate);

    for (const tradeDate of candidateDates) {
      const nearValue = legValue(target.near, tradeDate, sourceBySymbolDate);
      const farValue = target.far ? legValue(target.far, tradeDate, sourceBySymbolDate) : null;
      if (nearValue === null || (view === "cal-spread" && farValue === null)) continue;

      const expiryTime = expiryTimeForLeg(target.near, latestSourceTradeTime, observedFinalTradeTimeBySymbol);
      const tradeTime = new Date(`${tradeDate}T00:00:00Z`).getTime();
      const daysToExpiry = Math.round((expiryTime - tradeTime) / MS_PER_DAY);
      if (daysToExpiry < 0 || daysToExpiry > MAX_DAYS_TO_EXPIRY) continue;

      const value = view === "cal-spread" ? roundTo(nearValue - (farValue ?? 0), 4) : roundTo(nearValue, 4);
      seriesByYear[yearKey].push({
        tradeDate,
        daysToExpiry,
        value,
        nearValue: roundTo(nearValue, 4),
        farValue: farValue === null ? null : roundTo(farValue, 4),
        sourceSymbols: target.sourceSymbols,
        formula: target.formula,
        status: daysToExpiry === 0 ? "final" : "latest",
        missingSymbols: [],
      });
      dataAvailability[yearKey] = true;
    }

    seriesByYear[yearKey].sort((first, second) => {
      if (second.daysToExpiry !== first.daysToExpiry) return second.daysToExpiry - first.daysToExpiry;
      return first.tradeDate.localeCompare(second.tradeDate);
    });
    latestByYear[yearKey] = [...seriesByYear[yearKey]].sort((first, second) =>
      first.tradeDate.localeCompare(second.tradeDate),
    ).at(-1) ?? null;

    const completePoints = seriesByYear[yearKey].length;
    yearDiagnostics[yearKey] = {
      rawRows,
      inHorizonRows: completePoints,
      completePoints,
      missingSymbols,
      reason:
        completePoints > 0
          ? "complete"
          : rawRows === 0
            ? "no_rows"
            : missingSymbols.length > 0
              ? "missing_symbols"
              : "outside_horizon",
    };
  }

  const pointByDte = new Map<number, GasCurveEvolutionPoint>();
  let valueCount = 0;
  for (const year of years) {
    const yearKey = String(year);
    for (const point of seriesByYear[yearKey] ?? []) {
      let row = pointByDte.get(point.daysToExpiry);
      if (!row) {
        row = { daysToExpiry: point.daysToExpiry };
        pointByDte.set(point.daysToExpiry, row);
      }
      row[yearKey] = point.value;
      row[`${yearKey}Date`] = point.tradeDate;
      valueCount += 1;
    }
  }

  const stripLabel =
    view === "cal-spread"
      ? `${gasCurveStripLabel(gasNear)} - ${gasCurveStripLabel(gasFar)}`
      : gasCurveStripLabel(gasStrip);
  const formula =
    view === "cal-spread"
      ? `${market.shortLabel} ${gasNear}-${gasFar} all-in gas calendar spread`
      : `${market.shortLabel} ${gasStrip} all-in gas outright`;

  return {
    view,
    market,
    gasStrip,
    gasNear,
    gasFar,
    stripLabel,
    years,
    data: [...pointByDte.values()].sort((first, second) => second.daysToExpiry - first.daysToExpiry),
    seriesByYear,
    latestByYear,
    dataAvailability,
    yearDiagnostics,
    metadata: {
      sourceTable: "ice_python.settlements",
      rowCount: rows.length,
      valueCount,
      lastTradeDate: latestSourceTradeDate,
      latestUpdatedAt,
      formula,
      noCalendarAssumption: true,
      noContract: !market.futuresProduct,
    },
  };
}

function buildYearTargets({
  market,
  view,
  gasStrip,
  gasNear,
  gasFar,
  years,
}: {
  market: DailyGasMarket;
  view: GasCurveEvolutionView;
  gasStrip: string;
  gasNear: string;
  gasFar: string;
  years: number[];
}): GasCurveYearTarget[] {
  return years.map((year) => {
    const nearStrip = view === "cal-spread" ? gasNear : gasStrip;
    const near = buildLegTarget(market, nearStrip, year);
    const farYear = calendarFarYear(gasNear, gasFar, year);
    const far = view === "cal-spread" ? buildLegTarget(market, gasFar, farYear) : null;
    const sourceSymbols = [...new Set([...(near?.sourceSymbols ?? []), ...(far?.sourceSymbols ?? [])])];
    return {
      year,
      near,
      far,
      sourceSymbols,
      formula: view === "cal-spread"
        ? `(${near?.formula ?? "No near leg"}) - (${far?.formula ?? "No far leg"})`
        : near?.formula ?? "No monthly futures configured",
    };
  });
}

function buildLegTarget(market: DailyGasMarket, strip: string, year: number): GasCurveLegTarget | null {
  if (!market.futuresProduct) return null;
  const marketSymbol = monthlySymbol(market.futuresProduct, strip, year);
  if (market.curveStyle === "basis") {
    const henrySymbol = monthlySymbol(HENRY_FUTURES_PRODUCT, strip, year);
    return {
      strip,
      year,
      sourceSymbols: [henrySymbol, marketSymbol],
      formula: `${henrySymbol} + ${marketSymbol}`,
      referenceSymbol: henrySymbol,
    };
  }
  return {
    strip,
    year,
    sourceSymbols: [marketSymbol],
    formula: marketSymbol,
    referenceSymbol: marketSymbol,
  };
}

function monthlySymbol(product: string, strip: string, year: number): string {
  return `${product} ${strip}${yearSuffix(year)}-IUS`;
}

function yearSuffix(year: number): string {
  return String(year % 100).padStart(2, "0");
}

function calendarFarYear(nearStrip: string, farStrip: string, nearYear: number): number {
  const nearMonth = STRIP_TO_MONTH.get(nearStrip) ?? 1;
  const farMonth = STRIP_TO_MONTH.get(farStrip) ?? nearMonth + 1;
  return farMonth <= nearMonth ? nearYear + 1 : nearYear;
}

function thirdBusinessDayBeforeDeliveryMonth(month: number, year: number): Date {
  const date = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (count < 3) {
    date.setUTCDate(date.getUTCDate() - 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return date;
}

function expiryTimeForLeg(
  leg: GasCurveLegTarget,
  latestSourceTradeTime: number | null,
  observedFinalTradeTimeBySymbol: Map<string, number>,
): number {
  const projected = thirdBusinessDayBeforeDeliveryMonth(STRIP_TO_MONTH.get(leg.strip) ?? 1, leg.year).getTime();
  if (!leg.referenceSymbol || latestSourceTradeTime === null || projected > latestSourceTradeTime) {
    return projected;
  }
  return observedFinalTradeTimeBySymbol.get(leg.referenceSymbol) ?? projected;
}

function toDateKey(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function getOrInitSymbolMap(
  map: Map<string, Map<string, GasCurveSettlementRow>>,
  symbol: string,
): Map<string, GasCurveSettlementRow> {
  const existing = map.get(symbol);
  if (existing) return existing;
  const fresh = new Map<string, GasCurveSettlementRow>();
  map.set(symbol, fresh);
  return fresh;
}

function candidateTradeDates(
  sourceSymbols: string[],
  sourceBySymbolDate: Map<string, Map<string, GasCurveSettlementRow>>,
): string[] {
  const firstSymbol = sourceSymbols[0];
  if (!firstSymbol) return [];
  const firstDates = sourceBySymbolDate.get(firstSymbol);
  if (!firstDates) return [];
  return [...firstDates.keys()].sort();
}

function legValue(
  leg: GasCurveLegTarget,
  tradeDate: string,
  sourceBySymbolDate: Map<string, Map<string, GasCurveSettlementRow>>,
): number | null {
  let sum = 0;
  for (const symbol of leg.sourceSymbols) {
    const row = sourceBySymbolDate.get(symbol)?.get(tradeDate);
    if (!row) return null;
    const value = Number(row.value);
    if (!Number.isFinite(value)) return null;
    sum += value;
  }
  return sum;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
