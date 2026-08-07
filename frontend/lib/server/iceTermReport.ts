import "server-only";

import { ICE_POWER_TERM_PRODUCTS } from "@/lib/icePowerTerm/products";
import { DAILY_GAS_MARKETS } from "@/lib/gasPricing/iceGasRegistry";
import type { DailyGasMarket } from "@/lib/gasPricing/dailyGasPriceView";
import { query } from "@/lib/server/db";

export type IceTermReportMode = "power" | "gas";
export type IceTermReportTab = "all" | IceTermReportMode;
export type IceTermDatePolicy = "latest" | "as-of";

type MatrixMode = "power" | "cal" | "spark" | "gas";

interface MatrixSettlementSourceRow {
  data_as_of: string | Date | null;
  report_index?: number | string;
  product_code: string;
  month_number: number | string;
  month_strip: string;
  strip_label: string;
  contract_year: number | string;
  symbol: string;
  trade_date: string | Date;
  settlement: number | string | null;
  volume: number | string | null;
}

interface MatrixSettlementPoint {
  tradeDate: string;
  settlement: number;
  volume: number | null;
  symbol: string;
}

interface DerivedMatrixProductConfig {
  product: string;
  powerRoot: string;
  spreadRoot: string | null;
  gasRoot: string;
  basisRoot: string | null;
  heatRate: number;
}

export interface IceTermReportProductConfig extends DerivedMatrixProductConfig {
  mode: IceTermReportMode;
  root: string;
  reportIndex: number;
}

export interface IceTermTrendPoint {
  date: string | null;
  value: number | null;
}

export interface IceTermPriorSettlementPoint {
  contractYear: number | null;
  pointType?: "settlement" | "forward" | null;
  symbol: string | null;
  finalTradeDate: string | null;
  settlement: number | null;
  volume: number | null;
}

export interface IcePmiCurvePayload {
  product: string;
  pricingMode?: MatrixMode;
  source: "ice_python.settlements";
  startContractMonth: string;
  currentYear: number;
  endYear: number;
  tradingDays: number;
  priorYears: number;
  dataAsOf: string | null;
  requestedTradeDate: string | null;
  datePolicy: IceTermDatePolicy;
  rows: Array<{
    strip: string;
    stripOrder: number;
    currentSymbol: string | null;
    currentTradeDate: string | null;
    currentPrice: number | null;
    currentVolume: number | null;
    currentMarkStale: boolean;
    priceTrend: IceTermTrendPoint[];
    volumeTrend: IceTermTrendPoint[];
    cal27Symbol: string | null;
    cal27TradeDate: string | null;
    cal27Price: number | null;
    cal27Volume: number | null;
    cal27MarkStale: boolean;
    cal27PriceTrend: IceTermTrendPoint[];
    cal27VolumeTrend: IceTermTrendPoint[];
    cal28Symbol: string | null;
    cal28TradeDate: string | null;
    cal28Price: number | null;
    cal28Volume: number | null;
    cal28MarkStale: boolean;
    cal28PriceTrend: IceTermTrendPoint[];
    cal28VolumeTrend: IceTermTrendPoint[];
    previousYearSettlements: IceTermPriorSettlementPoint[];
    monthCurvePoints: IceTermPriorSettlementPoint[];
  }>;
}

export interface IceTermReportResult {
  mode: IceTermReportMode;
  root: string;
  payload: IcePmiCurvePayload | null;
  error: string | null;
}

export interface IceTermReportPayload {
  source: "ice_python.settlements";
  currentYear: number;
  endYear: number;
  tradingDays: number;
  priorYears: number;
  requestedTradeDate: string | null;
  datePolicy: IceTermDatePolicy;
  dataAsOf: string | null;
  rowCount: number;
  results: IceTermReportResult[];
}

const DEFAULT_POWER_TERM_GAS_ROOT = "HNG";
const DEFAULT_POWER_TERM_BASIS_ROOT = "TMT";
const DEFAULT_POWER_TERM_HEAT_RATE = 7.0;
const DEFAULT_GAS_TERM_FIXED_ROOT = "HNG";

