export interface PowerSparkSpreadProduct {
  id: string;
  market: string;
  marketLabel: string;
  hub: string;
  powerRoot: string;
  gasRoot: string;
  basisRoot: string;
  gasLabel: string;
  heatRate: number;
  label: string;
  shortLabel: string;
}

export const POWER_SPARK_SPREAD_PRODUCTS: PowerSparkSpreadProduct[] = [
  {
    id: "PJM_WH_RT_TETCO_M3_7X",
    market: "PJM",
    marketLabel: "PJM",
    hub: "Western Hub RT",
    powerRoot: "PMI",
    gasRoot: "HNG",
    basisRoot: "TMT",
    gasLabel: "Tetco M3",
    heatRate: 7.0,
    label: "PJM Western Hub RT Spark 7x Tetco M3",
    shortLabel: "PJM WH RT Spark 7x",
  },
];

export const DEFAULT_POWER_SPARK_SPREAD_PRODUCT = POWER_SPARK_SPREAD_PRODUCTS[0];

export function getPowerSparkSpreadProduct(
  id: string | null | undefined,
): PowerSparkSpreadProduct | null {
  const normalized = id?.trim().toUpperCase();
  if (!normalized) return null;
  return POWER_SPARK_SPREAD_PRODUCTS.find((product) => product.id === normalized) ?? null;
}
