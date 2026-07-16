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

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_TTL_MS = 5 * 60 * 1000;
const FRESH_CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=120";
const RESPONSE_CACHE = new Map<string, { expiresAt: number; payload: IceTradeBlotterPayload }>();

async function query<T>(text: string, values?: ReadonlyArray<unknown>): Promise<{ rows: T[] }> {
  return { rows: await serverQuery<T>(text, values) };
}

interface IceTradeBlotterRow {
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
  asset_class: string | null;
  region: string | null;
  product_group: string | null;
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
}

interface LatestDateRow {
  latest_date: string | null;
}

interface IceTradeBlotterPayload {
  startDate: string;
  endDate: string;
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
  };
  filters: {
    traders: string[];
    products: string[];
    hubs: string[];
    contracts: string[];
  };
  rows: IceTradeBlotterRow[];
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

function buildRowsSql(): string {
  return `
    WITH params AS NOT MATERIALIZED (
      SELECT
        $1::date AS start_trade_date,
        ($2::date + INTERVAL '1 day')::date AS end_trade_date,
        $3::text AS trader,
        $4::text AS product,
        $5::text AS hub,
        $6::text AS contract,
        $7::text AS product_scope
    ),
    ${buildProductDictionaryCte()},
    trades_normalized AS (
      SELECT
        trades.*,
        CASE
          WHEN regexp_replace(LOWER(BTRIM(trades.contract)), '[^a-z0-9]+', '', 'g') IN ('he0800he2300', 'he08002300') THEN 'D0'
          WHEN LOWER(BTRIM(trades.contract)) IN ('bal day', 'balance of day') THEN 'D0'
          WHEN LOWER(BTRIM(trades.contract)) = 'next day' THEN 'D1'
          WHEN LOWER(BTRIM(trades.contract)) IN ('bal week', 'balance of week') THEN 'W0'
          WHEN LOWER(BTRIM(trades.contract)) IN ('next week', 'week 1') THEN 'W1'
          WHEN LOWER(BTRIM(trades.contract)) IN ('2nd week', 'second week', 'week 2') THEN 'W2'
          WHEN LOWER(BTRIM(trades.contract)) IN ('3rd week', 'third week', 'week 3') THEN 'W3'
          WHEN LOWER(BTRIM(trades.contract)) IN ('4th week', 'fourth week', 'week 4') THEN 'W4'
          WHEN regexp_replace(LOWER(BTRIM(trades.contract)), '[^a-z0-9]+', '', 'g') IN ('weekend2x16', 'wknd2x16', '2x16') THEN 'P1'
          ELSE NULL
        END AS settlement_contract_code
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
    )
    SELECT
      to_char(trades.trade_date, 'YYYY-MM-DD') AS trade_date,
      trades.trade_time,
      to_char(trades.report_date, 'YYYY-MM-DD') AS report_date,
      trades.deal_id,
      trades.leg_id,
      trades.orig_id,
      trades.b_s,
      trades.product,
      trades.hub,
      trades.contract,
      trades.begin_date,
      trades.end_date,
      trades.clearing_acct,
      trades.cust_acct,
      trades.clearing_firm,
      trades.price,
      trades.price_units,
      trades.option,
      trades.strike,
      trades.strike_2,
      trades.style,
      trades.lots,
      trades.total_quantity,
      trades.qty_units,
      trades.tt,
      trades.brk,
      trades.trader,
      trades.memo,
      trades.clearing_venue,
      trades.user_id,
      trades.source,
      trades.link_id,
      trades.usi,
      trades.authorized_trader_id,
      trades.location,
      trades.meter,
      trades.lead_time,
      trades.waiver_ind,
      trades.trade_time_micros,
      trades.cdi_override,
      trades.by_pass_mqr,
      trades.broker_name,
      trades.trading_company,
      trades.mic,
      trades.cc,
      trades.strip,
      trades.counterparty,
      trades.qty_per_period,
      trades.periods,
      trades.counterparty_user,
      trades.deal_section,
      trades.file_hash,
      trades.source_row_number,
      trades.source_row_hash,
      to_char(trades.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
      to_char(trades.updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at,
      COALESCE(
        matched_product.asset_class,
        CASE
          WHEN UPPER(BTRIM(trades.cc)) IN ('H', 'HNG', 'PHE', 'TRZ', 'TFL', 'CGB', 'CGM', 'TWB', 'HXS', 'WAH', 'NTO', 'ALQ', 'TMT', 'T5B', 'IZB', 'TZS', 'DOM', 'SCB', 'PGE', 'CRI')
            OR LOWER(BTRIM(trades.product)) LIKE '%gas%'
            THEN 'Gas'
          ELSE 'Power'
        END
      ) AS asset_class,
      COALESCE(
        matched_product.region,
        CASE
          WHEN UPPER(BTRIM(trades.cc)) IN ('H', 'HNG', 'PHE', 'XGF')
            OR LOWER(BTRIM(trades.hub)) LIKE '%henry%'
            OR LOWER(BTRIM(trades.product)) LIKE '%henry%'
            THEN 'Henry Hub'
          WHEN UPPER(BTRIM(trades.cc)) IN ('TRZ', 'TFL', 'CGB', 'CGM', 'TWB', 'HXS', 'WAH', 'NTO', 'ALQ', 'TMT', 'T5B', 'IZB', 'TZS', 'DOM', 'SCB', 'PGE', 'CRI')
            OR LOWER(BTRIM(trades.product)) LIKE '%gas%'
            THEN 'Basis'
          WHEN UPPER(BTRIM(trades.cc)) IN ('PMI', 'OPJ', 'P1X', 'PDP', 'PWA', 'PDA', 'PJL', 'PDO', 'ODP') THEN 'PJM'
          WHEN UPPER(BTRIM(trades.cc)) IN ('ERN', 'ECI', 'END', 'ERA', 'NDA', 'NED') THEN 'ERCOT'
          ELSE NULL
        END,
        NULLIF(BTRIM(trades.hub), '')
      ) AS region,
      matched_product.product_group
    FROM trades_normalized AS trades
    CROSS JOIN params
    LEFT JOIN LATERAL (
      SELECT
        product_dictionary.asset_class,
        product_dictionary.region,
        product_dictionary.product_group
      FROM product_dictionary
      WHERE
        product_dictionary.active
        AND product_dictionary.cc = UPPER(BTRIM(trades.cc))
        AND (
          LOWER(BTRIM(trades.hub)) = ANY(product_dictionary.blotter_hub_aliases)
          OR CARDINALITY(product_dictionary.blotter_hub_aliases) = 0
        )
        AND (
          product_dictionary.contract_code = trades.settlement_contract_code
          OR (
            product_dictionary.settlement_source = 'ICE_OPTION_SETTLEMENT'
            AND NULLIF(BTRIM(trades.option), '') IS NOT NULL
            AND BTRIM(trades.contract) ~* '^[A-Za-z]{3,4}[0-9]{2}$'
          )
          OR (
            product_dictionary.contract_code = 'MONTH'
            AND NULLIF(BTRIM(trades.option), '') IS NULL
            AND BTRIM(trades.contract) ~* '^[A-Za-z]{3}[0-9]{2}$'
          )
        )
      ORDER BY product_dictionary.settlement_priority, product_dictionary.contract_code
      LIMIT 1
    ) AS matched_product ON TRUE
    WHERE ${normalizedContractScopePredicateSql("trades.cc", "trades.settlement_contract_code")}
    ORDER BY
      trades.trade_date DESC,
      trades.report_date DESC,
      trades.trade_time DESC,
      trades.deal_id,
      trades.leg_id;
  `;
}

