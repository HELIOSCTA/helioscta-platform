import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import {
  DAILY_GAS_MARKETS,
  buildDailyGasMarketValuesSql,
  getIceGasRegistryCounts,
  type DailyGasCurveColumn,
  type DailyGasMarket,
  type DailyGasPriceRow,
  type DailyGasPricesPayload,
} from "@/lib/gasPricing";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const MONTH_COLUMNS = 12;

const ROUTE_CONFIG = {
  route: "/api/gas-daily-prices",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "Local-dev ICE physical gas curve snapshot",
  p95TargetMs: 2_500,
  freshnessSource: "ice_python.settlements updated_at",
} as const;

interface RawGasCurveCell {
  trade_date: string;
  row_sort: number;
  region: DailyGasMarket["region"];
  market: string;
  short_label: string;
  cash_symbol: string;
  balmo_symbol: string | null;
  futures_product: string | null;
  curve_style: DailyGasMarket["curveStyle"];
  column_key: string;
  column_label: string;
  column_kind: DailyGasCurveColumn["kind"];
  column_sort: number;
  contract_month: string | null;
  value: number | string | null;
  value_trade_date: string | null;
  source_symbol: string | null;
  source_symbols: string | null;
  updated_at: string | null;
}

function parseIsoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function maxString(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function buildSql(): string {
  return `
    with requested as (
      select
        $1::date as requested_trade_date
    ),
    market_registry as (
      select *
      from (
        values
${buildDailyGasMarketValuesSql()}
      ) as t(
        row_sort,
        region,
        market,
        short_label,
        cash_symbol,
        balmo_symbol,
        futures_product,
        curve_style
      )
    ),
    futures_products as (
      select 'HNG'::text as product
      union
      select futures_product::text as product
      from market_registry
      where futures_product is not null
    ),
    selected_trade_date as (
      select coalesce(
        (select requested_trade_date from requested),
        (
          select max(s.trade_date)::date
          from ice_python.settlements s
          where s.symbol ~ '^HNG [FGHJKMNQUVXZ][0-9]{2}-IUS$'
            and s.settlement is not null
            and s.settlement::text <> 'NaN'
        ),
        (
          select max(s.trade_date)::date
          from ice_python.settlements s
          where s.symbol in (select cash_symbol from market_registry)
        )
      ) as trade_date
    ),
    parsed_monthly_symbols as (
      select
        s.symbol,
        match_parts[1] as product,
        match_parts[2] as strip_code,
        make_date(
          2000 + match_parts[3]::int,
          case match_parts[2]
            when 'F' then 1
            when 'G' then 2
            when 'H' then 3
            when 'J' then 4
            when 'K' then 5
            when 'M' then 6
            when 'N' then 7
            when 'Q' then 8
            when 'U' then 9
            when 'V' then 10
            when 'X' then 11
            when 'Z' then 12
          end,
          1
        ) as contract_month
      from ice_python.settlements s
      cross join selected_trade_date d
      cross join lateral regexp_match(s.symbol, '^([A-Z0-9]+) ([FGHJKMNQUVXZ])([0-9]{2})-IUS$') as match_parts
      where s.trade_date::date = d.trade_date
        and match_parts[1] in (select product from futures_products)
    ),
    active_months as (
      select contract_month
      from (
        select distinct contract_month
        from parsed_monthly_symbols
        cross join selected_trade_date d
        where contract_month >= date_trunc('month', d.trade_date)::date
      ) months
      order by contract_month
      limit ${MONTH_COLUMNS}
    ),
    month_columns as (
      select
        ('month_' || to_char(contract_month, 'YYYY_MM')) as column_key,
        to_char(contract_month, 'FMMon YY') as column_label,
        'month'::text as column_kind,
        (100 + row_number() over (order by contract_month))::int as column_sort,
        contract_month
      from active_months
    ),
    columns as (
      select 'cash'::text as column_key, 'Cash'::text as column_label, 'cash'::text as column_kind, 1::int as column_sort, null::date as contract_month
      union all
      select 'balmo'::text as column_key, 'BalMo'::text as column_label, 'balmo'::text as column_kind, 2::int as column_sort, null::date as contract_month
      union all
      select column_key, column_label, column_kind, column_sort, contract_month
      from month_columns
    ),
    market_columns as (
      select
        d.trade_date,
        m.*,
        c.column_key,
        c.column_label,
        c.column_kind,
        c.column_sort,
        c.contract_month,
        case
          when c.column_kind = 'cash' then m.cash_symbol
          when c.column_kind = 'balmo' then m.balmo_symbol
          when c.column_kind = 'month' and m.curve_style = 'fixed' then
            m.futures_product || ' ' ||
            case extract(month from c.contract_month)::int
              when 1 then 'F'
              when 2 then 'G'
              when 3 then 'H'
              when 4 then 'J'
              when 5 then 'K'
              when 6 then 'M'
              when 7 then 'N'
              when 8 then 'Q'
              when 9 then 'U'
              when 10 then 'V'
              when 11 then 'X'
              when 12 then 'Z'
            end ||
            right(extract(year from c.contract_month)::int::text, 2) || '-IUS'
          when c.column_kind = 'month' and m.curve_style = 'basis' then
            'HNG + ' || m.futures_product || ' ' ||
            case extract(month from c.contract_month)::int
              when 1 then 'F'
              when 2 then 'G'
              when 3 then 'H'
              when 4 then 'J'
              when 5 then 'K'
              when 6 then 'M'
              when 7 then 'N'
              when 8 then 'Q'
              when 9 then 'U'
              when 10 then 'V'
              when 11 then 'X'
              when 12 then 'Z'
            end ||
            right(extract(year from c.contract_month)::int::text, 2) || '-IUS'
          else null
        end as display_symbol,
        case
          when c.column_kind = 'cash' then array[m.cash_symbol]
          when c.column_kind = 'balmo' and m.balmo_symbol is not null then array[m.balmo_symbol]
          when c.column_kind = 'month' and m.curve_style = 'fixed' then array[
            m.futures_product || ' ' ||
            case extract(month from c.contract_month)::int
              when 1 then 'F'
              when 2 then 'G'
              when 3 then 'H'
              when 4 then 'J'
              when 5 then 'K'
              when 6 then 'M'
              when 7 then 'N'
              when 8 then 'Q'
              when 9 then 'U'
              when 10 then 'V'
              when 11 then 'X'
              when 12 then 'Z'
            end ||
            right(extract(year from c.contract_month)::int::text, 2) || '-IUS'
          ]
          when c.column_kind = 'month' and m.curve_style = 'basis' then array[
            'HNG ' ||
            case extract(month from c.contract_month)::int
              when 1 then 'F'
              when 2 then 'G'
              when 3 then 'H'
              when 4 then 'J'
              when 5 then 'K'
              when 6 then 'M'
              when 7 then 'N'
              when 8 then 'Q'
              when 9 then 'U'
              when 10 then 'V'
              when 11 then 'X'
              when 12 then 'Z'
            end ||
            right(extract(year from c.contract_month)::int::text, 2) || '-IUS',
            m.futures_product || ' ' ||
            case extract(month from c.contract_month)::int
              when 1 then 'F'
              when 2 then 'G'
              when 3 then 'H'
              when 4 then 'J'
              when 5 then 'K'
              when 6 then 'M'
              when 7 then 'N'
              when 8 then 'Q'
              when 9 then 'U'
              when 10 then 'V'
              when 11 then 'X'
              when 12 then 'Z'
            end ||
            right(extract(year from c.contract_month)::int::text, 2) || '-IUS'
          ]
          else array[]::text[]
        end as source_symbols,
        case
          when c.column_kind = 'month' then
            'HNG ' ||
            case extract(month from c.contract_month)::int
              when 1 then 'F'
              when 2 then 'G'
              when 3 then 'H'
              when 4 then 'J'
              when 5 then 'K'
              when 6 then 'M'
              when 7 then 'N'
              when 8 then 'Q'
              when 9 then 'U'
              when 10 then 'V'
              when 11 then 'X'
              when 12 then 'Z'
            end ||
            right(extract(year from c.contract_month)::int::text, 2) || '-IUS'
          else null
        end as henry_symbol,
        case
          when c.column_kind = 'month' and m.futures_product is not null then
            m.futures_product || ' ' ||
            case extract(month from c.contract_month)::int
              when 1 then 'F'
              when 2 then 'G'
              when 3 then 'H'
              when 4 then 'J'
              when 5 then 'K'
              when 6 then 'M'
              when 7 then 'N'
              when 8 then 'Q'
              when 9 then 'U'
              when 10 then 'V'
              when 11 then 'X'
              when 12 then 'Z'
            end ||
            right(extract(year from c.contract_month)::int::text, 2) || '-IUS'
          else null
        end as market_month_symbol
      from selected_trade_date d
      cross join market_registry m
      cross join columns c
    ),
    cell_daily_values as (
      select
        mc.row_sort,
        mc.market,
        mc.column_key,
        s.trade_date::date as trade_date,
        case
          when s.trade_date is null then null
          when count(*) filter (
            where case
              when mc.column_kind in ('cash', 'balmo') then nullif(s.vwap_close::text, 'NaN')::double precision
              else nullif(s.settlement::text, 'NaN')::double precision
            end is not null
          ) = cardinality(mc.source_symbols)
          then sum(
            case
              when mc.column_kind in ('cash', 'balmo') then nullif(s.vwap_close::text, 'NaN')::double precision
              else nullif(s.settlement::text, 'NaN')::double precision
            end
          )
          else null
        end as value,
        max(s.updated_at) as updated_at
      from market_columns mc
      cross join selected_trade_date d
      left join lateral unnest(mc.source_symbols) as leg(symbol) on true
      left join ice_python.settlements s
        on s.symbol = leg.symbol
       and s.trade_date::date <= d.trade_date
      group by mc.row_sort, mc.market, mc.column_key, mc.column_kind, cardinality(mc.source_symbols), s.trade_date::date
    ),
    cell_latest as (
      select
        row_sort,
        market,
        column_key,
        trade_date,
        value,
        updated_at
      from (
        select
          cell_daily_values.*,
          row_number() over (
            partition by row_sort, market, column_key
            order by trade_date desc
          ) as row_number
        from cell_daily_values
        where value is not null
      ) ranked
      where row_number = 1
    )
    select
      mc.trade_date::text as trade_date,
      mc.row_sort,
      mc.region,
      mc.market,
      mc.short_label,
      mc.cash_symbol,
      mc.balmo_symbol,
      mc.futures_product,
      mc.curve_style,
      mc.column_key,
      mc.column_label,
      mc.column_kind,
      mc.column_sort,
      mc.contract_month::text as contract_month,
      latest.value as value,
      latest.trade_date::text as value_trade_date,
      mc.display_symbol as source_symbol,
      array_to_string(mc.source_symbols, ',') as source_symbols,
      to_char(latest.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as updated_at
    from market_columns mc
    left join cell_latest latest
      on latest.row_sort = mc.row_sort
     and latest.market = mc.market
     and latest.column_key = mc.column_key
    order by mc.row_sort, mc.column_sort;
  `;
}

function buildPayload(
  rawRows: RawGasCurveCell[],
  priceBasis: DailyGasPricesPayload["priceBasis"],
): DailyGasPricesPayload {
  const tradeDate = rawRows[0]?.trade_date ?? "";
  const registryCounts = getIceGasRegistryCounts();
  const columnsByKey = new Map<string, DailyGasCurveColumn & { sort: number }>();
  const rowsByMarket = new Map<string, DailyGasPriceRow & { sort: number }>();
  let valueCount = 0;

  for (const raw of rawRows) {
    if (!columnsByKey.has(raw.column_key)) {
      columnsByKey.set(raw.column_key, {
        key: raw.column_key,
        label: raw.column_label,
        kind: raw.column_kind,
        contractMonth: raw.contract_month,
        sort: raw.column_sort,
      });
    }

    let row = rowsByMarket.get(raw.market);
    if (!row) {
      row = {
        region: raw.region,
        market: raw.market,
        shortLabel: raw.short_label,
        cashSymbol: raw.cash_symbol,
        balmoSymbol: raw.balmo_symbol,
        futuresProduct: raw.futures_product,
        curveStyle: raw.curve_style,
        values: {},
        valueDates: {},
        symbols: {},
        sourceSymbols: {},
        updatedAt: {},
        sort: raw.row_sort,
      };
      rowsByMarket.set(raw.market, row);
    }

    const value = toNumber(raw.value);
    if (value !== null) valueCount += 1;
    row.values[raw.column_key] = value;
    row.valueDates[raw.column_key] = raw.value_trade_date;
    row.symbols[raw.column_key] = raw.source_symbol;
    row.sourceSymbols[raw.column_key] = raw.source_symbols
      ? raw.source_symbols.split(",").filter(Boolean)
      : [];
    row.updatedAt[raw.column_key] = raw.updated_at === "-infinity" ? null : raw.updated_at;
  }

  const columns = [...columnsByKey.values()]
    .sort((left, right) => left.sort - right.sort)
    .map((column) => ({
      key: column.key,
      label: column.label,
      kind: column.kind,
      contractMonth: column.contractMonth,
    }));
  const rows = [...rowsByMarket.values()]
    .sort((left, right) => left.sort - right.sort)
    .map((row) => ({
      region: row.region,
      market: row.market,
      shortLabel: row.shortLabel,
      cashSymbol: row.cashSymbol,
      balmoSymbol: row.balmoSymbol,
      futuresProduct: row.futuresProduct,
      curveStyle: row.curveStyle,
      values: row.values,
      valueDates: row.valueDates,
      symbols: row.symbols,
      sourceSymbols: row.sourceSymbols,
      updatedAt: row.updatedAt,
    }));
  const expectedValueCount = columns.length * rows.length;

  return {
    priceBasis,
    tradeDate,
    columns,
    markets: DAILY_GAS_MARKETS,
    rows,
    metadata: {
      dataAsOf: maxString(rawRows.map((row) => row.updated_at === "-infinity" ? null : row.updated_at)),
      sourceTable: "ice_python.settlements",
      rowCount: rawRows.length,
      valueCount,
      missingValueCount: Math.max(0, expectedValueCount - valueCount),
      henryCurveProduct: "HNG",
      registrySource: registryCounts.source,
      registryMarketCount: registryCounts.marketCount,
      registryNextDayCount: registryCounts.nextDayCount,
      registryBalmoCount: registryCounts.balmoCount,
      registryFuturesProductCount: registryCounts.futuresProductCount,
    },
  };
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  if (!isLocalOnlyFeatureEnabled()) {
    return {
      status: 404,
      payload: { error: "Gas pricing is local-only while the ICE price grid is being validated." },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  const { searchParams } = new URL(request.url);
  const tradeDateParam = searchParams.get("tradeDate") ?? searchParams.get("date");
  const tradeDate = parseIsoDate(tradeDateParam);
  if (tradeDateParam && !tradeDate) {
    return {
      status: 400,
      payload: { error: "tradeDate must be YYYY-MM-DD." },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  const rawRows = await query<RawGasCurveCell>(buildSql(), [tradeDate]);

  if (!rawRows.length || !rawRows[0]?.trade_date) {
    return {
      status: 404,
      payload: { error: "No ICE physical gas curve data is available for the selected trade date." },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  const payload = buildPayload(rawRows, "settlement");

  return {
    payload,
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: rawRows.length,
    dataAsOf: payload.metadata.dataAsOf,
  };
});

export function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