const BATCH_DERIVED_MATRIX_SQL = `
with params as (
    select
        $1::integer as current_year,
        $2::integer as end_year,
        $3::integer as trading_days,
        $4::integer as prior_year_count,
        $5::date as requested_trade_date,
        $6::jsonb as report_configs
),
report_configs as (
    select
        c.report_index,
        c.mode,
        c.root,
        c.product,
        c.power_root,
        c.gas_root,
        c.basis_root,
        c.spread_root,
        c.heat_rate
    from params as p
    cross join jsonb_to_recordset(p.report_configs) as c(
        report_index integer,
        mode text,
        root text,
        product text,
        power_root text,
        gas_root text,
        basis_root text,
        spread_root text,
        heat_rate double precision
    )
),
month_strips as (
    select *
    from (
        values
            (1, 'F', 'Jan'),
            (2, 'G', 'Feb'),
            (3, 'H', 'Mar'),
            (4, 'J', 'Apr'),
            (5, 'K', 'May'),
            (6, 'M', 'Jun'),
            (7, 'N', 'Jul'),
            (8, 'Q', 'Aug'),
            (9, 'U', 'Sep'),
            (10, 'V', 'Oct'),
            (11, 'X', 'Nov'),
            (12, 'Z', 'Dec')
    ) as m(month_number, month_strip, strip_label)
),
product_roots as (
    select
        report_index,
        power_root as product_code
    from report_configs
    union
    select
        report_index,
        spread_root as product_code
    from report_configs
    where spread_root is not null
      and mode in ('power', 'cal')
    union
    select
        report_index,
        gas_root as product_code
    from report_configs
    where mode = 'spark'
    union
    select
        report_index,
        basis_root as product_code
    from report_configs
    where basis_root is not null
      and mode in ('spark', 'gas')
),
target_symbols as (
    select
        rc.report_index,
        rc.mode,
        rc.root,
        pr.product_code,
        ms.month_number,
        ms.month_strip,
        ms.strip_label,
        contract_year,
        pr.product_code
            || ' '
            || ms.month_strip
            || right(contract_year::text, 2)
            || '-IUS' as symbol
    from report_configs as rc
    inner join product_roots as pr
        on pr.report_index = rc.report_index
    cross join month_strips as ms
    cross join lateral generate_series(
        (select current_year - prior_year_count from params),
        (select end_year + case when rc.mode = 'cal' then 1 else 0 end from params)
    ) as years(contract_year)
),
latest_symbol_dates as (
    select
        distinct_symbols.report_index,
        latest.trade_date
    from (
        select distinct
            report_index,
            symbol
        from target_symbols
    ) as distinct_symbols
    left join lateral (
        select s.trade_date::date as trade_date
        from ice_python.settlements as s
        where s.symbol = distinct_symbols.symbol
          and s.settlement is not null
          and (
              (select requested_trade_date from params) is null
              or s.trade_date::date <= (select requested_trade_date from params)
          )
        order by s.trade_date desc
        limit 1
    ) as latest on true
    where latest.trade_date is not null
),
window_bounds as (
    select
        report_index,
        max(trade_date) as latest_curve_trade_date
    from latest_symbol_dates
    group by report_index
)
select
    wb.latest_curve_trade_date as data_as_of,
    t.report_index,
    t.product_code,
    t.month_number,
    t.month_strip,
    t.strip_label,
    t.contract_year,
    t.symbol,
    recent.trade_date,
    recent.settlement,
    recent.volume
from target_symbols as t
inner join window_bounds as wb
    on wb.report_index = t.report_index
inner join lateral (
    select
        s.trade_date::date as trade_date,
        s.settlement::float8 as settlement,
        s.volume::float8 as volume
    from ice_python.settlements as s
    where s.symbol = t.symbol
      and s.settlement is not null
      and s.trade_date::date <= wb.latest_curve_trade_date
    order by s.trade_date desc
    limit (select trading_days from params)
) as recent on true
order by t.report_index, t.month_number, t.product_code, t.contract_year, recent.trade_date
`;

