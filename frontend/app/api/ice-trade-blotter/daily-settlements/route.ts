import { NextResponse } from "next/server";
import { query as serverQuery } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import { buildProductDictionaryCte } from "@/lib/iceTradeBlotterProductDictionary";
import {
  parseIceTradeProductScope,
  productDictionaryScopePredicateSql,
  type IceTradeProductScope,
} from "@/lib/iceTradeBlotterRules";
import { buildNercOffPeakDaysValuesSql } from "@/lib/tradingCalendars/calendars/pjmPower";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_TTL_MS = 5 * 60 * 1000;
const FRESH_CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=120";
const RESPONSE_CACHE = new Map<string, { expiresAt: number; payload: DailySettlementsPayload }>();

async function query<T>(text: string, values?: ReadonlyArray<unknown>): Promise<{ rows: T[] }> {
  return { rows: await serverQuery<T>(text, values) };
}

interface DailySettlementRow {
  date: string;
  symbol: string;
  cc: string;
  blotter_cc: string;
  asset_class: string;
  region: string;
  product_group: string;
  hub: string;
  ice_trading_screen_hub_name: string | null;
  ice_contract_size: string | null;
  market: string;
  contract: string;
  settlement_source: string;
  lmp_source_tier: string | null;
  contract_family: string;
  hour_bucket: string | null;
  begin_date: string | null;
  end_date: string | null;
  rule_begin_date: string | null;
  rule_end_date: string | null;
  ice_begin_date: string | null;
  ice_end_date: string | null;
  date_check_status: string;
  date_check_detail: string;
  settlement: number | string | null;
  ice_settlement: number | string | null;
  open: number | string | null;
  high: number | string | null;
  low: number | string | null;
  close: number | string | null;
  vwap_close: number | string | null;
  volume: number | string | null;
  created_at: string | null;
  updated_at: string | null;
  contract_snapshot_trade_date: string | null;
  contract_dates_updated_at: string | null;
  expected_settlement_days: number | string | null;
  matched_settlement_days: number | string | null;
  settlement_components: unknown;
  metadata_status: string;
}

interface SummaryRow {
  row_count: number | string;
  latest_date: string | null;
  latest_updated_at: string | null;
}

interface LatestDateRow {
  latest_date: string | null;
}

