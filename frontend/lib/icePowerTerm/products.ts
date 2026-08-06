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

export interface IcePowerTermMarket {
  id: IcePowerTermMarketId;
  label: string;
}

export interface IcePowerTermProduct {
  root: IcePowerTermProductRoot;
  market: IcePowerTermMarketId;
  title: string;
  subtitle: string;
}

export const ICE_POWER_TERM_MARKETS: IcePowerTermMarket[] = [
  { id: "pjm", label: "PJM" },
  { id: "ercot", label: "ERCOT" },
  { id: "isone", label: "ISO-NE" },
  { id: "caiso", label: "CAISO" },
  { id: "midc", label: "Mid-C" },
];

export const ICE_POWER_TERM_PRODUCTS: IcePowerTermProduct[] = [
  {
    root: "PMI",
    market: "pjm",
    title: "PMI Monthly Matrix",
    subtitle: "PJM Western Hub RT on-peak monthly settles.",
  },
  {
    root: "OPJ",
    market: "pjm",
    title: "OPJ Monthly Matrix",
    subtitle: "PJM Western Hub RT off-peak monthly settles.",
  },
  {
    root: "ERN",
    market: "ercot",
    title: "ERN Monthly Matrix",
    subtitle: "ERCOT North 345 kV Hub RT peak monthly settles.",
  },
  {
    root: "ECI",
    market: "ercot",
    title: "ECI Monthly Matrix",
    subtitle: "ERCOT North 345 kV Hub RT off-peak 7x8 monthly settles.",
  },
  {
    root: "NEP",
    market: "isone",
    title: "NEP Monthly Matrix",
    subtitle: "ISO-NE Massachusetts Hub DA peak monthly settles.",
  },
  {
    root: "SPM",
    market: "caiso",
    title: "SPM Monthly Matrix",
    subtitle: "CAISO SP15 DA peak monthly settles.",
  },
  {
    root: "NPM",
    market: "caiso",
    title: "NPM Monthly Matrix",
    subtitle: "CAISO NP15 DA peak monthly settles.",
  },
  {
    root: "MDC",
    market: "midc",
    title: "MDC Monthly Matrix",
    subtitle: "Mid-Columbia DA peak monthly settles.",
  },
];

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

export const ICE_POWER_TERM_PRODUCT_ROOTS = ICE_POWER_TERM_PRODUCTS.map(
  (product) => product.root,
);

export const DEFAULT_ICE_POWER_TERM_MARKET = ICE_POWER_TERM_MARKETS[0];
export const DEFAULT_ICE_POWER_TERM_PRODUCT = ICE_POWER_TERM_PRODUCTS_BY_ROOT.PMI;

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
