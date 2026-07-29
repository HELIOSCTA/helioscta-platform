import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import {
  DAILY_GAS_MARKETS,
  buildDailyGasMarketValuesSql,
  getIceGasRegistryCounts,
  normalizeDailyGasPriceBasis,
  type DailyGasCurveColumn,
  type DailyGasMarket,
  type DailyGasPriceRow,
  type DailyGasPricesPayload,
  type GasPriceBasis,
} from "@/lib/gasPricing";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const MONTH_COLUMNS = 24;
const DEFAULT_CASH_BALMO_BASIS: GasPriceBasis = "vwap_close";

const ROUTE_CONFIG = {
  route: "/api/gas-daily-prices",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "ICE physical gas curve snapshot",
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
  trend_points: unknown;
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

function parseTrendPoints(value: unknown): Array<{ tradeDate: string | null; value: number | null }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((point) => {
      if (!point || typeof point !== "object") return null;
      const record = point as Record<string, unknown>;
      const tradeDate =
        typeof record.tradeDate === "string"
          ? record.tradeDate.slice(0, 10)
          : typeof record.trade_date === "string"
            ? record.trade_date.slice(0, 10)
            : null;
      return {
        tradeDate,
        value: toNumber(record.value),
      };
    })
    .filter((point): point is { tradeDate: string | null; value: number | null } => point !== null);
}

function normalizeCashBalmoBasis(value: string | null): GasPriceBasis {
  if (!value) return DEFAULT_CASH_BALMO_BASIS;
  const normalized = normalizeDailyGasPriceBasis(value);
  return normalized === value ? normalized : DEFAULT_CASH_BALMO_BASIS;
}

function priceBasisSqlField(basis: GasPriceBasis): string {
  switch (basis) {
    case "settlement":
      return "settlement";
    case "open":
      return "open";
    case "high":
      return "high";
    case "low":
      return "low";
    case "close":
      return "close";
    case "vwap_close":
      return "vwap_close";
  }
}

