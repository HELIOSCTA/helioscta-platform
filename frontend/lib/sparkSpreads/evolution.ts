import {
  DEFAULT_POWER_SPARK_SPREAD_PRODUCT,
  type PowerSparkSpreadProduct,
} from "@/lib/sparkSpreads/products";

export interface SettlementValueRow {
  symbol: string;
  trade_date: string | Date;
  value: number;
}

export interface ParsedIceSymbol {
  product: string;
  stripCode: string;
  month: number;
  year: number;
}

export interface SparkEvolutionPoint {
  daysToExpiry: number;
  [year: string]: number | string | null;
}

export interface SparkEvolutionSnapshotPoint {
  tradeDate: string;
  daysToExpiry: number;
  power: number;
  gas: number;
  basis: number;
  allInGas: number;
  sparkSpread: number;
}

export interface SparkEvolutionResponse {
  strip: string;
  monthName: string;
  componentCodes: string[];
  years: number[];
  data: SparkEvolutionPoint[];
  seriesByYear: Record<string, SparkEvolutionSnapshotPoint[]>;
  latestByYear: Record<string, SparkEvolutionSnapshotPoint | null>;
  dataAvailability: Record<string, boolean>;
  metadata: {
    heatRate: number;
    gasLeg: string;
    powerLeg: string;
    lastTradeDate: string | null;
    latestUpdatedAt: string | null;
    sourceTable: "ice_python.settlements";
    rowCount: number;
  };
}

export const STRIP_TO_MONTH: Record<string, number> = {
  F: 1,
  G: 2,
  H: 3,
  J: 4,
  K: 5,
  M: 6,
  N: 7,
  Q: 8,
  U: 9,
  V: 10,
  X: 11,
  Z: 12,
};

export const MONTH_NAMES = [
  "",
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
];

export const STRIPS = ["F", "G", "H", "J", "K", "M", "N", "Q", "U", "V", "X", "Z"] as const;

export const COMPOSITE_STRIPS: Record<string, { codes: string[]; name: string; dteRef: string }> = {
  JF: { codes: ["F", "G"], name: "Jan-Feb", dteRef: "F" },
  JA: { codes: ["N", "Q"], name: "Jul-Aug", dteRef: "N" },
  Q1: { codes: ["F", "G", "H"], name: "Q1", dteRef: "F" },
  Q2: { codes: ["J", "K", "M"], name: "Q2", dteRef: "J" },
  Q3: { codes: ["N", "Q", "U"], name: "Q3", dteRef: "N" },
  Q4: { codes: ["V", "X", "Z"], name: "Q4", dteRef: "V" },
};

const SYMBOL_RE = /^([A-Z]+)\s+([FGHJKMNQUVXZ])(\d{2})-IUS$/;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

interface DayPrices {
  power?: number;
  gas?: number;
  basis?: number;
  dte: number;
}

export function validStrip(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  if ((STRIPS as readonly string[]).includes(normalized) || normalized in COMPOSITE_STRIPS) {
    return normalized;
  }
  return null;
}

export function resolveStrip(strip: string): { codes: string[]; dteRef: string; label: string } {
  const composite = COMPOSITE_STRIPS[strip];
  if (composite) return { codes: composite.codes, dteRef: composite.dteRef, label: composite.name };
  return {
    codes: [strip],
    dteRef: strip,
    label: MONTH_NAMES[STRIP_TO_MONTH[strip]] ?? strip,
  };
}

export function parseIceSymbol(symbol: string): ParsedIceSymbol | null {
  const match = symbol.match(SYMBOL_RE);
  if (!match) return null;

  const [, product, stripCode, yearSuffix] = match;
  const month = STRIP_TO_MONTH[stripCode];
  if (!month) return null;

  return {
    product,
    stripCode,
    month,
    year: 2000 + Number.parseInt(yearSuffix, 10),
  };
}

export function yearSuffix(year: number): string {
  return String(year % 100).padStart(2, "0");
}

