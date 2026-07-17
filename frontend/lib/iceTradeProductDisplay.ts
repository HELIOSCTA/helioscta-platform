export interface IceTradeProductDisplayInput {
  cc?: string | null;
  blotterCc?: string | null;
  hub?: string | null;
  iceTradingScreenHubName?: string | null;
  market?: string | null;
  shape?: string | null;
  iceContractSize?: string | null;
  contractCode?: string | null;
  contractLabel?: string | null;
}

const SHORT_PJM_PRODUCT_MARKET: Record<string, "DA" | "RT"> = {
  PDA: "DA",
  PJL: "DA",
  PDO: "DA",
  PDP: "RT",
  PWA: "RT",
  ODP: "RT",
  PJH: "RT",
};

function compactText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePjmHub(value: string): string {
  const cleaned = value
    .replace(/\s*\((?:Daily\s*)?16 MWh\)\s*/gi, " ")
    .replace(/\s*\(Daily\)\s*/gi, " ")
    .replace(/\bOff-?Peak\b/gi, " ")
    .replace(/\b(?:DA|RT)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^PJM\s+WH\b/i.test(cleaned) || /^PJM\s+Western\s+Hub\b/i.test(cleaned)) {
    return "PJM WH";
  }
  return cleaned || value;
}

function marketFromInput(input: IceTradeProductDisplayInput, rawHub: string, productCode: string): string {
  const explicitMarket = compactText(input.market).toUpperCase();
  if (explicitMarket === "DA" || explicitMarket === "RT") return explicitMarket;
  if (/\bDA\b/i.test(rawHub)) return "DA";
  if (/\bRT\b/i.test(rawHub)) return "RT";
  return SHORT_PJM_PRODUCT_MARKET[productCode] ?? explicitMarket;
}

function isMini(input: IceTradeProductDisplayInput, rawHub: string, productCode: string): boolean {
  const size = compactText(input.iceContractSize);
  return /^16\s*MWh$/i.test(size) || /\b16\s*MWh\b/i.test(rawHub) || productCode === "PWA" || productCode === "PJL";
}

function isWeekend(input: IceTradeProductDisplayInput, productCode: string): boolean {
  const contractCode = compactText(input.contractCode).toUpperCase();
  const contractLabel = compactText(input.contractLabel);
  return contractCode === "P1" || /weekend/i.test(contractLabel) || productCode === "PDO" || productCode === "ODP";
}

function isOffPeak(input: IceTradeProductDisplayInput, rawHub: string, productCode: string): boolean {
  const shape = compactText(input.shape);
  return /off-?peak/i.test(shape) || /off-?peak/i.test(rawHub) || productCode === "PDO" || productCode === "ODP";
}

export function iceTradeProductDisplaySortKey(input: IceTradeProductDisplayInput): number {
  const productCode = compactText(input.blotterCc || input.cc).toUpperCase();
  const rawHub = compactText(input.iceTradingScreenHubName || input.hub);
  const market = marketFromInput(input, rawHub, productCode);
  const weekend = isWeekend(input, productCode);
  const mini = isMini(input, rawHub, productCode);

  if (weekend) return market === "RT" ? 60 : 50;
  if (market === "RT" && mini) return 20;
  if (market === "RT") return 10;
  if (market === "DA" && mini) return 40;
  if (market === "DA") return 30;
  return 90;
}

export function compareIceTradeProductDisplay(
  first: IceTradeProductDisplayInput,
  second: IceTradeProductDisplayInput
): number {
  const firstSortKey = iceTradeProductDisplaySortKey(first);
  const secondSortKey = iceTradeProductDisplaySortKey(second);
  if (firstSortKey !== secondSortKey) return firstSortKey - secondSortKey;

  return formatIceTradeProductDisplay(first).localeCompare(
    formatIceTradeProductDisplay(second),
    undefined,
    { numeric: true, sensitivity: "base" }
  );
}

export function formatIceTradeProductDisplay(input: IceTradeProductDisplayInput): string {
  const productCode = compactText(input.blotterCc || input.cc).toUpperCase();
  const rawHub = compactText(input.iceTradingScreenHubName || input.hub);
  const hub = normalizePjmHub(rawHub);
  const market = marketFromInput(input, rawHub, productCode);
  const descriptors = [
    market,
    isWeekend(input, productCode) ? "Weekend" : "",
    isOffPeak(input, rawHub, productCode) ? "Off-Peak" : "",
    isMini(input, rawHub, productCode) ? "Mini" : "",
  ].filter(Boolean);

  return [productCode, hub, descriptors.join(" ")]
    .filter((value) => value.trim().length > 0)
    .join(" | ");
}