function buildSql({
  cashBasis,
  balmoBasis,
}: {
  cashBasis: GasPriceBasis;
  balmoBasis: GasPriceBasis;
}): string {
  const cashField = priceBasisSqlField(cashBasis);
  const balmoField = priceBasisSqlField(balmoBasis);

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
    selected_trade_date as (
      select coalesce(
        (select requested_trade_date from requested),
        (
          select max(s.trade_date)::date
          from ice_python.settlements s
          where s.symbol in (select cash_symbol from market_registry)
            and s.vwap_close is not null
            and s.vwap_close::text <> 'NaN'
        ),
        (
          select max(s.trade_date)::date
          from ice_python.settlements s
          where s.symbol ~ '^HNG [FGHJKMNQUVXZ][0-9]{2}-IUS$'
            and s.settlement is not null
            and s.settlement::text <> 'NaN'
        )
      ) as trade_date
    ),
    active_months as (
      select
        (date_trunc('month', d.trade_date)::date + (month_offset || ' month')::interval)::date as contract_month
      from selected_trade_date d
      cross join generate_series(1, ${MONTH_COLUMNS}) as offsets(month_offset)
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
    single_leg_targets as (
      select
        mc.row_sort,
        mc.market,
        mc.column_key,
        mc.column_kind,
        mc.source_symbols[1] as source_symbol
      from market_columns mc
      where cardinality(mc.source_symbols) = 1
        and mc.source_symbols[1] is not null
    ),
    basis_month_targets as (
      select
        mc.row_sort,
        mc.market,
        mc.column_key,
        mc.henry_symbol,
        mc.market_month_symbol
      from market_columns mc
      where mc.column_kind = 'month'
        and mc.curve_style = 'basis'
        and mc.henry_symbol is not null
        and mc.market_month_symbol is not null
    ),
    cell_latest as (
      select
        t.row_sort,
        t.market,
        t.column_key,
        latest.trade_date,
        latest.value,
        latest.updated_at
      from single_leg_targets t
      cross join selected_trade_date d
      left join lateral (
        select
          s.trade_date::date as trade_date,
          case
            when t.column_kind = 'cash' then nullif(s.${cashField}::text, 'NaN')::double precision
            when t.column_kind = 'balmo' then nullif(s.${balmoField}::text, 'NaN')::double precision
            else nullif(s.settlement::text, 'NaN')::double precision
          end as value,
          s.updated_at
        from ice_python.settlements s
        where s.symbol = t.source_symbol
          and s.trade_date::date <= d.trade_date
          and case
            when t.column_kind = 'cash' then nullif(s.${cashField}::text, 'NaN')::double precision
            when t.column_kind = 'balmo' then nullif(s.${balmoField}::text, 'NaN')::double precision
            else nullif(s.settlement::text, 'NaN')::double precision
          end is not null
        order by s.trade_date desc
        limit 1
      ) latest on true

      union all

      select
        t.row_sort,
        t.market,
        t.column_key,
        latest.trade_date,
        latest.value,
        latest.updated_at
      from basis_month_targets t
      cross join selected_trade_date d
      left join lateral (
        select
          h.trade_date::date as trade_date,
          nullif(h.settlement::text, 'NaN')::double precision
            + nullif(basis_leg.settlement::text, 'NaN')::double precision as value,
          (
            select max(value)
            from (values (h.updated_at), (basis_leg.updated_at)) as updated(value)
          ) as updated_at
        from ice_python.settlements h
        inner join ice_python.settlements basis_leg
          on basis_leg.symbol = t.market_month_symbol
         and basis_leg.trade_date::date = h.trade_date::date
         and nullif(basis_leg.settlement::text, 'NaN') is not null
        where h.symbol = t.henry_symbol
          and h.trade_date::date <= d.trade_date
          and nullif(h.settlement::text, 'NaN') is not null
        order by h.trade_date desc
        limit 1
      ) latest on true
    ),
    cash_balmo_trends as (
      select
        trend_source.row_sort,
        trend_source.market,
        trend_source.column_key,
        jsonb_agg(
          jsonb_build_object(
            'tradeDate', trend_source.trade_date::text,
            'value', trend_source.value
          )
          order by trend_source.trade_date
        ) as trend_points
      from (
        select
          mc.row_sort,
          mc.market,
          mc.column_key,
          s.trade_date::date as trade_date,
          s.value
        from market_columns mc
        cross join selected_trade_date d
        cross join lateral (
          select
            s.trade_date,
            case
              when mc.column_kind = 'cash' then nullif(s.${cashField}::text, 'NaN')::double precision
              when mc.column_kind = 'balmo' then nullif(s.${balmoField}::text, 'NaN')::double precision
            end as value
          from ice_python.settlements s
          where s.symbol = mc.source_symbols[1]
            and s.trade_date::date <= d.trade_date
            and case
              when mc.column_kind = 'cash' then nullif(s.${cashField}::text, 'NaN')::double precision
              when mc.column_kind = 'balmo' then nullif(s.${balmoField}::text, 'NaN')::double precision
            end is not null
          order by s.trade_date desc
          limit 7
        ) s
        where mc.column_kind in ('cash', 'balmo')
          and cardinality(mc.source_symbols) = 1
          and mc.source_symbols[1] is not null
      ) trend_source
      group by trend_source.row_sort, trend_source.market, trend_source.column_key
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
      to_char(latest.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as updated_at,
      coalesce(trend.trend_points, '[]'::jsonb) as trend_points
    from market_columns mc
    left join cell_latest latest
      on latest.row_sort = mc.row_sort
     and latest.market = mc.market
     and latest.column_key = mc.column_key
    left join cash_balmo_trends trend
      on trend.row_sort = mc.row_sort
     and trend.market = mc.market
     and trend.column_key = mc.column_key
    order by mc.row_sort, mc.column_sort;
  `;
}

function buildPayload(
  rawRows: RawGasCurveCell[],
  priceBasis: DailyGasPricesPayload["priceBasis"],
  cashBasis: DailyGasPricesPayload["cashBasis"],
  balmoBasis: DailyGasPricesPayload["balmoBasis"],
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
        trends: {},
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
    row.trends[raw.column_key] = parseTrendPoints(raw.trend_points);
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
      trends: row.trends,
    }));
  const expectedValueCount = columns.length * rows.length;

  return {
    priceBasis,
    cashBasis,
    balmoBasis,
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
  const { searchParams } = new URL(request.url);
  const tradeDateParam = searchParams.get("tradeDate") ?? searchParams.get("date");
  const tradeDate = parseIsoDate(tradeDateParam);
  const cashBasis = normalizeCashBalmoBasis(searchParams.get("cashBasis") ?? searchParams.get("cashPriceBasis"));
  const balmoBasis = normalizeCashBalmoBasis(searchParams.get("balmoBasis") ?? searchParams.get("balmoPriceBasis"));
  if (tradeDateParam && !tradeDate) {
    return {
      status: 400,
      payload: { error: "tradeDate must be YYYY-MM-DD." },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  const rawRows = await query<RawGasCurveCell>(buildSql({ cashBasis, balmoBasis }), [tradeDate]);

  if (!rawRows.length || !rawRows[0]?.trade_date) {
    return {
      status: 404,
      payload: { error: "No ICE physical gas curve data is available for the selected trade date." },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  const payload = buildPayload(rawRows, "settlement", cashBasis, balmoBasis);

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
