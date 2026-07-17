export const ICE_TRADE_PRODUCT_SCOPES = ["short_pjm", "all"] as const;
export type IceTradeProductScope = (typeof ICE_TRADE_PRODUCT_SCOPES)[number];

export const DEFAULT_ICE_TRADE_PRODUCT_SCOPE: IceTradeProductScope = "short_pjm";

export const SHORT_TERM_PJM_CODES = ["PDP", "PWA", "PDA", "PJL", "PDO", "ODP"] as const;
export const SHORT_TERM_PJM_CONTRACT_CODES = ["D0", "D1", "W0", "W1", "W2", "W3", "W4", "P1"] as const;
export const SHORT_TERM_PJM_ALLOWED_CONTRACTS_BY_CODE = {
  PDP: ["D0", "D1", "W0", "W1", "W2", "W3", "W4"],
  PWA: ["D0", "D1"],
  PDA: ["D1"],
  PJL: ["D1"],
  PDO: ["P1"],
  ODP: ["P1"],
} as const satisfies Record<(typeof SHORT_TERM_PJM_CODES)[number], readonly string[]>;
export const SHORT_TERM_PJM_PRODUCT_DICTIONARY_CONTRACT_CODES = [
  "D0",
  "D1",
  "W0",
  "W1",
  "W2",
  "W3",
  "W4",
  "P1",
] as const;
export const SHORT_TERM_PJM_EXPECTED_PRODUCT_DICTIONARY_ROW_COUNT = 13;

export const SHORT_TERM_PJM_HOY_VALIDATION_BASELINE = {
  trader: "Hoy, D",
  asOf: "2026-06-03",
  startDate: "2026-05-04",
  endDate: "2026-06-03",
  rawLegCount: 194,
  groupedRowCount: 46,
  totalPnl: -419939,
  mutableIceFallbackRows: 2,
  sourceReviewDate: "2026-06-11",
} as const;

export const SHORT_TERM_PJM_CODE_LIST_SQL = SHORT_TERM_PJM_CODES
  .map((code) => `'${code}'`)
  .join(", ");
export const SHORT_TERM_PJM_CONTRACT_CODE_LIST_SQL = SHORT_TERM_PJM_CONTRACT_CODES
  .map((code) => `'${code}'`)
  .join(", ");
export const SHORT_TERM_PJM_ALLOWED_PAIR_VALUES_SQL = Object.entries(
  SHORT_TERM_PJM_ALLOWED_CONTRACTS_BY_CODE
)
  .flatMap(([code, contracts]) => contracts.map((contract) => `('${code}', '${contract}')`))
  .join(", ");

const SHORT_TERM_PJM_CODE_SET = new Set<string>(SHORT_TERM_PJM_CODES);
const SHORT_TERM_PJM_CONTRACT_CODE_SET = new Set<string>(SHORT_TERM_PJM_CONTRACT_CODES);
const SHORT_TERM_PJM_ALLOWED_PAIR_SET = new Set(
  Object.entries(SHORT_TERM_PJM_ALLOWED_CONTRACTS_BY_CODE).flatMap(([code, contracts]) =>
    contracts.map((contract) => `${code}:${contract}`)
  )
);
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseIceTradeProductScope(value: string | null): IceTradeProductScope {
  return value === "all" ? "all" : DEFAULT_ICE_TRADE_PRODUCT_SCOPE;
}

export function isShortTermPjmCode(value: string | null | undefined): boolean {
  return SHORT_TERM_PJM_CODE_SET.has(String(value ?? "").trim().toUpperCase());
}

export function isShortTermPjmContractCode(value: string | null | undefined): boolean {
  return SHORT_TERM_PJM_CONTRACT_CODE_SET.has(String(value ?? "").trim().toUpperCase());
}

export function isShortTermPjmAllowedPair(
  code: string | null | undefined,
  contractCode: string | null | undefined
): boolean {
  return SHORT_TERM_PJM_ALLOWED_PAIR_SET.has(
    `${String(code ?? "").trim().toUpperCase()}:${String(contractCode ?? "").trim().toUpperCase()}`
  );
}

export function tradeTableScopePredicateSql(alias: string): string {
  return `(
          params.product_scope = 'all'
          OR UPPER(BTRIM(${alias}.cc)) IN (${SHORT_TERM_PJM_CODE_LIST_SQL})
        )`;
}

