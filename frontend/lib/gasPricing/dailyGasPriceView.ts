import type { GasPriceBasis } from "./hourlyGasPricingSql";
import { DAILY_GAS_MARKETS } from "./iceGasRegistry";

export type GasRegion =
  | "east"
  | "midwest"
  | "mountain"
  | "pacific"
  | "south_central";

export type GasCurveColumnKind = "cash" | "balmo" | "month";

export interface DailyGasCurveColumn {
  key: string;
  label: string;
  kind: GasCurveColumnKind;
  contractMonth: string | null;
}

export interface DailyGasMarket {
  region: GasRegion;
  market: string;
  shortLabel: string;
  cashSymbol: string;
  balmoSymbol: string | null;
  futuresProduct: string | null;
  curveStyle: "fixed" | "basis" | "none";
}

export interface DailyGasTrendPoint {
  tradeDate: string | null;
  value: number | null;
}

export interface DailyGasPriceRow {
  region: GasRegion;
  market: string;
  shortLabel: string;
  cashSymbol: string;
  balmoSymbol: string | null;
  futuresProduct: string | null;
  curveStyle: "fixed" | "basis" | "none";
  values: Record<string, number | null>;
  valueDates: Record<string, string | null>;
  symbols: Record<string, string | null>;
  sourceSymbols: Record<string, string[]>;
  updatedAt: Record<string, string | null>;
  trends: Record<string, DailyGasTrendPoint[]>;
}

export interface DailyGasPricesPayload {
  priceBasis: GasPriceBasis;
  cashBasis: GasPriceBasis;
  balmoBasis: GasPriceBasis;
  tradeDate: string;
  columns: DailyGasCurveColumn[];
  markets: DailyGasMarket[];
  rows: DailyGasPriceRow[];
  metadata: {
    dataAsOf: string | null;
    sourceTable: "ice_python.settlements";
    rowCount: number;
    valueCount: number;
    missingValueCount: number;
    henryCurveProduct: "HNG";
    registrySource: "backend.scrapes.ice_python.symbols.gas";
    registryMarketCount: number;
    registryNextDayCount: number;
    registryBalmoCount: number;
    registryFuturesProductCount: number;
  };
}

export const GAS_REGION_ORDER: GasRegion[] = [
  "south_central",
  "east",
  "pacific",
  "mountain",
  "midwest",
];

export const GAS_REGION_LABELS: Record<GasRegion, string> = {
  east: "East",
  midwest: "Midwest",
  mountain: "Mountain",
  pacific: "Pacific",
  south_central: "South Central",
};

export const GAS_CURVE_MONTH_CODES: Record<number, string> = {
  1: "F",
  2: "G",
  3: "H",
  4: "J",
  5: "K",
  6: "M",
  7: "N",
  8: "Q",
  9: "U",
  10: "V",
  11: "X",
  12: "Z",
};

export { DAILY_GAS_MARKETS };

export const DAILY_GAS_PRICE_BASIS_LABELS: Record<GasPriceBasis, string> = {
  settlement: "Settlement",
  open: "Open",
  high: "High",
  low: "Low",
  close: "Close",
  vwap_close: "VWAP",
};

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNullableText(value: string | null): string {
  return value === null ? "NULL" : sqlText(value);
}

export function buildDailyGasMarketValuesSql(markets = DAILY_GAS_MARKETS): string {
  return markets
    .map((market, index) =>
      [
        "    (",
        [
          index + 1,
          sqlText(market.region),
          sqlText(market.market),
          sqlText(market.shortLabel),
          sqlText(market.cashSymbol),
          sqlNullableText(market.balmoSymbol),
          sqlNullableText(market.futuresProduct),
          sqlText(market.curveStyle),
        ].join(", "),
        ")",
      ].join("")
    )
    .join(",\n");
}

export function normalizeDailyGasPriceBasis(value: string | null | undefined): GasPriceBasis {
  if (
    value === "settlement" ||
    value === "open" ||
    value === "high" ||
    value === "low" ||
    value === "close" ||
    value === "vwap_close"
  ) {
    return value;
  }
  return "settlement";
}
