import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { bindPromotedSql, readPjmDaPromotedSql } from "@/lib/server/pjmDaPromotedSql";
import {
  DAILY_GAS_MARKETS,
  GAS_CURVE_MONTH_CODES,
  getIceGasRegistryCounts,
  normalizeDailyGasPriceBasis,
  type DailyGasMarket,
  type GasMonthlyFuturesDisplay,
  type GasMonthlySettlesCell,
  type GasMonthlySettlesMode,
  type GasMonthlySettlesPayload,
  type GasMonthlySettlesPointType,
  type GasMonthlySettlesTrendPoint,
  type GasPriceBasis,
} from "@/lib/gasPricing";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const CURRENT_YEAR = new Date().getUTCFullYear();
const CURRENT_MONTH = new Date().getUTCMonth() + 1;
const MIN_YEAR = CURRENT_YEAR - 20;
const MAX_YEAR = CURRENT_YEAR + 10;
const MAX_YEAR_SPAN = 15;
const HENRY_FUTURES_PRODUCT = "HNG";
const SETTLEMENTS_SOURCE = "ice_python.settlements" as const;
const NEXT_DAY_GAS_SOURCE = "ice_python_next_day_gas" as const;

const ROUTE_CONFIG = {
  route: "/api/gas-daily-prices/monthly-settles",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "ICE gas month x year settles matrix",
  p95TargetMs: 2_500,
  freshnessSource: "ice_python.settlements trade_date",
} as const;

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const PRICE_FIELD_SQL: Record<GasPriceBasis, string> = {
  settlement: "settlement",
  open: "open",
  high: "high",
  low: "low",
  close: "close",
  vwap_close: "vwap_close",
};

interface TargetCell {
  cellKey: string;
  rowKey: string;
  columnKey: string;
  displaySymbol: string | null;
  sourceSymbols: string[];
  formula: string;
  contractMonth: string | null;
  pointType: GasMonthlySettlesPointType;
}

interface FuturesSourceRow {
  cell_key: string;
  trade_date: string | Date | null;
  value: number | string | null;
  volume: number | string | null;
  updated_at: string | Date | null;
  price_trend: unknown;
}

interface DailySourceRow {
  trade_date: string | Date;
  contract_year: number | string;
  contract_month: number | string;
  day_of_month: number | string;
  value: number | string | null;
  volume: number | string | null;
  updated_at: string | Date | null;
  date_basis: "trade_date" | "gas_day";
}

interface SqlRequest {
  text: string;
  values: ReadonlyArray<unknown>;
}

function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeMode(value: string | null): GasMonthlySettlesMode {
  return value === "cash" || value === "balmo" || value === "futures" ? value : "futures";
}

function normalizeFuturesDisplay(
  value: string | null,
  market: DailyGasMarket,
): GasMonthlyFuturesDisplay {
  if (value === "basis" && market.curveStyle === "basis") return "basis";
  return "outright";
}

function normalizeMarket(value: string | null): DailyGasMarket {
  const requested = value?.trim().toLowerCase();
  const market = requested
    ? DAILY_GAS_MARKETS.find((entry) => entry.market.toLowerCase() === requested)
    : null;
  return market ?? DAILY_GAS_MARKETS.find((entry) => entry.market === "Henry Hub") ?? DAILY_GAS_MARKETS[0];
}

function normalizeYearWindow(searchParams: URLSearchParams): { startYear: number; endYear: number } {
  let startYear = intParam(searchParams.get("startYear"), CURRENT_YEAR - 4, MIN_YEAR, MAX_YEAR);
  let endYear = intParam(searchParams.get("endYear"), CURRENT_YEAR + 2, MIN_YEAR, MAX_YEAR);
  if (startYear > endYear) {
    [startYear, endYear] = [endYear, startYear];
  }
  if (endYear - startYear + 1 > MAX_YEAR_SPAN) {
    endYear = startYear + MAX_YEAR_SPAN - 1;
  }
  return { startYear, endYear };
}

