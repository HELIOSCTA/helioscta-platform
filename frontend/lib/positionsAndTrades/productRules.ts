import {
  normalizeProductText,
  resolveProductLookup,
  type ProductAliasSource,
  type ProductLookupMatch,
  type ProductRuleGroup,
} from "./productLookup";

export type ProductRuleSource = "nav" | "clearStreet" | "clearStreetIntraday" | "marex";
export type PutCall = "C" | "P";
export type ExchangeName = "IFED" | "NYME";

export interface ProductRuleInput {
  source: ProductRuleSource;
  product?: string | null;
  exchangeCode?: string | null;
  exchangeName?: string | null;
  monthYear?: string | null;
  contractYyyymm?: string | number | null;
  contractYear?: string | number | null;
  contractMonth?: string | number | null;
  contractDay?: string | number | null;
  promptDay?: string | number | null;
  tradeDate?: string | null;
  callPut?: string | null;
  type?: string | null;
  strikePrice?: string | number | null;
}

export interface ContractRuleFields {
  contractMonth: string | null;
  contractYyyymm: string | null;
  contractYyyymmdd: string | null;
  contractYear: number | null;
  contractMonthNumber: number | null;
  contractDay: number | null;
  futuresMonthCode: string | null;
  futuresMonthCodeY: string | null;
  futuresMonthCodeYY: string | null;
}

export interface ProductRuleResult extends ContractRuleFields {
  lookup: ProductLookupMatch | null;
  productCode: string | null;
  exchangeName: ExchangeName | null;
  exchangeCode: string | null;
  ruleGroup: ProductRuleGroup | null;
  ruleRegion: string | null;
  productCodeUnderlying: string | null;
  bbgExchangeCode: string | null;
  isOption: boolean;
  putCall: PutCall | null;
  strikePrice: number | null;
  iceXlSymbol: string | null;
  iceXlSymbolUnderlying: string | null;
  cmeExcelSymbol: string | null;
  bbgSymbol: string | null;
  bbgOptionDescription: string | null;
}

const FUTURES_MONTH_CODES: Record<number, string> = {
  1: "F",
  2: "G",
  3: "H",
  4: "J",
  5: "K",
  6: "M",
  7: "N",
  8: "Q",
  9: "U",
  10: "V",
  11: "X",
  12: "Z",
};

const MONTH_ABBREVIATIONS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const SHORT_TERM_POWER_RT_CODES = new Set(["PDP", "PWA", "DDP"]);
const CME_GAS_FUTURE_CODES = new Set(["HP", "PHH", "HH", "H", "NG"]);
const CME_GAS_OPTION_CODES = new Set(["LN", "PHE"]);
const CME_WEEKLY_OPTION_CODES = new Set(["LN1", "LN2", "LN3", "LN4", "LN5"]);
const CME_CAL_SPREAD_CODES = new Set(["G3", "G4"]);

function nullIfBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeLookupText(value: string | null | undefined): string | null {
  return normalizeProductText(value);
}

function normalizeCode(value: string | null | undefined): string | null {
  const trimmed = nullIfBlank(value);
  return trimmed ? trimmed.toUpperCase() : null;
}

