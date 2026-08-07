import {
  ICE_POWER_TERM_MARKETS as REGISTRY_POWER_TERM_MARKETS,
  ICE_POWER_TERM_PRODUCTS as REGISTRY_POWER_TERM_PRODUCTS,
  ICE_POWER_TERM_PRODUCT_ROOTS as REGISTRY_POWER_TERM_PRODUCT_ROOTS,
  type IcePowerTermMarket,
  type IcePowerTermMarketId,
  type IcePowerTermProduct,
  type IcePowerTermProductRoot,
} from "@/lib/powerPricing/icePowerRegistry";

export type {
  IcePowerTermMarket,
  IcePowerTermMarketId,
  IcePowerTermProduct,
  IcePowerTermProductRoot,
};

export const ICE_POWER_TERM_MARKETS = REGISTRY_POWER_TERM_MARKETS;
export const ICE_POWER_TERM_PRODUCTS = REGISTRY_POWER_TERM_PRODUCTS;

export const ICE_POWER_TERM_PRODUCTS_BY_ROOT = Object.fromEntries(
  ICE_POWER_TERM_PRODUCTS.map((product) => [product.root, product]),
) as Record<IcePowerTermProductRoot, IcePowerTermProduct>;

export const ICE_POWER_TERM_PRODUCTS_BY_MARKET = ICE_POWER_TERM_MARKETS.reduce(
  (markets, market) => {
    markets[market.id] = ICE_POWER_TERM_PRODUCTS.filter(
      (product) => product.market === market.id,
    );
    return markets;
  },
  {} as Record<IcePowerTermMarketId, IcePowerTermProduct[]>,
);

export const ICE_POWER_TERM_PRODUCT_ROOTS = REGISTRY_POWER_TERM_PRODUCT_ROOTS;

export const DEFAULT_ICE_POWER_TERM_MARKET = ICE_POWER_TERM_MARKETS[0];
export const DEFAULT_ICE_POWER_TERM_PRODUCT =
  ICE_POWER_TERM_PRODUCTS_BY_ROOT.PMI ?? ICE_POWER_TERM_PRODUCTS[0];

export function isIcePowerTermProductRoot(
  value: string | null | undefined,
): value is IcePowerTermProductRoot {
  const normalized = value?.trim().toUpperCase();
  return Boolean(
    normalized &&
      ICE_POWER_TERM_PRODUCT_ROOTS.includes(normalized as IcePowerTermProductRoot),
  );
}

export function getIcePowerTermProduct(
  value: string | null | undefined,
): IcePowerTermProduct | null {
  const normalized = value?.trim().toUpperCase();
  if (!isIcePowerTermProductRoot(normalized)) return null;
  return ICE_POWER_TERM_PRODUCTS_BY_ROOT[normalized];
}