function yearsBetween(startYear: number, endYear: number): number[] {
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
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

function toTimestampString(value: unknown): string | null {
  if (typeof value === "string") return value === "-infinity" ? null : value;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function maxString(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizePriceTrendPoint(value: unknown): GasMonthlySettlesTrendPoint {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    date: toDateString(row.date ?? row.tradeDate ?? row.trade_date),
    value: toNumber(row.value),
  };
}

function parsePriceTrend(value: unknown): GasMonthlySettlesTrendPoint[] {
  return asArray(value).map(normalizePriceTrendPoint).slice(-7);
}

function priceTrendFromDailyRows(rows: DailySourceRow[]): GasMonthlySettlesTrendPoint[] {
  return [...rows]
    .sort((first, second) =>
      (toDateString(first.trade_date) ?? "").localeCompare(toDateString(second.trade_date) ?? ""),
    )
    .slice(-7)
    .map((row) => ({
      date: toDateString(row.trade_date),
      value: toNumber(row.value),
    }));
}

function promotedSqlBody(sql: string): string {
  return sql.trim().replace(/;\s*$/, "");
}

function yearSuffix(year: number): string {
  return String(year % 100).padStart(2, "0");
}

function monthlySymbol(product: string, month: number, year: number): string {
  return `${product} ${GAS_CURVE_MONTH_CODES[month]}${yearSuffix(year)}-IUS`;
}

function contractMonthDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function pointTypeForContractMonth(year: number, month: number): GasMonthlySettlesPointType {
  if (year < CURRENT_YEAR || (year === CURRENT_YEAR && month < CURRENT_MONTH)) return "settled";
  return "forward";
}

function buildFuturesTargetCells(
  market: DailyGasMarket,
  years: number[],
  futuresDisplay: GasMonthlyFuturesDisplay,
): TargetCell[] {
  const cells: TargetCell[] = [];
  for (const month of Array.from({ length: 12 }, (_, index) => index + 1)) {
    for (const year of years) {
      const rowKey = String(month);
      const columnKey = String(year);
      const contractMonth = contractMonthDate(year, month);
      const pointType = pointTypeForContractMonth(year, month);
      const futuresProduct = market.futuresProduct;
      const marketSymbol = futuresProduct ? monthlySymbol(futuresProduct, month, year) : null;

      let displaySymbol: string | null = marketSymbol;
      let sourceSymbols: string[] = [];
      let formula = market.futuresProduct ? `${marketSymbol} settlement` : "No monthly futures configured";

      if (futuresProduct && marketSymbol && market.curveStyle === "basis" && futuresDisplay === "outright") {
        const henrySymbol = monthlySymbol(HENRY_FUTURES_PRODUCT, month, year);
        displaySymbol = `${henrySymbol} + ${marketSymbol}`;
        sourceSymbols = [henrySymbol, marketSymbol];
        formula = `Henry fixed price + ${futuresProduct} basis settlement`;
      } else if (futuresProduct && marketSymbol) {
        sourceSymbols = [marketSymbol];
        if (market.curveStyle === "basis" && futuresDisplay === "basis") {
          formula = `${futuresProduct} basis settlement`;
        }
      }

      cells.push({
        cellKey: `${rowKey}:${columnKey}`,
        rowKey,
        columnKey,
        displaySymbol,
        sourceSymbols,
        formula,
        contractMonth,
        pointType,
      });
    }
  }
  return cells;
}

function futuresSql(): string {
  return `
with target_cells as (
  select
    target.cell->>'cellKey' as cell_key,
    array(
      select jsonb_array_elements_text(target.cell->'sourceSymbols')
    ) as source_symbols
  from jsonb_array_elements($1::jsonb) as target(cell)
  where jsonb_array_length(target.cell->'sourceSymbols') > 0
),
daily as (
  select
    tc.cell_key,
    s.trade_date::date as trade_date,
    sum(nullif(s.settlement::text, 'NaN')::double precision) as value,
    sum(nullif(s.volume::text, 'NaN')::double precision) as volume,
    max(s.updated_at) as updated_at,
    count(distinct s.symbol) as matched_symbol_count,
    cardinality(tc.source_symbols) as required_symbol_count
  from target_cells tc
  cross join lateral unnest(tc.source_symbols) as source_symbol(symbol)
  inner join ice_python.settlements s
    on s.symbol = source_symbol.symbol
   and nullif(s.settlement::text, 'NaN') is not null
  group by tc.cell_key, tc.source_symbols, s.trade_date::date
  having count(distinct s.symbol) = cardinality(tc.source_symbols)
),
latest as (
  select distinct on (cell_key)
    cell_key,
    trade_date,
    value,
    volume,
    updated_at
  from daily
  order by cell_key, trade_date desc
),
trend_source as (
  select
    cell_key,
    trade_date,
    value
  from (
    select
      cell_key,
      trade_date,
      value,
      row_number() over (partition by cell_key order by trade_date desc) as trend_rank
    from daily
  ) ranked
  where trend_rank <= 7
),
trends as (
  select
    cell_key,
    jsonb_agg(
      jsonb_build_object(
        'date', trade_date::text,
        'value', value
      )
      order by trade_date
    ) as price_trend
  from trend_source
  group by cell_key
)
select
  latest.cell_key,
  latest.trade_date::text as trade_date,
  latest.value,
  latest.volume,
  to_char(latest.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as updated_at,
  coalesce(trends.price_trend, '[]'::jsonb) as price_trend
from latest
left join trends
  on trends.cell_key = latest.cell_key
order by latest.cell_key;
`;
}

function buildDailySql(priceBasis: GasPriceBasis): string {
  const field = PRICE_FIELD_SQL[priceBasis];
  return `
select
  s.trade_date::date as trade_date,
  extract(year from s.trade_date)::int as contract_year,
  extract(month from s.trade_date)::int as contract_month,
  extract(day from s.trade_date)::int as day_of_month,
  nullif(s.${field}::text, 'NaN')::double precision as value,
  nullif(s.volume::text, 'NaN')::double precision as volume,
  to_char(s.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as updated_at,
  'trade_date'::text as date_basis
from ice_python.settlements s
where s.symbol = $1
  and extract(year from s.trade_date)::int between $2 and $3
  and nullif(s.${field}::text, 'NaN') is not null
order by s.trade_date;
`;
}

function buildGasDayCashSql({
  sourceSymbol,
  startDate,
  endDate,
}: {
  sourceSymbol: string;
  startDate: string;
  endDate: string;
}): SqlRequest {
  const promoted = bindPromotedSql(readPjmDaPromotedSql(NEXT_DAY_GAS_SOURCE), {
    start_date: startDate,
    end_date: endDate,
  });
  const symbolParam = `$${promoted.values.length + 1}`;

  return {
    text: `
with gas_day_source as (
${promotedSqlBody(promoted.text)}
)
select
  g.gas_day::date as trade_date,
  extract(year from g.gas_day)::int as contract_year,
  extract(month from g.gas_day)::int as contract_month,
  extract(day from g.gas_day)::int as day_of_month,
  g.gas_price::double precision as value,
  null::double precision as volume,
  to_char(g.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as updated_at,
  'gas_day'::text as date_basis
from gas_day_source g
where g.symbol = ${symbolParam}::text
  and g.gas_price is not null
order by g.gas_day;
`,
    values: [...promoted.values, sourceSymbol],
  };
}

function basePayload({
  mode,
  market,
  priceBasis,
  futuresDisplay,
  selectedMonth,
  years,
  rows,
  rowCount,
  valueCount,
  dataAsOf,
  source = SETTLEMENTS_SOURCE,
}: {
  mode: GasMonthlySettlesMode;
  market: DailyGasMarket;
  priceBasis: GasPriceBasis;
  futuresDisplay: GasMonthlyFuturesDisplay;
  selectedMonth: number | null;
  years: number[];
  rows: GasMonthlySettlesPayload["rows"];
  rowCount: number;
  valueCount: number;
  dataAsOf: string | null;
  source?: GasMonthlySettlesPayload["source"];
}): GasMonthlySettlesPayload {
  const registryCounts = getIceGasRegistryCounts();
  const expectedValueCount = rows.reduce(
    (sum, row) => sum + Object.values(row.cells).filter(Boolean).length,
    0,
  );
  return {
    product: "gas",
    source,
    mode,
    market,
    priceBasis,
    futuresDisplay,
    selectedMonth,
    years,
    columns: years.map((year) => ({
      key: String(year),
      year,
      label: String(year),
    })),
    rows,
    metadata: {
      dataAsOf,
      sourceTable: source,
      rowCount,
      valueCount,
      missingValueCount: Math.max(0, expectedValueCount - valueCount),
      registrySource: registryCounts.source,
      noCalendarAssumption: true,
    },
  };
}

async function buildFuturesPayload({
  market,
  years,
  futuresDisplay,
}: {
  market: DailyGasMarket;
  years: number[];
  futuresDisplay: GasMonthlyFuturesDisplay;
}): Promise<GasMonthlySettlesPayload> {
  const targetCells = buildFuturesTargetCells(market, years, futuresDisplay);
  const sourceRows = await query<FuturesSourceRow>(futuresSql(), [JSON.stringify(targetCells)]);
  const sourceByCell = new Map(sourceRows.map((row) => [row.cell_key, row]));
  let valueCount = 0;

  const rows = MONTH_LABELS.map((label, index) => {
    const month = index + 1;
    const rowKey = String(month);
    const cells: Record<string, GasMonthlySettlesCell | null> = {};
    for (const year of years) {
      const columnKey = String(year);
      const target = targetCells.find((cell) => cell.cellKey === `${rowKey}:${columnKey}`);
      if (!target) {
        cells[columnKey] = null;
        continue;
      }
      const sourceRow = sourceByCell.get(target.cellKey);
      const value = toNumber(sourceRow?.value);
      if (value !== null) valueCount += 1;
      cells[columnKey] = {
        rowKey,
        columnKey,
        value,
        tradeDate: toDateString(sourceRow?.trade_date),
        updatedAt: toTimestampString(sourceRow?.updated_at),
        volume: toNumber(sourceRow?.volume),
        displaySymbol: target.displaySymbol,
        sourceSymbols: target.sourceSymbols,
        formula: target.formula,
        contractMonth: target.contractMonth,
        pointType: target.pointType,
        dateBasis: "trade_date",
        priceTrend: parsePriceTrend(sourceRow?.price_trend),
      };
    }
    return {
      key: rowKey,
      label,
      sortOrder: month,
      cells,
    };
  });

  return basePayload({
    mode: "futures",
    market,
    priceBasis: "settlement",
    futuresDisplay,
    selectedMonth: null,
    years,
    rows,
    rowCount: sourceRows.length,
    valueCount,
    dataAsOf: maxString(sourceRows.map((row) => toTimestampString(row.updated_at) ?? toDateString(row.trade_date))),
  });
}

async function buildDailyPayload({
  mode,
  market,
  years,
  priceBasis,
}: {
  mode: Extract<GasMonthlySettlesMode, "cash" | "balmo">;
  market: DailyGasMarket;
  years: number[];
  priceBasis: GasPriceBasis;
}): Promise<GasMonthlySettlesPayload> {
  const sourceSymbol = mode === "cash" ? market.cashSymbol : market.balmoSymbol;
  const useGasDayCash = mode === "cash";
  const firstYear = years[0];
  const lastYear = years.at(-1) ?? firstYear;
  const formula = sourceSymbol
    ? useGasDayCash
      ? `${sourceSymbol} gas-day cash monthly average`
      : `${sourceSymbol} ${priceBasis.replace("_", " ")} monthly average`
    : "No symbol";
  const sqlRequest: SqlRequest | null = sourceSymbol
    ? useGasDayCash
      ? buildGasDayCashSql({
          sourceSymbol,
          startDate: `${firstYear}-01-01`,
          endDate: `${lastYear}-12-31`,
        })
      : {
          text: buildDailySql(priceBasis),
          values: [sourceSymbol, firstYear, lastYear],
        }
    : null;
  const sourceRows = sqlRequest ? await query<DailySourceRow>(sqlRequest.text, sqlRequest.values) : [];
  const sourceByMonthYear = new Map<string, DailySourceRow[]>();
  for (const row of sourceRows) {
    const contractMonth = toNumber(row.contract_month);
    const contractYear = toNumber(row.contract_year);
    if (contractMonth === null || contractYear === null) continue;
    const key = `${contractMonth}:${contractYear}`;
    const rowsForCell = sourceByMonthYear.get(key) ?? [];
    rowsForCell.push(row);
    sourceByMonthYear.set(key, rowsForCell);
  }
  let valueCount = 0;

  const rows = MONTH_LABELS.map((label, index) => {
    const month = index + 1;
    const rowKey = String(month);
    const cells: Record<string, GasMonthlySettlesCell | null> = {};
    for (const year of years) {
      const columnKey = String(year);
      const sourceRowsForCell = sourceByMonthYear.get(`${month}:${year}`) ?? [];
      const numericValues = sourceRowsForCell
        .map((row) => toNumber(row.value))
        .filter((value): value is number => value !== null);
      const numericVolumes = sourceRowsForCell
        .map((row) => toNumber(row.volume))
        .filter((value): value is number => value !== null);
      const value = numericValues.length
        ? numericValues.reduce((sum, price) => sum + price, 0) / numericValues.length
        : null;
      if (value !== null) valueCount += 1;
      const latestTradeDate = maxString(sourceRowsForCell.map((row) => toDateString(row.trade_date)));
      const latestUpdatedAt = maxString(sourceRowsForCell.map((row) => toTimestampString(row.updated_at)));
      cells[columnKey] = {
        rowKey,
        columnKey,
        value,
        tradeDate: latestTradeDate,
        updatedAt: latestUpdatedAt,
        volume: numericVolumes.length ? numericVolumes.reduce((sum, volume) => sum + volume, 0) : null,
        displaySymbol: sourceSymbol,
        sourceSymbols: sourceSymbol ? [sourceSymbol] : [],
        formula: sourceSymbol ? formula : mode === "balmo" ? "No BalMo configured" : "No cash symbol configured",
        contractMonth: contractMonthDate(year, month),
        pointType: mode,
        dateBasis: useGasDayCash ? "gas_day" : "trade_date",
        priceTrend: priceTrendFromDailyRows(sourceRowsForCell),
      };
    }
    return {
      key: rowKey,
      label,
      sortOrder: month,
      cells,
    };
  });

  return basePayload({
    mode,
    market,
    priceBasis,
    futuresDisplay: "outright",
    selectedMonth: null,
    years,
    rows,
    rowCount: sourceRows.length,
    valueCount,
    dataAsOf: maxString(sourceRows.map((row) => toTimestampString(row.updated_at) ?? toDateString(row.trade_date))),
    source: useGasDayCash ? NEXT_DAY_GAS_SOURCE : SETTLEMENTS_SOURCE,
  });
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const mode = normalizeMode(searchParams.get("mode"));
  const market = normalizeMarket(searchParams.get("market"));
  const { startYear, endYear } = normalizeYearWindow(searchParams);
  const years = yearsBetween(startYear, endYear);
  const futuresDisplay = normalizeFuturesDisplay(searchParams.get("futuresDisplay"), market);
  const requestedPriceBasis = normalizeDailyGasPriceBasis(searchParams.get("priceBasis"));
  let priceBasis: GasPriceBasis = requestedPriceBasis;
  if (mode === "futures") {
    priceBasis = "settlement";
  } else if (mode === "cash" || requestedPriceBasis === "settlement") {
    priceBasis = "vwap_close";
  }

  const payload =
    mode === "futures"
      ? await buildFuturesPayload({ market, years, futuresDisplay })
      : await buildDailyPayload({ mode, market, years, priceBasis });

  return {
    payload,
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: payload.metadata.rowCount,
    dataAsOf: payload.metadata.dataAsOf,
  };
});

export function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
