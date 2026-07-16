import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/ice-pmi-curve",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "ICE PMI monthly curve table",
  p95TargetMs: 1_500,
  freshnessSource: "ice_python.settlements trade_date",
} as const;

interface IcePmiCurveSourceRow {
  strip: string;
  strip_order: number | string;
  current_symbol: string | null;
  current_trade_date: string | null;
  current_price: number | string | null;
  current_volume: number | string | null;
  current_mark_stale: boolean | null;
  price_trend: unknown;
  volume_trend: unknown;
  cal27_symbol: string;
  cal27_trade_date: string | null;
  cal27_price: number | string | null;
  cal27_volume: number | string | null;
  cal27_mark_stale: boolean | null;
  cal27_price_trend: unknown;
  cal27_volume_trend: unknown;
  cal28_symbol: string;
  cal28_trade_date: string | null;
  cal28_price: number | string | null;
  cal28_volume: number | string | null;
  cal28_mark_stale: boolean | null;
  cal28_price_trend: unknown;
  cal28_volume_trend: unknown;
  previous_year_settlements: unknown;
  month_curve_points: unknown;
}

function intParam(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
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

function toBoolean(value: unknown): boolean {
  return value === true;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeTrendPoint(value: unknown) {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    date: toDateString(row.date),
    value: toNumber(row.value),
  };
}

function normalizePriorPoint(value: unknown) {
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

function normalizeRow(row: IcePmiCurveSourceRow) {
  return {
    strip: row.strip,
    stripOrder: toNumber(row.strip_order) ?? 0,
    currentSymbol: row.current_symbol,
    currentTradeDate: toDateString(row.current_trade_date),
    currentPrice: toNumber(row.current_price),
    currentVolume: toNumber(row.current_volume),
    currentMarkStale: toBoolean(row.current_mark_stale),
    priceTrend: asArray(row.price_trend).map(normalizeTrendPoint),
    volumeTrend: asArray(row.volume_trend).map(normalizeTrendPoint),
    cal27Symbol: row.cal27_symbol,
    cal27TradeDate: toDateString(row.cal27_trade_date),
    cal27Price: toNumber(row.cal27_price),
    cal27Volume: toNumber(row.cal27_volume),
    cal27MarkStale: toBoolean(row.cal27_mark_stale),
    cal27PriceTrend: asArray(row.cal27_price_trend).map(normalizeTrendPoint),
    cal27VolumeTrend: asArray(row.cal27_volume_trend).map(normalizeTrendPoint),
    cal28Symbol: row.cal28_symbol,
    cal28TradeDate: toDateString(row.cal28_trade_date),
    cal28Price: toNumber(row.cal28_price),
    cal28Volume: toNumber(row.cal28_volume),
    cal28MarkStale: toBoolean(row.cal28_mark_stale),
    cal28PriceTrend: asArray(row.cal28_price_trend).map(normalizeTrendPoint),
    cal28VolumeTrend: asArray(row.cal28_volume_trend).map(normalizeTrendPoint),
    previousYearSettlements: asArray(row.previous_year_settlements).map(
      normalizePriorPoint,
    ),
    monthCurvePoints: asArray(row.month_curve_points).map(normalizePriorPoint),
  };
}

const CURVE_SQL = `
with params as (
    select
        'PMI'::text as product_code,
        $1::integer as current_year,
        make_date($1::integer, 1, 1) as start_contract_month,
        make_date($2::integer, 12, 1) as end_contract_month,
        $3::integer as trading_days,
        $4::integer as prior_year_count
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
target_symbols as (
    select
        gs.contract_month_start::date as contract_month_start,
        extract(year from gs.contract_month_start)::integer as contract_year,
        ms.month_number,
        ms.month_strip,
        ms.strip_label,
        p.product_code
            || ' '
            || ms.month_strip
            || right(extract(year from gs.contract_month_start)::integer::text, 2)
            || '-IUS' as symbol
    from params as p
    cross join generate_series(
        p.start_contract_month,
        p.end_contract_month,
        interval '1 month'
    ) as gs(contract_month_start)
    inner join month_strips as ms
        on extract(month from gs.contract_month_start)::integer = ms.month_number
),
curve_trade_dates as (
    select distinct s.trade_date::date as trade_date
    from ice_python.settlements as s
    inner join target_symbols as t
        on s.symbol = t.symbol
    where s.settlement is not null
),
latest_curve_dates as (
    select trade_date
    from curve_trade_dates
    order by trade_date desc
    limit (select trading_days from params)
),
window_bounds as (
    select
        min(trade_date) as window_start_trade_date,
        max(trade_date) as latest_curve_trade_date
    from latest_curve_dates
),
month_rows as (
    select
        ms.month_number,
        ms.month_strip,
        ms.strip_label,
        make_date(p.current_year, ms.month_number, 1) as current_contract_month,
        p.current_year as current_contract_year,
        p.product_code
            || ' '
            || ms.month_strip
            || right(p.current_year::text, 2)
            || '-IUS' as current_symbol,
        p.product_code || ' ' || ms.month_strip || '27-IUS' as cal27_symbol,
        p.product_code || ' ' || ms.month_strip || '28-IUS' as cal28_symbol
    from month_strips as ms
    cross join params as p
)
select
    mr.strip_label as strip,
    mr.month_number as strip_order,
    mr.current_symbol,
    current_mark.trade_date as current_trade_date,
    current_mark.settlement as current_price,
    current_mark.volume as current_volume,
    current_mark.trade_date < wb.latest_curve_trade_date as current_mark_stale,
    price_trend.points as price_trend,
    volume_trend.points as volume_trend,
    mr.cal27_symbol,
    cal27_mark.trade_date as cal27_trade_date,
    cal27_mark.settlement as cal27_price,
    cal27_mark.volume as cal27_volume,
    cal27_mark.trade_date < wb.latest_curve_trade_date as cal27_mark_stale,
    cal27_price_trend.points as cal27_price_trend,
    cal27_volume_trend.points as cal27_volume_trend,
    mr.cal28_symbol,
    cal28_mark.trade_date as cal28_trade_date,
    cal28_mark.settlement as cal28_price,
    cal28_mark.volume as cal28_volume,
    cal28_mark.trade_date < wb.latest_curve_trade_date as cal28_mark_stale,
    cal28_price_trend.points as cal28_price_trend,
    cal28_volume_trend.points as cal28_volume_trend,
    prior_settlements.points as previous_year_settlements,
    month_curve.points as month_curve_points
from month_rows as mr
cross join window_bounds as wb
left join lateral (
    select
        s.trade_date::date as trade_date,
        s.settlement::float8 as settlement,
        s.volume::float8 as volume
    from ice_python.settlements as s
    where s.symbol = mr.current_symbol
      and s.settlement is not null
      and s.trade_date::date <= wb.latest_curve_trade_date
    order by s.trade_date desc
    limit 1
) as current_mark on true
left join lateral (
    with ranked as (
        select
            s.trade_date::date as trade_date,
            s.settlement::float8 as settlement,
            row_number() over (order by s.trade_date desc) as recent_rank
        from ice_python.settlements as s
        where s.symbol = mr.current_symbol
          and s.settlement is not null
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'date', ranked.trade_date::text,
                'value', ranked.settlement
            )
            order by ranked.trade_date
        ),
        '[]'::jsonb
    ) as points
    from ranked
    where ranked.recent_rank <= (select trading_days from params)
) as price_trend on true
left join lateral (
    with ranked as (
        select
            s.trade_date::date as trade_date,
            s.volume::float8 as volume,
            row_number() over (order by s.trade_date desc) as recent_rank
        from ice_python.settlements as s
        where s.symbol = mr.current_symbol
          and s.settlement is not null
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'date', ranked.trade_date::text,
                'value', ranked.volume
            )
            order by ranked.trade_date
        ),
        '[]'::jsonb
    ) as points
    from ranked
    where ranked.recent_rank <= (select trading_days from params)
) as volume_trend on true
left join lateral (
    select
        s.trade_date::date as trade_date,
        s.settlement::float8 as settlement,
        s.volume::float8 as volume
    from ice_python.settlements as s
    where s.symbol = mr.cal27_symbol
      and s.settlement is not null
      and s.trade_date::date <= wb.latest_curve_trade_date
    order by s.trade_date desc
    limit 1
) as cal27_mark on true
left join lateral (
    with ranked as (
        select
            s.trade_date::date as trade_date,
            s.settlement::float8 as settlement,
            row_number() over (order by s.trade_date desc) as recent_rank
        from ice_python.settlements as s
        where s.symbol = mr.cal27_symbol
          and s.settlement is not null
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'date', ranked.trade_date::text,
                'value', ranked.settlement
            )
            order by ranked.trade_date
        ),
        '[]'::jsonb
    ) as points
    from ranked
    where ranked.recent_rank <= (select trading_days from params)
) as cal27_price_trend on true
left join lateral (
    with ranked as (
        select
            s.trade_date::date as trade_date,
            s.volume::float8 as volume,
            row_number() over (order by s.trade_date desc) as recent_rank
        from ice_python.settlements as s
        where s.symbol = mr.cal27_symbol
          and s.settlement is not null
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'date', ranked.trade_date::text,
                'value', ranked.volume
            )
            order by ranked.trade_date
        ),
        '[]'::jsonb
    ) as points
    from ranked
    where ranked.recent_rank <= (select trading_days from params)
) as cal27_volume_trend on true
left join lateral (
    select
        s.trade_date::date as trade_date,
        s.settlement::float8 as settlement,
        s.volume::float8 as volume
    from ice_python.settlements as s
    where s.symbol = mr.cal28_symbol
      and s.settlement is not null
      and s.trade_date::date <= wb.latest_curve_trade_date
    order by s.trade_date desc
    limit 1
) as cal28_mark on true
left join lateral (
    with ranked as (
        select
            s.trade_date::date as trade_date,
            s.settlement::float8 as settlement,
            row_number() over (order by s.trade_date desc) as recent_rank
        from ice_python.settlements as s
        where s.symbol = mr.cal28_symbol
          and s.settlement is not null
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'date', ranked.trade_date::text,
                'value', ranked.settlement
            )
            order by ranked.trade_date
        ),
        '[]'::jsonb
    ) as points
    from ranked
    where ranked.recent_rank <= (select trading_days from params)
) as cal28_price_trend on true
left join lateral (
    with ranked as (
        select
            s.trade_date::date as trade_date,
            s.volume::float8 as volume,
            row_number() over (order by s.trade_date desc) as recent_rank
        from ice_python.settlements as s
        where s.symbol = mr.cal28_symbol
          and s.settlement is not null
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'date', ranked.trade_date::text,
                'value', ranked.volume
            )
            order by ranked.trade_date
        ),
        '[]'::jsonb
    ) as points
    from ranked
    where ranked.recent_rank <= (select trading_days from params)
) as cal28_volume_trend on true
left join lateral (
    with prior_years as (
        select generate_series(1, (select prior_year_count from params)) as years_back
    ),
    prior_symbols as (
        select
            mr.current_contract_year - years_back as contract_year,
            (select product_code from params)
                || ' '
                || mr.month_strip
                || right((mr.current_contract_year - years_back)::text, 2)
                || '-IUS' as symbol
        from prior_years
    ),
    prior_final as (
        select
            ps.contract_year,
            ps.symbol,
            final.trade_date,
            final.settlement,
            final.volume
        from prior_symbols as ps
        left join lateral (
            select
                s.trade_date::date as trade_date,
                s.settlement::float8 as settlement,
                s.volume::float8 as volume
            from ice_python.settlements as s
            where s.symbol = ps.symbol
              and s.settlement is not null
            order by s.trade_date desc
            limit 1
        ) as final on true
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'contractYear', contract_year,
                'symbol', symbol,
                'finalTradeDate', trade_date::text,
                'settlement', settlement,
                'volume', volume
            )
            order by contract_year
        ),
        '[]'::jsonb
    ) as points
    from prior_final
) as prior_settlements on true
left join lateral (
    with prior_years as (
        select generate_series(1, (select prior_year_count from params)) as years_back
    ),
    prior_symbols as (
        select
            mr.current_contract_year - years_back as contract_year,
            'settlement'::text as point_type,
            (select product_code from params)
                || ' '
                || mr.month_strip
                || right((mr.current_contract_year - years_back)::text, 2)
                || '-IUS' as symbol
        from prior_years
    ),
    prior_final as (
        select
            ps.contract_year,
            ps.point_type,
            ps.symbol,
            final.trade_date,
            final.settlement,
            final.volume
        from prior_symbols as ps
        left join lateral (
            select
                s.trade_date::date as trade_date,
                s.settlement::float8 as settlement,
                s.volume::float8 as volume
            from ice_python.settlements as s
            where s.symbol = ps.symbol
              and s.settlement is not null
            order by s.trade_date desc
            limit 1
        ) as final on true
    ),
    forward_points as (
        select
            mr.current_contract_year as contract_year,
            'forward'::text as point_type,
            mr.current_symbol as symbol,
            current_mark.trade_date,
            current_mark.settlement,
            current_mark.volume
        union all
        select
            2027 as contract_year,
            'forward'::text as point_type,
            mr.cal27_symbol as symbol,
            cal27_mark.trade_date,
            cal27_mark.settlement,
            cal27_mark.volume
        union all
        select
            2028 as contract_year,
            'forward'::text as point_type,
            mr.cal28_symbol as symbol,
            cal28_mark.trade_date,
            cal28_mark.settlement,
            cal28_mark.volume
    ),
    all_points as (
        select * from prior_final
        union all
        select * from forward_points
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'contractYear', contract_year,
                'pointType', point_type,
                'symbol', symbol,
                'finalTradeDate', trade_date::text,
                'settlement', settlement,
                'volume', volume
            )
            order by contract_year, point_type
        ),
        '[]'::jsonb
    ) as points
    from all_points
) as month_curve on true
order by mr.month_number
`;

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const currentYear = intParam(searchParams.get("currentYear"), 2026, 2020, 2035);
  const endYear = intParam(searchParams.get("endYear"), 2028, 2026, 2035);
  const tradingDays = intParam(searchParams.get("tradingDays"), 7, 2, 20);
  const priorYears = intParam(searchParams.get("priorYears"), 5, 1, 10);

  const rows = await query<IcePmiCurveSourceRow>(CURVE_SQL, [
    currentYear,
    endYear,
    tradingDays,
    priorYears,
  ]);
  const normalizedRows = rows.map(normalizeRow);
  const dataAsOf =
    normalizedRows
      .map((row) => row.currentTradeDate)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return {
    payload: {
      product: "PMI",
      source: "ice_python.settlements",
      startContractMonth: `${currentYear}-01-01`,
      currentYear,
      endYear,
      tradingDays,
      priorYears,
      dataAsOf,
      rows: normalizedRows,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: rows.length,
    dataAsOf,
  };
});

export async function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