function buildSummarySql(): string {
  return `
    WITH filtered AS (${buildRowsSql().trim().replace(/;$/, "")})
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
      MAX(updated_at) AS latest_updated_at
    FROM filtered;
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

function normalizeSummary(row: SummaryRow | undefined): IceTradeBlotterPayload["summary"] {
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
    const cacheKey = [
      "ice-trade-blotter",
      dateMode,
      startDate,
      endDate,
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
          headers: { "Cache-Control": FRESH_CACHE_HEADER, "X-Ice-Trade-Blotter-Cache": "HIT" },
        });
      }
    }

    const params = [startDate, endDate, trader, product, hub, contract, scope];
    const [rowsResult, summaryResult] = await Promise.all([
      query<IceTradeBlotterRow>(buildRowsSql(), params),
      query<SummaryRow>(buildSummarySql(), params),
    ]);
    const payload: IceTradeBlotterPayload = {
      startDate,
      endDate,
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
      headers: { "Cache-Control": FRESH_CACHE_HEADER, "X-Ice-Trade-Blotter-Cache": "MISS" },
    });
  } catch (error) {
    console.error("[ice-trade-blotter] DB query failed:", error);
    const stale = Array.from(RESPONSE_CACHE.values()).sort((first, second) => second.expiresAt - first.expiresAt)[0];
    if (stale) {
      return NextResponse.json(stale.payload, {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          "X-Ice-Trade-Blotter-Cache": "STALE",
        },
      });
    }
    return NextResponse.json({ error: "Failed to fetch ICE trade blotter data" }, { status: 500 });
  }
}
