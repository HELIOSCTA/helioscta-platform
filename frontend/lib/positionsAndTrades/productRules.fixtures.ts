import {
  normalizePositionProduct,
  type ProductRuleInput,
  type ProductRuleResult,
} from "./productRules";

type ExpectedProductRuleFields = Partial<
  Pick<
    ProductRuleResult,
    | "bbgOptionDescription"
    | "bbgSymbol"
    | "cmeExcelSymbol"
    | "contractDay"
    | "contractMonth"
    | "contractYyyymm"
    | "contractYyyymmdd"
    | "exchangeCode"
    | "futuresMonthCode"
    | "futuresMonthCodeY"
    | "futuresMonthCodeYY"
    | "iceXlSymbol"
    | "isOption"
    | "productCodeUnderlying"
    | "putCall"
    | "ruleGroup"
    | "ruleRegion"
    | "strikePrice"
  >
>;

export interface ProductRuleFixture {
  name: string;
  input: ProductRuleInput;
  expected: ExpectedProductRuleFields;
}

export interface ProductRuleFixtureFailure {
  name: string;
  field: keyof ExpectedProductRuleFields;
  expected: unknown;
  actual: unknown;
}

export const PRODUCT_RULE_FIXTURES: readonly ProductRuleFixture[] = [
  {
    name: "NAV daily BALMO contract parses yyyy-mm and day",
    input: {
      source: "nav",
      product: "ICE NGAS HH SWG DLY DAY-3",
      exchangeName: "IFED",
      monthYear: "06/03/2026",
    },
    expected: {
      contractMonth: "2026-06",
      contractYyyymm: "202606",
      contractYyyymmdd: "20260603",
      contractDay: 3,
      futuresMonthCode: "M",
      futuresMonthCodeY: "M6",
      futuresMonthCodeYY: "M26",
      exchangeCode: "HHD",
      ruleGroup: "Gas",
      ruleRegion: "Henry Hub",
      iceXlSymbol: "HHD B0-IUS",
      isOption: false,
    },
  },
  {
    name: "NAV monthly gas future derives CME code",
    input: {
      source: "nav",
      product: "NATURAL GAS",
      exchangeName: "NYM",
      monthYear: "JAN27",
    },
    expected: {
      contractMonth: "2027-01",
      contractYyyymm: "202701",
      contractDay: null,
      futuresMonthCode: "F",
      futuresMonthCodeY: "F7",
      futuresMonthCodeYY: "F27",
      exchangeCode: "NG",
      ruleGroup: "Gas",
      ruleRegion: "Henry Hub",
      cmeExcelSymbol: "1|G|XNYM:F:NG:202701",
      isOption: false,
    },
  },
  {
    name: "NAV gas option derives CME and Bloomberg option codes",
    input: {
      source: "nav",
      product: "NYM EUR NATURAL GAS",
      exchangeName: "NYM",
      monthYear: "JAN27",
      callPut: "CALL",
      strikePrice: 4.25,
    },
    expected: {
      contractMonth: "2027-01",
      exchangeCode: "LN",
      ruleGroup: "Gas",
      ruleRegion: "Henry Hub",
      productCodeUnderlying: "NG",
      putCall: "C",
      strikePrice: 4.25,
      cmeExcelSymbol: "1|G|XNYM:O:LN:202701:C:4.25",
      bbgSymbol: "NGF7C 4.25",
      bbgOptionDescription: "CALL JAN 2027 4.25",
      isOption: true,
    },
  },
  {
    name: "NAV weekly gas option derives weekly CME and description",
    input: {
      source: "nav",
      product: "NATURAL GAS FINANCIAL Week 2",
      exchangeName: "NYM",
      monthYear: "JUL25",
      callPut: "P",
      strikePrice: 9,
    },
    expected: {
      contractMonth: "2025-07",
      exchangeCode: "LN2",
      ruleGroup: "Gas",
      ruleRegion: "Henry Hub",
      productCodeUnderlying: "NG",
      putCall: "P",
      cmeExcelSymbol: "1|G|XNYM:O:KN2:202507:P:9",
      bbgOptionDescription: "PUT JUL 2025 WKLY WEEK2 9.00",
      isOption: true,
    },
  },
  {
    name: "NAV short-term power daily contract uses D0 ICE symbol",
    input: {
      source: "nav",
      product: "ICE PJM WH RTD",
      exchangeName: "IFED",
      monthYear: "06/30/2026",
    },
    expected: {
      contractMonth: "2026-06",
      contractDay: 30,
      exchangeCode: "PDP",
      ruleGroup: "Power",
      ruleRegion: "PJM",
      iceXlSymbol: "PDP D0-IUS",
      isOption: false,
    },
  },
  {
    name: "Clear Street option uses clear_street aliases",
    input: {
      source: "clearStreet",
      product: "PMI-OPTION ON PJM WESTERN HUB REAL-TIME PEAK MINI FIXED PRICE FUTURE",
      type: "O",
      contractYyyymm: 202607,
      callPut: "C",
      strikePrice: 50,
    },
    expected: {
      contractMonth: "2026-07",
      exchangeCode: "P1X",
      ruleGroup: "Power",
      ruleRegion: "PJM",
      productCodeUnderlying: "PMI",
      putCall: "C",
      isOption: true,
      iceXlSymbol: "P1X N26C50-IUS",
    },
  },
  {
    name: "Unknown product leaves derived product fields null",
    input: {
      source: "nav",
      product: "UNKNOWN PRODUCT",
      exchangeName: "IFED",
      monthYear: "not-a-contract",
    },
    expected: {
      contractMonth: null,
      contractYyyymm: null,
      exchangeCode: null,
      ruleGroup: null,
      ruleRegion: null,
      iceXlSymbol: null,
      cmeExcelSymbol: null,
      bbgSymbol: null,
      isOption: false,
    },
  },
];

export function evaluateProductRuleFixtures(): ProductRuleFixtureFailure[] {
  return PRODUCT_RULE_FIXTURES.flatMap((fixture) => {
    const actual = normalizePositionProduct(fixture.input);
    return (Object.keys(fixture.expected) as Array<keyof ExpectedProductRuleFields>)
      .filter((field) => !Object.is(actual[field], fixture.expected[field]))
      .map((field) => ({
        name: fixture.name,
        field,
        expected: fixture.expected[field],
        actual: actual[field],
      }));
  });
}

export function assertProductRuleFixtures(): void {
  const failures = evaluateProductRuleFixtures();
  if (failures.length === 0) return;

  const details = failures
    .map(
      (failure) =>
        `${failure.name} ${String(failure.field)} expected ${String(
          failure.expected
        )} but received ${String(failure.actual)}`
    )
    .join("\n");
  throw new Error(`Product rule fixture failures:\n${details}`);
}
