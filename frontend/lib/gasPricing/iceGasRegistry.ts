import registryJson from "./ice_gas_registry.json";
import type { DailyGasMarket, GasRegion } from "./dailyGasPriceView";

export interface IceGasRegistryEntry {
  symbol?: string | null;
  product?: string | null;
  cc?: string | null;
  description: string;
  hub: string;
  region: GasRegion;
  contract_type: string;
  ice_product_type: string;
  ice_product_id?: string | null;
  ice_product_url?: string | null;
  ice_contract_symbol?: string | null;
  ice_trading_screen_hub_name?: string | null;
  ice_trading_screen_product_name?: string | null;
  product_name?: string | null;
  notes?: string | null;
  source_table: "ice_python.settlements";
  metadata_status: string;
}

interface IceGasRegistryMarket {
  sortOrder: number;
  region: GasRegion;
  market: string;
  shortLabel: string;
  cashSymbol: string;
  balmoSymbol: string | null;
  futuresProduct: string | null;
  curveStyle: DailyGasMarket["curveStyle"];
  registryHubKey: string;
}

interface IceGasRegistry {
  metadata: {
    source: "backend.scrapes.ice_python.symbols.gas";
    generatedAt: string;
    nextDayCount: number;
    balmoCount: number;
    futuresProductCount: number;
    marketCount: number;
  };
  nextDay: IceGasRegistryEntry[];
  balmo: IceGasRegistryEntry[];
  futures: IceGasRegistryEntry[];
  markets: IceGasRegistryMarket[];
}

export const ICE_GAS_REGISTRY = registryJson as IceGasRegistry;

const ICE_GAS_REGISTRY_ENTRIES = [
  ...ICE_GAS_REGISTRY.nextDay,
  ...ICE_GAS_REGISTRY.balmo,
  ...ICE_GAS_REGISTRY.futures,
];

const ICE_GAS_REGISTRY_ENTRY_BY_KEY = new Map<string, IceGasRegistryEntry>();

for (const entry of ICE_GAS_REGISTRY_ENTRIES) {
  for (const key of [entry.symbol, entry.product, entry.cc, entry.ice_contract_symbol]) {
    if (key) ICE_GAS_REGISTRY_ENTRY_BY_KEY.set(key, entry);
  }
}

export const DAILY_GAS_MARKETS: DailyGasMarket[] = ICE_GAS_REGISTRY.markets.map((market) => ({
  region: market.region,
  market: market.market,
  shortLabel: market.shortLabel,
  cashSymbol: market.cashSymbol,
  balmoSymbol: market.balmoSymbol,
  futuresProduct: market.futuresProduct,
  curveStyle: market.curveStyle,
}));

export function getIceGasRegistryCounts() {
  return ICE_GAS_REGISTRY.metadata;
}

export function getIceGasRegistryEntry(identifier: string | null | undefined): IceGasRegistryEntry | null {
  if (!identifier) return null;
  return ICE_GAS_REGISTRY_ENTRY_BY_KEY.get(identifier) ?? null;
}

export function getIceGasVerificationLabel(entry: IceGasRegistryEntry | null | undefined): string {
  if (!entry) return "No contract configured";
  if (entry.metadata_status === "ice_product_url_verified") return "Verified ICE product";
  if (entry.metadata_status === "unverified_legacy_symbol") return "Legacy settlement symbol";
  return entry.metadata_status || "Unknown";
}
