export type ProductAliasSource = "nav" | "marex" | "any";
export type ProductAliasMatchType = "exact" | "regex";
export type ProductRuleGroup = "Gas" | "Power" | "Basis";

export interface ProductDefinition {
  exchangeCode: string;
  ruleGroup: ProductRuleGroup;
  ruleRegion: string;
  exchangeCodeUnderlying: string | null;
  bbgExchangeCode: string | null;
  defaultExchangeName: "IFED" | "NYME" | null;
}

export interface ProductAliasRule {
  source: ProductAliasSource;
  matchType: ProductAliasMatchType;
  pattern: string;
  exchangeCode: string;
  optionType?: "option" | "future";
}

export interface ProductLookupMatch {
  definition: ProductDefinition;
  alias: ProductAliasRule | null;
}

const product = (
  exchangeCode: string,
  ruleGroup: ProductRuleGroup,
  ruleRegion: string,
  {
    exchangeCodeUnderlying = null,
    bbgExchangeCode = null,
    defaultExchangeName = "IFED",
  }: Partial<Omit<ProductDefinition, "exchangeCode" | "ruleGroup" | "ruleRegion">> = {}
): ProductDefinition => ({
  exchangeCode,
  ruleGroup,
  ruleRegion,
  exchangeCodeUnderlying,
  bbgExchangeCode,
  defaultExchangeName,
});

const gas = (
  exchangeCode: string,
  options?: Partial<Omit<ProductDefinition, "exchangeCode" | "ruleGroup" | "ruleRegion">>
) => product(exchangeCode, "Gas", "Henry Hub", options);

const power = (
  exchangeCode: string,
  ruleRegion: string,
  options?: Partial<Omit<ProductDefinition, "exchangeCode" | "ruleGroup" | "ruleRegion">>
) => product(exchangeCode, "Power", ruleRegion, options);

const basis = (
  exchangeCode: string,
  ruleRegion: string,
  options?: Partial<Omit<ProductDefinition, "exchangeCode" | "ruleGroup" | "ruleRegion">>
) => product(exchangeCode, "Basis", ruleRegion, options);

export const PRODUCT_DEFINITIONS: readonly ProductDefinition[] = [
  gas("HHD"),
  gas("NG", {
    bbgExchangeCode: "NG",
    defaultExchangeName: "NYME",
  }),
  gas("HH", {
    bbgExchangeCode: "IW",
    defaultExchangeName: "NYME",
  }),
  gas("HP", {
    bbgExchangeCode: "ZA",
    defaultExchangeName: "NYME",
  }),
  gas("H"),
  gas("PHH"),
  gas("PHE", { exchangeCodeUnderlying: "NG" }),
  gas("LN", {
    exchangeCodeUnderlying: "NG",
    bbgExchangeCode: "NG",
    defaultExchangeName: "NYME",
  }),
  gas("LN1", {
    exchangeCodeUnderlying: "NG",
    bbgExchangeCode: "NGW",
    defaultExchangeName: "NYME",
  }),
  gas("LN2", {
    exchangeCodeUnderlying: "NG",
    bbgExchangeCode: "NGW",
    defaultExchangeName: "NYME",
  }),
  gas("LN3", {
    exchangeCodeUnderlying: "NG",
    bbgExchangeCode: "NGW",
    defaultExchangeName: "NYME",
  }),
  gas("LN4", {
    exchangeCodeUnderlying: "NG",
    bbgExchangeCode: "NGW",
    defaultExchangeName: "NYME",
  }),
  gas("LN5", {
    exchangeCodeUnderlying: "NG",
    bbgExchangeCode: "NGW",
    defaultExchangeName: "NYME",
  }),
  gas("KN4", {
    exchangeCodeUnderlying: "NG",
    bbgExchangeCode: "HZI",
    defaultExchangeName: "NYME",
  }),
  gas("G3", {
    exchangeCodeUnderlying: "NG",
    defaultExchangeName: "NYME",
  }),
  gas("G4", {
    exchangeCodeUnderlying: "NG",
    defaultExchangeName: "NYME",
  }),
  power("PDP", "PJM"),
  power("PWA", "PJM"),
  power("DDP", "PJM"),
  power("PDA", "PJM"),
  power("PJL", "PJM"),
  power("PMI", "PJM", { exchangeCodeUnderlying: "PMI" }),
  power("P1X", "PJM", { exchangeCodeUnderlying: "PMI" }),
  power("OPJ", "PJM"),
  power("ODP", "PJM"),
  power("ERA", "ERCOT"),
  power("ERN", "ERCOT"),
  power("ECI", "ERCOT"),
  power("NEZ", "NEPOOL"),
  power("NEP", "NEPOOL"),
  power("SPM", "CAISO"),
  power("NPM", "CAISO"),
  power("MDC", "Mid-C"),
  basis("AEC", "AECO"),
  basis("ALQ", "Algonquin"),
  basis("CRI", "CIG Rockies"),
  basis("DGD", "Chicago"),
  basis("DOM", "Eastern Gas South"),
  basis("HXS", "Houston Ship Channel"),
  basis("UCS", "Houston Ship Channel"),
  basis("NTO", "NGPL TXOK"),
  basis("NWR", "Northwest Rockies"),
  basis("PGE", "PG&E Citygate"),
  basis("TMT", "Tetco M3"),
  basis("TRZ", "Transco Zone 4"),
];

