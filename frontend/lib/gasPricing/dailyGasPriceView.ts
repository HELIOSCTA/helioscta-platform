import type { GasPriceBasis } from "./hourlyGasPricingSql";

export type GasRegion =
  | "louisiana"
  | "southeast"
  | "east_texas"
  | "northeast"
  | "midwest"
  | "rockies_northwest"
  | "southwest";

export interface DailyGasHub {
  symbol: string;
  label: string;
  shortLabel: string;
  region: GasRegion;
}

export interface DailyGasPriceCell {
  symbol: string;
  value: number | null;
}

export interface DailyGasPriceRow {
  gasDay: string;
  tradeDate: string;
  year: number;
  month: number;
  gasDayLabel: string;
  values: Record<string, number | null>;
}

export interface DailyGasPricesPayload {
  priceBasis: "vwap_close";
  startDate: string;
  endDate: string;
  hubs: DailyGasHub[];
  rows: DailyGasPriceRow[];
}

export const GAS_REGION_LABELS: Record<GasRegion, string> = {
  louisiana: "Louisiana",
  southeast: "Louisiana/Southeast",
  east_texas: "East Texas",
  northeast: "NE",
  midwest: "Midwest",
  rockies_northwest: "Rockies/Northwest",
  southwest: "Southwest",
};

export const NEXT_DAY_GAS_DAILY_HUBS: DailyGasHub[] = [
  { symbol: "XGF D1-IPG", label: "Henry Hub", shortLabel: "HH", region: "louisiana" },
  { symbol: "XTA D1-IPG", label: "ANR SE-T", shortLabel: "ANR", region: "southeast" },
  { symbol: "YV7 D1-IPG", label: "Pine Prairie", shortLabel: "Pine Prairie", region: "southeast" },
  { symbol: "XVA D1-IPG", label: "Transco Station 85", shortLabel: "ST85", region: "southeast" },
  { symbol: "XIT D1-IPG", label: "NGPL TX/OK", shortLabel: "Tex-Ok", region: "east_texas" },
  { symbol: "XT6 D1-IPG", label: "Waha", shortLabel: "WAHA", region: "east_texas" },
  { symbol: "XYZ D1-IPG", label: "Houston Ship Channel", shortLabel: "Ship", region: "east_texas" },
  { symbol: "XVM D1-IPG", label: "Tetco WLA", shortLabel: "TETCO WLA", region: "southeast" },
  { symbol: "XIZ D1-IPG", label: "Columbia TCO Pool", shortLabel: "TCO", region: "northeast" },
  { symbol: "XJL D1-IPG", label: "Dominion South", shortLabel: "Dom", region: "northeast" },
  { symbol: "YFF D1-IPG", label: "Transco Zone 5 South", shortLabel: "Z5S", region: "northeast" },
  { symbol: "Z2Y D1-IPG", label: "Transco Zone 5 North", shortLabel: "Z5", region: "northeast" },
  { symbol: "XZR D1-IPG", label: "Tetco M3", shortLabel: "M3", region: "northeast" },
  { symbol: "YP8 D1-IPG", label: "Iroquois Zone 2", shortLabel: "IROQUOIS-Z2", region: "northeast" },
  { symbol: "XWK D1-IPG", label: "Transco Zone 6 NY", shortLabel: "TRANSCO-Z6 NY", region: "northeast" },
  { symbol: "YQE D1-IPG", label: "Transco Leidy", shortLabel: "Leidy", region: "northeast" },
  { symbol: "YAG D1-IPG", label: "Tetco M2", shortLabel: "M2", region: "northeast" },
  { symbol: "Z1Q D1-IPG", label: "Tennessee Z4", shortLabel: "Tenn Z4", region: "northeast" },
  { symbol: "XTG D1-IPG", label: "Northern Ventura", shortLabel: "Ventura", region: "midwest" },
  { symbol: "YHF D1-IPG", label: "Chicago CityGate", shortLabel: "Chicago", region: "midwest" },
  { symbol: "XJZ D1-IPG", label: "MichCon", shortLabel: "MichCon", region: "midwest" },
  { symbol: "XJR D1-IPG", label: "NGPL Midcontinent", shortLabel: "NGPL Midcon", region: "midwest" },
  { symbol: "YKL D1-IPG", label: "CIG Mainline", shortLabel: "CIG", region: "rockies_northwest" },
  { symbol: "XGV D1-IPG", label: "PG&E Citygate", shortLabel: "PG&E", region: "southwest" },
  { symbol: "XKF D1-IPG", label: "SoCal Citygate", shortLabel: "SoCal", region: "southwest" },
];

export const DAILY_GAS_PRICE_BASIS_LABELS: Record<GasPriceBasis, string> = {
  settlement: "Settlement",
  open: "Open",
  high: "High",
  low: "Low",
  close: "Close",
  vwap_close: "VWAP Close",
};

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildDailyGasHubValuesSql(hubs = NEXT_DAY_GAS_DAILY_HUBS): string {
  return hubs
    .map((hub, index) =>
      `    (${sqlText(hub.symbol)}, ${sqlText(hub.label)}, ${sqlText(hub.shortLabel)}, ${sqlText(hub.region)}, ${index + 1})`
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
  return "vwap_close";
}