interface DailySettlementsPayload {
  startDate: string;
  endDate: string;
  scope: IceTradeProductScope;
  rowCount: number;
  summary: {
    rowCount: number;
    latestDate: string | null;
    latestUpdatedAt: string | null;
  };
  rows: DailySettlementRow[];
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isDateKey(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function parseDate(value: string | null, fallback: string): string {
  return isDateKey(value) ? value : fallback;
}

function parseDateMode(value: string | null): "single" | "historical" {
  return value === "historical" ? "historical" : "single";
}

function dateDaysBefore(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDailySettlementsSql(): string {
  return `
    WITH params AS NOT MATERIALIZED (
      SELECT
        $1::date AS start_trade_date,
        $2::date AS end_trade_date,
        $3::text AS product_scope,
        8::int AS onpeak_start_he,
        23::int AS onpeak_end_he
    ),
    nerc_off_peak_days AS (
${buildNercOffPeakDaysValuesSql(2020, 2035)}
    ),
    ${buildProductDictionaryCte()},
    exact_products AS MATERIALIZED (
      SELECT *
      FROM product_dictionary
      CROSS JOIN params
      WHERE
        active
        AND ice_symbol_pattern NOT LIKE '%{%}%'
        AND ${productDictionaryScopePredicateSql("product_dictionary")}
    ),
    futures_products AS MATERIALIZED (
      SELECT *
      FROM product_dictionary
      CROSS JOIN params
      WHERE
        active
        AND settlement_source = 'ICE_SETTLEMENT'
        AND ice_symbol_pattern LIKE '%{%}%'
        AND ${productDictionaryScopePredicateSql("product_dictionary")}
    ),
    trade_dates AS MATERIALIZED (
      SELECT DISTINCT settlements.trade_date
      FROM ice_python.settlements AS settlements
      CROSS JOIN params
      WHERE
        settlements.trade_date >= params.start_trade_date
        AND settlements.trade_date <= params.end_trade_date
        AND (
          settlements.symbol IN (SELECT ice_symbol_pattern FROM exact_products)
          OR LEFT(settlements.symbol, 3) IN (SELECT cc FROM futures_products)
        )
    ),
    market_stats AS MATERIALIZED (
      SELECT
        settlements.trade_date,
        settlements.symbol,
        LEFT(settlements.symbol, 3) AS cc,
        settlements.settlement,
        settlements.open,
        settlements.high,
        settlements.low,
        settlements.close,
        settlements.vwap_close,
        settlements.volume,
        settlements.created_at,
        settlements.updated_at
      FROM ice_python.settlements AS settlements
      CROSS JOIN params
      WHERE
        settlements.trade_date >= params.start_trade_date
        AND settlements.trade_date <= params.end_trade_date
        AND (
          settlements.symbol IN (SELECT ice_symbol_pattern FROM exact_products)
          OR LEFT(settlements.symbol, 3) IN (SELECT cc FROM futures_products)
        )
    ),
    product_trade_rows AS MATERIALIZED (
      SELECT
        ROW_NUMBER() OVER (
          ORDER BY trade_dates.trade_date, exact_products.cc, exact_products.contract_code
        ) AS row_id,
        trade_dates.trade_date,
        exact_products.ice_symbol_pattern AS symbol,
        exact_products.cc,
        exact_products.asset_class,
        exact_products.region,
        exact_products.product_group,
        CASE
          WHEN exact_products.cc = 'PDP' AND exact_products.contract_code LIKE 'W_' THEN 'PJH'
          ELSE exact_products.cc
        END AS ice_contract_symbol,
        exact_products.market,
        exact_products.hub,
        exact_products.ice_contract_size,
        CASE
          WHEN exact_products.cc = 'PDA' AND exact_products.contract_code = 'D1' THEN 'PJM WH DA (Daily)'
          WHEN exact_products.cc = 'PJL' AND exact_products.contract_code = 'D1' THEN 'PJM WH DA (Daily 16 MWh)'
          WHEN exact_products.cc = 'PWA' AND exact_products.contract_code IN ('D0', 'D1') THEN 'PJM WH RT (16 MWh)'
          WHEN exact_products.cc = 'PDP' THEN 'PJM WH RT'
          WHEN exact_products.cc = 'PDO' THEN 'PJM WH DA Off-Peak'
          WHEN exact_products.cc = 'ODP' THEN 'PJM WH RT Off-Peak'
          ELSE exact_products.hub
        END AS ice_trading_screen_hub_name,
        exact_products.contract_label AS contract,
        exact_products.settlement_source,
        exact_products.settlement_source_key,
        exact_products.contract_family,
        exact_products.contract_code,
        exact_products.hour_bucket,
        COALESCE(NULLIF(market_stats.settlement::text, 'NaN')::double precision, market_stats.vwap_close) AS ice_settlement,
        market_stats.open,
        market_stats.high,
        market_stats.low,
        market_stats.close,
        market_stats.vwap_close,
        market_stats.volume,
        market_stats.created_at,
        market_stats.updated_at AS market_stats_updated_at,
        market_stats.symbol IS NOT NULL AS has_market_stats
      FROM trade_dates
      CROSS JOIN exact_products
      LEFT JOIN market_stats
        ON market_stats.trade_date = trade_dates.trade_date
       AND market_stats.symbol = exact_products.ice_symbol_pattern
    ),
    futures_trade_rows AS MATERIALIZED (
      SELECT
        ROW_NUMBER() OVER (
          ORDER BY market_stats.trade_date, market_stats.symbol
        ) + 1000000 AS row_id,
        market_stats.trade_date,
        market_stats.symbol,
        market_stats.cc,
        COALESCE(futures_products.asset_class, 'Power') AS asset_class,
        COALESCE(futures_products.region, 'ICE') AS region,
        COALESCE(futures_products.product_group, 'Power | ICE') AS product_group,
        market_stats.cc AS ice_contract_symbol,
        COALESCE(futures_products.market, 'ICE') AS market,
        COALESCE(futures_products.hub, 'PJM') AS hub,
        futures_products.ice_contract_size,
        CASE
          WHEN market_stats.cc = 'PMI' THEN 'PJM WH RT'
          WHEN market_stats.cc = 'OPJ' THEN 'PJM WH RT Off-Peak'
          ELSE COALESCE(futures_products.hub, 'PJM')
        END AS ice_trading_screen_hub_name,
        COALESCE(
          CASE
            WHEN market_stats.symbol ~ '^[A-Z0-9]{3} [FGHJKMNQUVXZ][0-9]{2}-IUS$' THEN
              CASE SUBSTRING(market_stats.symbol FROM 5 FOR 1)
                WHEN 'F' THEN 'Jan'
                WHEN 'G' THEN 'Feb'
                WHEN 'H' THEN 'Mar'
                WHEN 'J' THEN 'Apr'
                WHEN 'K' THEN 'May'
                WHEN 'M' THEN 'Jun'
                WHEN 'N' THEN 'Jul'
                WHEN 'Q' THEN 'Aug'
                WHEN 'U' THEN 'Sep'
                WHEN 'V' THEN 'Oct'
                WHEN 'X' THEN 'Nov'
                WHEN 'Z' THEN 'Dec'
                ELSE ''
              END || SUBSTRING(market_stats.symbol FROM 6 FOR 2)
            ELSE NULL
          END,
          market_stats.symbol
        ) AS contract,
        COALESCE(futures_products.settlement_source, 'ICE_SETTLEMENT') AS settlement_source,
        COALESCE(futures_products.settlement_source_key, 'ice_settlement') AS settlement_source_key,
        COALESCE(futures_products.contract_family, 'Monthly') AS contract_family,
        'MONTH'::text AS contract_code,
        COALESCE(futures_products.hour_bucket, 'ONPEAK') AS hour_bucket,
        COALESCE(NULLIF(market_stats.settlement::text, 'NaN')::double precision, market_stats.vwap_close) AS ice_settlement,
        market_stats.open,
        market_stats.high,
        market_stats.low,
        market_stats.close,
        market_stats.vwap_close,
        market_stats.volume,
        market_stats.created_at,
        market_stats.updated_at AS market_stats_updated_at,
        TRUE AS has_market_stats
      FROM market_stats
      LEFT JOIN futures_products
        ON futures_products.cc = market_stats.cc
      WHERE market_stats.cc IN (SELECT cc FROM futures_products)
    ),
    product_rows AS MATERIALIZED (
      SELECT * FROM product_trade_rows
      UNION ALL
      SELECT * FROM futures_trade_rows
    ),
    product_rows_with_contracts AS MATERIALIZED (
      SELECT
        product_rows.*,
        contract_dates.strip,
        contract_dates.start_date AS ice_begin_date,
        contract_dates.end_date AS ice_end_date,
        contract_dates.trade_date AS contract_snapshot_trade_date,
        contract_dates.updated_at AS contract_dates_updated_at,
        COALESCE(
          contract_dates.strip,
          product_rows.contract
        ) AS resolved_contract,
        derived_dates.begin_date AS rule_begin_date,
        derived_dates.end_date AS rule_end_date,
        derived_dates.begin_date AS begin_date,
        derived_dates.end_date AS end_date,
        CASE
          WHEN derived_dates.begin_date IS NULL OR derived_dates.end_date IS NULL THEN 'rule'
          WHEN contract_dates.start_date IS NULL OR contract_dates.end_date IS NULL THEN 'missing'
          WHEN contract_dates.start_date = derived_dates.begin_date
            AND contract_dates.end_date = derived_dates.end_date THEN 'ok'
          ELSE 'diff'
        END AS date_check_status,
        CASE
          WHEN derived_dates.begin_date IS NULL OR derived_dates.end_date IS NULL
            THEN 'No deterministic short-term PJM ladder date was derived.'
          WHEN contract_dates.start_date IS NULL OR contract_dates.end_date IS NULL
            THEN 'No ICE contract-date reference row was available; using deterministic short-term PJM ladder.'
          WHEN contract_dates.start_date = derived_dates.begin_date
            AND contract_dates.end_date = derived_dates.end_date
            THEN 'ICE contract dates match the deterministic short-term PJM ladder.'
          ELSE 'ICE contract dates disagree with the deterministic short-term PJM ladder; ICE dates are shown as reference only.'
        END AS date_check_detail
      FROM product_rows
      LEFT JOIN LATERAL (
        SELECT
          dates.strip,
          dates.start_date,
          dates.end_date,
          dates.trade_date,
          dates.updated_at
        FROM ice_python.settlement_contract_dates AS dates
        WHERE
          dates.symbol = product_rows.symbol
          AND dates.trade_date = product_rows.trade_date
        ORDER BY dates.updated_at DESC NULLS LAST
        LIMIT 1
      ) AS contract_dates ON TRUE
      LEFT JOIN LATERAL (
        SELECT MIN(calendar.delivery_date::date) AS delivery_date
        FROM generate_series(
          product_rows.trade_date + INTERVAL '1 day',
          product_rows.trade_date + INTERVAL '14 days',
          INTERVAL '1 day'
        ) AS calendar(delivery_date)
        LEFT JOIN nerc_off_peak_days AS market_dates
          ON market_dates.holiday_date = calendar.delivery_date::date
        WHERE
          EXTRACT(ISODOW FROM calendar.delivery_date)::int BETWEEN 1 AND 5
          AND market_dates.holiday_date IS NULL
      ) AS next_eligible_day ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          MIN(calendar.delivery_date::date) AS begin_date
        FROM generate_series(
          next_eligible_day.delivery_date + INTERVAL '1 day',
          product_rows.trade_date + INTERVAL '21 days',
          INTERVAL '1 day'
        ) AS calendar(delivery_date)
        LEFT JOIN nerc_off_peak_days AS market_dates
          ON market_dates.holiday_date = calendar.delivery_date::date
        WHERE
          next_eligible_day.delivery_date IS NOT NULL
          AND EXTRACT(ISODOW FROM calendar.delivery_date)::int BETWEEN 1 AND 5
          AND market_dates.holiday_date IS NULL
      ) AS bal_week_start ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          MIN(calendar.delivery_date::date) AS begin_date,
          MAX(calendar.delivery_date::date) AS end_date
        FROM generate_series(
          bal_week_start.begin_date,
          bal_week_start.begin_date
            + (GREATEST(5 - EXTRACT(ISODOW FROM bal_week_start.begin_date)::int, 0) * INTERVAL '1 day'),
          INTERVAL '1 day'
        ) AS calendar(delivery_date)
        LEFT JOIN nerc_off_peak_days AS market_dates
          ON market_dates.holiday_date = calendar.delivery_date::date
        WHERE
          bal_week_start.begin_date IS NOT NULL
          AND EXTRACT(ISODOW FROM calendar.delivery_date)::int BETWEEN 1 AND 5
          AND market_dates.holiday_date IS NULL
      ) AS bal_week_dates ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          CASE
            WHEN product_rows.contract_code IN ('W1', 'W2', 'W3', 'W4') THEN
              product_rows.trade_date
              + (
                (
                  CASE
                    WHEN EXTRACT(ISODOW FROM product_rows.trade_date)::int = 1 THEN 7
                    ELSE (8 - EXTRACT(ISODOW FROM product_rows.trade_date)::int) % 7
                  END
                  + ((SUBSTRING(product_rows.contract_code FROM 2 FOR 1)::int - 1) * 7)
                ) * INTERVAL '1 day'
              )
            ELSE NULL
          END AS week_start
      ) AS target_week ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          MIN(calendar.delivery_date::date) AS begin_date,
          MAX(calendar.delivery_date::date) AS end_date
        FROM generate_series(
          target_week.week_start,
          target_week.week_start + INTERVAL '4 days',
          INTERVAL '1 day'
        ) AS calendar(delivery_date)
        LEFT JOIN nerc_off_peak_days AS market_dates
          ON market_dates.holiday_date = calendar.delivery_date::date
        WHERE
          target_week.week_start IS NOT NULL
          AND EXTRACT(ISODOW FROM calendar.delivery_date)::int BETWEEN 1 AND 5
          AND market_dates.holiday_date IS NULL
      ) AS target_week_dates ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          CASE
            WHEN product_rows.contract_code = 'D0' THEN product_rows.trade_date
            WHEN product_rows.contract_code = 'D1' THEN next_eligible_day.delivery_date
            WHEN product_rows.contract_code = 'P1' THEN
              product_rows.trade_date
              + (((6 - EXTRACT(ISODOW FROM product_rows.trade_date)::int + 7) % 7) * INTERVAL '1 day')
            WHEN product_rows.contract_code = 'W0' THEN bal_week_dates.begin_date
            WHEN product_rows.contract_code IN ('W1', 'W2', 'W3', 'W4') THEN target_week_dates.begin_date
            ELSE NULL
          END::date AS begin_date,
          CASE
            WHEN product_rows.contract_code = 'D0' THEN product_rows.trade_date
            WHEN product_rows.contract_code = 'D1' THEN next_eligible_day.delivery_date
            WHEN product_rows.contract_code = 'P1' THEN
              product_rows.trade_date
              + (((7 - EXTRACT(ISODOW FROM product_rows.trade_date)::int + 7) % 7) * INTERVAL '1 day')
            WHEN product_rows.contract_code = 'W0' THEN bal_week_dates.end_date
            WHEN product_rows.contract_code IN ('W1', 'W2', 'W3', 'W4') THEN target_week_dates.end_date
            ELSE NULL
          END::date AS end_date
      ) AS derived_dates ON TRUE
    ),
    delivery_bounds AS MATERIALIZED (
      SELECT
        MIN(begin_date) AS min_delivery_date,
        MAX(end_date) AS max_delivery_date
      FROM product_rows_with_contracts
      WHERE
        settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP', 'ERCOT_RT_LMP', 'ERCOT_DA_LMP')
        AND begin_date IS NOT NULL
        AND end_date IS NOT NULL
    ),
    da_onpeak_hourly AS MATERIALIZED (
      SELECT
        'pjm_da_onpeak'::text AS settlement_source_key,
        lmps.datetime_beginning_ept::date AS market_date,
        lmps.total_lmp_da AS total_lmp,
        lmps.updated_at AS source_updated_at,
        'da_lmp'::text AS lmp_source_tier
      FROM pjm.da_hrl_lmps AS lmps
      CROSS JOIN params
      CROSS JOIN delivery_bounds
      WHERE
        lmps.row_is_current = TRUE
        AND lmps.pnode_name = 'WESTERN HUB'
        AND delivery_bounds.min_delivery_date IS NOT NULL
        AND lmps.datetime_beginning_ept::date >= delivery_bounds.min_delivery_date
        AND lmps.datetime_beginning_ept::date <= delivery_bounds.max_delivery_date
        AND (EXTRACT(HOUR FROM lmps.datetime_beginning_ept) + 1)::int BETWEEN params.onpeak_start_he AND params.onpeak_end_he
    ),
    da_offpeak_hourly AS MATERIALIZED (
      SELECT
        'pjm_da_offpeak'::text AS settlement_source_key,
        lmps.datetime_beginning_ept::date AS market_date,
        lmps.total_lmp_da AS total_lmp,
        lmps.updated_at AS source_updated_at,
        'da_lmp'::text AS lmp_source_tier
      FROM pjm.da_hrl_lmps AS lmps
      CROSS JOIN params
      CROSS JOIN delivery_bounds
      WHERE
        lmps.row_is_current = TRUE
        AND lmps.pnode_name = 'WESTERN HUB'
        AND delivery_bounds.min_delivery_date IS NOT NULL
        AND lmps.datetime_beginning_ept::date >= delivery_bounds.min_delivery_date
        AND lmps.datetime_beginning_ept::date <= delivery_bounds.max_delivery_date
        AND (
          (EXTRACT(HOUR FROM lmps.datetime_beginning_ept) + 1)::int BETWEEN 1 AND 7
          OR (EXTRACT(HOUR FROM lmps.datetime_beginning_ept) + 1)::int = 24
        )
    ),
    da_offpeak_weekend_hourly AS MATERIALIZED (
      SELECT
        'pjm_da_offpeak_weekend_16'::text AS settlement_source_key,
        lmps.datetime_beginning_ept::date AS market_date,
        lmps.total_lmp_da AS total_lmp,
        lmps.updated_at AS source_updated_at,
        'da_lmp'::text AS lmp_source_tier
      FROM pjm.da_hrl_lmps AS lmps
      CROSS JOIN params
      CROSS JOIN delivery_bounds
      WHERE
        lmps.row_is_current = TRUE
        AND lmps.pnode_name = 'WESTERN HUB'
        AND delivery_bounds.min_delivery_date IS NOT NULL
        AND lmps.datetime_beginning_ept::date >= delivery_bounds.min_delivery_date
        AND lmps.datetime_beginning_ept::date <= delivery_bounds.max_delivery_date
        AND (EXTRACT(HOUR FROM lmps.datetime_beginning_ept) + 1)::int BETWEEN params.onpeak_start_he AND params.onpeak_end_he
    ),
    rt_verified AS MATERIALIZED (
      SELECT
        lmps.datetime_beginning_utc,
        lmps.datetime_beginning_ept,
        lmps.datetime_beginning_ept::date AS market_date,
        1::int AS source_priority,
        'verified_rt_lmp'::text AS lmp_source_tier,
        lmps.version_nbr,
        lmps.total_lmp_rt AS total_lmp,
        lmps.updated_at AS source_updated_at
      FROM pjm.rt_hrl_lmps AS lmps
      CROSS JOIN delivery_bounds
      WHERE
        lmps.row_is_current = TRUE
        AND lmps.pnode_name = 'WESTERN HUB'
        AND delivery_bounds.min_delivery_date IS NOT NULL
        AND lmps.datetime_beginning_ept >= delivery_bounds.min_delivery_date::timestamp
        AND lmps.datetime_beginning_ept < (delivery_bounds.max_delivery_date + 1)::timestamp
    ),
    rt_unverified AS MATERIALIZED (
      SELECT
        lmps.datetime_beginning_utc,
        lmps.datetime_beginning_ept,
        lmps.datetime_beginning_ept::date AS market_date,
        2::int AS source_priority,
        'unverified_rt_lmp'::text AS lmp_source_tier,
        NULL::bigint AS version_nbr,
        lmps.total_lmp_rt AS total_lmp,
        lmps.updated_at AS source_updated_at
      FROM pjm.rt_unverified_hrl_lmps AS lmps
      CROSS JOIN delivery_bounds
      WHERE
        lmps.pnode_name = 'WESTERN HUB'
        AND delivery_bounds.min_delivery_date IS NOT NULL
        AND lmps.datetime_beginning_ept >= delivery_bounds.min_delivery_date::timestamp
        AND lmps.datetime_beginning_ept < (delivery_bounds.max_delivery_date + 1)::timestamp
    ),
    rt_ranked AS MATERIALIZED (
      SELECT
        combined.*,
        ROW_NUMBER() OVER (
          PARTITION BY combined.datetime_beginning_utc
          ORDER BY combined.source_priority, combined.version_nbr DESC NULLS LAST
        ) AS source_rank
      FROM (
        SELECT * FROM rt_verified
        UNION ALL
        SELECT * FROM rt_unverified
      ) AS combined
    ),
    rt_onpeak_hourly AS MATERIALIZED (
      SELECT
        'pjm_rt_onpeak'::text AS settlement_source_key,
        rt_ranked.market_date,
        rt_ranked.total_lmp,
        rt_ranked.source_updated_at,
        rt_ranked.lmp_source_tier
      FROM rt_ranked
      CROSS JOIN params
      WHERE
        rt_ranked.source_rank = 1
        AND (EXTRACT(HOUR FROM rt_ranked.datetime_beginning_ept) + 1)::int BETWEEN params.onpeak_start_he AND params.onpeak_end_he
    ),
    rt_offpeak_hourly AS MATERIALIZED (
      SELECT
        'pjm_rt_offpeak'::text AS settlement_source_key,
        rt_ranked.market_date,
        rt_ranked.total_lmp,
        rt_ranked.source_updated_at,
        rt_ranked.lmp_source_tier
      FROM rt_ranked
      CROSS JOIN params
      WHERE
        rt_ranked.source_rank = 1
        AND (
          (EXTRACT(HOUR FROM rt_ranked.datetime_beginning_ept) + 1)::int BETWEEN 1 AND 7
          OR (EXTRACT(HOUR FROM rt_ranked.datetime_beginning_ept) + 1)::int = 24
        )
    ),
    rt_offpeak_weekend_hourly AS MATERIALIZED (
      SELECT
        'pjm_rt_offpeak_weekend_16'::text AS settlement_source_key,
        rt_ranked.market_date,
        rt_ranked.total_lmp,
        rt_ranked.source_updated_at,
        rt_ranked.lmp_source_tier
      FROM rt_ranked
      CROSS JOIN params
      WHERE
        rt_ranked.source_rank = 1
        AND (EXTRACT(HOUR FROM rt_ranked.datetime_beginning_ept) + 1)::int BETWEEN params.onpeak_start_he AND params.onpeak_end_he
    ),
    hourly AS MATERIALIZED (
      SELECT * FROM da_onpeak_hourly
      UNION ALL
      SELECT * FROM da_offpeak_hourly
      UNION ALL
      SELECT * FROM da_offpeak_weekend_hourly
      UNION ALL
      SELECT * FROM rt_onpeak_hourly
      UNION ALL
      SELECT * FROM rt_offpeak_hourly
      UNION ALL
      SELECT * FROM rt_offpeak_weekend_hourly
    ),
    pjm_daily_settlements AS MATERIALIZED (
      SELECT
        hourly.settlement_source_key,
        hourly.market_date,
        AVG(hourly.total_lmp) AS settlement,
        COUNT(*) AS hours_present,
        CASE
          WHEN hourly.settlement_source_key IN ('pjm_rt_offpeak', 'pjm_da_offpeak') THEN 8
          ELSE params.onpeak_end_he - params.onpeak_start_he + 1
        END AS expected_hours,
        CASE
          WHEN COUNT(DISTINCT hourly.lmp_source_tier) = 1 THEN MIN(hourly.lmp_source_tier)
          WHEN COUNT(DISTINCT hourly.lmp_source_tier) > 1 THEN 'mixed_lmp'
          ELSE NULL
        END AS lmp_source_tier,
        MAX(hourly.source_updated_at) AS latest_source_updated_at
      FROM hourly
      CROSS JOIN params
      GROUP BY
        hourly.settlement_source_key,
        hourly.market_date,
        params.onpeak_start_he,
        params.onpeak_end_he
    ),
    ercot_rt_hourly AS MATERIALIZED (
      SELECT
        NULL::text AS settlement_source_key,
        NULL::date AS market_date,
        NULL::double precision AS total_lmp,
        NULL::timestamp AS source_updated_at,
        NULL::text AS lmp_source_tier
      WHERE FALSE
    ),
    ercot_da_hourly AS MATERIALIZED (
      SELECT
        NULL::text AS settlement_source_key,
        NULL::date AS market_date,
        NULL::double precision AS total_lmp,
        NULL::timestamp AS source_updated_at,
        NULL::text AS lmp_source_tier
      WHERE FALSE
    ),
    ercot_hourly AS MATERIALIZED (
      SELECT * FROM ercot_rt_hourly
      UNION ALL
      SELECT * FROM ercot_da_hourly
    ),
    ercot_daily_settlements AS MATERIALIZED (
      SELECT
        ercot_hourly.settlement_source_key,
        ercot_hourly.market_date,
        AVG(ercot_hourly.total_lmp) AS settlement,
        COUNT(*) AS hours_present,
        CASE
          WHEN ercot_hourly.settlement_source_key = 'ercot_rt_north_offpeak' THEN 8
          ELSE 16
        END AS expected_hours,
        CASE
          WHEN COUNT(DISTINCT ercot_hourly.lmp_source_tier) = 1 THEN MIN(ercot_hourly.lmp_source_tier)
          WHEN COUNT(DISTINCT ercot_hourly.lmp_source_tier) > 1 THEN 'mixed_lmp'
          ELSE NULL
        END AS lmp_source_tier,
        MAX(ercot_hourly.source_updated_at) AS latest_source_updated_at
      FROM ercot_hourly
      GROUP BY ercot_hourly.settlement_source_key, ercot_hourly.market_date
    ),
    iso_daily_settlements AS MATERIALIZED (
      SELECT * FROM pjm_daily_settlements
      UNION ALL
      SELECT * FROM ercot_daily_settlements
    ),
    eligible_delivery_days AS MATERIALIZED (
      SELECT
        product_rows_with_contracts.row_id,
        calendar.delivery_date::date AS delivery_date
      FROM product_rows_with_contracts
      CROSS JOIN LATERAL generate_series(
        product_rows_with_contracts.begin_date,
        product_rows_with_contracts.end_date,
        INTERVAL '1 day'
      ) AS calendar(delivery_date)
      WHERE
        product_rows_with_contracts.settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP', 'ERCOT_RT_LMP', 'ERCOT_DA_LMP')
        AND product_rows_with_contracts.begin_date IS NOT NULL
        AND product_rows_with_contracts.end_date IS NOT NULL
    ),
    pjm_row_marks AS MATERIALIZED (
      SELECT
        product_rows_with_contracts.row_id,
        COUNT(DISTINCT eligible_delivery_days.delivery_date) AS expected_settlement_days,
        COUNT(DISTINCT iso_daily_settlements.market_date) FILTER (
          WHERE iso_daily_settlements.hours_present = iso_daily_settlements.expected_hours
        ) AS matched_settlement_days,
        AVG(iso_daily_settlements.settlement) FILTER (
          WHERE iso_daily_settlements.hours_present = iso_daily_settlements.expected_hours
        ) AS settlement,
        CASE
          WHEN COUNT(DISTINCT iso_daily_settlements.lmp_source_tier) FILTER (
            WHERE iso_daily_settlements.hours_present = iso_daily_settlements.expected_hours
              AND iso_daily_settlements.lmp_source_tier IS NOT NULL
          ) = 1
            THEN MIN(iso_daily_settlements.lmp_source_tier) FILTER (
              WHERE iso_daily_settlements.hours_present = iso_daily_settlements.expected_hours
                AND iso_daily_settlements.lmp_source_tier IS NOT NULL
            )
          WHEN COUNT(DISTINCT iso_daily_settlements.lmp_source_tier) FILTER (
            WHERE iso_daily_settlements.hours_present = iso_daily_settlements.expected_hours
              AND iso_daily_settlements.lmp_source_tier IS NOT NULL
          ) > 1
            THEN 'mixed_lmp'
          ELSE NULL
        END AS lmp_source_tier,
        MAX(iso_daily_settlements.latest_source_updated_at) AS latest_source_updated_at,
        jsonb_agg(
          jsonb_build_object(
            'date', to_char(eligible_delivery_days.delivery_date, 'YYYY-MM-DD'),
            'settlement', iso_daily_settlements.settlement,
            'hours_present', iso_daily_settlements.hours_present,
            'expected_hours', iso_daily_settlements.expected_hours,
            'source_tier', iso_daily_settlements.lmp_source_tier,
            'updated_at', to_char(iso_daily_settlements.latest_source_updated_at, 'YYYY-MM-DD HH24:MI:SS')
          )
          ORDER BY eligible_delivery_days.delivery_date
        ) FILTER (WHERE eligible_delivery_days.delivery_date IS NOT NULL) AS settlement_components
      FROM product_rows_with_contracts
      LEFT JOIN eligible_delivery_days
        ON eligible_delivery_days.row_id = product_rows_with_contracts.row_id
      LEFT JOIN iso_daily_settlements
        ON iso_daily_settlements.settlement_source_key = CASE
          WHEN product_rows_with_contracts.contract_code = 'P1'
            AND product_rows_with_contracts.settlement_source_key = 'pjm_da_offpeak'
            THEN 'pjm_da_offpeak_weekend_16'
          WHEN product_rows_with_contracts.contract_code = 'P1'
            AND product_rows_with_contracts.settlement_source_key = 'pjm_rt_offpeak'
            THEN 'pjm_rt_offpeak_weekend_16'
          ELSE product_rows_with_contracts.settlement_source_key
        END
       AND iso_daily_settlements.market_date = eligible_delivery_days.delivery_date
      WHERE
        product_rows_with_contracts.settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP', 'ERCOT_RT_LMP', 'ERCOT_DA_LMP')
      GROUP BY product_rows_with_contracts.row_id
    ),
    rows AS (
      SELECT
        product_rows_with_contracts.trade_date,
        product_rows_with_contracts.symbol,
        product_rows_with_contracts.cc,
        product_rows_with_contracts.ice_contract_symbol,
        product_rows_with_contracts.asset_class,
        product_rows_with_contracts.region,
        product_rows_with_contracts.product_group,
        product_rows_with_contracts.hub,
        product_rows_with_contracts.ice_trading_screen_hub_name,
        product_rows_with_contracts.ice_contract_size,
        product_rows_with_contracts.market,
        product_rows_with_contracts.resolved_contract AS contract,
        product_rows_with_contracts.settlement_source,
        pjm_row_marks.lmp_source_tier,
        product_rows_with_contracts.contract_family,
        product_rows_with_contracts.hour_bucket,
        product_rows_with_contracts.begin_date,
        product_rows_with_contracts.end_date,
        product_rows_with_contracts.rule_begin_date,
        product_rows_with_contracts.rule_end_date,
        product_rows_with_contracts.ice_begin_date,
        product_rows_with_contracts.ice_end_date,
        product_rows_with_contracts.date_check_status,
        product_rows_with_contracts.date_check_detail,
        CASE
          WHEN product_rows_with_contracts.settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP', 'ERCOT_RT_LMP', 'ERCOT_DA_LMP')
            THEN pjm_row_marks.settlement
          ELSE product_rows_with_contracts.ice_settlement
        END AS settlement,
        product_rows_with_contracts.ice_settlement,
        product_rows_with_contracts.open,
        product_rows_with_contracts.high,
        product_rows_with_contracts.low,
        product_rows_with_contracts.close,
        product_rows_with_contracts.vwap_close,
        product_rows_with_contracts.volume,
        product_rows_with_contracts.created_at,
        COALESCE(
          GREATEST(
            product_rows_with_contracts.market_stats_updated_at,
            pjm_row_marks.latest_source_updated_at
          ),
          product_rows_with_contracts.market_stats_updated_at,
          pjm_row_marks.latest_source_updated_at
        ) AS updated_at,
        product_rows_with_contracts.contract_snapshot_trade_date,
        product_rows_with_contracts.contract_dates_updated_at,
        pjm_row_marks.expected_settlement_days,
        pjm_row_marks.matched_settlement_days,
        pjm_row_marks.settlement_components,
        CASE
          WHEN product_rows_with_contracts.settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP', 'ERCOT_RT_LMP', 'ERCOT_DA_LMP')
            AND (product_rows_with_contracts.begin_date IS NULL OR product_rows_with_contracts.end_date IS NULL)
            THEN 'missing_contract_dates'
          WHEN product_rows_with_contracts.settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP', 'ERCOT_RT_LMP', 'ERCOT_DA_LMP')
            AND COALESCE(pjm_row_marks.expected_settlement_days, 0) = 0
            THEN 'no_eligible_delivery_days'
          WHEN product_rows_with_contracts.settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP', 'ERCOT_RT_LMP', 'ERCOT_DA_LMP')
            AND pjm_row_marks.matched_settlement_days = pjm_row_marks.expected_settlement_days
            THEN CASE
              WHEN product_rows_with_contracts.has_market_stats THEN 'complete'
              ELSE 'complete_missing_ice_stats'
            END
          WHEN product_rows_with_contracts.settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP', 'ERCOT_RT_LMP', 'ERCOT_DA_LMP')
            AND COALESCE(pjm_row_marks.matched_settlement_days, 0) > 0
            THEN 'partial_iso_lmp'
          WHEN product_rows_with_contracts.settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP', 'ERCOT_RT_LMP', 'ERCOT_DA_LMP')
            THEN 'pending_iso_lmp'
          WHEN NOT product_rows_with_contracts.has_market_stats THEN 'missing_ice_stats'
          WHEN product_rows_with_contracts.contract_snapshot_trade_date IS NULL THEN 'missing_contract_snapshot'
          ELSE 'exact_contract_snapshot'
        END AS metadata_status
      FROM product_rows_with_contracts
      LEFT JOIN pjm_row_marks
        ON pjm_row_marks.row_id = product_rows_with_contracts.row_id
    )
    SELECT
      to_char(rows.trade_date, 'YYYY-MM-DD') AS date,
      rows.symbol,
      rows.ice_contract_symbol AS cc,
      rows.cc AS blotter_cc,
      rows.asset_class,
      rows.region,
      rows.product_group,
      rows.hub,
      rows.ice_trading_screen_hub_name,
      rows.ice_contract_size,
      rows.market,
      rows.contract,
      rows.settlement_source,
      rows.lmp_source_tier,
      rows.contract_family,
      rows.hour_bucket,
      to_char(rows.begin_date, 'YYYY-MM-DD') AS begin_date,
      to_char(rows.end_date, 'YYYY-MM-DD') AS end_date,
      to_char(rows.rule_begin_date, 'YYYY-MM-DD') AS rule_begin_date,
      to_char(rows.rule_end_date, 'YYYY-MM-DD') AS rule_end_date,
      to_char(rows.ice_begin_date, 'YYYY-MM-DD') AS ice_begin_date,
      to_char(rows.ice_end_date, 'YYYY-MM-DD') AS ice_end_date,
      rows.date_check_status,
      rows.date_check_detail,
      rows.settlement,
      rows.ice_settlement,
      rows.open,
      rows.high,
      rows.low,
      rows.close,
      rows.vwap_close,
      rows.volume,
      to_char(rows.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
      to_char(rows.updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at,
      to_char(rows.contract_snapshot_trade_date, 'YYYY-MM-DD') AS contract_snapshot_trade_date,
      to_char(rows.contract_dates_updated_at, 'YYYY-MM-DD HH24:MI:SS') AS contract_dates_updated_at,
      rows.expected_settlement_days,
      rows.matched_settlement_days,
      rows.settlement_components,
      rows.metadata_status
    FROM rows
    ORDER BY
      rows.end_date ASC NULLS LAST,
      rows.begin_date ASC NULLS LAST,
      rows.trade_date DESC,
      CASE rows.contract_family
        WHEN 'Daily' THEN 1
        WHEN 'Weekly' THEN 2
        WHEN 'Monthly' THEN 3
        ELSE 99
      END,
      CASE rows.settlement_source
        WHEN 'PJM_DA_LMP' THEN 1
        WHEN 'PJM_RT_LMP' THEN 2
        WHEN 'ERCOT_DA_LMP' THEN 3
        WHEN 'ERCOT_RT_LMP' THEN 4
        WHEN 'ICE_SETTLEMENT' THEN 5
        ELSE 99
      END,
      rows.cc,
      rows.symbol;
  `;
}

function buildSummarySql(): string {
  return `
    WITH rows AS (${buildDailySettlementsSql().trim().replace(/;$/, "")})
    SELECT
      COUNT(*)::int AS row_count,
      MAX(date) AS latest_date,
      MAX(updated_at) AS latest_updated_at
    FROM rows;
  `;
}

function buildLatestSettlementDateSql(): string {
  return `
    WITH params AS NOT MATERIALIZED (
      SELECT $1::text AS product_scope
    ),
    ${buildProductDictionaryCte()},
    exact_products AS (
      SELECT ice_symbol_pattern
      FROM product_dictionary
      CROSS JOIN params
      WHERE active
        AND ice_symbol_pattern NOT LIKE '%{%}%'
        AND ${productDictionaryScopePredicateSql("product_dictionary")}
    ),
    futures_products AS (
      SELECT cc
      FROM product_dictionary
      CROSS JOIN params
      WHERE active
        AND settlement_source = 'ICE_SETTLEMENT'
        AND ice_symbol_pattern LIKE '%{%}%'
        AND ${productDictionaryScopePredicateSql("product_dictionary")}
    )
    SELECT to_char(MAX(settlements.trade_date), 'YYYY-MM-DD') AS latest_date
    FROM ice_python.settlements AS settlements
    WHERE
      settlements.symbol IN (SELECT ice_symbol_pattern FROM exact_products)
      OR LEFT(settlements.symbol, 3) IN (SELECT cc FROM futures_products);
  `;
}

function normalizeSummary(row: SummaryRow | undefined): DailySettlementsPayload["summary"] {
  return {
    rowCount: toNumber(row?.row_count) ?? 0,
    latestDate: row?.latest_date ?? null,
    latestUpdatedAt: row?.latest_updated_at ?? null,
  };
}

export async function GET(request: Request) {
  if (!isLocalOnlyFeatureEnabled()) {
    return NextResponse.json({ error: "ICE trade blotter is local-only while the settlement view is being validated." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const dateMode = parseDateMode(searchParams.get("mode"));
  const requestedStartDate = searchParams.get("start");
  const requestedEndDate = searchParams.get("end");
  const scope = parseIceTradeProductScope(searchParams.get("scope"));
  const refresh = searchParams.get("refresh") === "1";
  let cacheKey: string | null = null;

  try {
    const latestDateResult =
      isDateKey(requestedStartDate) && isDateKey(requestedEndDate)
        ? null
        : await query<LatestDateRow>(buildLatestSettlementDateSql(), [scope]);
    const defaultEnd = latestDateResult?.rows[0]?.latest_date ?? dateKey(now);
    const defaultStart = dateMode === "historical" ? dateDaysBefore(defaultEnd, 30) : defaultEnd;
    const startDate = parseDate(requestedStartDate, defaultStart);
    const endDate = parseDate(requestedEndDate, defaultEnd);
    cacheKey = [
      "ice-trade-blotter-daily-settlements",
      dateMode,
      startDate,
      endDate,
      scope,
    ].join(":");

    if (!refresh) {
      const cached = RESPONSE_CACHE.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.payload, {
          headers: { "Cache-Control": FRESH_CACHE_HEADER, "X-Ice-Trade-Blotter-Daily-Settlements-Cache": "HIT" },
        });
      }
    }

    const params = [startDate, endDate, scope];
    const [rowsResult, summaryResult] = await Promise.all([
      query<DailySettlementRow>(buildDailySettlementsSql(), params),
      query<SummaryRow>(buildSummarySql(), params),
    ]);
    const payload: DailySettlementsPayload = {
      startDate,
      endDate,
      scope,
      rowCount: rowsResult.rows.length,
      summary: normalizeSummary(summaryResult.rows[0]),
      rows: rowsResult.rows,
    };

    RESPONSE_CACHE.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload,
    });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": FRESH_CACHE_HEADER, "X-Ice-Trade-Blotter-Daily-Settlements-Cache": "MISS" },
    });
  } catch (error) {
    console.error("[ice-trade-blotter-daily-settlements] DB query failed:", error);
    const stale = cacheKey ? RESPONSE_CACHE.get(cacheKey) : undefined;
    if (stale) {
      return NextResponse.json(stale.payload, {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          "X-Ice-Trade-Blotter-Daily-Settlements-Cache": "STALE",
        },
      });
    }
    return NextResponse.json(
      {
        error: "Failed to fetch settlement data",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
