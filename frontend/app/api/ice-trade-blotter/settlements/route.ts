import { NextResponse } from "next/server";
import { query as serverQuery } from "@/lib/server/db";
import { buildProductDictionaryCte } from "@/lib/iceTradeBlotterProductDictionary";
import {
  normalizedContractScopePredicateSql,
  parseIceTradeProductScope,
  tradeTableScopePredicateSql,
  type IceTradeProductScope,
} from "@/lib/iceTradeBlotterRules";
import { buildNercOffPeakDaysValuesSql } from "@/lib/tradingCalendars/calendars/pjmPower";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_TTL_MS = 5 * 60 * 1000;
const FRESH_CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=120";
const RESPONSE_CACHE = new Map<string, { expiresAt: number; payload: IceTradeBlotterSettlementsPayload }>();

async function query<T>(text: string, values?: ReadonlyArray<unknown>): Promise<{ rows: T[] }> {
  return { rows: await serverQuery<T>(text, values) };
}

interface IceTradeBlotterSettlementRow {
  trade_date: string;
  trade_time: string;
  report_date: string;
  deal_id: string;
  leg_id: string;
  orig_id: string;
  link_id: string;
  b_s: string;
  product: string;
  hub: string;
  contract: string;
  begin_date: string;
  end_date: string;
  clearing_acct: string;
  cust_acct: string;
  clearing_firm: string;
  price: number;
  price_units: string;
  option: string;
  strike: number;
  strike_2: number;
  style: string;
  lots: number;
  total_quantity: number;
  qty_units: string;
  tt: string;
  brk: string;
  trader: string;
  memo: string;
  clearing_venue: string;
  user_id: string;
  source: string;
  usi: string;
  authorized_trader_id: string;
  location: string;
  meter: string;
  lead_time: string;
  waiver_ind: string;
  trade_time_micros: string;
  cdi_override: string;
  by_pass_mqr: string;
  broker_name: string;
  trading_company: string;
  mic: string;
  cc: string;
  strip: string;
  counterparty: string;
  qty_per_period: number;
  periods: number;
  counterparty_user: string;
  deal_section: string;
  file_hash: string;
  source_row_number: number;
  source_row_hash: string;
  created_at: string | null;
  updated_at: string | null;
  ice_symbol: string | null;
  asset_class: string | null;
  region: string | null;
  product_group: string | null;
  settlement_source: string | null;
  settlement_contract_family: string | null;
  settlement_source_key: string | null;
  settlement_match_status: string;
  active_mark_source: string | null;
  source_settlement_mark: number | string | null;
  ice_mark: number | string | null;
  ice_open: number | string | null;
  ice_high: number | string | null;
  ice_low: number | string | null;
  ice_close: number | string | null;
  ice_vwap_close: number | string | null;
  ice_volume: number | string | null;
  settlement_mark: number | string | null;
  settlement_pnl: number | string | null;
  expected_settlement_days: number | string | null;
  matched_settlement_days: number | string | null;
}

interface SummaryRow {
  row_count: number | string;
  distinct_deal_count: number | string;
  product_count: number | string;
  hub_count: number | string;
  contract_count: number | string;
  total_lots: number | string | null;
  total_quantity: number | string | null;
  latest_trade_date: string | null;
  latest_report_date: string | null;
  latest_updated_at: string | null;
  marked_row_count: number | string;
  total_settlement_pnl: number | string | null;
}

interface LatestDateRow {
  latest_date: string | null;
}