export function productDictionaryScopePredicateSql(alias: string): string {
  return `(
          params.product_scope = 'all'
          OR (
            UPPER(BTRIM(${alias}.cc)) IN (${SHORT_TERM_PJM_CODE_LIST_SQL})
            AND ${alias}.registry_group = 'pjm'
            AND ${alias}.source_registry = 'short_term'
            AND (UPPER(BTRIM(${alias}.cc)), ${alias}.contract_code) IN (
              VALUES ${SHORT_TERM_PJM_ALLOWED_PAIR_VALUES_SQL}
            )
          )
        )`;
}

export function normalizedContractScopePredicateSql(
  codeExpression: string,
  contractCodeExpression: string
): string {
  return `(
          params.product_scope = 'all'
          OR (UPPER(BTRIM(${codeExpression})), ${contractCodeExpression}) IN (
            VALUES ${SHORT_TERM_PJM_ALLOWED_PAIR_VALUES_SQL}
          )
        )`;
}

export function normalizeIceTradeContractCode(contract: string | null | undefined): string | null {
  const trimmed = String(contract ?? "").trim().toLowerCase();
  const compact = trimmed.replace(/[^a-z0-9]+/g, "");

  if (compact === "he0800he2300" || compact === "he08002300") return "D0";
  if (trimmed === "bal day" || trimmed === "balance of day") return "D0";
  if (trimmed === "next day") return "D1";
  if (trimmed === "bal week" || trimmed === "balance of week") return "W0";
  if (trimmed === "next week" || trimmed === "week 1") return "W1";
  if (trimmed === "2nd week" || trimmed === "second week" || trimmed === "week 2") return "W2";
  if (trimmed === "3rd week" || trimmed === "third week" || trimmed === "week 3") return "W3";
  if (trimmed === "4th week" || trimmed === "fourth week" || trimmed === "week 4") return "W4";
  if (compact === "weekend2x16" || compact === "wknd2x16" || compact === "2x16") return "P1";

  return null;
}

function parseDateKey(value: string): Date | null {
  if (!DATE_KEY_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function expectedPjmSettlementDateKeys({
  beginDate,
  endDate,
  hourBucket = "ONPEAK",
  holidayDateKeys = [],
}: {
  beginDate: string;
  endDate: string;
  hourBucket?: string | null;
  holidayDateKeys?: string[];
}): string[] {
  const begin = parseDateKey(beginDate);
  const end = parseDateKey(endDate);
  if (!begin || !end || begin > end) return [];

  const holidaySet = new Set(holidayDateKeys);
  const includeAllDays = String(hourBucket ?? "").toUpperCase() === "OFFPEAK";
  const dates: string[] = [];

  for (let time = begin.getTime(); time <= end.getTime(); time += MS_PER_DAY) {
    const current = new Date(time);
    const key = dateKey(current);
    const day = current.getUTCDay();
    const weekend = day === 0 || day === 6;
    if (includeAllDays || (!weekend && !holidaySet.has(key))) {
      dates.push(key);
    }
  }

  return dates;
}

export function isPjmIsoSettlementComplete({
  settlementSource,
  expectedSettlementDays,
  matchedSettlementDays,
  sourceSettlementMark,
  endDeliveryDate,
  asOf,
}: {
  settlementSource: string | null | undefined;
  expectedSettlementDays: number;
  matchedSettlementDays: number;
  sourceSettlementMark: number | null;
  endDeliveryDate: string | null;
  asOf: string;
}): boolean {
  if (expectedSettlementDays <= 0 || matchedSettlementDays !== expectedSettlementDays) return false;
  if (sourceSettlementMark === null) return false;
  if (settlementSource === "PJM_DA_LMP") return true;
  if (settlementSource === "PJM_RT_LMP") {
    return Boolean(endDeliveryDate && endDeliveryDate < asOf);
  }
  return false;
}

export function activeMarkSourceForSettlement(input: {
  settlementSource: string | null | undefined;
  expectedSettlementDays: number;
  matchedSettlementDays: number;
  sourceSettlementMark: number | null;
  iceMark: number | null;
  endDeliveryDate: string | null;
  asOf: string;
}): "PJM_DA_LMP" | "PJM_RT_LMP" | "ICE_MARK" | null {
  if (isPjmIsoSettlementComplete(input)) {
    return input.settlementSource === "PJM_DA_LMP" ? "PJM_DA_LMP" : "PJM_RT_LMP";
  }
  return input.iceMark === null ? null : "ICE_MARK";
}