export function buildSettlementSymbols({
  product,
  stripCodes,
  startYear,
  endYear,
}: {
  product: PowerSparkSpreadProduct;
  stripCodes: readonly string[];
  startYear: number;
  endYear: number;
}): string[] {
  const symbols: string[] = [];
  for (const root of [product.powerRoot, product.gasRoot, product.basisRoot]) {
    for (const code of stripCodes) {
      for (let year = startYear; year <= endYear; year += 1) {
        symbols.push(`${root} ${code}${yearSuffix(year)}-IUS`);
      }
    }
  }
  return symbols;
}

function lastTradingDay(month: number, year: number): Date {
  const date = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (count < 3) {
    date.setUTCDate(date.getUTCDate() - 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return date;
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function toDateKey(value: string | Date): string {
  return toDate(value).toISOString().slice(0, 10);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getOrInitNested(
  map: Map<string, Map<string, DayPrices>>,
  key: string,
): Map<string, DayPrices> {
  const existing = map.get(key);
  if (existing) return existing;
  const fresh = new Map<string, DayPrices>();
  map.set(key, fresh);
  return fresh;
}

function getOrInitDayPrices(
  map: Map<string, DayPrices>,
  stripCode: string,
  dte: number,
): DayPrices {
  const existing = map.get(stripCode);
  if (existing) return existing;
  const fresh: DayPrices = { dte };
  map.set(stripCode, fresh);
  return fresh;
}

function resolveYears(
  rows: SettlementValueRow[],
  product: PowerSparkSpreadProduct,
  stripCodes: readonly string[],
  symbolCache: Map<string, ParsedIceSymbol | null>,
): number[] {
  const productRoots = new Set([product.powerRoot, product.gasRoot, product.basisRoot]);
  const stripCodeSet = new Set(stripCodes);
  const years = new Set<number>();

  for (const row of rows) {
    let parsed = symbolCache.get(row.symbol);
    if (parsed === undefined) {
      parsed = parseIceSymbol(row.symbol);
      symbolCache.set(row.symbol, parsed);
    }
    if (!parsed) continue;
    if (!productRoots.has(parsed.product)) continue;
    if (!stripCodeSet.has(parsed.stripCode)) continue;
    years.add(parsed.year);
  }

  return Array.from(years).sort((first, second) => first - second);
}

export function buildSparkEvolutionData({
  rows,
  strip,
  product = DEFAULT_POWER_SPARK_SPREAD_PRODUCT,
  latestUpdatedAt = null,
}: {
  rows: SettlementValueRow[];
  strip: string;
  product?: PowerSparkSpreadProduct;
  latestUpdatedAt?: string | null;
}): SparkEvolutionResponse {
  const resolved = resolveStrip(strip);
  const componentCodeSet = new Set(resolved.codes);
  const symbolCache = new Map<string, ParsedIceSymbol | null>();
  const targetYears = resolveYears(rows, product, resolved.codes, symbolCache);
  const targetYearSet = new Set(targetYears);
  const byYearDate = new Map<string, Map<string, DayPrices>>();
  const expiryCache = new Map<string, number>();

  for (const row of rows) {
    let parsed = symbolCache.get(row.symbol);
    if (parsed === undefined) {
      parsed = parseIceSymbol(row.symbol);
      symbolCache.set(row.symbol, parsed);
    }
    if (!parsed) continue;
    if (!componentCodeSet.has(parsed.stripCode)) continue;
    if (!targetYearSet.has(parsed.year)) continue;

    const tradeDate = toDate(row.trade_date);
    const expiryKey = `${parsed.year}:${parsed.month}`;
    let expiryTime = expiryCache.get(expiryKey);
    if (expiryTime === undefined) {
      expiryTime = lastTradingDay(parsed.month, parsed.year).getTime();
      expiryCache.set(expiryKey, expiryTime);
    }

    const dte = Math.round((expiryTime - tradeDate.getTime()) / MS_PER_DAY);
    if (dte < 0 || dte > 730) continue;

    const dateKey = toDateKey(row.trade_date);
    const yearDateKey = `${parsed.year}:${dateKey}`;
    const stripMap = getOrInitNested(byYearDate, yearDateKey);
    const dayPrices = getOrInitDayPrices(stripMap, parsed.stripCode, dte);

    if (parsed.product === product.powerRoot) dayPrices.power = row.value;
    if (parsed.product === product.gasRoot) dayPrices.gas = row.value;
    if (parsed.product === product.basisRoot) dayPrices.basis = row.value;
  }

  const spreadMap = new Map<string, number>();
  const dateMap = new Map<string, string>();
  const seriesByYear: Record<string, SparkEvolutionSnapshotPoint[]> = {};
  const latestByYear: Record<string, SparkEvolutionSnapshotPoint | null> = {};
  let lastTradeDate: string | null = null;

  for (const year of targetYears) {
    const yearKey = String(year);
    seriesByYear[yearKey] = [];
    latestByYear[yearKey] = null;
  }

  for (const [yearDate, stripMap] of byYearDate) {
    const separator = yearDate.indexOf(":");
    const yearKey = yearDate.slice(0, separator);
    const tradeDate = yearDate.slice(separator + 1);

    let powerSum = 0;
    let gasSum = 0;
    let basisSum = 0;
    let dteValue: number | undefined;

    for (const code of resolved.codes) {
      const entry = stripMap.get(code);
      if (!entry || entry.power === undefined || entry.gas === undefined || entry.basis === undefined) {
        dteValue = undefined;
        break;
      }
      powerSum += entry.power;
      gasSum += entry.gas;
      basisSum += entry.basis;
      if (code === resolved.dteRef) dteValue = entry.dte;
    }

    if (dteValue === undefined) continue;

    const componentCount = resolved.codes.length;
    const power = roundTo(powerSum / componentCount, 4);
    const gas = roundTo(gasSum / componentCount, 4);
    const basis = roundTo(basisSum / componentCount, 4);
    const allInGas = roundTo(gas + basis, 4);
    const sparkSpread = roundTo(power - allInGas * product.heatRate, 2);
    const mapKey = `${yearKey}:${dteValue}`;

    spreadMap.set(mapKey, sparkSpread);
    dateMap.set(mapKey, tradeDate);
    seriesByYear[yearKey]?.push({
      tradeDate,
      daysToExpiry: dteValue,
      power,
      gas,
      basis,
      allInGas,
      sparkSpread,
    });

    if (!lastTradeDate || tradeDate > lastTradeDate) lastTradeDate = tradeDate;
  }

  const allDtes = new Set<number>();
  for (const key of spreadMap.keys()) {
    allDtes.add(Number.parseInt(key.slice(key.lastIndexOf(":") + 1), 10));
  }

  const dataAvailability: Record<string, boolean> = {};
  for (const year of targetYears) dataAvailability[String(year)] = false;

  const data: SparkEvolutionPoint[] = Array.from(allDtes)
    .sort((first, second) => second - first)
    .map((dte) => {
      const point: SparkEvolutionPoint = { daysToExpiry: dte };
      for (const year of targetYears) {
        const yearKey = String(year);
        const key = `${year}:${dte}`;
        const value = spreadMap.get(key) ?? null;
        point[yearKey] = value;
        point[`${yearKey}Date`] = value !== null ? dateMap.get(key) ?? null : null;
        if (value !== null) dataAvailability[yearKey] = true;
      }
      return point;
    });

  for (const year of targetYears) {
    const yearKey = String(year);
    seriesByYear[yearKey].sort((first, second) => second.daysToExpiry - first.daysToExpiry);
    latestByYear[yearKey] = seriesByYear[yearKey].at(-1) ?? null;
  }

  return {
    strip,
    monthName: resolved.label,
    componentCodes: resolved.codes,
    years: targetYears,
    data,
    seriesByYear,
    latestByYear,
    dataAvailability,
    metadata: {
      heatRate: product.heatRate,
      gasLeg: `${product.gasRoot} + ${product.basisRoot} (${product.gasLabel})`,
      powerLeg: `${product.powerRoot} (${product.hub})`,
      lastTradeDate,
      latestUpdatedAt,
      sourceTable: "ice_python.settlements",
      rowCount: rows.length,
    },
  };
}
