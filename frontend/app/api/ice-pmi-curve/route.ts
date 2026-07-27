import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import {
  DEFAULT_POWER_SPARK_SPREAD_PRODUCT,
  getPowerSparkSpreadProduct,
} from "@/lib/sparkSpreads/products";

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

type MatrixMode = "power" | "cal" | "spark";

interface MatrixSettlementSourceRow {
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

interface DerivedMatrixRow {
  strip: string;
  stripOrder: number;
  currentSymbol: string | null;
  currentTradeDate: string | null;
  currentPrice: number | null;
  currentVolume: number | null;
  currentMarkStale: boolean;
  priceTrend: Array<{ date: string | null; value: number | null }>;
  volumeTrend: Array<{ date: string | null; value: number | null }>;
  cal27Symbol: string | null;
  cal27TradeDate: string | null;
  cal27Price: number | null;
  cal27Volume: number | null;
  cal27MarkStale: boolean;
  cal27PriceTrend: Array<{ date: string | null; value: number | null }>;
  cal27VolumeTrend: Array<{ date: string | null; value: number | null }>;
  cal28Symbol: string | null;
  cal28TradeDate: string | null;
  cal28Price: number | null;
  cal28Volume: number | null;
  cal28MarkStale: boolean;
  cal28PriceTrend: Array<{ date: string | null; value: number | null }>;
  cal28VolumeTrend: Array<{ date: string | null; value: number | null }>;
  previousYearSettlements: ReturnType<typeof normalizePriorPoint>[];
  monthCurvePoints: ReturnType<typeof normalizePriorPoint>[];
}

function intParam(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeMode(value: string | null): MatrixMode {
  const normalized = (value ?? "power").trim().toLowerCase();
  if (normalized === "calendar" || normalized === "calender") return "cal";
  if (normalized === "cal" || normalized === "spark" || normalized === "power") return normalized;
  return "power";
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

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
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

const DERIVED_MATRIX_SQL = `
with params as (
    select
        $1::integer as current_year,
        $2::integer as end_year,
        $3::integer as trading_days,
        $4::integer as prior_year_count,
        $5::text as power_root,
        $6::text as gas_root,
        $7::text as basis_root,
        $8::text as spread_root
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
    select power_root as product_code from params
    union
    select spread_root as product_code from params where spread_root is not null
    union
    select gas_root as product_code from params
    union
    select basis_root as product_code from params
),
target_symbols as (
    select
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
    from product_roots as pr
    cross join month_strips as ms
    cross join lateral generate_series(
        (select current_year - prior_year_count from params),
        (select end_year + 1 from params)
    ) as years(contract_year)
),
ranked as (
    select
        t.product_code,
        t.month_number,
        t.month_strip,
        t.strip_label,
        t.contract_year,
        t.symbol,
        s.trade_date::date as trade_date,
        s.settlement::float8 as settlement,
        s.volume::float8 as volume,
        row_number() over (partition by t.symbol order by s.trade_date desc) as recent_rank
    from target_symbols as t
    inner join ice_python.settlements as s
        on s.symbol = t.symbol
    where s.settlement is not null
)
select
    product_code,
    month_number,
    month_strip,
    strip_label,
    contract_year,
    symbol,
    trade_date,
    settlement,
    volume
from ranked
where recent_rank <= (select trading_days from params)
order by month_number, product_code, contract_year, trade_date
`;

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
  productRoots: { power: string; spread: string | null; gas: string; basis: string };
  pointsBySymbol: Map<string, MatrixSettlementPoint[]>;
}): { priceTrend: Array<{ date: string | null; value: number | null }>; volumeTrend: Array<{ date: string | null; value: number | null }>; latest: ReturnType<typeof normalizePriorPoint> | null } {
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
          symbolFor(productRoots.basis, monthStrip, year),
        ]
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

  const latestPoints = pointSets
    .map((points) => points.at(-1) ?? null)
    .filter((point): point is MatrixSettlementPoint => point !== null);
  if (latestPoints.length !== pointSets.length) {
    return { priceTrend, volumeTrend, latest: null };
  }

  const commonLatestDate = dates.at(-1) ?? latestPoints.map((point) => point.tradeDate).sort().at(-1) ?? null;
  const latest = {
    contractYear: year,
    pointType: year >= currentYear ? "forward" : "settlement",
    symbol: legSymbols.length === 1 ? legSymbols[0] : null,
    finalTradeDate: commonLatestDate,
    settlement: roundTo(deriveValue(mode, latestPoints, heatRate), 2),
    volume: sumVolumes(latestPoints),
  };

  return { priceTrend, volumeTrend, latest };
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
  productRoots: { power: string; spread: string | null; gas: string; basis: string };
}): DerivedMatrixRow[] {
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
        .filter((point): point is ReturnType<typeof normalizePriorPoint> => point !== null);
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

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const defaultCurrentYear = new Date().getUTCFullYear();
  const currentYear = intParam(searchParams.get("currentYear"), defaultCurrentYear, 2020, 2035);
  const endYear = intParam(searchParams.get("endYear"), currentYear + 2, currentYear, 2035);
  const tradingDays = intParam(searchParams.get("tradingDays"), 7, 2, 20);
  const priorYears = intParam(searchParams.get("priorYears"), 5, 1, 10);
  const mode = normalizeMode(searchParams.get("mode"));
  const selectedProduct =
    getPowerSparkSpreadProduct(searchParams.get("sparkProduct")) ?? DEFAULT_POWER_SPARK_SPREAD_PRODUCT;

  if (mode !== "power" || selectedProduct.id !== DEFAULT_POWER_SPARK_SPREAD_PRODUCT.id) {
    const rows = await query<MatrixSettlementSourceRow>(DERIVED_MATRIX_SQL, [
      currentYear,
      endYear,
      tradingDays,
      priorYears,
      selectedProduct.powerRoot,
      selectedProduct.gasRoot,
      selectedProduct.basisRoot,
      selectedProduct.spreadRoot,
    ]);
    const normalizedRows = buildDerivedRows({
      sourceRows: rows,
      mode,
      currentYear,
      endYear,
      priorYears,
      heatRate: selectedProduct.heatRate,
      productRoots: {
        power: selectedProduct.powerRoot,
        spread: selectedProduct.spreadRoot,
        gas: selectedProduct.gasRoot,
        basis: selectedProduct.basisRoot,
      },
    });
    const dataAsOf =
      normalizedRows
        .flatMap((row) => row.monthCurvePoints.map((point) => point.finalTradeDate))
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

    return {
      payload: {
        product: selectedProduct.spreadRoot
          ? `${selectedProduct.powerRoot}-${selectedProduct.spreadRoot}`
          : selectedProduct.powerRoot,
        pricingMode: mode,
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
  }

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