export function intParam(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function tradeDateParam(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  if (!Number.isInteger(year) || year < 1) return null;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function parseIceTermReportTab(value: string | null): IceTermReportTab {
  const normalized = value?.trim().toLowerCase();
  return normalized === "power" || normalized === "gas" ? normalized : "all";
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateString(value: unknown): string | null {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

function normalizePriorPoint(value: unknown): IceTermPriorSettlementPoint {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const pointType =
    row.pointType === "forward" || row.pointType === "settlement" ? row.pointType : null;
  return {
    contractYear: toNumber(row.contractYear),
    pointType,
    symbol: typeof row.symbol === "string" ? row.symbol : null,
    finalTradeDate: toDateString(row.finalTradeDate),
    settlement: toNumber(row.settlement),
    volume: toNumber(row.volume),
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function yearSuffix(year: number): string {
  return String(year % 100).padStart(2, "0");
}

function symbolFor(productCode: string, monthStrip: string, year: number): string {
  return `${productCode} ${monthStrip}${yearSuffix(year)}-IUS`;
}

function pointByDate(points: MatrixSettlementPoint[]): Map<string, MatrixSettlementPoint> {
  return new Map(points.map((point) => [point.tradeDate, point]));
}

function commonDates(pointSets: MatrixSettlementPoint[][]): string[] {
  if (!pointSets.length || pointSets.some((points) => !points.length)) return [];
  const dateSets = pointSets.map((points) => new Set(points.map((point) => point.tradeDate)));
  return [...dateSets[0]]
    .filter((date) => dateSets.every((dates) => dates.has(date)))
    .sort((first, second) => first.localeCompare(second));
}

function sumVolumes(points: MatrixSettlementPoint[]): number | null {
  const volumes = points
    .map((point) => point.volume)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  return volumes.length ? volumes.reduce((sum, value) => sum + value, 0) : null;
}

function deriveValue(mode: MatrixMode, points: MatrixSettlementPoint[], heatRate: number): number {
  if (mode === "gas") {
    return points.reduce((sum, point) => sum + point.settlement, 0);
  }
  if (mode === "cal") {
    if (points.length === 4) {
      return (points[0].settlement - points[1].settlement) - (points[2].settlement - points[3].settlement);
    }
    return points[0].settlement - points[1].settlement;
  }
  if (mode === "spark") return points[0].settlement - heatRate * (points[1].settlement + points[2].settlement);
  if (points.length === 2) return points[0].settlement - points[1].settlement;
  return points[0].settlement;
}

function deriveSeries({
  mode,
  monthStrip,
  year,
  currentYear,
  heatRate,
  productRoots,
  pointsBySymbol,
}: {
  mode: MatrixMode;
  monthStrip: string;
  year: number;
  currentYear: number;
  heatRate: number;
  productRoots: { power: string; spread: string | null; gas: string; basis: string | null };
  pointsBySymbol: Map<string, MatrixSettlementPoint[]>;
}): {
  priceTrend: IceTermTrendPoint[];
  volumeTrend: IceTermTrendPoint[];
  latest: IceTermPriorSettlementPoint | null;
} {
  const legSymbols =
    mode === "cal"
      ? productRoots.spread
        ? [
            symbolFor(productRoots.power, monthStrip, year),
            symbolFor(productRoots.spread, monthStrip, year),
            symbolFor(productRoots.power, monthStrip, year + 1),
            symbolFor(productRoots.spread, monthStrip, year + 1),
          ]
        : [symbolFor(productRoots.power, monthStrip, year), symbolFor(productRoots.power, monthStrip, year + 1)]
      : mode === "spark"
        ? [
          symbolFor(productRoots.power, monthStrip, year),
          symbolFor(productRoots.gas, monthStrip, year),
          symbolFor(productRoots.basis ?? productRoots.gas, monthStrip, year),
        ]
        : mode === "gas"
          ? productRoots.basis && productRoots.basis !== productRoots.power
            ? [symbolFor(productRoots.power, monthStrip, year), symbolFor(productRoots.basis, monthStrip, year)]
            : [symbolFor(productRoots.power, monthStrip, year)]
          : productRoots.spread
            ? [symbolFor(productRoots.power, monthStrip, year), symbolFor(productRoots.spread, monthStrip, year)]
            : [symbolFor(productRoots.power, monthStrip, year)];
  const pointSets = legSymbols.map((symbol) => pointsBySymbol.get(symbol) ?? []);
  const dates = commonDates(pointSets);
  const maps = pointSets.map(pointByDate);
  const priceTrend = dates.map((date) => {
    const points = maps.map((map) => map.get(date)).filter((point): point is MatrixSettlementPoint => Boolean(point));
    return { date, value: roundTo(deriveValue(mode, points, heatRate), 2) };
  });
  const volumeTrend = dates.map((date) => {
    const points = maps.map((map) => map.get(date)).filter((point): point is MatrixSettlementPoint => Boolean(point));
    return { date, value: sumVolumes(points) };
  });

  const commonLatestDate = dates.at(-1) ?? null;
  if (!commonLatestDate && pointSets.length > 1) {
    return { priceTrend, volumeTrend, latest: null };
  }

  const latestPoints = (commonLatestDate
    ? maps.map((map) => map.get(commonLatestDate) ?? null)
    : pointSets.map((points) => points.at(-1) ?? null)
  )
    .filter((point): point is MatrixSettlementPoint => point !== null);
  if (latestPoints.length !== pointSets.length) {
    return { priceTrend, volumeTrend, latest: null };
  }

  return {
    priceTrend,
    volumeTrend,
    latest: normalizePriorPoint({
      contractYear: year,
      pointType: year >= currentYear ? "forward" : "settlement",
      symbol: legSymbols.length === 1 ? legSymbols[0] : null,
      finalTradeDate: commonLatestDate,
      settlement: roundTo(deriveValue(mode, latestPoints, heatRate), 2),
      volume: sumVolumes(latestPoints),
    }),
  };
}

function buildDerivedRows({
  sourceRows,
  mode,
  currentYear,
  endYear,
  priorYears,
  heatRate,
  productRoots,
}: {
  sourceRows: MatrixSettlementSourceRow[];
  mode: MatrixMode;
  currentYear: number;
  endYear: number;
  priorYears: number;
  heatRate: number;
  productRoots: { power: string; spread: string | null; gas: string; basis: string | null };
}): IcePmiCurvePayload["rows"] {
  const pointsBySymbol = new Map<string, MatrixSettlementPoint[]>();
  const monthMeta = new Map<string, { strip: string; stripOrder: number; monthStrip: string }>();

  for (const row of sourceRows) {
    const tradeDate = toDateString(row.trade_date);
    const settlement = toNumber(row.settlement);
    const contractYear = toNumber(row.contract_year);
    const stripOrder = toNumber(row.month_number);
    if (!tradeDate || settlement === null || contractYear === null || stripOrder === null) continue;

    const symbol = row.symbol;
    const points = pointsBySymbol.get(symbol) ?? [];
    points.push({
      tradeDate,
      settlement,
      volume: toNumber(row.volume),
      symbol,
    });
    pointsBySymbol.set(symbol, points);
    monthMeta.set(row.month_strip, {
      strip: row.strip_label,
      stripOrder,
      monthStrip: row.month_strip,
    });
  }

  for (const points of pointsBySymbol.values()) {
    points.sort((first, second) => first.tradeDate.localeCompare(second.tradeDate));
  }

  return [...monthMeta.values()]
    .sort((first, second) => first.stripOrder - second.stripOrder)
    .map((month) => {
      const pointForYear = (year: number) =>
        deriveSeries({
          mode,
          monthStrip: month.monthStrip,
          year,
          currentYear,
          heatRate,
          productRoots,
          pointsBySymbol,
        });
      const current = pointForYear(currentYear);
      const cal27 = pointForYear(2027);
      const cal28 = pointForYear(2028);
      const monthCurvePoints = Array.from(
        { length: endYear - (currentYear - priorYears) + 1 },
        (_, index) => currentYear - priorYears + index,
      )
        .map((year) => pointForYear(year).latest)
        .filter((point): point is IceTermPriorSettlementPoint => point !== null);
      const previousYearSettlements = monthCurvePoints.filter(
        (point) => point.contractYear !== null && point.contractYear < currentYear,
      );

      return {
        strip: month.strip,
        stripOrder: month.stripOrder,
        currentSymbol: current.latest?.symbol ?? null,
        currentTradeDate: current.latest?.finalTradeDate ?? null,
        currentPrice: current.latest?.settlement ?? null,
        currentVolume: current.latest?.volume ?? null,
        currentMarkStale: false,
        priceTrend: current.priceTrend,
        volumeTrend: current.volumeTrend,
        cal27Symbol: cal27.latest?.symbol ?? null,
        cal27TradeDate: cal27.latest?.finalTradeDate ?? null,
        cal27Price: cal27.latest?.settlement ?? null,
        cal27Volume: cal27.latest?.volume ?? null,
        cal27MarkStale: false,
        cal27PriceTrend: cal27.priceTrend,
        cal27VolumeTrend: cal27.volumeTrend,
        cal28Symbol: cal28.latest?.symbol ?? null,
        cal28TradeDate: cal28.latest?.finalTradeDate ?? null,
        cal28Price: cal28.latest?.settlement ?? null,
        cal28Volume: cal28.latest?.volume ?? null,
        cal28MarkStale: false,
        cal28PriceTrend: cal28.priceTrend,
        cal28VolumeTrend: cal28.volumeTrend,
        previousYearSettlements,
        monthCurvePoints,
      };
    });
}

function derivedConfigForPowerRoot(root: string): DerivedMatrixProductConfig {
  return {
    product: root,
    powerRoot: root,
    spreadRoot: null,
    gasRoot: DEFAULT_POWER_TERM_GAS_ROOT,
    basisRoot: DEFAULT_POWER_TERM_BASIS_ROOT,
    heatRate: DEFAULT_POWER_TERM_HEAT_RATE,
  };
}

function derivedConfigForGasMarket(market: DailyGasMarket): DerivedMatrixProductConfig | null {
  if (!market.futuresProduct) return null;
  const basisRoot = market.curveStyle === "basis" ? market.futuresProduct : null;
  return {
    product: market.futuresProduct,
    powerRoot: basisRoot ? DEFAULT_GAS_TERM_FIXED_ROOT : market.futuresProduct,
    spreadRoot: null,
    gasRoot: DEFAULT_GAS_TERM_FIXED_ROOT,
    basisRoot,
    heatRate: 1,
  };
}

export function getIceTermReportProductConfigs(tab: IceTermReportTab): IceTermReportProductConfig[] {
  const configs: IceTermReportProductConfig[] = [];

  if (tab === "all" || tab === "power") {
    for (const product of ICE_POWER_TERM_PRODUCTS) {
      configs.push({
        mode: "power",
        root: product.root,
        reportIndex: configs.length,
        ...derivedConfigForPowerRoot(product.root),
      });
    }
  }

  if (tab === "all" || tab === "gas") {
    for (const market of DAILY_GAS_MARKETS) {
      const config = derivedConfigForGasMarket(market);
      if (!config) continue;
      configs.push({
        mode: "gas",
        root: market.futuresProduct!,
        reportIndex: configs.length,
        ...config,
      });
    }
  }

  return configs;
}

function sourceRowsByReportIndex(
  rows: MatrixSettlementSourceRow[],
): Map<number, MatrixSettlementSourceRow[]> {
  const grouped = new Map<number, MatrixSettlementSourceRow[]>();
  for (const row of rows) {
    const reportIndex = toNumber(row.report_index);
    if (reportIndex === null) continue;
    const productRows = grouped.get(reportIndex) ?? [];
    productRows.push(row);
    grouped.set(reportIndex, productRows);
  }
  return grouped;
}

function dataAsOfForRows(rows: MatrixSettlementSourceRow[], payloadRows: IcePmiCurvePayload["rows"]): string | null {
  return (
    toDateString(rows[0]?.data_as_of) ??
    payloadRows
      .flatMap((row) => row.monthCurvePoints.map((point) => point.finalTradeDate))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ??
    null
  );
}

export async function loadIceTermReportBatch({
  currentYear,
  endYear,
  tradingDays,
  priorYears,
  requestedTradeDate,
  datePolicy,
  tab,
}: {
  currentYear: number;
  endYear: number;
  tradingDays: number;
  priorYears: number;
  requestedTradeDate: string | null;
  datePolicy: IceTermDatePolicy;
  tab: IceTermReportTab;
}): Promise<IceTermReportPayload> {
  const configs = getIceTermReportProductConfigs(tab);
  const rows = configs.length
    ? await query<MatrixSettlementSourceRow>(BATCH_DERIVED_MATRIX_SQL, [
        currentYear,
        endYear,
        tradingDays,
        priorYears,
        requestedTradeDate,
        JSON.stringify(
          configs.map((config) => ({
            report_index: config.reportIndex,
            mode: config.mode,
            root: config.root,
            product: config.product,
            power_root: config.powerRoot,
            gas_root: config.gasRoot,
            basis_root: config.basisRoot,
            spread_root: config.spreadRoot,
            heat_rate: config.heatRate,
          })),
        ),
      ])
    : [];
  const groupedRows = sourceRowsByReportIndex(rows);
  const results = configs.map<IceTermReportResult>((config) => {
    const sourceRows = groupedRows.get(config.reportIndex) ?? [];
    const payloadRows = buildDerivedRows({
      sourceRows,
      mode: config.mode,
      currentYear,
      endYear,
      priorYears,
      heatRate: config.heatRate,
      productRoots: {
        power: config.powerRoot,
        spread: config.spreadRoot,
        gas: config.gasRoot,
        basis: config.basisRoot,
      },
    });
    const dataAsOf = dataAsOfForRows(sourceRows, payloadRows);

    return {
      mode: config.mode,
      root: config.root,
      payload: {
        product: config.product,
        pricingMode: config.mode,
        source: "ice_python.settlements",
        startContractMonth: `${currentYear}-01-01`,
        currentYear,
        endYear,
        tradingDays,
        priorYears,
        dataAsOf,
        requestedTradeDate,
        datePolicy,
        rows: payloadRows,
      },
      error: null,
    };
  });
  const dataAsOf =
    results
      .map((result) => result.payload?.dataAsOf)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return {
    source: "ice_python.settlements",
    currentYear,
    endYear,
    tradingDays,
    priorYears,
    requestedTradeDate,
    datePolicy,
    dataAsOf,
    rowCount: rows.length,
    results,
  };
}
