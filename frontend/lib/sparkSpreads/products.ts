export interface PowerSparkSpreadProduct {
  id: string;
  market: string;
  marketLabel: string;
  hub: string;
  powerRoot: string;
  spreadRoot: string | null;
  peak: "onpeak" | "offpeak" | "peakOffpeak";
  onPeakProductId: string;
  offPeakProductId: string | null;
  gasRoot: string;
  basisRoot: string;
  gasLabel: string;
  heatRate: number;
  label: string;
  shortLabel: string;
  sparkEnabled: boolean;
}

export interface SparkGasLeg {
  id: string;
  market: string;
  gasRoot: string;
  basisRoot: string;
  gasLabel: string;
  label: string;
  shortLabel: string;
  contextLabel: string;
}

export const SPARK_GAS_LEGS: SparkGasLeg[] = [
  {
    id: "TETCO_M3",
    market: "PJM",
    gasRoot: "HNG",
    basisRoot: "TMT",
    gasLabel: "Tetco M3",
    label: "Henry Hub + Tetco M3 Basis",
    shortLabel: "Tetco M3",
    contextLabel: "Default for PJM Western Hub",
  },
];

export const POWER_SPARK_SPREAD_PRODUCTS: PowerSparkSpreadProduct[] = [
  {
    id: "PJM_WH_RT_TETCO_M3_7X",
    market: "PJM",
    marketLabel: "PJM",
    hub: "Western Hub RT",
    powerRoot: "PMI",
    spreadRoot: null,
    peak: "onpeak",
    onPeakProductId: "PJM_WH_RT_TETCO_M3_7X",
    offPeakProductId: "PJM_WH_RT_OFFPEAK_TETCO_M3_7X",
    gasRoot: "HNG",
    basisRoot: "TMT",
    gasLabel: "Tetco M3",
    heatRate: 7.0,
    label: "PJM Western Hub RT Spark 7x Tetco M3",
    shortLabel: "PJM WH RT Spark 7x",
    sparkEnabled: true,
  },
  {
    id: "PJM_WH_RT_OFFPEAK_TETCO_M3_7X",
    market: "PJM",
    marketLabel: "PJM",
    hub: "Western Hub RT Off-Peak",
    powerRoot: "OPJ",
    spreadRoot: null,
    peak: "offpeak",
    onPeakProductId: "PJM_WH_RT_TETCO_M3_7X",
    offPeakProductId: "PJM_WH_RT_OFFPEAK_TETCO_M3_7X",
    gasRoot: "HNG",
    basisRoot: "TMT",
    gasLabel: "Tetco M3",
    heatRate: 7.0,
    label: "PJM Western Hub RT Off-Peak Spark 7x Tetco M3",
    shortLabel: "PJM WH RT Off-Peak 7x",
    sparkEnabled: true,
  },
  {
    id: "PJM_WH_RT_PEAK_OFFPEAK_SPREAD",
    market: "PJM",
    marketLabel: "PJM",
    hub: "Western Hub RT Peak/Off-Peak",
    powerRoot: "PMI",
    spreadRoot: "OPJ",
    peak: "peakOffpeak",
    onPeakProductId: "PJM_WH_RT_TETCO_M3_7X",
    offPeakProductId: "PJM_WH_RT_OFFPEAK_TETCO_M3_7X",
    gasRoot: "HNG",
    basisRoot: "TMT",
    gasLabel: "Tetco M3",
    heatRate: 7.0,
    label: "PJM Western Hub RT Peak less Off-Peak Spread",
    shortLabel: "PJM WH RT Pk/OffPk",
    sparkEnabled: false,
  },
  {
    id: "NEPOOL_MH_DA_PEAK",
    market: "NEPOOL",
    marketLabel: "NEPOOL",
    hub: "Mass Hub DA",
    powerRoot: "NEP",
    spreadRoot: null,
    peak: "onpeak",
    onPeakProductId: "NEPOOL_MH_DA_PEAK",
    offPeakProductId: null,
    gasRoot: "HNG",
    basisRoot: "TMT",
    gasLabel: "Unmapped",
    heatRate: 7.0,
    label: "ISO New England Massachusetts Hub Day-Ahead Peak",
    shortLabel: "NEPOOL MH DA Peak",
    sparkEnabled: false,
  },
  {
    id: "ERCOT_NORTH_RT_PEAK",
    market: "ERCOT",
    marketLabel: "ERCOT",
    hub: "North 345KV Hub RT",
    powerRoot: "ERN",
    spreadRoot: null,
    peak: "onpeak",
    onPeakProductId: "ERCOT_NORTH_RT_PEAK",
    offPeakProductId: "ERCOT_NORTH_RT_OFFPEAK",
    gasRoot: "HNG",
    basisRoot: "TMT",
    gasLabel: "Unmapped",
    heatRate: 7.0,
    label: "ERCOT North 345 kV Hub Real-Time Peak",
    shortLabel: "ERCOT North RT Peak",
    sparkEnabled: false,
  },
  {
    id: "ERCOT_NORTH_RT_OFFPEAK",
    market: "ERCOT",
    marketLabel: "ERCOT",
    hub: "North 345KV Hub RT Off-Peak",
    powerRoot: "ECI",
    spreadRoot: null,
    peak: "offpeak",
    onPeakProductId: "ERCOT_NORTH_RT_PEAK",
    offPeakProductId: "ERCOT_NORTH_RT_OFFPEAK",
    gasRoot: "HNG",
    basisRoot: "TMT",
    gasLabel: "Unmapped",
    heatRate: 7.0,
    label: "ERCOT North 345 kV Hub Real-Time Off-Peak",
    shortLabel: "ERCOT North RT Off-Peak",
    sparkEnabled: false,
  },
  {
    id: "ERCOT_NORTH_RT_PEAK_OFFPEAK_SPREAD",
    market: "ERCOT",
    marketLabel: "ERCOT",
    hub: "North 345KV Hub RT Peak/Off-Peak",
    powerRoot: "ERN",
    spreadRoot: "ECI",
    peak: "peakOffpeak",
    onPeakProductId: "ERCOT_NORTH_RT_PEAK",
    offPeakProductId: "ERCOT_NORTH_RT_OFFPEAK",
    gasRoot: "HNG",
    basisRoot: "TMT",
    gasLabel: "Unmapped",
    heatRate: 7.0,
    label: "ERCOT North 345 kV Hub RT Peak less Off-Peak Spread",
    shortLabel: "ERCOT North Pk/OffPk",
    sparkEnabled: false,
  },
];

export const DEFAULT_POWER_SPARK_SPREAD_PRODUCT = POWER_SPARK_SPREAD_PRODUCTS[0];
export const DEFAULT_SPARK_GAS_LEG = SPARK_GAS_LEGS[0];

export function getPowerSparkSpreadProduct(
  id: string | null | undefined,
): PowerSparkSpreadProduct | null {
  const normalized = id?.trim().toUpperCase();
  if (!normalized) return null;
  return POWER_SPARK_SPREAD_PRODUCTS.find((product) => product.id === normalized) ?? null;
}

export function getSparkGasLeg(id: string | null | undefined): SparkGasLeg | null {
  const normalized = id?.trim().toUpperCase();
  if (!normalized) return null;
  return SPARK_GAS_LEGS.find((leg) => leg.id === normalized) ?? null;
}
