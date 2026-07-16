import { NextResponse } from "next/server";
import { query as serverQuery } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
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
const RESPONSE_CACHE = new Map<string, { expiresAt: number; payload: PositionsPayload }>();

async function query<T>(text: string, values?: ReadonlyArray<unknown>): Promise<{ rows: T[] }> {
  return { rows: await serverQuery<T>(text, values) };
}
const POSITION_LEGS_CACHE = new Map<string, { expiresAt: number; payload: PositionLegsPayload }>();

interface PositionLegRow {
  trade_date: string;
  trade_time: string;
  deal_id: string;
  leg_id: string;
  b_s: string;
  product: string;
  hub: string;
  contract: string;
  begin_date: string;
  end_date: string;
  option: string;
  style: string;
  strike: number | null;
  strike_2: number | null;
  lots: number;
  total_quantity: number;
  price: number;
  trader: string;
  clearing_acct: string;
  cust_acct: string;
  brk: string;
}

interface PositionRow {
  position_key: string;
  as_of: string;
  trader: string;
  clearing_acct: string;
  cust_acct: string;
  clearing_firm: string;
  product: string;
  hub: string;
  cc: string;
  asset_class: string | null;
  region: string | null;
  contract: string;
  begin_date: string;
  end_date: string;
  option: string;
  style: string;
  strike: number | null;
  strike_2: number | null;
  qty_units: string;
  price_units: string;
  net_side: string;
  net_lots: number;
  net_quantity: number;
  avg_price: number | null;
  settlement_mark: number | null;
  mark_trade_date: string | null;
  prior_settlement_mark: number | null;
  prior_mark_trade_date: string | null;
  ice_symbol: string | null;
  settlement_contract_strip: string | null;
  settlement_contract_start_date: string | null;
  settlement_contract_end_date: string | null;
  option_symbol: string | null;
  underlying_symbol: string | null;
  option_delta: number | null;
  option_expiration_date: string | null;
  option_last_settlement_date: string | null;
  option_expiry_source: string | null;
  option_greek_quote_date: string | null;
  option_greek_status: string | null;
  option_greek_reason: string | null;
  delta_equivalent_lots: number | null;
  delta_equivalent_quantity: number | null;
  settlement_source: string | null;
  settlement_source_key: string | null;
  settlement_contract_family: string | null;
  days_to_expiry: number | null;
  delivery_status: string;
  settlement_status: string;
  daily_pnl: number | null;
  open_pnl: number | null;
  contributing_trade_count: number;
  latest_trade_date: string | null;
  latest_trade_time: string | null;
  latest_updated_at: string | null;
  legs?: PositionLegRow[];
}

interface LatestDateRow {
  latest_date: string | null;
}

interface MarketAsOfRow {
  market_as_of_date: string | null;
}

interface PositionsPayload {
  asOf: string;
  marketAsOf: string;
  scope: IceTradeProductScope;
  rowCount: number;
  summary: {
    rowCount: number;
    totalNetLots: number | null;
    totalNetQuantity: number | null;
    markedRowCount: number;
    dailyMarkedRowCount: number;
    totalDailyPnl: number | null;
    totalOpenPnl: number | null;
    latestTradeDate: string | null;
    latestUpdatedAt: string | null;
  };
  rows: PositionRow[];
}