export const PRODUCTS_BY_CODE: Readonly<Record<string, ProductDefinition>> = Object.fromEntries(
  PRODUCT_DEFINITIONS.map((definition) => [definition.exchangeCode, definition])
);

const exactAlias = (
  source: ProductAliasSource,
  pattern: string,
  exchangeCode: string,
  optionType?: ProductAliasRule["optionType"]
): ProductAliasRule => ({
  source,
  matchType: "exact",
  pattern,
  exchangeCode,
  optionType,
});

const regexAlias = (
  source: ProductAliasSource,
  pattern: string,
  exchangeCode: string,
  optionType?: ProductAliasRule["optionType"]
): ProductAliasRule => ({
  source,
  matchType: "regex",
  pattern,
  exchangeCode,
  optionType,
});

export const PRODUCT_ALIASES: readonly ProductAliasRule[] = [
  regexAlias("nav", "^ICE NGAS HH SWG DLY DAY-[0-9]+$", "HHD"),
  exactAlias("nav", "ICE NGAS HH SWING DAILY", "HHD"),
  exactAlias("marex", "HENRY SWING", "HHD"),

  exactAlias("nav", "NATURAL GAS", "NG"),
  exactAlias("marex", "NAT GAS", "NG"),
  exactAlias("nav", "GLOBEX NATURAL GAS LD", "HH"),
  exactAlias("nav", "NYMEX HENRY HUB FINANCIAL LDO", "HH"),
  exactAlias("marex", "NAT GAS LAST DAY FINAN", "HH"),
  exactAlias("nav", "NYMEX HENRY HUB NATURAL GAS", "HP"),
  exactAlias("nav", "HENRY PENULTIMATE NATURAL GAS", "HP"),
  exactAlias("marex", "HENRY HUB FINANCIAL", "HP"),
  exactAlias("nav", "NATURAL GAS LD1 FUTURE", "H"),
  exactAlias("nav", "HENRY HUB NATURAL GAS", "H"),
  exactAlias("marex", "HENRY LD1 FIXED", "H"),
  exactAlias("nav", "ICE PHH", "PHH"),
  exactAlias("marex", "HENRY PENULT FIXED", "PHH", "future"),
  exactAlias("nav", "ICE PHE", "PHE", "option"),
  exactAlias("nav", "ICE HH EQ", "PHE", "option"),
  exactAlias("nav", "ICE NGAS PEN HENRY HUB", "PHE", "option"),
  exactAlias("marex", "HENRY PENULT FIXED", "PHE", "option"),
  exactAlias("nav", "NYM EUR NATURAL GAS", "LN", "option"),
  exactAlias("nav", "NATURAL GAS CLEARPORT", "LN", "option"),
  exactAlias("marex", "EUR NAT GAS", "LN", "option"),
  exactAlias("nav", "NATURAL GAS FINANCIAL WEEK 1", "LN1", "option"),
  exactAlias("nav", "NATURAL GAS FINANCIAL WEEK 2", "LN2", "option"),
  exactAlias("nav", "NATURAL GAS FINANCIAL WEEK 3", "LN3", "option"),
  exactAlias("nav", "NATURAL GAS FINANCIAL WEEK 4", "LN4", "option"),
  exactAlias("nav", "NATURAL GAS FINANCIAL WEEK 5", "LN5", "option"),
  exactAlias("marex", "NAT GAS FIN WKLY WK1", "LN1", "option"),
  exactAlias("marex", "NAT GAS FIN WKLY WK2", "LN2", "option"),
  exactAlias("marex", "NAT GAS FIN WKLY WK3", "LN3", "option"),
  exactAlias("marex", "NAT GAS FIN WKLY WK4", "LN4", "option"),
  exactAlias("marex", "NAT GAS FIN WKLY WK5", "LN5", "option"),
  exactAlias("nav", "NATURAL GAS 3M CSO", "G3", "option"),
  exactAlias("marex", "NAT GAS CAL SPRD FIN 3MO", "G3", "option"),
  exactAlias("nav", "NATURAL GAS FINANCIAL 1M SO", "G4", "option"),
  exactAlias("nav", "NATURAL GAS 1M CSO", "G4", "option"),
  exactAlias("marex", "NAT GAS FINAN 1 MNTH SPRD", "G4", "option"),

  exactAlias("nav", "ICE PJM WH RTD", "PDP"),
  exactAlias("marex", "PJM WH REAL T PEAK DAILY", "PDP"),
  exactAlias("nav", "ICE PWA", "PWA"),
  exactAlias("marex", "PJM W HUB RT PEAK DAILY", "PWA"),
  exactAlias("marex", "PJM AEP DAYTHUB PEAK DLY", "DDP"),
  exactAlias("nav", "ICE PJMWHPKDAY", "PDA"),
  exactAlias("marex", "PJM WEST DAY AHEAD PK DA", "PDA"),
  exactAlias("nav", "ICE PJL", "PJL"),
  exactAlias("marex", "PJM WST HUB D APDM FP FU", "PJL"),
  regexAlias("nav", "^ICE (PJM MINI|MINIPJMRT|PJM WHREAL TYM PK MINI)([-_][0-9]+)?$", "PMI"),
  exactAlias("marex", "PJM WST HUB REAL PEAK FIXED", "PMI"),
  exactAlias("nav", "ICE PJM WHRT PEAK OPT_4096", "P1X", "option"),
  exactAlias("marex", "PJM WEST HUB RT", "P1X", "option"),
  regexAlias("nav", "^ICE PJM OFF PK[-_][0-9]+$", "OPJ"),
  exactAlias("marex", "PJM WST HUB REAL OFF PEAK FIXED", "OPJ"),
  exactAlias("marex", "PJM WH OFF-PEAK DAILY", "ODP"),

  exactAlias("nav", "ICE ERA", "ERA"),
  exactAlias("marex", "EMINI ERCOT 345RT PK DAILY", "ERA"),
  exactAlias("nav", "ERCOT N 345 KV RT PEAK DLY", "ERN"),
  exactAlias("marex", "ERCOT NORTH PEAK FIXED", "ERN"),
  regexAlias("nav", "^ICE ERCOT NORTH 345KV 7X8[-_][0-9]+$", "ECI"),
  exactAlias("marex", "ERCT NORTH 345KVRT 7X8 FXD", "ECI"),

  exactAlias("marex", "ISO NEW ENG MASS MINI FU", "NEZ"),
  regexAlias("nav", "^(ISO ENG MASS HUB D-PK-[0-9]+|ICE NEPOOL PK MNTH-[0-9]+)$", "NEP"),
  exactAlias("marex", "ISO MASS HUB PEAK FIXED", "NEP"),
  regexAlias("nav", "^ICE SP 15 PEAK([_-][0-9]+)?$", "SPM"),
  exactAlias("marex", "CAISO SP15 PEAK FIXED", "SPM"),
  regexAlias("nav", "^ICE NP 15 PEAK([_-][0-9]+)?$", "NPM"),
  exactAlias("marex", "CAISO NP15 PEAK FIXED", "NPM"),
  regexAlias("nav", "^ICE MID-C PEAK([_-][0-9]+)?$", "MDC"),
  exactAlias("marex", "MID C FIN PEAK ELEC", "MDC"),

  exactAlias("nav", "AB NIT BASIS FUTURE", "AEC"),
  exactAlias("marex", "AB NIT BASIS", "AEC"),
  exactAlias("nav", "ICE ALQCTYGTSW", "ALQ"),
  exactAlias("marex", "ALGONQUIN CITYGATES BASIS", "ALQ"),
  exactAlias("nav", "ICE CIG ROCKIES BASIS", "CRI"),
  exactAlias("marex", "CIG ROCKIES BASIS", "CRI"),
  exactAlias("nav", "ICE CHICAGO BASIS FUT", "DGD"),
  exactAlias("marex", "CHICAGO BASIS", "DGD"),
  exactAlias("nav", "ICE EASTERN GAS SOUTH BASIS FU", "DOM"),
  exactAlias("marex", "DOMINION SOUTH BASIS", "DOM"),
  exactAlias("nav", "ICE HSC BASIS", "HXS"),
  exactAlias("marex", "HSC BASIS", "HXS"),
  exactAlias("marex", "HSC SWING", "UCS"),
  exactAlias("nav", "NGPL TXOK BASIS FUTURE", "NTO"),
  exactAlias("marex", "NGPL TXOK BASIS", "NTO"),
  exactAlias("nav", "ICE NGAS NYM NWP RK", "NWR"),
  exactAlias("marex", "NAT GAS B/S FERC;ROCKIES", "NWR"),
  exactAlias("nav", "ICE NGAS NYM PG&E", "PGE"),
  exactAlias("marex", "PG&E CITYGATE BASIS", "PGE"),
  exactAlias("nav", "ICE TETCO SWP", "TMT"),
  exactAlias("marex", "TETCO M3 BASIS", "TMT"),
  exactAlias("nav", "ICE TRANSCO STATION 85 ZONE 4", "TRZ"),
  exactAlias("nav", "ICE TCOZN4BASI", "TRZ"),
  exactAlias("marex", "TRANSCO 85 Z4 BASIS", "TRZ"),
];

