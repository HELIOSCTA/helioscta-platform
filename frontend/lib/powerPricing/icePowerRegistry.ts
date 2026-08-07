import registryJson from "./ice_power_registry.json";

export type IcePowerRegistrySourceModule =
  | "backend.scrapes.ice_python.symbols.pjm"
  | "backend.scrapes.ice_python.symbols.ercot"
  | "backend.scrapes.ice_python.symbols.east_power"
  | "backend.scrapes.ice_python.symbols.west_power";

export type IcePowerTermMarketId = "pjm" | "ercot" | "isone" | "caiso" | "midc";

export type IcePowerTermProductRoot =
  | "PMI"
  | "OPJ"
  | "ERN"
  | "ECI"
  | "NEP"
  | "SPM"
  | "NPM"
  | "MDC";

export interface IcePowerRegistryEntry {
  symbol?: string | null;
  product?: string | null;
  cc?: string | null;
  description: string;
  product_name?: string | null;
  product_type: string;
  contract_type: string;
  market?: string | null;
  shape?: string | null;
  hub?: string | null;
  hour_bucket?: string | null;
  hours?: string | null;
  contract_size?: string | null;
  contract_code?: string | null;
  contract_label?: string | null;
  ice_product_id?: string | null;
  ice_product_url?: string | null;
  ice_contract_symbol?: string | null;
  ice_product_type?: string | null;
  ice_trading_screen_hub_name?: string | null;
  ice_trading_screen_product_name?: string | null;
  ice_symbol_pattern?: string | null;
  reference_price?: string | null;
  settlement_source?: string | null;
  settlement_source_key?: string | null;
  settlement_priority?: number | null;
  source_table?: string | null;
  pjm_source_table?: string | null;
  source_registry: string;
  metadata_status: string;
  active?: boolean | null;
  notes?: string | null;
  blotter_hub_aliases?: string[] | null;
}

export interface IcePowerTermMarket {
  id: IcePowerTermMarketId;
  label: string;
}

interface IcePowerRegistryTermMarket extends IcePowerTermMarket {
  sortOrder: number;
  productCount: number;
}

export interface IcePowerTermProduct {
  root: IcePowerTermProductRoot;
  market: IcePowerTermMarketId;
  title: string;
  subtitle: string;
}

interface IcePowerRegistryTermProduct extends IcePowerTermProduct {
  sortOrder: number;
  productName: string | null;
  description: string | null;
  hub: string | null;
  shape: string | null;
  marketType: string | null;
  hourBucket: string | null;
  iceProductUrl: string | null;
  sourceRegistry: string | null;
}

interface IcePowerRegistry {
  metadata: {
    source: IcePowerRegistrySourceModule[];
    generatedAt: string;
    shortTermCount: number;
    dailyCount: number;
    futuresProductCount: number;
    productDictionaryCount: number;
    termMarketCount: number;
    termProductCount: number;
  };
  shortTerm: {
    pjm: IcePowerRegistryEntry[];
    ercot: IcePowerRegistryEntry[];
  };
  daily: {
    eastPower: IcePowerRegistryEntry[];
    westPower: IcePowerRegistryEntry[];
  };
  futures: {
    pjm: IcePowerRegistryEntry[];
    ercot: IcePowerRegistryEntry[];
    eastPower: IcePowerRegistryEntry[];
    westPower: IcePowerRegistryEntry[];
  };
  productDictionary: IcePowerRegistryEntry[];
  termMarkets: IcePowerRegistryTermMarket[];
  termProducts: IcePowerRegistryTermProduct[];
}

export const ICE_POWER_REGISTRY = registryJson as IcePowerRegistry;

const ICE_POWER_REGISTRY_ENTRIES = [
  ...ICE_POWER_REGISTRY.shortTerm.pjm,
  ...ICE_POWER_REGISTRY.shortTerm.ercot,
  ...ICE_POWER_REGISTRY.daily.eastPower,
  ...ICE_POWER_REGISTRY.daily.westPower,
  ...ICE_POWER_REGISTRY.futures.pjm,
  ...ICE_POWER_REGISTRY.futures.ercot,
  ...ICE_POWER_REGISTRY.futures.eastPower,
  ...ICE_POWER_REGISTRY.futures.westPower,
  ...ICE_POWER_REGISTRY.productDictionary,
];

const ICE_POWER_REGISTRY_ENTRY_BY_KEY = new Map<string, IcePowerRegistryEntry>();

for (const entry of ICE_POWER_REGISTRY_ENTRIES) {
  for (const key of [
    entry.symbol,
    entry.product,
    entry.cc,
    entry.ice_contract_symbol,
    entry.ice_symbol_pattern,
    entry.ice_product_id,
  ]) {
    if (key) ICE_POWER_REGISTRY_ENTRY_BY_KEY.set(key, entry);
  }
}

export const ICE_POWER_TERM_MARKETS: IcePowerTermMarket[] =
  ICE_POWER_REGISTRY.termMarkets.map((market) => ({
    id: market.id,
    label: market.label,
  }));

export const ICE_POWER_TERM_PRODUCTS: IcePowerTermProduct[] =
  ICE_POWER_REGISTRY.termProducts.map((product) => ({
    root: product.root,
    market: product.market,
    title: product.title,
    subtitle: product.subtitle,
  }));

export const ICE_POWER_TERM_PRODUCT_ROOTS = ICE_POWER_TERM_PRODUCTS.map(
  (product) => product.root,
);

export function getIcePowerRegistryCounts() {
  return ICE_POWER_REGISTRY.metadata;
}

export function getIcePowerRegistryEntry(
  identifier: string | null | undefined,
): IcePowerRegistryEntry | null {
  if (!identifier) return null;
  return ICE_POWER_REGISTRY_ENTRY_BY_KEY.get(identifier) ?? null;
}

export function getIcePowerVerificationLabel(
  entry: IcePowerRegistryEntry | null | undefined,
): string {
  if (!entry) return "No contract configured";
  if (entry.metadata_status === "ice_product_url_verified") return "Verified ICE product";
  if (entry.metadata_status === "unverified_legacy_symbol") return "Legacy settlement symbol";
  return entry.metadata_status || "Unknown";
}
