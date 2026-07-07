import productAliasesData from "./rules/product_aliases.json";
import productDefinitionsData from "./rules/product_definitions.json";

export type ProductAliasSource = "nav" | "marex" | "clear_street" | "any";
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

export const PRODUCT_DEFINITIONS =
  productDefinitionsData as unknown as readonly ProductDefinition[];

export const PRODUCT_ALIASES =
  productAliasesData as unknown as readonly ProductAliasRule[];

export const PRODUCTS_BY_CODE: Readonly<Record<string, ProductDefinition>> = Object.fromEntries(
  PRODUCT_DEFINITIONS.map((definition) => [definition.exchangeCode, definition])
);

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