function parseInteger(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  return (
    year >= 1900 &&
    year <= 2199 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

function fullYearFromTwoDigits(year: number): number {
  return year >= 70 ? 1900 + year : 2000 + year;
}

function contractFieldsFromParts(
  year: number | null,
  month: number | null,
  day: number | null
): ContractRuleFields {
  if (year === null || month === null || month < 1 || month > 12) {
    return {
      contractMonth: null,
      contractYyyymm: null,
      contractYyyymmdd: null,
      contractYear: null,
      contractMonthNumber: null,
      contractDay: null,
      futuresMonthCode: null,
      futuresMonthCodeY: null,
      futuresMonthCodeYY: null,
    };
  }

  const validDay = day !== null && isValidDateParts(year, month, day) ? day : null;
  const monthPadded = pad2(month);
  const contractYyyymm = `${year}${monthPadded}`;
  const futuresMonthCode = FUTURES_MONTH_CODES[month] ?? null;
  const yearText = String(year);

  return {
    contractMonth: `${year}-${monthPadded}`,
    contractYyyymm,
    contractYyyymmdd: validDay === null ? null : `${contractYyyymm}${pad2(validDay)}`,
    contractYear: year,
    contractMonthNumber: month,
    contractDay: validDay,
    futuresMonthCode,
    futuresMonthCodeY: futuresMonthCode ? `${futuresMonthCode}${yearText.slice(-1)}` : null,
    futuresMonthCodeYY: futuresMonthCode ? `${futuresMonthCode}${yearText.slice(-2)}` : null,
  };
}

export function parseContractFields(input: ProductRuleInput): ContractRuleFields {
  const monthYear = nullIfBlank(input.monthYear);

  if (monthYear) {
    const dateMatch = monthYear.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dateMatch) {
      const month = Number(dateMatch[1]);
      const day = Number(dateMatch[2]);
      const year = Number(dateMatch[3]);
      if (isValidDateParts(year, month, day)) {
        return contractFieldsFromParts(year, month, day);
      }
    }

    const monthCodeMatch = monthYear.match(/^([A-Za-z]{3})(\d{2})$/);
    if (monthCodeMatch) {
      const month = MONTH_ABBREVIATIONS[monthCodeMatch[1].toUpperCase()] ?? null;
      const year = fullYearFromTwoDigits(Number(monthCodeMatch[2]));
      if (month !== null) {
        return contractFieldsFromParts(year, month, null);
      }
    }
  }

  const yyyymmText = String(input.contractYyyymm ?? "").trim();
  if (/^\d{6}$/.test(yyyymmText)) {
    return contractFieldsFromParts(
      Number(yyyymmText.slice(0, 4)),
      Number(yyyymmText.slice(4, 6)),
      parseInteger(input.contractDay ?? input.promptDay)
    );
  }

  return contractFieldsFromParts(
    parseInteger(input.contractYear),
    parseInteger(input.contractMonth),
    parseInteger(input.contractDay ?? input.promptDay)
  );
}

export function normalizePutCall(value: string | null | undefined): PutCall | null {
  const normalized = normalizeCode(value);
  if (normalized === "CALL" || normalized === "C") return "C";
  if (normalized === "PUT" || normalized === "P") return "P";
  return null;
}

export function normalizeExchangeName(value: string | null | undefined): ExchangeName | null {
  const normalized = normalizeCode(value);
  if (normalized === "NYM" || normalized === "NYME") return "NYME";
  if (normalized === "IFE" || normalized === "IPE" || normalized === "IFED") return "IFED";
  return null;
}

function aliasSourceForRuleSource(source: ProductRuleSource): ProductAliasSource {
  return source === "marex" ? "marex" : "nav";
}

function isOptionInput(input: ProductRuleInput, putCall: PutCall | null): boolean {
  return putCall !== null || normalizeLookupText(input.type)?.includes("OPTION") === true;
}

export function findProductLookup(
  input: ProductRuleInput,
  isOption = isOptionInput(input, normalizePutCall(input.callPut))
): ProductLookupMatch | null {
  return resolveProductLookup({
    source: aliasSourceForRuleSource(input.source),
    productName: input.product,
    exchangeCode: input.exchangeCode,
    isOption,
  });
}

function formatStrike(value: number | null): string | null {
  if (value === null) return null;
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function formatIceStrike(value: number | null): string | null {
  if (value === null) return null;
  return String(Math.round(value));
}

function formatOptionDescriptionStrike(value: number | null): string | null {
  if (value === null) return null;
  return value.toFixed(2);
}

function monthName(month: number | null): string | null {
  if (month === null || month < 1 || month > 12) return null;
  return Object.entries(MONTH_ABBREVIATIONS).find(([, value]) => value === month)?.[0] ?? null;
}

function buildIceXlSymbol({
  exchangeCode,
  exchangeName,
  isOption,
  contractDay,
  futuresMonthCodeYY,
  putCall,
  strikePrice,
}: {
  exchangeCode: string | null;
  exchangeName: ExchangeName | null;
  isOption: boolean;
  contractDay: number | null;
  futuresMonthCodeYY: string | null;
  putCall: PutCall | null;
  strikePrice: number | null;
}): string | null {
  if (!exchangeCode) return null;

  if (exchangeName === "IFED" && exchangeCode === "HHD") {
    return `${exchangeCode} B0-IUS`;
  }

  if (SHORT_TERM_POWER_RT_CODES.has(exchangeCode)) {
    return `${exchangeCode} D0-IUS`;
  }

  if (exchangeName !== "IFED" || !futuresMonthCodeYY) {
    return null;
  }

  if (isOption && putCall && strikePrice !== null) {
    return `${exchangeCode} ${futuresMonthCodeYY}${putCall}${formatIceStrike(strikePrice)}-IUS`;
  }

  if (!isOption && contractDay === null) {
    return `${exchangeCode} ${futuresMonthCodeYY}-IUS`;
  }

  return null;
}

function buildIceXlSymbolUnderlying({
  exchangeName,
  isOption,
  productCodeUnderlying,
  futuresMonthCodeYY,
}: {
  exchangeName: ExchangeName | null;
  isOption: boolean;
  productCodeUnderlying: string | null;
  futuresMonthCodeYY: string | null;
}): string | null {
  if (exchangeName !== "IFED" || !isOption || !productCodeUnderlying || !futuresMonthCodeYY) {
    return null;
  }
  return `${productCodeUnderlying} ${futuresMonthCodeYY}-IUS`;
}

function buildCmeExcelSymbol({
  exchangeCode,
  contractYyyymm,
  putCall,
  strikePrice,
}: {
  exchangeCode: string | null;
  contractYyyymm: string | null;
  putCall: PutCall | null;
  strikePrice: number | null;
}): string | null {
  if (!exchangeCode || !contractYyyymm) return null;

  if (CME_GAS_FUTURE_CODES.has(exchangeCode)) {
    return `1|G|XNYM:F:NG:${contractYyyymm}`;
  }

  const strike = formatStrike(strikePrice);
  if (!putCall || strike === null) return null;

  if (CME_GAS_OPTION_CODES.has(exchangeCode)) {
    return `1|G|XNYM:O:LN:${contractYyyymm}:${putCall}:${strike}`;
  }

  if (CME_WEEKLY_OPTION_CODES.has(exchangeCode) || exchangeCode === "KN4") {
    return `1|G|XNYM:O:KN${exchangeCode.slice(2)}:${contractYyyymm}:${putCall}:${strike}`;
  }

  if (CME_CAL_SPREAD_CODES.has(exchangeCode)) {
    return "CAL_SPREAD_CME_EXCEL_CODE";
  }

  return null;
}

function buildNavBloombergSymbol({
  bbgExchangeCode,
  exchangeCode,
  isOption,
  futuresMonthCodeY,
  putCall,
  strikePrice,
}: {
  bbgExchangeCode: string | null;
  exchangeCode: string | null;
  isOption: boolean;
  futuresMonthCodeY: string | null;
  putCall: PutCall | null;
  strikePrice: number | null;
}): string | null {
  const strike = formatStrike(strikePrice);
  if (
    !isOption ||
    !bbgExchangeCode ||
    !exchangeCode ||
    !futuresMonthCodeY ||
    !putCall ||
    strike === null
  ) {
    return null;
  }

  if (CME_GAS_OPTION_CODES.has(exchangeCode)) {
    return `${bbgExchangeCode}${futuresMonthCodeY}${putCall} ${strike}`;
  }

  return null;
}

function buildTradeBloombergSymbol({
  bbgExchangeCode,
  exchangeCode,
  futuresMonthCodeY,
  futuresMonthCodeYY,
  putCall,
  strikePrice,
}: {
  bbgExchangeCode: string | null;
  exchangeCode: string | null;
  futuresMonthCodeY: string | null;
  futuresMonthCodeYY: string | null;
  putCall: PutCall | null;
  strikePrice: number | null;
}): string | null {
  if (!bbgExchangeCode || !exchangeCode) return null;
  const strike = formatStrike(strikePrice);

  if (exchangeCode === "HP" && bbgExchangeCode === "ZA" && futuresMonthCodeY) {
    return `${bbgExchangeCode}${futuresMonthCodeY} COMDTY`;
  }

  if (exchangeCode === "HH" && bbgExchangeCode === "IW" && futuresMonthCodeY) {
    return `${bbgExchangeCode}${futuresMonthCodeY} COMDTY`;
  }

  if (exchangeCode === "NG" && bbgExchangeCode === "NG" && futuresMonthCodeYY) {
    return `${bbgExchangeCode}${futuresMonthCodeYY} COMDTY`;
  }

  if (
    CME_GAS_OPTION_CODES.has(exchangeCode) &&
    bbgExchangeCode === "NG" &&
    futuresMonthCodeY &&
    putCall &&
    strike
  ) {
    return `${bbgExchangeCode}${futuresMonthCodeY}${putCall} ${strike} COMDTY`;
  }

  if (
    CME_WEEKLY_OPTION_CODES.has(exchangeCode) &&
    futuresMonthCodeYY &&
    putCall &&
    strike
  ) {
    return `${bbgExchangeCode}${futuresMonthCodeYY}${putCall}${exchangeCode.slice(2)} ${strike} COMB`;
  }

  if (exchangeCode === "KN4" && futuresMonthCodeYY && putCall && strike) {
    return `${bbgExchangeCode}${futuresMonthCodeYY}${putCall}${exchangeCode.slice(2)} ${strike} Comdty`;
  }

  return null;
}

function buildBbgOptionDescription({
  source,
  exchangeCode,
  isOption,
  putCall,
  strikePrice,
  contractYear,
  contractMonthNumber,
}: {
  source: ProductRuleSource;
  exchangeCode: string | null;
  isOption: boolean;
  putCall: PutCall | null;
  strikePrice: number | null;
  contractYear: number | null;
  contractMonthNumber: number | null;
}): string | null {
  if (source !== "nav" || !isOption || !exchangeCode || !putCall) return null;

  const month = monthName(contractMonthNumber);
  const strike = formatOptionDescriptionStrike(strikePrice);
  if (!month || !contractYear || strike === null) return null;

  const direction = putCall === "C" ? "CALL" : "PUT";

  if (CME_GAS_OPTION_CODES.has(exchangeCode)) {
    return `${direction} ${month} ${contractYear} ${strike}`;
  }

  if (CME_WEEKLY_OPTION_CODES.has(exchangeCode)) {
    return `${direction} ${month} ${contractYear} WKLY WEEK${exchangeCode.slice(2)} ${strike}`;
  }

  if (CME_CAL_SPREAD_CODES.has(exchangeCode)) {
    return `${direction} ${month} ${contractYear} CAL SPREAD ${exchangeCode.slice(1, 2)} MONTHS ${strike}`;
  }

  return null;
}

export function normalizePositionProduct(input: ProductRuleInput): ProductRuleResult {
  const contract = parseContractFields(input);
  const putCall = normalizePutCall(input.callPut);
  const isOption = isOptionInput(input, putCall);
  const lookup = findProductLookup(input, isOption);
  const exchangeCode = lookup?.definition.exchangeCode ?? null;
  const strikePriceRaw = parseNumber(input.strikePrice);
  const strikePrice = strikePriceRaw === null ? null : roundTo(strikePriceRaw, 3);
  const exchangeName =
    normalizeExchangeName(input.exchangeName) ?? lookup?.definition.defaultExchangeName ?? null;
  const productCodeUnderlying = isOption
    ? (lookup?.definition.exchangeCodeUnderlying ?? null)
    : null;
  const bbgExchangeCode = lookup?.definition.bbgExchangeCode ?? null;

  return {
    lookup,
    productCode: exchangeCode,
    exchangeName,
    exchangeCode,
    ruleGroup: lookup?.definition.ruleGroup ?? null,
    ruleRegion: lookup?.definition.ruleRegion ?? null,
    productCodeUnderlying,
    bbgExchangeCode,
    isOption,
    putCall,
    strikePrice,
    ...contract,
    iceXlSymbol: buildIceXlSymbol({
      exchangeCode,
      exchangeName,
      isOption,
      contractDay: contract.contractDay,
      futuresMonthCodeYY: contract.futuresMonthCodeYY,
      putCall,
      strikePrice,
    }),
    iceXlSymbolUnderlying: buildIceXlSymbolUnderlying({
      exchangeName,
      isOption,
      productCodeUnderlying,
      futuresMonthCodeYY: contract.futuresMonthCodeYY,
    }),
    cmeExcelSymbol: buildCmeExcelSymbol({
      exchangeCode,
      contractYyyymm: contract.contractYyyymm,
      putCall,
      strikePrice,
    }),
    bbgSymbol:
      input.source === "nav"
        ? buildNavBloombergSymbol({
            bbgExchangeCode,
            exchangeCode,
            isOption,
            futuresMonthCodeY: contract.futuresMonthCodeY,
            putCall,
            strikePrice,
          })
        : buildTradeBloombergSymbol({
            bbgExchangeCode,
            exchangeCode,
            futuresMonthCodeY: contract.futuresMonthCodeY,
            futuresMonthCodeYY: contract.futuresMonthCodeYY,
            putCall,
            strikePrice,
          }),
    bbgOptionDescription: buildBbgOptionDescription({
      source: input.source,
      exchangeCode,
      isOption,
      putCall,
      strikePrice,
      contractYear: contract.contractYear,
      contractMonthNumber: contract.contractMonthNumber,
    }),
  };
}

export function normalizeNavPositionProduct(
  input: Omit<ProductRuleInput, "source">
): ProductRuleResult {
  return normalizePositionProduct({ ...input, source: "nav" });
}