interface PositionLegsPayload {
  asOf: string;
  marketAsOf: string;
  scope: IceTradeProductScope;
  positionKey: string;
  rows: PositionLegRow[];
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

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDefaultAsOfSql(): string {
  // Default to the latest ICE settlement trade date, not CURRENT_DATE. Contract
  // date rows can be generated on non-trading days, but marks only validate
  // through the latest settlement file.
  return `
    SELECT to_char(MAX(trade_date), 'YYYY-MM-DD') AS latest_date
    FROM ice_python.settlements;
  `;
}

function buildMarketAsOfSql(): string {
  return `
    SELECT to_char(
      COALESCE(
        (
          SELECT MAX(settlements.trade_date)
          FROM ice_python.settlements AS settlements
          WHERE settlements.trade_date <= $1::date
        ),
        $1::date
      ),
      'YYYY-MM-DD'
    ) AS market_as_of_date;
  `;
}

function buildPositionsSql(includeLegs = false): string {
  return `
    WITH params AS NOT MATERIALIZED (
      SELECT
        $1::date AS as_of_date,
        $1::date AS valuation_date,
        COALESCE(
          (
            SELECT MAX(settlements.trade_date)
            FROM ice_python.settlements AS settlements
            WHERE settlements.trade_date <= $1::date
          ),
          $1::date
        ) AS market_as_of_date,
        $2::text AS product_scope
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
      WHERE trades.trade_date <= params.as_of_date
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
          WHEN LOWER(BTRIM(blotter_raw.b_s)) IN ('s', 'sell', 'sold') THEN -ABS(blotter_raw.lots)
          ELSE ABS(blotter_raw.lots)
        END AS signed_lots,
        CASE
          WHEN LOWER(BTRIM(blotter_raw.b_s)) IN ('s', 'sell', 'sold') THEN -ABS(blotter_raw.total_quantity)
          ELSE ABS(blotter_raw.total_quantity)
        END AS signed_quantity
      FROM blotter_raw
    ),
    open_trades AS (
      -- All trades through as_of. Expired/settled positions are filtered out
      -- after grouping (see the priced CTE + final WHERE) so the DA
      -- settle-one-day-early adjustment can key off settlement_source.
      SELECT blotter_normalized.*
      FROM blotter_normalized
      CROSS JOIN params
      WHERE ${normalizedContractScopePredicateSql(
        "blotter_normalized.cc",
        "blotter_normalized.settlement_contract_code"
      )}
    ),
    trades_with_symbols AS (
      SELECT
        open_trades.*,
        COALESCE(
          contract_date_product.asset_class,
          product_dictionary.asset_class,
          CASE
            WHEN UPPER(BTRIM(open_trades.cc)) IN ('H', 'HNG', 'PHE', 'TRZ', 'TFL', 'CGB', 'CGM', 'TWB', 'HXS', 'WAH', 'NTO', 'ALQ', 'TMT', 'T5B', 'IZB', 'TZS', 'DOM', 'SCB', 'PGE', 'CRI')
              OR LOWER(BTRIM(open_trades.product)) LIKE '%gas%'
              THEN 'Gas'
            ELSE 'Power'
          END
        ) AS asset_class,
        COALESCE(
          contract_date_product.region,
          product_dictionary.region,
          CASE
            WHEN UPPER(BTRIM(open_trades.cc)) IN ('H', 'HNG', 'PHE', 'XGF')
              OR LOWER(BTRIM(open_trades.hub)) LIKE '%henry%'
              OR LOWER(BTRIM(open_trades.product)) LIKE '%henry%'
              THEN 'Henry Hub'
            WHEN UPPER(BTRIM(open_trades.cc)) IN ('TRZ', 'TFL', 'CGB', 'CGM', 'TWB', 'HXS', 'WAH', 'NTO', 'ALQ', 'TMT', 'T5B', 'IZB', 'TZS', 'DOM', 'SCB', 'PGE', 'CRI')
              OR LOWER(BTRIM(open_trades.product)) LIKE '%gas%'
              THEN 'Basis'
            WHEN UPPER(BTRIM(open_trades.cc)) IN ('PMI', 'OPJ', 'P1X', 'PDP', 'PWA', 'PDA', 'PJL', 'PDO', 'ODP') THEN 'PJM'
            WHEN UPPER(BTRIM(open_trades.cc)) IN ('ERN', 'ECI', 'END', 'ERA', 'NDA', 'NED') THEN 'ERCOT'
            ELSE NULL
          END,
          NULLIF(BTRIM(open_trades.hub), '')
        ) AS region,
        COALESCE(
          contract_date_product.contract_family,
          product_dictionary.contract_family,
          CASE
            WHEN NULLIF(BTRIM(open_trades.option), '') IS NOT NULL
              AND UPPER(BTRIM(open_trades.cc)) IN ('PMI', 'OPJ', 'P1X', 'PHE')
              AND BTRIM(open_trades.contract) ~* '^[A-Za-z]{3,4}[0-9]{2}$'
              THEN 'Option'
            ELSE NULL
          END
        ) AS settlement_contract_family,
        COALESCE(
          contract_date_product.settlement_source,
          product_dictionary.settlement_source,
          CASE
            WHEN NULLIF(BTRIM(open_trades.option), '') IS NOT NULL
              AND UPPER(BTRIM(open_trades.cc)) IN ('PMI', 'OPJ', 'P1X', 'PHE')
              AND BTRIM(open_trades.contract) ~* '^[A-Za-z]{3,4}[0-9]{2}$'
              THEN 'ICE_OPTION_SETTLEMENT'
            ELSE NULL
          END
        ) AS settlement_source,
        COALESCE(
          contract_date_product.settlement_source_key,
          product_dictionary.settlement_source_key,
          CASE
            WHEN NULLIF(BTRIM(open_trades.option), '') IS NOT NULL
              AND UPPER(BTRIM(open_trades.cc)) IN ('PMI', 'OPJ', 'P1X', 'PHE')
              AND BTRIM(open_trades.contract) ~* '^[A-Za-z]{3,4}[0-9]{2}$'
              THEN 'ice_option_settlement'
            ELSE NULL
          END
        ) AS settlement_source_key,
        COALESCE(
          contract_date_product.resolved_ice_symbol,
          CASE
            WHEN product_dictionary.contract_code = 'MONTH'
              AND BTRIM(open_trades.contract) ~* '^[A-Za-z]{3}[0-9]{2}$'
              THEN SPLIT_PART(product_dictionary.ice_symbol_pattern, ' ', 1) || ' ' ||
                CASE SUBSTRING(LOWER(BTRIM(open_trades.contract)) FROM 1 FOR 3)
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
                SUBSTRING(BTRIM(open_trades.contract) FROM '[0-9]{2}$') ||
                '-IUS'
            WHEN product_dictionary.ice_symbol_pattern NOT LIKE '%{%}%'
              THEN product_dictionary.ice_symbol_pattern
            ELSE NULL
          END
        ) AS ice_symbol,
        contract_date_product.contract_strip AS settlement_contract_strip,
        contract_date_product.contract_start_date AS settlement_contract_start_date_key,
        contract_date_product.contract_end_date AS settlement_contract_end_date_key
        ,
        CASE
          WHEN NULLIF(BTRIM(open_trades.option), '') IS NOT NULL
            AND UPPER(BTRIM(open_trades.cc)) IN ('PMI', 'OPJ', 'P1X', 'PHE')
            AND BTRIM(open_trades.contract) ~* '^[A-Za-z]{3,4}[0-9]{2}$'
            AND open_trades.strike IS NOT NULL
            AND LOWER(BTRIM(open_trades.option)) IN ('put', 'p', 'call', 'c')
            THEN
              CASE WHEN UPPER(BTRIM(open_trades.cc)) = 'PHE' THEN 'PHE.L' ELSE UPPER(BTRIM(open_trades.cc)) END ||
              ' ' ||
              CASE SUBSTRING(LOWER(BTRIM(open_trades.contract)) FROM '^[A-Za-z]{3,4}')
                WHEN 'jan' THEN 'F'
                WHEN 'feb' THEN 'G'
                WHEN 'mar' THEN 'H'
                WHEN 'apr' THEN 'J'
                WHEN 'may' THEN 'K'
                WHEN 'jun' THEN 'M'
                WHEN 'jul' THEN 'N'
                WHEN 'aug' THEN 'Q'
                WHEN 'sep' THEN 'U'
                WHEN 'sept' THEN 'U'
                WHEN 'oct' THEN 'V'
                WHEN 'nov' THEN 'X'
                WHEN 'dec' THEN 'Z'
                ELSE ''
              END ||
              SUBSTRING(BTRIM(open_trades.contract) FROM '([0-9]{2})$') ||
              CASE
                WHEN LOWER(BTRIM(open_trades.option)) IN ('put', 'p') THEN 'P'
                WHEN LOWER(BTRIM(open_trades.option)) IN ('call', 'c') THEN 'C'
                ELSE ''
              END ||
              trim(
                trailing '.' FROM regexp_replace(
                  to_char(open_trades.strike, 'FM999999999999990.999999'),
                  '0+$',
                  ''
                )
              ) ||
              '-IUS'
          ELSE NULL
        END AS option_symbol,
        CASE
          WHEN NULLIF(BTRIM(open_trades.option), '') IS NOT NULL
            AND UPPER(BTRIM(open_trades.cc)) IN ('PMI', 'OPJ', 'P1X', 'PHE')
            AND BTRIM(open_trades.contract) ~* '^[A-Za-z]{3,4}[0-9]{2}$'
            THEN
              CASE WHEN UPPER(BTRIM(open_trades.cc)) = 'PHE' THEN 'PHH.L' ELSE UPPER(BTRIM(open_trades.cc)) END ||
              ' ' ||
              CASE SUBSTRING(LOWER(BTRIM(open_trades.contract)) FROM '^[A-Za-z]{3,4}')
                WHEN 'jan' THEN 'F'
                WHEN 'feb' THEN 'G'
                WHEN 'mar' THEN 'H'
                WHEN 'apr' THEN 'J'
                WHEN 'may' THEN 'K'
                WHEN 'jun' THEN 'M'
                WHEN 'jul' THEN 'N'
                WHEN 'aug' THEN 'Q'
                WHEN 'sep' THEN 'U'
                WHEN 'sept' THEN 'U'
                WHEN 'oct' THEN 'V'
                WHEN 'nov' THEN 'X'
                WHEN 'dec' THEN 'Z'
                ELSE ''
              END ||
              SUBSTRING(BTRIM(open_trades.contract) FROM '([0-9]{2})$') ||
              '-IUS'
          ELSE NULL
        END AS underlying_symbol
      FROM open_trades
      CROSS JOIN params
      LEFT JOIN LATERAL (
        SELECT
          dictionary_product.asset_class,
          dictionary_product.region,
          dictionary_product.contract_family,
          dictionary_product.settlement_source,
          dictionary_product.settlement_source_key,
          candidate_symbol.symbol AS resolved_ice_symbol,
          matched_contract_dates.contract_strip,
          matched_contract_dates.contract_start_date,
          matched_contract_dates.contract_end_date
        FROM product_dictionary AS dictionary_product
        CROSS JOIN LATERAL (
          SELECT
            CASE
              WHEN dictionary_product.contract_code = 'MONTH'
                AND BTRIM(open_trades.contract) ~* '^[A-Za-z]{3}[0-9]{2}$'
                THEN SPLIT_PART(dictionary_product.ice_symbol_pattern, ' ', 1) || ' ' ||
                  CASE SUBSTRING(LOWER(BTRIM(open_trades.contract)) FROM 1 FOR 3)
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
                  SUBSTRING(BTRIM(open_trades.contract) FROM '[0-9]{2}$') ||
                  '-IUS'
              WHEN dictionary_product.ice_symbol_pattern NOT LIKE '%{%}%'
                THEN dictionary_product.ice_symbol_pattern
              ELSE NULL
            END AS symbol
        ) AS candidate_symbol
        LEFT JOIN LATERAL (
          SELECT
            latest_dates.trade_date,
            latest_dates.updated_at,
            latest_dates.strip AS contract_strip,
            latest_dates.start_date AS contract_start_date,
            latest_dates.end_date AS contract_end_date,
            latest_dates.start_date = open_trades.begin_delivery_date
              AND latest_dates.end_date = open_trades.end_delivery_date AS exact_delivery_match
          FROM (
            SELECT dates.*
            FROM ice_python.settlement_contract_dates AS dates
            WHERE
              dates.symbol = candidate_symbol.symbol
              AND dates.trade_date <= open_trades.trade_date
            ORDER BY
              dates.trade_date DESC,
              dates.updated_at DESC NULLS LAST
            LIMIT 1
          ) AS latest_dates
          LIMIT 1
        ) AS matched_contract_dates ON TRUE
        WHERE dictionary_product.active
          AND dictionary_product.cc = UPPER(BTRIM(open_trades.cc))
          AND (
            LOWER(BTRIM(open_trades.hub)) = ANY(dictionary_product.blotter_hub_aliases)
            OR CARDINALITY(dictionary_product.blotter_hub_aliases) = 0
          )
          AND NULLIF(BTRIM(open_trades.option), '') IS NULL
          AND candidate_symbol.symbol IS NOT NULL
          AND (
            open_trades.begin_delivery_date IS NULL
            OR open_trades.end_delivery_date IS NULL
            OR open_trades.end_delivery_date = open_trades.begin_delivery_date
            OR dictionary_product.contract_code NOT IN ('D0', 'D1')
          )
        ORDER BY
          matched_contract_dates.exact_delivery_match DESC,
          CASE WHEN dictionary_product.contract_code = open_trades.settlement_contract_code THEN 0 ELSE 1 END,
          dictionary_product.settlement_priority,
          dictionary_product.contract_code
        LIMIT 1
      ) AS contract_date_product ON TRUE
      LEFT JOIN product_dictionary
        ON product_dictionary.active
       AND product_dictionary.cc = UPPER(BTRIM(open_trades.cc))
       AND (
         LOWER(BTRIM(open_trades.hub)) = ANY(product_dictionary.blotter_hub_aliases)
         OR CARDINALITY(product_dictionary.blotter_hub_aliases) = 0
       )
       AND (
         (
           NULLIF(BTRIM(open_trades.option), '') IS NULL
           AND (
             product_dictionary.contract_code = open_trades.settlement_contract_code
             OR (
               product_dictionary.contract_code = 'MONTH'
               AND BTRIM(open_trades.contract) ~* '^[A-Za-z]{3}[0-9]{2}$'
             )
           )
         )
         OR (
           NULLIF(BTRIM(open_trades.option), '') IS NOT NULL
           AND product_dictionary.contract_code IN ('OPTION_MONTH', 'OPTION_CALENDAR_YEAR')
           AND BTRIM(open_trades.contract) ~* '^[A-Za-z]{3,4}[0-9]{2}$'
         )
       )
    ),
    position_components AS (
      SELECT
        trades_with_symbols.*,
        COALESCE(split_components.component_contract, trades_with_symbols.contract) AS component_contract,
        COALESCE(
          to_char(split_components.component_start_date, 'YYYY-MM-DD'),
          to_char(trades_with_symbols.settlement_contract_start_date_key, 'YYYY-MM-DD'),
          trades_with_symbols.begin_date
        ) AS component_begin_date,
        COALESCE(
          to_char(split_components.component_end_date, 'YYYY-MM-DD'),
          to_char(trades_with_symbols.settlement_contract_end_date_key, 'YYYY-MM-DD'),
          trades_with_symbols.end_date
        ) AS component_end_date,
        COALESCE(split_components.component_start_date, trades_with_symbols.settlement_contract_start_date_key, trades_with_symbols.begin_delivery_date) AS component_begin_delivery_date,
        COALESCE(split_components.component_end_date, trades_with_symbols.settlement_contract_end_date_key, trades_with_symbols.end_delivery_date) AS component_end_delivery_date,
        COALESCE(split_components.component_ice_symbol, trades_with_symbols.ice_symbol) AS component_ice_symbol,
        COALESCE(split_components.component_settlement_source, trades_with_symbols.settlement_source) AS component_settlement_source,
        COALESCE(split_components.component_settlement_source_key, trades_with_symbols.settlement_source_key) AS component_settlement_source_key,
        COALESCE(split_components.component_contract_family, trades_with_symbols.settlement_contract_family) AS component_contract_family,
        COALESCE(split_components.component_contract_strip, trades_with_symbols.settlement_contract_strip) AS component_contract_strip,
        COALESCE(split_components.component_start_date, trades_with_symbols.settlement_contract_start_date_key) AS component_contract_start_date_key,
        COALESCE(split_components.component_end_date, trades_with_symbols.settlement_contract_end_date_key) AS component_contract_end_date_key,
        trades_with_symbols.signed_lots * COALESCE(split_components.component_fraction, 1) AS component_signed_lots,
        trades_with_symbols.signed_quantity * COALESCE(split_components.component_fraction, 1) AS component_signed_quantity,
        trades_with_symbols.total_quantity * COALESCE(split_components.component_fraction, 1) AS component_total_quantity
      FROM trades_with_symbols
      CROSS JOIN params
      LEFT JOIN LATERAL (
        SELECT
          CASE split_dictionary.contract_code
            WHEN 'D0' THEN 'Bal Day'
            WHEN 'D1' THEN 'Next Day'
            WHEN 'W0' THEN 'Bal Week'
            WHEN 'W1' THEN 'Next Week'
            WHEN 'W2' THEN '2nd Week'
            WHEN 'W3' THEN '3rd Week'
            WHEN 'W4' THEN '4th Week'
            ELSE split_contract_dates.strip
          END AS component_contract,
          component_day_counts.component_start_date AS component_start_date,
          component_day_counts.component_end_date AS component_end_date,
          split_symbol.symbol AS component_ice_symbol,
          split_dictionary.settlement_source AS component_settlement_source,
          split_dictionary.settlement_source_key AS component_settlement_source_key,
          split_dictionary.contract_family AS component_contract_family,
          split_contract_dates.strip AS component_contract_strip,
          component_day_counts.component_days::double precision /
            NULLIF(total_day_counts.total_days, 0)::double precision AS component_fraction
        FROM product_dictionary AS split_dictionary
        CROSS JOIN LATERAL (
          SELECT
            CASE
              WHEN split_dictionary.ice_symbol_pattern NOT LIKE '%{%}%'
                THEN split_dictionary.ice_symbol_pattern
              ELSE NULL
            END AS symbol
        ) AS split_symbol
        JOIN LATERAL (
          SELECT dates.*
          FROM ice_python.settlement_contract_dates AS dates
          WHERE dates.symbol = split_symbol.symbol
            AND dates.trade_date <= params.market_as_of_date
          ORDER BY dates.trade_date DESC, dates.updated_at DESC NULLS LAST
          LIMIT 1
        ) AS split_contract_dates ON TRUE
        CROSS JOIN LATERAL (
          SELECT COUNT(*)::int AS total_days
          FROM generate_series(
            COALESCE(trades_with_symbols.settlement_contract_start_date_key, trades_with_symbols.begin_delivery_date),
            COALESCE(trades_with_symbols.settlement_contract_end_date_key, trades_with_symbols.end_delivery_date),
            INTERVAL '1 day'
          ) AS delivery_days(delivery_date)
          WHERE EXTRACT(ISODOW FROM delivery_days.delivery_date)::int BETWEEN 1 AND 5
        ) AS total_day_counts
        CROSS JOIN LATERAL (
          SELECT
            COUNT(*)::int AS component_days,
            MIN(delivery_days.delivery_date)::date AS component_start_date,
            MAX(delivery_days.delivery_date)::date AS component_end_date
          FROM generate_series(
            GREATEST(
              split_contract_dates.start_date,
              COALESCE(trades_with_symbols.settlement_contract_start_date_key, trades_with_symbols.begin_delivery_date)
            ),
            LEAST(
              split_contract_dates.end_date,
              COALESCE(trades_with_symbols.settlement_contract_end_date_key, trades_with_symbols.end_delivery_date)
            ),
            INTERVAL '1 day'
          ) AS delivery_days(delivery_date)
          WHERE EXTRACT(ISODOW FROM delivery_days.delivery_date)::int BETWEEN 1 AND 5
            AND NOT EXISTS (
              SELECT 1
              FROM product_dictionary AS higher_dictionary
              CROSS JOIN LATERAL (
                SELECT
                  CASE
                    WHEN higher_dictionary.ice_symbol_pattern NOT LIKE '%{%}%'
                      THEN higher_dictionary.ice_symbol_pattern
                    ELSE NULL
                  END AS symbol
              ) AS higher_symbol
              JOIN LATERAL (
                SELECT dates.*
                FROM ice_python.settlement_contract_dates AS dates
                WHERE dates.symbol = higher_symbol.symbol
                  AND dates.trade_date <= params.market_as_of_date
                ORDER BY dates.trade_date DESC, dates.updated_at DESC NULLS LAST
                LIMIT 1
              ) AS higher_contract_dates ON TRUE
              WHERE higher_dictionary.active
                AND higher_dictionary.cc = UPPER(BTRIM(trades_with_symbols.cc))
                AND (
                  LOWER(BTRIM(trades_with_symbols.hub)) = ANY(higher_dictionary.blotter_hub_aliases)
                  OR CARDINALITY(higher_dictionary.blotter_hub_aliases) = 0
                )
                AND higher_dictionary.contract_code IN ('D0', 'D1', 'W0', 'W1', 'W2', 'W3', 'W4')
                AND higher_symbol.symbol IS NOT NULL
                AND CASE higher_dictionary.contract_code
                      WHEN 'D0' THEN 0
                      WHEN 'D1' THEN 1
                      WHEN 'W0' THEN 2
                      WHEN 'W1' THEN 3
                      WHEN 'W2' THEN 4
                      WHEN 'W3' THEN 5
                      WHEN 'W4' THEN 6
                      ELSE 99
                    END < CASE split_dictionary.contract_code
                      WHEN 'D0' THEN 0
                      WHEN 'D1' THEN 1
                      WHEN 'W0' THEN 2
                      WHEN 'W1' THEN 3
                      WHEN 'W2' THEN 4
                      WHEN 'W3' THEN 5
                      WHEN 'W4' THEN 6
                      ELSE 99
                    END
                AND higher_contract_dates.start_date <= delivery_days.delivery_date::date
                AND higher_contract_dates.end_date >= delivery_days.delivery_date::date
            )
        ) AS component_day_counts
        WHERE trades_with_symbols.asset_class = 'Power'
          AND NULLIF(BTRIM(trades_with_symbols.option), '') IS NULL
          AND trades_with_symbols.settlement_contract_family = 'Weekly'
          AND COALESCE(trades_with_symbols.settlement_contract_start_date_key, trades_with_symbols.begin_delivery_date) IS NOT NULL
          AND COALESCE(trades_with_symbols.settlement_contract_end_date_key, trades_with_symbols.end_delivery_date) IS NOT NULL
          AND split_dictionary.active
          AND split_dictionary.cc = UPPER(BTRIM(trades_with_symbols.cc))
          AND (
            LOWER(BTRIM(trades_with_symbols.hub)) = ANY(split_dictionary.blotter_hub_aliases)
            OR CARDINALITY(split_dictionary.blotter_hub_aliases) = 0
          )
          AND split_dictionary.contract_code IN ('D0', 'D1', 'W0', 'W1', 'W2', 'W3', 'W4')
          AND split_symbol.symbol IS NOT NULL
          AND split_contract_dates.start_date <= COALESCE(trades_with_symbols.settlement_contract_end_date_key, trades_with_symbols.end_delivery_date)
          AND split_contract_dates.end_date >= COALESCE(trades_with_symbols.settlement_contract_start_date_key, trades_with_symbols.begin_delivery_date)
          AND component_day_counts.component_days > 0
          AND total_day_counts.total_days > 0
        ORDER BY
          split_contract_dates.start_date,
          CASE split_dictionary.contract_code
            WHEN 'D0' THEN 0
            WHEN 'D1' THEN 1
            WHEN 'W0' THEN 2
            WHEN 'W1' THEN 3
            WHEN 'W2' THEN 4
            WHEN 'W3' THEN 5
            WHEN 'W4' THEN 6
            ELSE 99
          END,
          split_dictionary.contract_code
      ) AS split_components ON TRUE
    ),
    required_ice_symbols AS (
      SELECT DISTINCT position_components.component_ice_symbol AS ice_symbol
      FROM position_components
      WHERE position_components.component_ice_symbol IS NOT NULL
        AND NULLIF(BTRIM(position_components.option), '') IS NULL
        AND position_components.component_settlement_source = 'ICE_SETTLEMENT'
    ),
    required_option_symbols AS (
      SELECT DISTINCT position_components.option_symbol
      FROM position_components
      WHERE position_components.option_symbol IS NOT NULL
        AND NULLIF(BTRIM(position_components.option), '') IS NOT NULL
    ),
    required_iso_marks AS (
      SELECT DISTINCT
        position_components.component_settlement_source_key AS settlement_source_key,
        position_components.component_begin_delivery_date,
        position_components.component_end_delivery_date,
        delivery_days.market_date::date AS market_date
      FROM position_components
      CROSS JOIN LATERAL generate_series(
        position_components.component_begin_delivery_date,
        position_components.component_end_delivery_date,
        INTERVAL '1 day'
      ) AS delivery_days(market_date)
      LEFT JOIN nerc_off_peak_days AS dates
        ON dates.holiday_date = delivery_days.market_date::date
      WHERE position_components.component_settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP')
        AND position_components.component_settlement_source_key IS NOT NULL
        AND position_components.component_begin_delivery_date IS NOT NULL
        AND position_components.component_end_delivery_date IS NOT NULL
        AND (
          position_components.component_settlement_source_key IN ('pjm_rt_offpeak', 'pjm_da_offpeak')
          OR (
            EXTRACT(ISODOW FROM delivery_days.market_date)::int NOT IN (6, 7)
            AND dates.holiday_date IS NULL
          )
        )
    ),
    latest_ice_marks AS (
      SELECT
        required_ice_symbols.ice_symbol AS symbol,
        to_char(current_mark.trade_date, 'YYYY-MM-DD') AS mark_trade_date,
        current_mark.settlement_mark,
        to_char(prior_mark.trade_date, 'YYYY-MM-DD') AS prior_mark_trade_date,
        prior_mark.settlement_mark AS prior_settlement_mark
      FROM required_ice_symbols
      CROSS JOIN params
      LEFT JOIN LATERAL (
        SELECT
          settlements.trade_date,
          COALESCE(NULLIF(settlements.settlement::text, 'NaN')::double precision, settlements.vwap_close) AS settlement_mark
        FROM ice_python.settlements AS settlements
        WHERE settlements.symbol = required_ice_symbols.ice_symbol
          AND settlements.trade_date <= params.market_as_of_date
        ORDER BY settlements.trade_date DESC
        LIMIT 1
      ) AS current_mark ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          settlements.trade_date,
          COALESCE(NULLIF(settlements.settlement::text, 'NaN')::double precision, settlements.vwap_close) AS settlement_mark
        FROM ice_python.settlements AS settlements
        WHERE settlements.symbol = required_ice_symbols.ice_symbol
          AND current_mark.trade_date IS NOT NULL
          AND settlements.trade_date < current_mark.trade_date
        ORDER BY settlements.trade_date DESC
        LIMIT 1
      ) AS prior_mark ON TRUE
    ),
    pjm_iso_delivery_bounds AS MATERIALIZED (
      SELECT
        MIN(required_iso_marks.market_date) AS min_delivery_date,
        MAX(required_iso_marks.market_date) AS max_delivery_date
      FROM required_iso_marks
      WHERE required_iso_marks.settlement_source_key IN ('pjm_rt_onpeak', 'pjm_rt_offpeak', 'pjm_da_onpeak', 'pjm_da_offpeak')
    ),
    pjm_da_onpeak_hourly AS MATERIALIZED (
      SELECT
        'pjm_da_onpeak'::text AS settlement_source_key,
        lmps.datetime_beginning_ept::date AS market_date,
        lmps.total_lmp_da AS total_lmp,
        lmps.updated_at AS source_updated_at
      FROM pjm.da_hrl_lmps AS lmps
      CROSS JOIN pjm_iso_delivery_bounds
      WHERE lmps.row_is_current = TRUE
        AND lmps.pnode_name = 'WESTERN HUB'
        AND pjm_iso_delivery_bounds.min_delivery_date IS NOT NULL
        AND lmps.datetime_beginning_ept::date >= pjm_iso_delivery_bounds.min_delivery_date
        AND lmps.datetime_beginning_ept::date <= pjm_iso_delivery_bounds.max_delivery_date
        AND (EXTRACT(HOUR FROM lmps.datetime_beginning_ept) + 1)::int BETWEEN 8 AND 23
    ),
    pjm_da_offpeak_hourly AS MATERIALIZED (
      SELECT
        'pjm_da_offpeak'::text AS settlement_source_key,
        lmps.datetime_beginning_ept::date AS market_date,
        lmps.total_lmp_da AS total_lmp,
        lmps.updated_at AS source_updated_at
      FROM pjm.da_hrl_lmps AS lmps
      CROSS JOIN pjm_iso_delivery_bounds
      WHERE lmps.row_is_current = TRUE
        AND lmps.pnode_name = 'WESTERN HUB'
        AND pjm_iso_delivery_bounds.min_delivery_date IS NOT NULL
        AND lmps.datetime_beginning_ept::date >= pjm_iso_delivery_bounds.min_delivery_date
        AND lmps.datetime_beginning_ept::date <= pjm_iso_delivery_bounds.max_delivery_date
        AND (
          (EXTRACT(HOUR FROM lmps.datetime_beginning_ept) + 1)::int BETWEEN 1 AND 7
          OR (EXTRACT(HOUR FROM lmps.datetime_beginning_ept) + 1)::int = 24
        )
    ),
    pjm_rt_verified AS MATERIALIZED (
      SELECT
        lmps.datetime_beginning_utc,
        lmps.datetime_beginning_ept,
        lmps.datetime_beginning_ept::date AS market_date,
        1::int AS source_priority,
        lmps.version_nbr,
        lmps.total_lmp_rt AS total_lmp,
        lmps.updated_at AS source_updated_at
      FROM pjm.rt_hrl_lmps AS lmps
      CROSS JOIN pjm_iso_delivery_bounds
      WHERE lmps.row_is_current = TRUE
        AND lmps.pnode_name = 'WESTERN HUB'
        AND pjm_iso_delivery_bounds.min_delivery_date IS NOT NULL
        AND lmps.datetime_beginning_ept >= pjm_iso_delivery_bounds.min_delivery_date::timestamp
        AND lmps.datetime_beginning_ept < (pjm_iso_delivery_bounds.max_delivery_date + 1)::timestamp
    ),
    pjm_rt_unverified AS MATERIALIZED (
      SELECT
        lmps.datetime_beginning_utc,
        lmps.datetime_beginning_ept,
        lmps.datetime_beginning_ept::date AS market_date,
        2::int AS source_priority,
        NULL::bigint AS version_nbr,
        lmps.total_lmp_rt AS total_lmp,
        lmps.updated_at AS source_updated_at
      FROM pjm.rt_unverified_hrl_lmps AS lmps
      CROSS JOIN pjm_iso_delivery_bounds
      WHERE lmps.pnode_name = 'WESTERN HUB'
        AND pjm_iso_delivery_bounds.min_delivery_date IS NOT NULL
        AND lmps.datetime_beginning_ept >= pjm_iso_delivery_bounds.min_delivery_date::timestamp
        AND lmps.datetime_beginning_ept < (pjm_iso_delivery_bounds.max_delivery_date + 1)::timestamp
    ),
    pjm_rt_ranked AS MATERIALIZED (
      SELECT
        combined.*,
        ROW_NUMBER() OVER (
          PARTITION BY combined.datetime_beginning_utc
          ORDER BY combined.source_priority, combined.version_nbr DESC NULLS LAST
        ) AS source_rank
      FROM (
        SELECT * FROM pjm_rt_verified
        UNION ALL
        SELECT * FROM pjm_rt_unverified
      ) AS combined
    ),
    pjm_rt_onpeak_hourly AS MATERIALIZED (
      SELECT
        'pjm_rt_onpeak'::text AS settlement_source_key,
        pjm_rt_ranked.market_date,
        pjm_rt_ranked.total_lmp,
        pjm_rt_ranked.source_updated_at
      FROM pjm_rt_ranked
      WHERE pjm_rt_ranked.source_rank = 1
        AND (EXTRACT(HOUR FROM pjm_rt_ranked.datetime_beginning_ept) + 1)::int BETWEEN 8 AND 23
    ),
    pjm_rt_offpeak_hourly AS MATERIALIZED (
      SELECT
        'pjm_rt_offpeak'::text AS settlement_source_key,
        pjm_rt_ranked.market_date,
        pjm_rt_ranked.total_lmp,
        pjm_rt_ranked.source_updated_at
      FROM pjm_rt_ranked
      WHERE pjm_rt_ranked.source_rank = 1
        AND (
          (EXTRACT(HOUR FROM pjm_rt_ranked.datetime_beginning_ept) + 1)::int BETWEEN 1 AND 7
          OR (EXTRACT(HOUR FROM pjm_rt_ranked.datetime_beginning_ept) + 1)::int = 24
        )
    ),
    pjm_hourly AS MATERIALIZED (
      SELECT * FROM pjm_da_onpeak_hourly
      UNION ALL
      SELECT * FROM pjm_da_offpeak_hourly
      UNION ALL
      SELECT * FROM pjm_rt_onpeak_hourly
      UNION ALL
      SELECT * FROM pjm_rt_offpeak_hourly
    ),
    pjm_iso_daily_marks AS MATERIALIZED (
      SELECT
        pjm_hourly.settlement_source_key,
        pjm_hourly.market_date,
        AVG(pjm_hourly.total_lmp) AS settlement_mark,
        COUNT(*) AS hours_present,
        CASE
          WHEN pjm_hourly.settlement_source_key IN ('pjm_rt_offpeak', 'pjm_da_offpeak') THEN 8
          ELSE 16
        END AS expected_hours,
        MAX(pjm_hourly.source_updated_at) AS latest_source_updated_at
      FROM pjm_hourly
      GROUP BY pjm_hourly.settlement_source_key, pjm_hourly.market_date
    ),
    latest_iso_marks AS (
      SELECT
        required_iso_marks.settlement_source_key,
        required_iso_marks.component_begin_delivery_date,
        required_iso_marks.component_end_delivery_date,
        to_char(MAX(required_iso_marks.market_date), 'YYYY-MM-DD') AS mark_trade_date,
        AVG(pjm_iso_daily_marks.settlement_mark) AS settlement_mark,
        COUNT(DISTINCT required_iso_marks.market_date) AS expected_settlement_days,
        COUNT(DISTINCT pjm_iso_daily_marks.market_date) FILTER (
          WHERE pjm_iso_daily_marks.hours_present = pjm_iso_daily_marks.expected_hours
        ) AS matched_settlement_days
      FROM required_iso_marks
      LEFT JOIN pjm_iso_daily_marks
        ON pjm_iso_daily_marks.settlement_source_key = required_iso_marks.settlement_source_key
       AND pjm_iso_daily_marks.market_date = required_iso_marks.market_date
       AND pjm_iso_daily_marks.hours_present = pjm_iso_daily_marks.expected_hours
      GROUP BY
        required_iso_marks.settlement_source_key,
        required_iso_marks.component_begin_delivery_date,
        required_iso_marks.component_end_delivery_date
    ),
    latest_option_marks AS (
      SELECT
        required_option_symbols.option_symbol AS symbol,
        current_mark.trade_date::date AS mark_trade_date_key,
        to_char(current_mark.trade_date, 'YYYY-MM-DD') AS mark_trade_date,
        current_mark.settlement_mark,
        to_char(prior_mark.trade_date, 'YYYY-MM-DD') AS prior_mark_trade_date,
        prior_mark.settlement_mark AS prior_settlement_mark
      FROM required_option_symbols
      CROSS JOIN params
      LEFT JOIN LATERAL (
        SELECT
          option_settlements.trade_date,
          option_settlements.settlement AS settlement_mark
        FROM ice_python.option_settlements AS option_settlements
        WHERE option_settlements.symbol = required_option_symbols.option_symbol
          AND option_settlements.trade_date <= params.market_as_of_date
          AND option_settlements.settlement IS NOT NULL
        ORDER BY option_settlements.trade_date DESC
        LIMIT 1
      ) AS current_mark ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          option_settlements.trade_date,
          option_settlements.settlement AS settlement_mark
        FROM ice_python.option_settlements AS option_settlements
        WHERE option_settlements.symbol = required_option_symbols.option_symbol
          AND current_mark.trade_date IS NOT NULL
          AND option_settlements.trade_date < current_mark.trade_date
          AND option_settlements.settlement IS NOT NULL
        ORDER BY option_settlements.trade_date DESC
        LIMIT 1
      ) AS prior_mark ON TRUE
    ),
    latest_option_greeks AS (
      SELECT
        required_option_symbols.option_symbol AS symbol,
        greeks.underlying,
        greeks.expiration AS expiration_date_key,
        greeks.delta,
        raw_quote.trade_date::date AS latest_quote_trade_date_key,
        CASE
          WHEN raw_quote.trade_date IS NULL THEN NULL
          WHEN raw_quote.delta IS NULL
            OR abs(raw_quote.delta) > 1
            OR nullif(btrim(raw_quote.option_type), '') IS NULL
            OR (
              raw_quote.underlying_price IS NOT NULL
              AND raw_quote.underlying_price::text = 'NaN'
            )
            OR raw_quote.strike IS NULL
            OR raw_quote.strike::text = 'NaN'
            THEN TRUE
          ELSE FALSE
        END AS latest_quote_bad
      FROM required_option_symbols
      CROSS JOIN params
      LEFT JOIN LATERAL (
        SELECT
          options_greeks.trade_date,
          options_greeks.option_type,
          options_greeks.delta,
          options_greeks.underlying_price,
          options_greeks.strike
        FROM ice_python.options_greeks AS options_greeks
        WHERE options_greeks.symbol = required_option_symbols.option_symbol
          AND options_greeks.trade_date <= params.market_as_of_date
        ORDER BY options_greeks.trade_date DESC, options_greeks.snapshot_at DESC
        LIMIT 1
      ) AS raw_quote ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          options_greeks.underlying,
          options_greeks.expiration::date AS expiration,
          options_greeks.delta
        FROM ice_python.options_greeks AS options_greeks
        WHERE options_greeks.symbol = required_option_symbols.option_symbol
          AND options_greeks.trade_date <= params.market_as_of_date
          AND options_greeks.delta IS NOT NULL
          AND abs(options_greeks.delta) <= 1
          AND nullif(btrim(options_greeks.option_type), '') IS NOT NULL
          AND (
            options_greeks.underlying_price IS NULL
            OR options_greeks.underlying_price::text <> 'NaN'
          )
          AND (
            options_greeks.strike IS NOT NULL
            AND options_greeks.strike::text <> 'NaN'
          )
        ORDER BY options_greeks.trade_date DESC, options_greeks.snapshot_at DESC
        LIMIT 1
      ) AS greeks ON TRUE
    ),
    grouped AS (
      SELECT
        md5(concat_ws('|',
          COALESCE(position_components.trader, ''),
          COALESCE(position_components.clearing_acct, ''),
          COALESCE(position_components.cust_acct, ''),
          COALESCE(position_components.product, ''),
          COALESCE(position_components.hub, ''),
          COALESCE(position_components.cc, ''),
          COALESCE(position_components.component_contract, ''),
          COALESCE(position_components.component_begin_date, ''),
          COALESCE(position_components.component_end_date, ''),
          COALESCE(position_components.option, ''),
          COALESCE(position_components.style, ''),
          COALESCE(position_components.strike::text, ''),
          COALESCE(position_components.strike_2::text, ''),
          COALESCE(position_components.qty_units, ''),
          COALESCE(position_components.price_units, ''),
          COALESCE(position_components.component_ice_symbol, ''),
          COALESCE(position_components.component_settlement_source_key, '')
        )) AS position_key,
        position_components.trader,
        position_components.clearing_acct,
        position_components.cust_acct,
        position_components.clearing_firm,
        position_components.product,
        position_components.hub,
        position_components.cc,
        position_components.asset_class,
        position_components.region,
        position_components.component_contract AS contract,
        position_components.component_begin_date AS begin_date,
        position_components.component_end_date AS end_date,
        position_components.option,
        position_components.style,
        position_components.strike,
        position_components.strike_2,
        position_components.qty_units,
        position_components.price_units,
        position_components.component_ice_symbol AS ice_symbol,
        MAX(position_components.component_contract_strip) AS settlement_contract_strip,
        MIN(position_components.component_contract_start_date_key) AS settlement_contract_start_date_key,
        MAX(position_components.component_contract_end_date_key) AS settlement_contract_end_date_key,
        position_components.option_symbol,
        position_components.underlying_symbol,
        position_components.component_settlement_source AS settlement_source,
        CASE
          WHEN position_components.component_settlement_source = 'ICE_SETTLEMENT' THEN position_components.component_ice_symbol
          ELSE position_components.component_settlement_source_key
        END AS settlement_source_key,
        position_components.component_contract_family AS settlement_contract_family,
        SUM(position_components.component_signed_lots)::double precision AS net_lots,
        SUM(position_components.component_signed_quantity) AS net_quantity,
        CASE
          WHEN SUM(position_components.component_signed_quantity) <> 0
            THEN SUM(position_components.component_signed_quantity * position_components.price) /
              SUM(position_components.component_signed_quantity)
          WHEN SUM(ABS(position_components.component_total_quantity)) <> 0
            THEN SUM(ABS(position_components.component_total_quantity) * position_components.price) /
              SUM(ABS(position_components.component_total_quantity))
          ELSE NULL
        END AS avg_price,
        CASE
          WHEN NULLIF(BTRIM(position_components.option), '') IS NOT NULL THEN latest_option_marks.settlement_mark
          WHEN position_components.component_settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP') THEN latest_iso_marks.settlement_mark
          ELSE latest_ice_marks.settlement_mark
        END AS settlement_mark,
        CASE
          WHEN NULLIF(BTRIM(position_components.option), '') IS NOT NULL THEN latest_option_marks.mark_trade_date
          WHEN position_components.component_settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP') THEN latest_iso_marks.mark_trade_date
          ELSE latest_ice_marks.mark_trade_date
        END AS mark_trade_date,
        CASE
          WHEN NULLIF(BTRIM(position_components.option), '') IS NOT NULL THEN latest_option_marks.prior_settlement_mark
          WHEN position_components.component_settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP') THEN NULL
          ELSE latest_ice_marks.prior_settlement_mark
        END AS prior_settlement_mark,
        CASE
          WHEN NULLIF(BTRIM(position_components.option), '') IS NOT NULL THEN latest_option_marks.prior_mark_trade_date
          WHEN position_components.component_settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP') THEN NULL
          ELSE latest_ice_marks.prior_mark_trade_date
        END AS prior_mark_trade_date,
        CASE
          WHEN NULLIF(BTRIM(position_components.option), '') IS NOT NULL THEN latest_option_greeks.delta
          ELSE NULL
        END AS option_delta,
        CASE
          WHEN NULLIF(BTRIM(position_components.option), '') IS NOT NULL THEN latest_option_greeks.latest_quote_trade_date_key
          ELSE NULL
        END AS option_greek_quote_date_key,
        CASE
          WHEN NULLIF(BTRIM(position_components.option), '') IS NOT NULL THEN latest_option_greeks.latest_quote_bad
          ELSE NULL
        END AS option_latest_quote_bad,
        CASE
          WHEN NULLIF(BTRIM(position_components.option), '') IS NOT NULL THEN latest_option_greeks.expiration_date_key
          ELSE NULL
        END AS option_expiration_date_key,
        CASE
          WHEN NULLIF(BTRIM(position_components.option), '') IS NOT NULL THEN latest_option_marks.mark_trade_date_key
          ELSE NULL
        END AS option_last_settlement_date_key,
        CASE
          WHEN NULLIF(BTRIM(position_components.option), '') IS NOT NULL AND latest_option_greeks.delta IS NOT NULL
            THEN SUM(position_components.component_signed_lots)::double precision * latest_option_greeks.delta
          ELSE NULL
        END AS delta_equivalent_lots,
        CASE
          WHEN NULLIF(BTRIM(position_components.option), '') IS NOT NULL AND latest_option_greeks.delta IS NOT NULL
            THEN SUM(position_components.component_signed_quantity) * latest_option_greeks.delta
          ELSE NULL
        END AS delta_equivalent_quantity,
        MIN(position_components.component_begin_delivery_date) AS begin_delivery_date_key,
        MAX(position_components.component_end_delivery_date) AS end_delivery_date_key,
        COUNT(*)::int AS contributing_trade_count,
        to_char(MAX(position_components.trade_date), 'YYYY-MM-DD') AS latest_trade_date,
        MAX(position_components.trade_time) AS latest_trade_time,
        to_char(MAX(position_components.updated_at), 'YYYY-MM-DD HH24:MI:SS') AS latest_updated_at
        ${
          includeLegs
            ? `,
        jsonb_agg(
          jsonb_build_object(
            'trade_date', to_char(position_components.trade_date, 'YYYY-MM-DD'),
            'trade_time', position_components.trade_time,
            'deal_id', position_components.deal_id,
            'leg_id', position_components.leg_id,
            'b_s', position_components.b_s,
            'product', position_components.product,
            'hub', position_components.hub,
            'contract', position_components.contract,
            'begin_date', position_components.begin_date,
            'end_date', position_components.end_date,
            'option', position_components.option,
            'style', position_components.style,
            'strike', position_components.strike,
            'strike_2', position_components.strike_2,
            'lots', position_components.lots,
            'total_quantity', position_components.total_quantity,
            'price', position_components.price,
            'trader', position_components.trader,
            'clearing_acct', position_components.clearing_acct,
            'cust_acct', position_components.cust_acct,
            'brk', position_components.brk
          )
          ORDER BY position_components.trade_date DESC, position_components.trade_time DESC, position_components.deal_id, position_components.leg_id
        ) AS legs`
            : ""
        }
      FROM position_components
      LEFT JOIN latest_ice_marks
        ON latest_ice_marks.symbol = position_components.component_ice_symbol
      LEFT JOIN latest_iso_marks
        ON latest_iso_marks.settlement_source_key = position_components.component_settlement_source_key
       AND latest_iso_marks.component_begin_delivery_date = position_components.component_begin_delivery_date
       AND latest_iso_marks.component_end_delivery_date = position_components.component_end_delivery_date
      LEFT JOIN latest_option_marks
        ON latest_option_marks.symbol = position_components.option_symbol
      LEFT JOIN latest_option_greeks
        ON latest_option_greeks.symbol = position_components.option_symbol
      GROUP BY
        position_components.trader,
        position_components.clearing_acct,
        position_components.cust_acct,
        position_components.clearing_firm,
        position_components.product,
        position_components.hub,
        position_components.cc,
        position_components.asset_class,
        position_components.region,
        position_components.component_contract,
        position_components.component_begin_date,
        position_components.component_end_date,
        position_components.option,
        position_components.style,
        position_components.strike,
        position_components.strike_2,
        position_components.qty_units,
        position_components.price_units,
        position_components.component_ice_symbol,
        position_components.option_symbol,
        position_components.underlying_symbol,
        position_components.component_settlement_source,
        position_components.component_settlement_source_key,
        position_components.component_contract_family,
        latest_ice_marks.settlement_mark,
        latest_ice_marks.mark_trade_date,
        latest_ice_marks.prior_settlement_mark,
        latest_ice_marks.prior_mark_trade_date,
        latest_iso_marks.settlement_mark,
        latest_iso_marks.mark_trade_date,
        latest_option_marks.settlement_mark,
        latest_option_marks.mark_trade_date,
        latest_option_marks.mark_trade_date_key,
        latest_option_marks.prior_settlement_mark,
        latest_option_marks.prior_mark_trade_date,
        latest_option_greeks.delta,
        latest_option_greeks.expiration_date_key,
        latest_option_greeks.latest_quote_trade_date_key,
        latest_option_greeks.latest_quote_bad
    ),
    priced AS (
      SELECT
        grouped.*,
        -- Options expire before the underlying delivery month. Prefer an exact
        -- ICE option expiration when Greeks provide it; otherwise use the last
        -- available option settlement date as the best observed expiry cutoff.
        -- DA (PJM_DA_LMP) products settle on the DA LMP for the flow day, which
        -- is published the day before delivery, so they expire one calendar day
        -- before end_date. RT/ICE products settle on/after their end_date.
        CASE
          WHEN NULLIF(BTRIM(grouped.option), '') IS NOT NULL
            THEN COALESCE(
              grouped.option_expiration_date_key,
              grouped.option_last_settlement_date_key,
              grouped.end_delivery_date_key
            )
          WHEN grouped.settlement_source = 'PJM_DA_LMP' AND grouped.end_delivery_date_key IS NOT NULL
            THEN grouped.end_delivery_date_key - 1
          ELSE grouped.end_delivery_date_key
        END AS effective_end_date_key
      FROM grouped
    )
    SELECT
      priced.position_key,
      priced.trader,
      priced.clearing_acct,
      priced.cust_acct,
      priced.clearing_firm,
      priced.product,
      priced.hub,
      priced.cc,
      priced.asset_class,
      priced.region,
      priced.contract,
      priced.begin_date,
      priced.end_date,
      priced.option,
      priced.style,
      priced.strike,
      priced.strike_2,
      priced.qty_units,
      priced.price_units,
      CASE
        WHEN priced.net_quantity > 0 THEN 'Long'
        WHEN priced.net_quantity < 0 THEN 'Short'
        ELSE 'Flat'
      END AS net_side,
      priced.net_lots,
      priced.net_quantity,
      priced.avg_price,
      priced.settlement_mark,
      priced.mark_trade_date,
      priced.prior_settlement_mark,
      priced.prior_mark_trade_date,
      priced.ice_symbol,
      priced.settlement_contract_strip,
      CASE
        WHEN priced.settlement_contract_start_date_key IS NULL THEN NULL
        ELSE to_char(priced.settlement_contract_start_date_key, 'YYYY-MM-DD')
      END AS settlement_contract_start_date,
      CASE
        WHEN priced.settlement_contract_end_date_key IS NULL THEN NULL
        ELSE to_char(priced.settlement_contract_end_date_key, 'YYYY-MM-DD')
      END AS settlement_contract_end_date,
      priced.option_symbol,
      priced.underlying_symbol,
      priced.option_delta,
      CASE
        WHEN priced.option_expiration_date_key IS NULL THEN NULL
        ELSE to_char(priced.option_expiration_date_key, 'YYYY-MM-DD')
      END AS option_expiration_date,
      CASE
        WHEN priced.option_last_settlement_date_key IS NULL THEN NULL
        ELSE to_char(priced.option_last_settlement_date_key, 'YYYY-MM-DD')
      END AS option_last_settlement_date,
      CASE
        WHEN NULLIF(BTRIM(priced.option), '') IS NULL THEN NULL
        WHEN priced.option_expiration_date_key IS NOT NULL THEN 'Greek Expiration'
        WHEN priced.option_last_settlement_date_key IS NOT NULL THEN 'Last Option Settlement'
        WHEN priced.end_delivery_date_key IS NOT NULL THEN 'Delivery End Fallback'
        ELSE 'Unknown'
      END AS option_expiry_source,
      CASE
        WHEN priced.option_greek_quote_date_key IS NULL THEN NULL
        ELSE to_char(priced.option_greek_quote_date_key, 'YYYY-MM-DD')
      END AS option_greek_quote_date,
      CASE
        WHEN NULLIF(BTRIM(priced.option), '') IS NULL THEN NULL
        WHEN params.valuation_date > priced.effective_end_date_key THEN 'Expired'
        WHEN priced.option_delta IS NOT NULL THEN 'Greek OK'
        WHEN priced.option_latest_quote_bad THEN 'Bad ICE Quote'
        WHEN priced.option_greek_quote_date_key IS NOT NULL THEN 'No Usable Greek'
        ELSE 'No Greek'
      END AS option_greek_status,
      CASE
        WHEN NULLIF(BTRIM(priced.option), '') IS NULL THEN NULL
        WHEN params.valuation_date > priced.effective_end_date_key THEN 'Option expired before valuation date'
        WHEN priced.option_delta IS NOT NULL THEN 'Exact ICE Greek selected'
        WHEN priced.option_latest_quote_bad THEN 'Latest ICE quote is missing valid option type, delta, strike, or underlying metadata'
        WHEN priced.option_greek_quote_date_key IS NOT NULL THEN 'No valid exact Greek quote at or before as-of date'
        ELSE 'No ICE Greek quote returned for exact option symbol'
      END AS option_greek_reason,
      priced.delta_equivalent_lots,
      priced.delta_equivalent_quantity,
      priced.settlement_source,
      priced.settlement_source_key,
      priced.settlement_contract_family,
      CASE
        WHEN priced.effective_end_date_key IS NULL THEN NULL
        ELSE (priced.effective_end_date_key - params.valuation_date)::int
      END AS days_to_expiry,
      CASE
        WHEN priced.begin_delivery_date_key IS NULL OR priced.effective_end_date_key IS NULL THEN 'Unknown'
        WHEN params.valuation_date > priced.effective_end_date_key THEN 'Expired'
        WHEN params.valuation_date = priced.effective_end_date_key THEN 'Expires Today'
        WHEN params.valuation_date < priced.begin_delivery_date_key THEN 'Future'
        WHEN params.valuation_date BETWEEN priced.begin_delivery_date_key AND priced.effective_end_date_key THEN 'In Delivery'
        ELSE 'Unknown'
      END AS delivery_status,
      CASE
        WHEN NULLIF(BTRIM(priced.option), '') IS NOT NULL AND priced.settlement_mark IS NOT NULL THEN 'Option - ICE Mark'
        WHEN NULLIF(BTRIM(priced.option), '') IS NOT NULL THEN 'Option - Unmarked'
        WHEN priced.settlement_source = 'PJM_RT_LMP' AND priced.settlement_mark IS NOT NULL THEN 'RT Product - ISO Mark'
        WHEN priced.settlement_source = 'PJM_RT_LMP' THEN 'RT Product - Unmarked'
        WHEN priced.settlement_source = 'PJM_DA_LMP' AND priced.settlement_mark IS NOT NULL THEN 'DA Product - ISO Mark'
        WHEN priced.settlement_source = 'PJM_DA_LMP' THEN 'DA Product - Unmarked'
        WHEN priced.settlement_mark IS NOT NULL THEN 'ICE Mark Available'
        ELSE 'Unmarked'
      END AS settlement_status,
      CASE
        WHEN priced.settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP')
          AND priced.settlement_mark IS NOT NULL
          AND priced.avg_price IS NOT NULL
          THEN priced.net_quantity * (priced.settlement_mark - priced.avg_price)
        WHEN priced.settlement_mark IS NULL OR priced.prior_settlement_mark IS NULL THEN NULL
        ELSE priced.net_quantity * (priced.settlement_mark - priced.prior_settlement_mark)
      END AS daily_pnl,
      CASE
        WHEN priced.settlement_mark IS NULL OR priced.avg_price IS NULL THEN NULL
        ELSE priced.net_quantity * (priced.settlement_mark - priced.avg_price)
      END AS open_pnl,
      priced.contributing_trade_count,
      priced.latest_trade_date,
      priced.latest_trade_time,
      priced.latest_updated_at
      ${includeLegs ? ", priced.legs" : ""}
    FROM priced
    CROSS JOIN params
    WHERE (priced.effective_end_date_key IS NULL OR priced.effective_end_date_key >= params.valuation_date)
      AND (ABS(priced.net_quantity) > 0.000001 OR ABS(priced.net_lots) > 0.000001)
    ORDER BY priced.effective_end_date_key NULLS LAST, priced.product, priced.hub, priced.contract, priced.trader;
  `;
}

function buildPositionLegsSql(): string {
  return `
    WITH params AS NOT MATERIALIZED (
      SELECT
        $1::date AS as_of_date,
        $3::text AS product_scope
    ),
    matching_trades AS (
      SELECT
        trades.*
      FROM ice_trade_blotter.ice_trade_blotter AS trades
      CROSS JOIN params
      WHERE trades.trade_date <= params.as_of_date
        AND ${tradeTableScopePredicateSql("trades")}
        AND md5(concat_ws('|',
          COALESCE(trades.trader, ''),
          COALESCE(trades.clearing_acct, ''),
          COALESCE(trades.cust_acct, ''),
          COALESCE(trades.product, ''),
          COALESCE(trades.hub, ''),
          COALESCE(trades.cc, ''),
          COALESCE(trades.contract, ''),
          COALESCE(trades.begin_date, ''),
          COALESCE(trades.end_date, ''),
          COALESCE(trades.option, ''),
          COALESCE(trades.style, ''),
          COALESCE(trades.strike::text, ''),
          COALESCE(trades.strike_2::text, ''),
          COALESCE(trades.qty_units, ''),
          COALESCE(trades.price_units, '')
        )) = $2
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'trade_date', to_char(matching_trades.trade_date, 'YYYY-MM-DD'),
          'trade_time', matching_trades.trade_time,
          'deal_id', matching_trades.deal_id,
          'leg_id', matching_trades.leg_id,
          'b_s', matching_trades.b_s,
          'product', matching_trades.product,
          'hub', matching_trades.hub,
          'contract', matching_trades.contract,
          'begin_date', matching_trades.begin_date,
          'end_date', matching_trades.end_date,
          'option', matching_trades.option,
          'style', matching_trades.style,
          'strike', matching_trades.strike,
          'strike_2', matching_trades.strike_2,
          'lots', matching_trades.lots,
          'total_quantity', matching_trades.total_quantity,
          'price', matching_trades.price,
          'trader', matching_trades.trader,
          'clearing_acct', matching_trades.clearing_acct,
          'cust_acct', matching_trades.cust_acct,
          'brk', matching_trades.brk
        )
        ORDER BY matching_trades.trade_date DESC, matching_trades.trade_time DESC, matching_trades.deal_id, matching_trades.leg_id
      ),
      '[]'::jsonb
    ) AS legs
    FROM matching_trades;
  `;
}

function sumNullable(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length > 0
    ? numbers.reduce((sum, value) => sum + value, 0)
    : null;
}

function buildSummary(rows: PositionRow[]): PositionsPayload["summary"] {
  return {
    rowCount: rows.length,
    totalNetLots: sumNullable(rows.map((row) => toNumber(row.net_lots))),
    totalNetQuantity: sumNullable(rows.map((row) => toNumber(row.net_quantity))),
    markedRowCount: rows.filter((row) => row.settlement_mark !== null).length,
    dailyMarkedRowCount: rows.filter((row) => row.daily_pnl !== null).length,
    totalDailyPnl: sumNullable(rows.map((row) => toNumber(row.daily_pnl))),
    totalOpenPnl: sumNullable(rows.map((row) => toNumber(row.open_pnl))),
    latestTradeDate: rows.reduce<string | null>(
      (latest, row) =>
        row.latest_trade_date && (!latest || row.latest_trade_date > latest)
          ? row.latest_trade_date
          : latest,
      null
    ),
    latestUpdatedAt: rows.reduce<string | null>(
      (latest, row) =>
        row.latest_updated_at && (!latest || row.latest_updated_at > latest)
          ? row.latest_updated_at
          : latest,
      null
    ),
  };
}

export async function GET(request: Request) {
  if (!isLocalOnlyFeatureEnabled()) {
    return NextResponse.json({ error: "ICE trade blotter is local-only while the settlement view is being validated." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "1";
  const scope = parseIceTradeProductScope(searchParams.get("scope"));
  const positionKey = searchParams.get("positionKey");

  try {
    const defaultAsOfResult = isDateKey(searchParams.get("asOf"))
      ? null
      : await query<LatestDateRow>(buildDefaultAsOfSql());
    const defaultAsOf = defaultAsOfResult?.rows[0]?.latest_date ?? dateKey(new Date());
    const asOf = parseDate(searchParams.get("asOf"), defaultAsOf);
    const marketAsOfResult = await query<MarketAsOfRow>(buildMarketAsOfSql(), [asOf]);
    const marketAsOf = marketAsOfResult.rows[0]?.market_as_of_date ?? asOf;
    const cacheKey = ["ice-trade-blotter-positions", asOf, scope].join(":");

    if (positionKey) {
      const legsCacheKey = ["ice-trade-blotter-position-legs", asOf, scope, positionKey].join(":");
      if (!refresh) {
        const cachedLegs = POSITION_LEGS_CACHE.get(legsCacheKey);
        if (cachedLegs && cachedLegs.expiresAt > Date.now()) {
          return NextResponse.json(cachedLegs.payload, {
            headers: {
              "Cache-Control": FRESH_CACHE_HEADER,
              "X-Ice-Trade-Blotter-Position-Legs-Cache": "HIT",
            },
          });
        }
      }

      const legsResult = await query<{ legs: PositionLegRow[] }>(buildPositionLegsSql(), [
        asOf,
        positionKey,
        scope,
      ]);
      const payload: PositionLegsPayload = {
        asOf,
        marketAsOf,
        scope,
        positionKey,
        rows: legsResult.rows[0]?.legs ?? [],
      };

      POSITION_LEGS_CACHE.set(legsCacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        payload,
      });

      return NextResponse.json(payload, {
        headers: {
          "Cache-Control": FRESH_CACHE_HEADER,
          "X-Ice-Trade-Blotter-Position-Legs-Cache": "MISS",
        },
      });
    }

    if (!refresh) {
      const cached = RESPONSE_CACHE.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.payload, {
          headers: { "Cache-Control": FRESH_CACHE_HEADER, "X-Ice-Trade-Blotter-Positions-Cache": "HIT" },
        });
      }
    }

    const rowsResult = await query<PositionRow>(buildPositionsSql(), [asOf, scope]);
    const rows = rowsResult.rows.map((row) => ({ ...row, as_of: asOf }));
    const payload: PositionsPayload = {
      asOf,
      marketAsOf,
      scope,
      rowCount: rows.length,
      summary: buildSummary(rows),
      rows,
    };

    RESPONSE_CACHE.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload,
    });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": FRESH_CACHE_HEADER, "X-Ice-Trade-Blotter-Positions-Cache": "MISS" },
    });
  } catch (error) {
    console.error("[ice-trade-blotter-positions] DB query failed:", error);
    if (positionKey) {
      const staleLegs = Array.from(POSITION_LEGS_CACHE.values()).sort((first, second) => second.expiresAt - first.expiresAt)[0];
      if (staleLegs) {
        return NextResponse.json(staleLegs.payload, {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
            "X-Ice-Trade-Blotter-Position-Legs-Cache": "STALE",
          },
        });
      }
    }
    const stale = Array.from(RESPONSE_CACHE.values()).sort((first, second) => second.expiresAt - first.expiresAt)[0];
    if (stale) {
      return NextResponse.json(stale.payload, {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          "X-Ice-Trade-Blotter-Positions-Cache": "STALE",
        },
      });
    }
    return NextResponse.json({ error: "Failed to fetch ICE trade blotter positions" }, { status: 500 });
  }
}
