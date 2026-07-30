import type { GasPriceBasis } from "./hourlyGasPricingSql";
import type { DailyGasMarket } from "./dailyGasPriceView";

export type GasMonthlySettlesMode = "futures" | "cash" | "balmo";
export type GasMonthlyFuturesDisplay = "outright" | "basis";
export type GasMonthlySettlesPointType = "forward" | "settled" | "cash" | "balmo";
export type GasMonthlySettlesDateBasis = "trade_date" | "gas_day";
export type GasMonthlySettlesSource = "ice_python.settlements" | "ice_python_next_day_gas";

export interface GasMonthlySettlesColumn {
  key: string;
  year: number;
  label: string;
}

export interface GasMonthlySettlesCell {
  rowKey: string;
  columnKey: string;
  value: number | null;
  tradeDate: string | null;
  updatedAt: string | null;
  volume: number | null;
  displaySymbol: string | null;
  sourceSymbols: string[];
  formula: string;
  contractMonth: string | null;
  pointType: GasMonthlySettlesPointType;
  dateBasis: GasMonthlySettlesDateBasis;
}

export interface GasMonthlySettlesRow {
  key: string;
  label: string;
  sortOrder: number;
  cells: Record<string, GasMonthlySettlesCell | null>;
}

export interface GasMonthlySettlesPayload {
  product: "gas";
  source: GasMonthlySettlesSource;
  mode: GasMonthlySettlesMode;
  market: DailyGasMarket;
  priceBasis: GasPriceBasis;
  futuresDisplay: GasMonthlyFuturesDisplay;
  selectedMonth: number | null;
  years: number[];
  columns: GasMonthlySettlesColumn[];
  rows: GasMonthlySettlesRow[];
  metadata: {
    dataAsOf: string | null;
    sourceTable: GasMonthlySettlesSource;
    rowCount: number;
    valueCount: number;
    missingValueCount: number;
    registrySource: "backend.scrapes.ice_python.symbols.gas";
    noCalendarAssumption: true;
  };
}

export const GAS_MONTHLY_SETTLES_MODE_LABELS: Record<GasMonthlySettlesMode, string> = {
  futures: "Futures",
  cash: "Cash",
  balmo: "BalMo",
};

export const GAS_MONTHLY_FUTURES_DISPLAY_LABELS: Record<GasMonthlyFuturesDisplay, string> = {
  outright: "Outright",
  basis: "Basis",
};
