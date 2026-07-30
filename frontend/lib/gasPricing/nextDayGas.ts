import { ICE_GAS_REGISTRY, type IceGasRegistryEntry } from "./iceGasRegistry";
import type { GasRegion } from "./dailyGasPriceView";

export type NextDayGasPriceMetric = string;

export interface NextDayGasPriceMetricConfig {
  value: NextDayGasPriceMetric;
  label: string;
  symbol: string;
  region: GasRegion;
  sortIndex: number;
}

type NextDayGasRegistryEntry = IceGasRegistryEntry & { symbol: string };

const NEXT_DAY_GAS_REGISTRY_ENTRIES = ICE_GAS_REGISTRY.nextDay.filter(
  (entry): entry is NextDayGasRegistryEntry =>
    typeof entry.symbol === "string" && entry.symbol.length > 0,
);

export const NEXT_DAY_GAS_PRICE_METRICS: NextDayGasPriceMetricConfig[] =
  NEXT_DAY_GAS_REGISTRY_ENTRIES.map((entry, index) => ({
    value: entry.symbol,
    label: entry.description,
    symbol: entry.symbol,
    region: entry.region,
    sortIndex: index,
  }));

export const NEXT_DAY_GAS_PRICE_COLUMNS: NextDayGasPriceMetric[] =
  NEXT_DAY_GAS_PRICE_METRICS.map((metric) => metric.value);