export function normalizeProductText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\s+/g, " ").toUpperCase() : null;
}

export function getProductDefinition(exchangeCode: string | null | undefined): ProductDefinition | null {
  if (!exchangeCode) return null;
  return PRODUCTS_BY_CODE[exchangeCode.trim().toUpperCase()] ?? null;
}

function aliasSourceMatches(alias: ProductAliasRule, source: ProductAliasSource): boolean {
  return alias.source === "any" || alias.source === source;
}

function aliasOptionMatches(alias: ProductAliasRule, isOption: boolean): boolean {
  if (!alias.optionType) return true;
  return alias.optionType === "option" ? isOption : !isOption;
}

function aliasPatternMatches(alias: ProductAliasRule, normalizedProduct: string): boolean {
  if (alias.matchType === "exact") return normalizedProduct === alias.pattern;
  return new RegExp(alias.pattern, "i").test(normalizedProduct);
}

export function findProductAlias(
  source: ProductAliasSource,
  productName: string | null | undefined,
  isOption: boolean
): ProductAliasRule | null {
  const normalizedProduct = normalizeProductText(productName);
  if (!normalizedProduct) return null;

  return (
    PRODUCT_ALIASES.find(
      (alias) =>
        aliasSourceMatches(alias, source) &&
        aliasOptionMatches(alias, isOption) &&
        aliasPatternMatches(alias, normalizedProduct)
    ) ?? null
  );
}

export function resolveProductLookup({
  source,
  productName,
  exchangeCode,
  isOption,
}: {
  source: ProductAliasSource;
  productName?: string | null;
  exchangeCode?: string | null;
  isOption: boolean;
}): ProductLookupMatch | null {
  const explicitDefinition = getProductDefinition(exchangeCode);
  if (explicitDefinition) {
    return { definition: explicitDefinition, alias: null };
  }

  const alias = findProductAlias(source, productName, isOption);
  if (!alias) return null;

  const definition = getProductDefinition(alias.exchangeCode);
  return definition ? { definition, alias } : null;
}