interface IceTradeBlotterSettlementsPayload {
  startDate: string;
  endDate: string;
  asOf: string;
  scope: IceTradeProductScope;
  trader: string | null;
  product: string | null;
  hub: string | null;
  contract: string | null;
  rowCount: number;
  summary: {
    rowCount: number;
    distinctDealCount: number;
    productCount: number;
    hubCount: number;
    contractCount: number;
    totalLots: number | null;
    totalQuantity: number | null;
    latestTradeDate: string | null;
    latestReportDate: string | null;
    latestUpdatedAt: string | null;
    markedRowCount: number;
    totalSettlementPnl: number | null;
  };
  filters: {
    traders: string[];
    products: string[];
    hubs: string[];
    contracts: string[];
  };
  rows: IceTradeBlotterSettlementRow[];
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

function parseOptionalText(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^[\w .:/()+,&'-]{1,120}$/.test(trimmed)) return null;
  return trimmed;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueSortedText<T>(rows: T[], select: (row: T) => string | null | undefined): string[] {
  return Array.from(
    new Set(
      rows
        .map((row) => select(row)?.trim() ?? "")
        .filter((value) => value.length > 0)
    )
  ).sort((first, second) => first.localeCompare(second));
}

function buildSettlementsSql(): string {
  return `
    WITH params AS NOT MATERIALIZED (
      SELECT
        $1::date AS start_trade_date,
        ($2::date + INTERVAL '1 day')::date AS end_trade_date,
        $3::text AS trader,
        $4::text AS product,
        $5::text AS hub,
        $6::text AS contract,
        $7::text AS product_scope,
        $8::date AS as_of_date,
        8::int AS onpeak_start_he,
        23::int AS onpeak_end_he,
        TRUE::boolean AS complete_onpeak_hours_only,
        FALSE::boolean AS include_non_onpeak_settle_days
    ),
    nerc_off_peak_days AS (
${buildNercOffPeakDaysValuesSql(2020, 2035)}
    ),
    ${buildProductDictionaryCte()},
    blotter_raw AS (
      SELECT
        concat_ws(':', trades.file_hash, trades.source_row_number::text, trades.deal_id, trades.leg_id) AS trade_row_key,
        trades.*
      FROM ice_trade_blotter.ice_trade_blotter AS trades
      CROSS JOIN params
      WHERE
        trades.trade_date >= params.start_trade_date
        AND trades.trade_date < params.end_trade_date
        AND (params.trader IS NULL OR trades.trader = params.trader)
        AND (params.product IS NULL OR trades.product = params.product)
        AND (params.hub IS NULL OR trades.hub = params.hub)
        AND (params.contract IS NULL OR trades.contract = params.contract)
        AND ${tradeTableScopePredicateSql("trades")}
    ),
    blotter_normalized AS (
      SELECT
        blotter_raw.*,
        CASE
          WHEN regexp_replace(LOWER(BTRIM(blotter_raw.contract)), '[^a-z0-9]+', '', 'g') IN ('he0800he2300', 'he08002300') THEN 'D0'
          WHEN LOWER(BTRIM(blotter_raw.contract)) IN ('bal day', 'balance of day') THEN 'D0'
          WHEN LOWER(BTRIM(blotter_raw.contract)) = 'next day' THEN 'D1'
          WHEN LOWER(BTRIM(blotter_raw.contract)) IN ('bal week', 'balance of week') THEN 'W0'
          WHEN LOWER(BTRIM(blotter_raw.contract)) IN ('next week', 'week 1') THEN 'W1'
          WHEN LOWER(BTRIM(blotter_raw.contract)) IN ('2nd week', 'second week', 'week 2') THEN 'W2'
          WHEN LOWER(BTRIM(blotter_raw.contract)) IN ('3rd week', 'third week', 'week 3') THEN 'W3'
          WHEN LOWER(BTRIM(blotter_raw.contract)) IN ('4th week', 'fourth week', 'week 4') THEN 'W4'
          WHEN regexp_replace(LOWER(BTRIM(blotter_raw.contract)), '[^a-z0-9]+', '', 'g') IN ('weekend2x16', 'wknd2x16', '2x16') THEN 'P1'
          ELSE NULL
        END AS settlement_contract_code,
        CASE
          WHEN blotter_raw.begin_date ~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}' THEN to_date(SUBSTRING(blotter_raw.begin_date FROM 1 FOR 10), 'YYYY-MM-DD')
          WHEN blotter_raw.begin_date ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN to_date(blotter_raw.begin_date, 'MM/DD/YYYY')
          WHEN blotter_raw.begin_date ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}$' THEN to_date(blotter_raw.begin_date, 'MM/DD/YY')
          WHEN blotter_raw.begin_date ~ '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}$' THEN to_date(blotter_raw.begin_date, 'MM-DD-YYYY')
          WHEN blotter_raw.begin_date ~ '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{2}$' THEN to_date(blotter_raw.begin_date, 'MM-DD-YY')
          WHEN blotter_raw.begin_date ~ '^[0-9]{1,2}-[A-Za-z]{3,9}-[0-9]{4}$' THEN to_date(blotter_raw.begin_date, 'DD-Mon-YYYY')
          WHEN blotter_raw.begin_date ~ '^[0-9]{1,2}-[A-Za-z]{3,9}-[0-9]{2}$' THEN to_date(blotter_raw.begin_date, 'DD-Mon-YY')
          WHEN blotter_raw.begin_date ~ '^[A-Za-z]{3,9}[ -]+[0-9]{1,2},?[ -]+[0-9]{4}$' THEN to_date(replace(blotter_raw.begin_date, ',', ''), 'Mon DD YYYY')
          WHEN blotter_raw.begin_date ~ '^[A-Za-z]{3,9}[ -]+[0-9]{1,2},?[ -]+[0-9]{2}$' THEN to_date(replace(blotter_raw.begin_date, ',', ''), 'Mon DD YY')
          ELSE NULL
        END AS begin_delivery_date,
        CASE
          WHEN blotter_raw.end_date ~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}' THEN to_date(SUBSTRING(blotter_raw.end_date FROM 1 FOR 10), 'YYYY-MM-DD')
          WHEN blotter_raw.end_date ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN to_date(blotter_raw.end_date, 'MM/DD/YYYY')
          WHEN blotter_raw.end_date ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}$' THEN to_date(blotter_raw.end_date, 'MM/DD/YY')
          WHEN blotter_raw.end_date ~ '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}$' THEN to_date(blotter_raw.end_date, 'MM-DD-YYYY')
          WHEN blotter_raw.end_date ~ '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{2}$' THEN to_date(blotter_raw.end_date, 'MM-DD-YY')
          WHEN blotter_raw.end_date ~ '^[0-9]{1,2}-[A-Za-z]{3,9}-[0-9]{4}$' THEN to_date(blotter_raw.end_date, 'DD-Mon-YYYY')
          WHEN blotter_raw.end_date ~ '^[0-9]{1,2}-[A-Za-z]{3,9}-[0-9]{2}$' THEN to_date(blotter_raw.end_date, 'DD-Mon-YY')
          WHEN blotter_raw.end_date ~ '^[A-Za-z]{3,9}[ -]+[0-9]{1,2},?[ -]+[0-9]{4}$' THEN to_date(replace(blotter_raw.end_date, ',', ''), 'Mon DD YYYY')
          WHEN blotter_raw.end_date ~ '^[A-Za-z]{3,9}[ -]+[0-9]{1,2},?[ -]+[0-9]{2}$' THEN to_date(replace(blotter_raw.end_date, ',', ''), 'Mon DD YY')
          ELSE NULL
        END AS end_delivery_date,
        CASE
          WHEN LOWER(BTRIM(blotter_raw.b_s)) IN ('s', 'sell', 'sold') THEN -ABS(blotter_raw.total_quantity)
          ELSE ABS(blotter_raw.total_quantity)
        END AS signed_quantity
      FROM blotter_raw
    ),
    blotter_with_symbols AS (
      SELECT
        blotter_normalized.*,
        product_dictionary.ice_symbol_pattern,
        product_dictionary.product_name AS settlement_product_name,
        COALESCE(
          product_dictionary.asset_class,
          CASE
            WHEN UPPER(BTRIM(blotter_normalized.cc)) IN ('H', 'HNG', 'PHE', 'TRZ', 'TFL', 'CGB', 'CGM', 'TWB', 'HXS', 'WAH', 'NTO', 'ALQ', 'TMT', 'T5B', 'IZB', 'TZS', 'DOM', 'SCB', 'PGE', 'CRI')
              OR LOWER(BTRIM(blotter_normalized.product)) LIKE '%gas%'
              THEN 'Gas'
            ELSE 'Power'
          END
        ) AS asset_class,
        COALESCE(
          product_dictionary.region,
          CASE
            WHEN UPPER(BTRIM(blotter_normalized.cc)) IN ('H', 'HNG', 'PHE', 'XGF')
              OR LOWER(BTRIM(blotter_normalized.hub)) LIKE '%henry%'
              OR LOWER(BTRIM(blotter_normalized.product)) LIKE '%henry%'
              THEN 'Henry Hub'
            WHEN UPPER(BTRIM(blotter_normalized.cc)) IN ('TRZ', 'TFL', 'CGB', 'CGM', 'TWB', 'HXS', 'WAH', 'NTO', 'ALQ', 'TMT', 'T5B', 'IZB', 'TZS', 'DOM', 'SCB', 'PGE', 'CRI')
              OR LOWER(BTRIM(blotter_normalized.product)) LIKE '%gas%'
              THEN 'Basis'
            WHEN UPPER(BTRIM(blotter_normalized.cc)) IN ('PMI', 'OPJ', 'P1X', 'PDP', 'PWA', 'PDA', 'PJL', 'PDO', 'ODP') THEN 'PJM'
            WHEN UPPER(BTRIM(blotter_normalized.cc)) IN ('ERN', 'ECI', 'END', 'ERA', 'NDA', 'NED') THEN 'ERCOT'
            ELSE NULL
          END,
          NULLIF(BTRIM(blotter_normalized.hub), '')
        ) AS region,
        product_dictionary.product_group,
        product_dictionary.market AS settlement_market,
        product_dictionary.pjm_pnode_name,
        product_dictionary.contract_family AS settlement_contract_family,
        product_dictionary.contract_label AS settlement_contract_label,
        product_dictionary.hour_bucket AS settlement_hour_bucket,
        product_dictionary.settlement_source,
        product_dictionary.settlement_source_key,
        product_dictionary.settlement_priority,
        CASE
          WHEN product_dictionary.settlement_source = 'ICE_OPTION_SETTLEMENT'
            AND BTRIM(blotter_normalized.contract) ~* '^[A-Za-z]{3,4}[0-9]{2}$'
            AND LOWER(BTRIM(COALESCE(blotter_normalized.option, ''))) IN ('put', 'p', 'call', 'c')
            AND blotter_normalized.strike IS NOT NULL
            THEN SPLIT_PART(product_dictionary.ice_symbol_pattern, ' ', 1) || ' ' ||
              CASE SUBSTRING(LOWER(BTRIM(blotter_normalized.contract)) FROM 1 FOR 3)
                WHEN 'jan' THEN 'F'
                WHEN 'feb' THEN 'G'
                WHEN 'mar' THEN 'H'
                WHEN 'apr' THEN 'J'
                WHEN 'may' THEN 'K'
                WHEN 'jun' THEN 'M'
                WHEN 'jul' THEN 'N'
                WHEN 'aug' THEN 'Q'
                WHEN 'sep' THEN 'U'
                WHEN 'oct' THEN 'V'
                WHEN 'nov' THEN 'X'
                WHEN 'dec' THEN 'Z'
                ELSE ''
              END ||
              SUBSTRING(BTRIM(blotter_normalized.contract) FROM '[0-9]{2}$') ||
              CASE LOWER(BTRIM(COALESCE(blotter_normalized.option, '')))
                WHEN 'put' THEN 'P'
                WHEN 'p' THEN 'P'
                WHEN 'call' THEN 'C'
                WHEN 'c' THEN 'C'
                ELSE ''
              END ||
              CASE
                WHEN blotter_normalized.strike::numeric = TRUNC(blotter_normalized.strike::numeric)
                  THEN TRUNC(blotter_normalized.strike::numeric)::text
                ELSE TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM blotter_normalized.strike::numeric::text))
              END ||
              '-IUS'
          WHEN product_dictionary.contract_code = 'MONTH'
            AND BTRIM(blotter_normalized.contract) ~* '^[A-Za-z]{3}[0-9]{2}$'
            THEN SPLIT_PART(product_dictionary.ice_symbol_pattern, ' ', 1) || ' ' ||
              CASE SUBSTRING(LOWER(BTRIM(blotter_normalized.contract)) FROM 1 FOR 3)
                WHEN 'jan' THEN 'F'
                WHEN 'feb' THEN 'G'
                WHEN 'mar' THEN 'H'
                WHEN 'apr' THEN 'J'
                WHEN 'may' THEN 'K'
                WHEN 'jun' THEN 'M'
                WHEN 'jul' THEN 'N'
                WHEN 'aug' THEN 'Q'
                WHEN 'sep' THEN 'U'
                WHEN 'oct' THEN 'V'
                WHEN 'nov' THEN 'X'
                WHEN 'dec' THEN 'Z'
                ELSE ''
              END ||
              SUBSTRING(BTRIM(blotter_normalized.contract) FROM '[0-9]{2}$') ||
              '-IUS'
          WHEN product_dictionary.ice_symbol_pattern NOT LIKE '%{%}%'
            THEN product_dictionary.ice_symbol_pattern
          ELSE NULL
        END AS ice_symbol
      FROM blotter_normalized
      CROSS JOIN params
      LEFT JOIN product_dictionary
        ON product_dictionary.active
       AND product_dictionary.cc = UPPER(BTRIM(blotter_normalized.cc))
       AND (
         LOWER(BTRIM(blotter_normalized.hub)) = ANY(product_dictionary.blotter_hub_aliases)
         OR CARDINALITY(product_dictionary.blotter_hub_aliases) = 0
       )
       AND (
         product_dictionary.contract_code = blotter_normalized.settlement_contract_code
         OR (
           product_dictionary.settlement_source = 'ICE_OPTION_SETTLEMENT'
           AND NULLIF(BTRIM(blotter_normalized.option), '') IS NOT NULL
           AND BTRIM(blotter_normalized.contract) ~* '^[A-Za-z]{3,4}[0-9]{2}$'
         )
         OR (
           product_dictionary.contract_code = 'MONTH'
           AND NULLIF(BTRIM(blotter_normalized.option), '') IS NULL
           AND BTRIM(blotter_normalized.contract) ~* '^[A-Za-z]{3}[0-9]{2}$'
          )
      )
      WHERE ${normalizedContractScopePredicateSql(
        "blotter_normalized.cc",
        "blotter_normalized.settlement_contract_code"
      )}
    ),
    blotter_with_contract_dates AS (
      SELECT
        blotter_with_symbols.*,
        contract_dates.start_date AS contract_begin_delivery_date,
        contract_dates.end_date AS contract_end_delivery_date
      FROM blotter_with_symbols
      LEFT JOIN ice_python.settlement_contract_dates AS contract_dates
        ON contract_dates.trade_date = blotter_with_symbols.trade_date
       AND contract_dates.symbol = blotter_with_symbols.ice_symbol
    ),
    blotter_scope AS (
      SELECT *
      FROM blotter_with_contract_dates
      WHERE
        settlement_source IS NOT NULL
        AND (
          settlement_source = 'ICE_SETTLEMENT'
          OR settlement_source = 'ICE_OPTION_SETTLEMENT'
          OR (
            COALESCE(begin_delivery_date, contract_begin_delivery_date) IS NOT NULL
            AND COALESCE(end_delivery_date, contract_end_delivery_date) IS NOT NULL
          )
        )
    ),
    blotter_delivery_bounds AS (
      SELECT
        MIN(COALESCE(begin_delivery_date, contract_begin_delivery_date)) AS min_delivery_date,
        MAX(COALESCE(end_delivery_date, contract_end_delivery_date)) AS max_delivery_date
      FROM blotter_scope
      WHERE settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP', 'ERCOT_RT_LMP', 'ERCOT_DA_LMP')
    ),
    da_hourly AS MATERIALIZED (
      SELECT
        'pjm_da_onpeak'::text AS settlement_source_key,
        lmps.datetime_beginning_ept::date AS market_date,
        lmps.pnode_name AS pjm_hub,
        'da'::text AS lmp_source,
        lmps.total_lmp_da AS total_lmp,
        lmps.updated_at AS source_updated_at
      FROM pjm.da_hrl_lmps AS lmps
      CROSS JOIN params
      CROSS JOIN blotter_delivery_bounds AS bounds
      WHERE
        lmps.row_is_current = TRUE
        AND lmps.pnode_name = 'WESTERN HUB'
        AND lmps.datetime_beginning_ept::date >= COALESCE(bounds.min_delivery_date, params.start_trade_date)
        AND lmps.datetime_beginning_ept::date <= COALESCE(bounds.max_delivery_date, params.end_trade_date)
        AND (EXTRACT(HOUR FROM lmps.datetime_beginning_ept) + 1)::int BETWEEN params.onpeak_start_he AND params.onpeak_end_he
    ),
    da_offpeak_hourly AS MATERIALIZED (
      SELECT
        'pjm_da_offpeak'::text AS settlement_source_key,
        lmps.datetime_beginning_ept::date AS market_date,
        lmps.pnode_name AS pjm_hub,
        'da'::text AS lmp_source,
        lmps.total_lmp_da AS total_lmp,
        lmps.updated_at AS source_updated_at
      FROM pjm.da_hrl_lmps AS lmps
      CROSS JOIN params
      CROSS JOIN blotter_delivery_bounds AS bounds
      WHERE
        lmps.row_is_current = TRUE
        AND lmps.pnode_name = 'WESTERN HUB'
        AND lmps.datetime_beginning_ept::date >= COALESCE(bounds.min_delivery_date, params.start_trade_date)
        AND lmps.datetime_beginning_ept::date <= COALESCE(bounds.max_delivery_date, params.end_trade_date)
        AND (
          (EXTRACT(HOUR FROM lmps.datetime_beginning_ept) + 1)::int BETWEEN 1 AND 7
          OR (EXTRACT(HOUR FROM lmps.datetime_beginning_ept) + 1)::int = 24
        )
    ),
    da_offpeak_weekend_hourly AS MATERIALIZED (
      SELECT
        'pjm_da_offpeak_weekend_16'::text AS settlement_source_key,
        lmps.datetime_beginning_ept::date AS market_date,
        lmps.pnode_name AS pjm_hub,
        'da'::text AS lmp_source,
        lmps.total_lmp_da AS total_lmp,
        lmps.updated_at AS source_updated_at
      FROM pjm.da_hrl_lmps AS lmps
      CROSS JOIN params
      CROSS JOIN blotter_delivery_bounds AS bounds
      WHERE
        lmps.row_is_current = TRUE
        AND lmps.pnode_name = 'WESTERN HUB'
        AND lmps.datetime_beginning_ept::date >= COALESCE(bounds.min_delivery_date, params.start_trade_date)
        AND lmps.datetime_beginning_ept::date <= COALESCE(bounds.max_delivery_date, params.end_trade_date)
        AND (EXTRACT(HOUR FROM lmps.datetime_beginning_ept) + 1)::int BETWEEN params.onpeak_start_he AND params.onpeak_end_he
    ),
    rt_verified AS (
      SELECT
        lmps.datetime_beginning_utc,
        lmps.datetime_beginning_ept,
        lmps.datetime_beginning_ept::date AS market_date,
        lmps.pnode_name AS pjm_hub,
        'verified'::text AS lmp_source,
        1::int AS source_priority,
        lmps.version_nbr,
        lmps.total_lmp_rt AS total_lmp,
        lmps.updated_at AS source_updated_at
      FROM pjm.rt_hrl_lmps AS lmps
      CROSS JOIN params
      CROSS JOIN blotter_delivery_bounds AS bounds
      WHERE
        lmps.row_is_current = TRUE
        AND lmps.pnode_name = 'WESTERN HUB'
        AND lmps.datetime_beginning_ept >= COALESCE(bounds.min_delivery_date, params.start_trade_date)::timestamp
        AND lmps.datetime_beginning_ept < (COALESCE(bounds.max_delivery_date, params.end_trade_date) + 1)::timestamp
    ),
    rt_unverified AS (
      SELECT
        lmps.datetime_beginning_utc,
        lmps.datetime_beginning_ept,
        lmps.datetime_beginning_ept::date AS market_date,
        lmps.pnode_name AS pjm_hub,
        'unverified'::text AS lmp_source,
        2::int AS source_priority,
        NULL::bigint AS version_nbr,
        lmps.total_lmp_rt AS total_lmp,
        lmps.updated_at AS source_updated_at
      FROM pjm.rt_unverified_hrl_lmps AS lmps
      CROSS JOIN params
      CROSS JOIN blotter_delivery_bounds AS bounds
      WHERE
        lmps.pnode_name = 'WESTERN HUB'
        AND lmps.datetime_beginning_ept >= COALESCE(bounds.min_delivery_date, params.start_trade_date)::timestamp
        AND lmps.datetime_beginning_ept < (COALESCE(bounds.max_delivery_date, params.end_trade_date) + 1)::timestamp
    ),
    rt_ranked AS (
      SELECT
        combined.*,
        ROW_NUMBER() OVER (
          PARTITION BY combined.datetime_beginning_utc, combined.pjm_hub
          ORDER BY combined.source_priority, combined.version_nbr DESC NULLS LAST
        ) AS source_rank
      FROM (
        SELECT * FROM rt_verified
        UNION ALL
        SELECT * FROM rt_unverified
      ) AS combined
    ),
    rt_hourly AS MATERIALIZED (
      SELECT
        'pjm_rt_onpeak'::text AS settlement_source_key,
        rt_ranked.market_date,
        rt_ranked.pjm_hub,
        rt_ranked.lmp_source,
        rt_ranked.total_lmp,
        rt_ranked.source_updated_at
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
        rt_ranked.pjm_hub,
        rt_ranked.lmp_source,
        rt_ranked.total_lmp,
        rt_ranked.source_updated_at
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
        rt_ranked.pjm_hub,
        rt_ranked.lmp_source,
        rt_ranked.total_lmp,
        rt_ranked.source_updated_at
      FROM rt_ranked
      CROSS JOIN params
      WHERE
        rt_ranked.source_rank = 1
        AND (EXTRACT(HOUR FROM rt_ranked.datetime_beginning_ept) + 1)::int BETWEEN params.onpeak_start_he AND params.onpeak_end_he
    ),
    hourly AS MATERIALIZED (
      SELECT * FROM da_hourly
      UNION ALL
      SELECT * FROM da_offpeak_hourly
      UNION ALL
      SELECT * FROM da_offpeak_weekend_hourly
      UNION ALL
      SELECT * FROM rt_hourly
      UNION ALL
      SELECT * FROM rt_offpeak_hourly
      UNION ALL
      SELECT * FROM rt_offpeak_weekend_hourly
    ),
    pjm_daily_settlements AS (
      SELECT
        hourly.settlement_source_key,
        hourly.market_date AS settlement_date,
        AVG(hourly.total_lmp) AS settlement,
        COUNT(*) AS hours_present,
        CASE
          WHEN hourly.settlement_source_key IN ('pjm_rt_offpeak', 'pjm_da_offpeak') THEN 8
          ELSE params.onpeak_end_he - params.onpeak_start_he + 1
        END AS expected_hours,
        MAX(hourly.source_updated_at) AS latest_source_updated_at,
        EXTRACT(ISODOW FROM hourly.market_date)::int IN (6, 7) AS is_weekend,
        dates.holiday_date IS NOT NULL AS excludes_pjm_onpeak_settle
      FROM hourly
      CROSS JOIN params
      LEFT JOIN nerc_off_peak_days AS dates
        ON dates.holiday_date = hourly.market_date
      GROUP BY
        hourly.settlement_source_key,
        hourly.market_date,
        dates.holiday_date,
        params.onpeak_start_he,
        params.onpeak_end_he
    ),
    ercot_rt_hourly AS MATERIALIZED (
      SELECT
        CASE
          WHEN rt_hourly.hour_ending BETWEEN 7 AND 22 THEN 'ercot_rt_north_onpeak'
          ELSE 'ercot_rt_north_offpeak'
        END AS settlement_source_key,
        rt_hourly.market_date AS settlement_date,
        rt_hourly.total_lmp,
        rt_hourly.source_updated_at
      FROM (
        SELECT
          prices.deliverydate::date AS market_date,
          prices.deliveryhour::int AS hour_ending,
          AVG(prices.settlementpointprice) AS total_lmp,
          MAX(prices.updated_at)::timestamp AS source_updated_at,
          COUNT(*) AS interval_count
        FROM ercot.rt_spp_all_nodes AS prices
        CROSS JOIN params
        CROSS JOIN blotter_delivery_bounds AS bounds
        WHERE
          prices.settlementpoint = 'HB_NORTH'
          AND prices.deliverydate::date >= COALESCE(bounds.min_delivery_date, params.start_trade_date)
          AND prices.deliverydate::date <= COALESCE(bounds.max_delivery_date, params.end_trade_date)
        GROUP BY prices.deliverydate::date, prices.deliveryhour::int
      ) AS rt_hourly
      WHERE rt_hourly.interval_count >= 4
    ),
    ercot_da_hourly AS MATERIALIZED (
      SELECT
        'ercot_da_north_onpeak'::text AS settlement_source_key,
        prices.deliverydate::date AS settlement_date,
        prices.settlementpointprice AS total_lmp,
        prices.updated_at::timestamp AS source_updated_at
      FROM ercot.dam_stlmnt_pnt_prices AS prices
      CROSS JOIN params
      CROSS JOIN blotter_delivery_bounds AS bounds
      WHERE
        prices.settlementpoint = 'HB_NORTH'
        AND prices.deliverydate::date >= COALESCE(bounds.min_delivery_date, params.start_trade_date)
        AND prices.deliverydate::date <= COALESCE(bounds.max_delivery_date, params.end_trade_date)
        AND prices.hourending BETWEEN 7 AND 22
    ),
    ercot_hourly AS MATERIALIZED (
      SELECT * FROM ercot_rt_hourly
      UNION ALL
      SELECT * FROM ercot_da_hourly
    ),
    ercot_daily_settlements AS (
      SELECT
        ercot_hourly.settlement_source_key,
        ercot_hourly.settlement_date,
        AVG(ercot_hourly.total_lmp) AS settlement,
        COUNT(*) AS hours_present,
        CASE
          WHEN ercot_hourly.settlement_source_key = 'ercot_rt_north_offpeak' THEN 8
          ELSE 16
        END AS expected_hours,
        MAX(ercot_hourly.source_updated_at) AS latest_source_updated_at,
        FALSE AS is_weekend,
        FALSE AS excludes_pjm_onpeak_settle
      FROM ercot_hourly
      GROUP BY ercot_hourly.settlement_source_key, ercot_hourly.settlement_date
    ),
    iso_daily_settlements AS (
      SELECT * FROM pjm_daily_settlements
      UNION ALL
      SELECT * FROM ercot_daily_settlements
    ),
    eligible_delivery_days AS (
      SELECT
        blotter_scope.trade_row_key,
        calendar.delivery_date::date AS delivery_date
      FROM blotter_scope
      CROSS JOIN LATERAL generate_series(
        COALESCE(blotter_scope.begin_delivery_date, blotter_scope.contract_begin_delivery_date),
        COALESCE(blotter_scope.end_delivery_date, blotter_scope.contract_end_delivery_date),
        INTERVAL '1 day'
      ) AS calendar(delivery_date)
      LEFT JOIN nerc_off_peak_days AS dates
          ON dates.holiday_date = calendar.delivery_date::date
      CROSS JOIN params
      WHERE
        blotter_scope.asset_class = 'Power'
        AND blotter_scope.region = 'ERCOT'
        OR
        blotter_scope.settlement_hour_bucket = 'OFFPEAK'
        OR
        params.include_non_onpeak_settle_days
        OR (
          EXTRACT(ISODOW FROM calendar.delivery_date)::int NOT IN (6, 7)
          AND dates.holiday_date IS NULL
        )
    ),
    matched_marks AS (
      SELECT
        blotter_scope.trade_row_key,
        COUNT(DISTINCT eligible_delivery_days.delivery_date) AS expected_settlement_days,
        COUNT(DISTINCT iso_daily_settlements.settlement_date) AS matched_settlement_days,
        AVG(iso_daily_settlements.settlement) AS settlement_mark
      FROM blotter_scope
      CROSS JOIN params
      LEFT JOIN eligible_delivery_days
        ON eligible_delivery_days.trade_row_key = blotter_scope.trade_row_key
      LEFT JOIN iso_daily_settlements
        ON iso_daily_settlements.settlement_source_key = CASE
          WHEN blotter_scope.settlement_contract_code = 'P1'
            AND blotter_scope.settlement_source_key = 'pjm_da_offpeak'
            THEN 'pjm_da_offpeak_weekend_16'
          WHEN blotter_scope.settlement_contract_code = 'P1'
            AND blotter_scope.settlement_source_key = 'pjm_rt_offpeak'
            THEN 'pjm_rt_offpeak_weekend_16'
          ELSE blotter_scope.settlement_source_key
        END
       AND iso_daily_settlements.settlement_date = eligible_delivery_days.delivery_date
       AND (
         NOT params.complete_onpeak_hours_only
         OR iso_daily_settlements.hours_present = iso_daily_settlements.expected_hours
       )
      GROUP BY blotter_scope.trade_row_key
    ),
    ice_settlement_marks AS (
      SELECT
        blotter_scope.trade_row_key,
        blotter_scope.ice_symbol,
        settlements.symbol AS matched_ice_symbol,
        COALESCE(NULLIF(settlements.settlement::text, 'NaN')::double precision, settlements.vwap_close) AS ice_mark,
        settlements.settlement AS raw_ice_settlement,
        NULLIF(settlements.open::text, 'NaN')::double precision AS ice_open,
        NULLIF(settlements.high::text, 'NaN')::double precision AS ice_high,
        NULLIF(settlements.low::text, 'NaN')::double precision AS ice_low,
        NULLIF(settlements.close::text, 'NaN')::double precision AS ice_close,
        NULLIF(settlements.vwap_close::text, 'NaN')::double precision AS ice_vwap_close,
        settlements.volume AS ice_volume,
        settlements.updated_at AS settlement_updated_at
      FROM blotter_scope
      LEFT JOIN ice_python.settlements AS settlements
        ON settlements.trade_date = blotter_scope.trade_date
       AND settlements.symbol = blotter_scope.ice_symbol
      WHERE blotter_scope.ice_symbol IS NOT NULL
    ),
    option_settlement_marks AS (
      SELECT
        blotter_scope.trade_row_key,
        blotter_scope.ice_symbol,
        option_settlements.symbol AS matched_ice_symbol,
        COALESCE(
          NULLIF(option_settlements.settlement::text, 'NaN')::double precision,
          option_settlements.last,
          option_settlements.vwap_close,
          option_settlements.close
        ) AS option_mark,
        option_settlements.settlement AS raw_option_settlement,
        option_settlements.open AS option_open,
        option_settlements.high AS option_high,
        option_settlements.low AS option_low,
        option_settlements.close AS option_close,
        option_settlements.vwap_close AS option_vwap_close,
        option_settlements.volume AS option_volume,
        option_settlements.updated_at AS settlement_updated_at
      FROM blotter_scope
      LEFT JOIN ice_python.option_settlements AS option_settlements
        ON option_settlements.trade_date = blotter_scope.trade_date
       AND option_settlements.symbol = blotter_scope.ice_symbol
      WHERE
        blotter_scope.settlement_source = 'ICE_OPTION_SETTLEMENT'
        AND blotter_scope.ice_symbol IS NOT NULL
    ),
    final_rows AS (
      SELECT
        blotter_with_contract_dates.*,
        matched_marks.expected_settlement_days,
        matched_marks.matched_settlement_days,
        CASE
          WHEN blotter_with_contract_dates.settlement_source = 'ICE_OPTION_SETTLEMENT'
            THEN option_settlement_marks.option_mark
          ELSE matched_marks.settlement_mark
        END AS source_settlement_mark,
        COALESCE(ice_settlement_marks.ice_mark, option_settlement_marks.option_mark) AS ice_mark,
        COALESCE(ice_settlement_marks.ice_open, option_settlement_marks.option_open) AS ice_open,
        COALESCE(ice_settlement_marks.ice_high, option_settlement_marks.option_high) AS ice_high,
        COALESCE(ice_settlement_marks.ice_low, option_settlement_marks.option_low) AS ice_low,
        COALESCE(ice_settlement_marks.ice_close, option_settlement_marks.option_close) AS ice_close,
        COALESCE(ice_settlement_marks.ice_vwap_close, option_settlement_marks.option_vwap_close) AS ice_vwap_close,
        COALESCE(ice_settlement_marks.ice_volume, option_settlement_marks.option_volume) AS ice_volume,
        CASE
          WHEN blotter_with_contract_dates.settlement_source = 'PJM_DA_LMP'
            AND matched_marks.expected_settlement_days > 0
            AND matched_marks.matched_settlement_days = matched_marks.expected_settlement_days
            AND matched_marks.settlement_mark IS NOT NULL
            THEN matched_marks.settlement_mark
          WHEN blotter_with_contract_dates.settlement_source = 'PJM_RT_LMP'
            AND matched_marks.expected_settlement_days > 0
            AND matched_marks.matched_settlement_days = matched_marks.expected_settlement_days
            AND matched_marks.settlement_mark IS NOT NULL
            AND COALESCE(blotter_with_contract_dates.end_delivery_date, blotter_with_contract_dates.contract_end_delivery_date) < params.as_of_date
            THEN matched_marks.settlement_mark
          WHEN blotter_with_contract_dates.settlement_source IN ('ERCOT_DA_LMP', 'ERCOT_RT_LMP')
            AND matched_marks.expected_settlement_days > 0
            AND matched_marks.matched_settlement_days = matched_marks.expected_settlement_days
            AND matched_marks.settlement_mark IS NOT NULL
            THEN matched_marks.settlement_mark
          WHEN blotter_with_contract_dates.settlement_source = 'ICE_SETTLEMENT'
            THEN ice_settlement_marks.ice_mark
          WHEN blotter_with_contract_dates.settlement_source = 'ICE_OPTION_SETTLEMENT'
            THEN option_settlement_marks.option_mark
          ELSE NULL
        END AS settlement_mark,
        CASE
          WHEN blotter_with_contract_dates.settlement_source = 'PJM_DA_LMP'
            AND matched_marks.expected_settlement_days > 0
            AND matched_marks.matched_settlement_days = matched_marks.expected_settlement_days
            AND matched_marks.settlement_mark IS NOT NULL
            THEN 'PJM_DA_LMP'
          WHEN blotter_with_contract_dates.settlement_source = 'PJM_RT_LMP'
            AND matched_marks.expected_settlement_days > 0
            AND matched_marks.matched_settlement_days = matched_marks.expected_settlement_days
            AND matched_marks.settlement_mark IS NOT NULL
            AND COALESCE(blotter_with_contract_dates.end_delivery_date, blotter_with_contract_dates.contract_end_delivery_date) < params.as_of_date
            THEN 'PJM_RT_LMP'
          WHEN blotter_with_contract_dates.settlement_source = 'ERCOT_DA_LMP'
            AND matched_marks.expected_settlement_days > 0
            AND matched_marks.matched_settlement_days = matched_marks.expected_settlement_days
            AND matched_marks.settlement_mark IS NOT NULL
            THEN 'ERCOT_DA_LMP'
          WHEN blotter_with_contract_dates.settlement_source = 'ERCOT_RT_LMP'
            AND matched_marks.expected_settlement_days > 0
            AND matched_marks.matched_settlement_days = matched_marks.expected_settlement_days
            AND matched_marks.settlement_mark IS NOT NULL
            THEN 'ERCOT_RT_LMP'
          WHEN blotter_with_contract_dates.settlement_source = 'ICE_SETTLEMENT'
            AND ice_settlement_marks.ice_mark IS NOT NULL THEN 'ICE_MARK'
          WHEN blotter_with_contract_dates.settlement_source = 'ICE_OPTION_SETTLEMENT'
            AND option_settlement_marks.option_mark IS NOT NULL THEN 'ICE_OPTION_MARK'
          ELSE NULL
        END AS active_mark_source,
        CASE
          WHEN blotter_with_contract_dates.settlement_source IS NULL THEN 'not_supported'
          WHEN blotter_with_contract_dates.settlement_source = 'ICE_SETTLEMENT'
            AND blotter_with_contract_dates.ice_symbol IS NULL THEN 'no_ice_symbol'
          WHEN blotter_with_contract_dates.settlement_source = 'ICE_SETTLEMENT'
            AND ice_settlement_marks.matched_ice_symbol IS NOT NULL
            AND ice_settlement_marks.ice_mark IS NOT NULL THEN 'matched'
          WHEN blotter_with_contract_dates.settlement_source = 'ICE_SETTLEMENT'
            AND ice_settlement_marks.matched_ice_symbol IS NOT NULL THEN 'pending_settlement'
          WHEN blotter_with_contract_dates.settlement_source = 'ICE_SETTLEMENT' THEN 'no_settlement_match'
          WHEN blotter_with_contract_dates.settlement_source = 'ICE_OPTION_SETTLEMENT'
            AND blotter_with_contract_dates.ice_symbol IS NULL THEN 'no_option_symbol'
          WHEN blotter_with_contract_dates.settlement_source = 'ICE_OPTION_SETTLEMENT'
            AND option_settlement_marks.matched_ice_symbol IS NOT NULL
            AND option_settlement_marks.option_mark IS NOT NULL THEN 'matched'
          WHEN blotter_with_contract_dates.settlement_source = 'ICE_OPTION_SETTLEMENT'
            AND option_settlement_marks.matched_ice_symbol IS NOT NULL THEN 'pending_settlement'
          WHEN blotter_with_contract_dates.settlement_source = 'ICE_OPTION_SETTLEMENT' THEN 'no_settlement_match'
          WHEN COALESCE(blotter_with_contract_dates.begin_delivery_date, blotter_with_contract_dates.contract_begin_delivery_date) IS NULL
            OR COALESCE(blotter_with_contract_dates.end_delivery_date, blotter_with_contract_dates.contract_end_delivery_date) IS NULL THEN 'invalid_delivery_dates'
          WHEN matched_marks.expected_settlement_days = 0 THEN 'no_eligible_settlement_days'
          WHEN blotter_with_contract_dates.settlement_source = 'PJM_DA_LMP'
            AND matched_marks.matched_settlement_days = matched_marks.expected_settlement_days
            AND matched_marks.settlement_mark IS NOT NULL THEN 'matched'
          WHEN blotter_with_contract_dates.settlement_source = 'PJM_RT_LMP'
            AND matched_marks.matched_settlement_days = matched_marks.expected_settlement_days
            AND matched_marks.settlement_mark IS NOT NULL
            AND COALESCE(blotter_with_contract_dates.end_delivery_date, blotter_with_contract_dates.contract_end_delivery_date) < params.as_of_date THEN 'matched'
          WHEN blotter_with_contract_dates.settlement_source = 'PJM_RT_LMP'
            AND matched_marks.matched_settlement_days = matched_marks.expected_settlement_days
            AND matched_marks.settlement_mark IS NOT NULL THEN 'pending_settlement'
          WHEN blotter_with_contract_dates.settlement_source IN ('ERCOT_DA_LMP', 'ERCOT_RT_LMP')
            AND matched_marks.matched_settlement_days = matched_marks.expected_settlement_days
            AND matched_marks.settlement_mark IS NOT NULL THEN 'matched'
          WHEN matched_marks.matched_settlement_days = 0 THEN 'no_settlement_match'
          WHEN matched_marks.matched_settlement_days < matched_marks.expected_settlement_days THEN 'partial_settlement_match'
          ELSE 'matched'
        END AS settlement_match_status
      FROM blotter_with_contract_dates
      CROSS JOIN params
      LEFT JOIN matched_marks
        ON matched_marks.trade_row_key = blotter_with_contract_dates.trade_row_key
      LEFT JOIN ice_settlement_marks
        ON ice_settlement_marks.trade_row_key = blotter_with_contract_dates.trade_row_key
      LEFT JOIN option_settlement_marks
        ON option_settlement_marks.trade_row_key = blotter_with_contract_dates.trade_row_key
    )
    SELECT
      to_char(final_rows.trade_date, 'YYYY-MM-DD') AS trade_date,
      final_rows.trade_time,
      to_char(final_rows.report_date, 'YYYY-MM-DD') AS report_date,
      final_rows.deal_id,
      final_rows.leg_id,
      final_rows.orig_id,
      final_rows.b_s,
      final_rows.product,
      final_rows.hub,
      final_rows.contract,
      to_char(COALESCE(final_rows.begin_delivery_date, final_rows.contract_begin_delivery_date), 'YYYY-MM-DD') AS begin_date,
      to_char(COALESCE(final_rows.end_delivery_date, final_rows.contract_end_delivery_date), 'YYYY-MM-DD') AS end_date,
      final_rows.clearing_acct,
      final_rows.cust_acct,
      final_rows.clearing_firm,
      final_rows.price,
      final_rows.price_units,
      final_rows.option,
      final_rows.strike,
      final_rows.strike_2,
      final_rows.style,
      final_rows.lots,
      final_rows.total_quantity,
      final_rows.qty_units,
      final_rows.tt,
      final_rows.brk,
      final_rows.trader,
      final_rows.memo,
      final_rows.clearing_venue,
      final_rows.user_id,
      final_rows.source,
      final_rows.link_id,
      final_rows.usi,
      final_rows.authorized_trader_id,
      final_rows.location,
      final_rows.meter,
      final_rows.lead_time,
      final_rows.waiver_ind,
      final_rows.trade_time_micros,
      final_rows.cdi_override,
      final_rows.by_pass_mqr,
      final_rows.broker_name,
      final_rows.trading_company,
      final_rows.mic,
      final_rows.cc,
      final_rows.strip,
      final_rows.counterparty,
      final_rows.qty_per_period,
      final_rows.periods,
      final_rows.counterparty_user,
      final_rows.deal_section,
      final_rows.file_hash,
      final_rows.source_row_number,
      final_rows.source_row_hash,
      to_char(final_rows.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
      to_char(final_rows.updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at,
      final_rows.ice_symbol,
      final_rows.asset_class,
      final_rows.region,
      final_rows.product_group,
      final_rows.settlement_source,
      final_rows.settlement_contract_family,
      CASE
        WHEN final_rows.settlement_source = 'ICE_SETTLEMENT' THEN final_rows.ice_symbol
        WHEN final_rows.settlement_source = 'ICE_OPTION_SETTLEMENT' THEN final_rows.ice_symbol
        ELSE final_rows.settlement_source_key
      END AS settlement_source_key,
      final_rows.settlement_match_status,
      final_rows.active_mark_source,
      final_rows.source_settlement_mark,
      final_rows.ice_mark,
      final_rows.ice_open,
      final_rows.ice_high,
      final_rows.ice_low,
      final_rows.ice_close,
      final_rows.ice_vwap_close,
      final_rows.ice_volume,
      final_rows.settlement_mark,
      final_rows.signed_quantity * (final_rows.settlement_mark - final_rows.price) AS settlement_pnl,
      final_rows.expected_settlement_days,
      final_rows.matched_settlement_days
    FROM final_rows
    ORDER BY
      final_rows.trade_date DESC,
      final_rows.report_date DESC,
      final_rows.trade_time DESC,
      final_rows.deal_id,
      final_rows.leg_id;
  `;
}

function buildSummarySql(): string {
  return `
    WITH rows AS (${buildSettlementsSql().trim().replace(/;$/, "")})
    SELECT
      COUNT(*)::int AS row_count,
      COUNT(DISTINCT deal_id)::int AS distinct_deal_count,
      COUNT(DISTINCT product)::int AS product_count,
      COUNT(DISTINCT hub)::int AS hub_count,
      COUNT(DISTINCT contract)::int AS contract_count,
      SUM(lots)::int AS total_lots,
      SUM(total_quantity) AS total_quantity,
      MAX(trade_date) AS latest_trade_date,
      MAX(report_date) AS latest_report_date,
      MAX(updated_at) AS latest_updated_at,
      COUNT(*) FILTER (WHERE settlement_mark IS NOT NULL)::int AS marked_row_count,
      SUM(settlement_pnl) AS total_settlement_pnl
    FROM rows;
  `;
}

function buildLatestTradeDateSql(): string {
  return `
    WITH params AS NOT MATERIALIZED (
      SELECT $1::text AS product_scope
    )
    SELECT to_char(MAX(trade_date), 'YYYY-MM-DD') AS latest_date
    FROM ice_trade_blotter.ice_trade_blotter AS trades
    CROSS JOIN params
    WHERE ${tradeTableScopePredicateSql("trades")};
  `;
}

function normalizeSummary(row: SummaryRow | undefined): IceTradeBlotterSettlementsPayload["summary"] {
  return {
    rowCount: toNumber(row?.row_count) ?? 0,
    distinctDealCount: toNumber(row?.distinct_deal_count) ?? 0,
    productCount: toNumber(row?.product_count) ?? 0,
    hubCount: toNumber(row?.hub_count) ?? 0,
    contractCount: toNumber(row?.contract_count) ?? 0,
    totalLots: toNumber(row?.total_lots),
    totalQuantity: toNumber(row?.total_quantity),
    latestTradeDate: row?.latest_trade_date ?? null,
    latestReportDate: row?.latest_report_date ?? null,
    latestUpdatedAt: row?.latest_updated_at ?? null,
    markedRowCount: toNumber(row?.marked_row_count) ?? 0,
    totalSettlementPnl: toNumber(row?.total_settlement_pnl),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const dateMode = parseDateMode(searchParams.get("mode"));
  const requestedStartDate = searchParams.get("start");
  const requestedEndDate = searchParams.get("end");
  const trader = parseOptionalText(searchParams.get("trader"));
  const product = parseOptionalText(searchParams.get("product"));
  const hub = parseOptionalText(searchParams.get("hub"));
  const contract = parseOptionalText(searchParams.get("contract"));
  const scope = parseIceTradeProductScope(searchParams.get("scope"));
  const refresh = searchParams.get("refresh") === "1";

  try {
    const latestDateResult =
      isDateKey(requestedStartDate) && isDateKey(requestedEndDate)
        ? null
        : await query<LatestDateRow>(buildLatestTradeDateSql(), [scope]);
    const defaultEnd = latestDateResult?.rows[0]?.latest_date ?? dateKey(now);
    const defaultStart = dateMode === "historical" ? dateDaysBefore(defaultEnd, 30) : defaultEnd;
    const startDate = parseDate(requestedStartDate, defaultStart);
    const endDate = parseDate(requestedEndDate, defaultEnd);
    const asOf = parseDate(searchParams.get("asOf"), dateKey(now));
    const cacheKey = [
      "ice-trade-blotter-settlements",
      dateMode,
      startDate,
      endDate,
      asOf,
      scope,
      trader ?? "",
      product ?? "",
      hub ?? "",
      contract ?? "",
    ].join(":");

    if (!refresh) {
      const cached = RESPONSE_CACHE.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.payload, {
          headers: { "Cache-Control": FRESH_CACHE_HEADER, "X-Ice-Trade-Blotter-Settlements-Cache": "HIT" },
        });
      }
    }

    const params = [startDate, endDate, trader, product, hub, contract, scope, asOf];
    const [rowsResult, summaryResult] = await Promise.all([
      query<IceTradeBlotterSettlementRow>(buildSettlementsSql(), params),
      query<SummaryRow>(buildSummarySql(), params),
    ]);
    const payload: IceTradeBlotterSettlementsPayload = {
      startDate,
      endDate,
      asOf,
      scope,
      trader,
      product,
      hub,
      contract,
      rowCount: rowsResult.rows.length,
      summary: normalizeSummary(summaryResult.rows[0]),
      filters: {
        traders: uniqueSortedText(rowsResult.rows, (row) => row.trader),
        products: uniqueSortedText(rowsResult.rows, (row) => row.product),
        hubs: uniqueSortedText(rowsResult.rows, (row) => row.hub),
        contracts: uniqueSortedText(rowsResult.rows, (row) => row.contract),
      },
      rows: rowsResult.rows,
    };

    RESPONSE_CACHE.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload,
    });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": FRESH_CACHE_HEADER, "X-Ice-Trade-Blotter-Settlements-Cache": "MISS" },
    });
  } catch (error) {
    console.error("[ice-trade-blotter-settlements] DB query failed:", error);
    const stale = Array.from(RESPONSE_CACHE.values()).sort((first, second) => second.expiresAt - first.expiresAt)[0];
    if (stale) {
      return NextResponse.json(stale.payload, {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          "X-Ice-Trade-Blotter-Cache": "STALE",
        },
      });
    }
    return NextResponse.json(
      {
        error: "Failed to fetch ICE trade blotter settlement data",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
