import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import type {
  IceTradeBlotterDebugPayload,
  IceTradeBlotterRawRow,
} from "@/lib/positionsAndTrades/iceTradeBlotterTypes";
import {
  RAW_ICE_TRADE_BLOTTER_BASE_PARAM_COUNT,
  RAW_ICE_TRADE_BLOTTER_FILE_MANIFEST_TABLE,
  RAW_ICE_TRADE_BLOTTER_SOURCE_TABLE,
  appliedFilters,
  baseArgs,
  buildRawIceTradeBlotterDrilldownWhere,
  parseDrilldownFilter,
  parseDrilldownLimit,
  parseRawIceTradeBlotterFilters,
  selectedRawIceTradeBlotterCte,
} from "@/lib/server/rawIceTradeBlotterSql";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "private, no-store";
const NO_STORE_HEADER = "no-store";
const ROUTE_CONFIG = {
  route: "/api/ice-trade-blotter/raw/drilldown",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "deployment-protected no-store",
  owner: "frontend",
  purpose: "Bounded raw ICE trade blotter rows",
  p95TargetMs: 2_000,
  freshnessSource:
    "ice_trade_blotter.ice_trade_blotter.updated_at and ice_trade_blotter.file_manifest.loaded_at",
} as const;

interface SnapshotDbRow {
  selected_trade_date: string | null;
  latest_trade_date: string | null;
}

interface SummaryDbRow {
  row_count: number | string;
  latest_loaded_at: string | null;
  latest_updated_at: string | null;
}

interface RawRowDbRow {
  trade_date: string;
  trade_time: string | null;
  report_date: string | null;
  deal_id: string | null;
  leg_id: string | null;
  orig_id: string | null;
  link_id: string | null;
  side: string | null;
  product: string | null;
  hub: string | null;
  contract: string | null;
  begin_date: string | null;
  end_date: string | null;
  clearing_acct: string | null;
  cust_acct: string | null;
  clearing_firm: string | null;
  broker_name: string | null;
  price: number | string | null;
  price_units: string | null;
  option: string | null;
  strike: number | string | null;
  strike_2: number | string | null;
  style: string | null;
  lots: number | string | null;
  total_quantity: number | string | null;
  qty_units: string | null;
  trader: string | null;
  counterparty: string | null;
  memo: string | null;
  source: string | null;
  user_id: string | null;
  deal_section: string | null;
  file_hash: string | null;
  source_row_number: number | string | null;
  source_row_hash: string | null;
  updated_at: string | null;
}

interface BundleDbRow {
  snapshot: unknown;
  summary: unknown;
  raw_rows: unknown;
}

function responseCacheHeaders(): HeadersInit {
  return {
    "Cache-Control": CACHE_HEADER,
    "Vercel-CDN-Cache-Control": NO_STORE_HEADER,
    "X-Helios-Cache-Policy": "auth-protected no-store",
  };
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: unknown): number {
  const parsed = toNumber(value);
  return parsed === null ? 0 : Math.trunc(parsed);
}

function round(value: unknown, digits = 6): number | null {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function isoOrText(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rowArray<T extends object>(value: unknown): T[] {
  return Array.isArray(value)
    ? value.filter((item): item is T => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function mapRawRow(row: RawRowDbRow): IceTradeBlotterRawRow {
  return {
    tradeDate: row.trade_date,
    tradeTime: row.trade_time,
    reportDate: row.report_date,
    dealId: row.deal_id,
    legId: row.leg_id,
    origId: row.orig_id,
    linkId: row.link_id,
    side: row.side,
    product: row.product,
    hub: row.hub,
    contract: row.contract,
    beginDate: row.begin_date,
    endDate: row.end_date,
    clearingAcct: row.clearing_acct,
    custAcct: row.cust_acct,
    clearingFirm: row.clearing_firm,
    brokerName: row.broker_name,
    price: round(row.price),
    priceUnits: row.price_units,
    option: row.option,
    strike: round(row.strike),
    strike2: round(row.strike_2),
    style: row.style,
    lots: round(row.lots),
    totalQuantity: round(row.total_quantity),
    qtyUnits: row.qty_units,
    trader: row.trader,
    counterparty: row.counterparty,
    memo: row.memo,
    source: row.source,
    userId: row.user_id,
    dealSection: row.deal_section,
    fileHash: row.file_hash,
    sourceRowNumber: toNumber(row.source_row_number),
    sourceRowHash: row.source_row_hash,
    updatedAt: isoOrText(row.updated_at),
  };
}

function bundleSql(drilldownWhereSql: string): string {
  return `
    ${selectedRawIceTradeBlotterCte()},
    drilldown_trades AS MATERIALIZED (
      SELECT *
      FROM source_trades
      WHERE ${drilldownWhereSql}
    )
    SELECT
      (
        SELECT to_jsonb(snapshot_row)
        FROM (
          SELECT
            to_char(selected_trade_date, 'YYYY-MM-DD') AS selected_trade_date,
            to_char(latest_trade_date, 'YYYY-MM-DD') AS latest_trade_date
          FROM selected_snapshot
        ) snapshot_row
      ) AS snapshot,
      (
        SELECT to_jsonb(summary_row)
        FROM (
          SELECT
            count(*)::integer AS row_count,
            MAX(manifest_loaded_at)::text AS latest_loaded_at,
            MAX(updated_at)::text AS latest_updated_at
          FROM drilldown_trades
        ) summary_row
      ) AS summary,
      (
        SELECT coalesce(jsonb_agg(to_jsonb(raw_row)), '[]'::jsonb)
        FROM (
          SELECT
            to_char(trade_date, 'YYYY-MM-DD') AS trade_date,
            NULLIF(BTRIM(trade_time), '') AS trade_time,
            to_char(report_date, 'YYYY-MM-DD') AS report_date,
            NULLIF(BTRIM(deal_id), '') AS deal_id,
            NULLIF(BTRIM(leg_id), '') AS leg_id,
            NULLIF(BTRIM(orig_id), '') AS orig_id,
            NULLIF(BTRIM(link_id), '') AS link_id,
            NULLIF(BTRIM(b_s), '') AS side,
            NULLIF(BTRIM(product), '') AS product,
            NULLIF(BTRIM(hub), '') AS hub,
            NULLIF(BTRIM(contract), '') AS contract,
            NULLIF(BTRIM(begin_date), '') AS begin_date,
            NULLIF(BTRIM(end_date), '') AS end_date,
            NULLIF(BTRIM(clearing_acct), '') AS clearing_acct,
            NULLIF(BTRIM(cust_acct), '') AS cust_acct,
            NULLIF(BTRIM(clearing_firm), '') AS clearing_firm,
            NULLIF(BTRIM(broker_name), '') AS broker_name,
            price::double precision AS price,
            NULLIF(BTRIM(price_units), '') AS price_units,
            NULLIF(BTRIM(option), '') AS option,
            strike::double precision AS strike,
            strike_2::double precision AS strike_2,
            NULLIF(BTRIM(style), '') AS style,
            lots::double precision AS lots,
            total_quantity::double precision AS total_quantity,
            NULLIF(BTRIM(qty_units), '') AS qty_units,
            NULLIF(BTRIM(trader), '') AS trader,
            NULLIF(BTRIM(counterparty), '') AS counterparty,
            NULLIF(BTRIM(memo), '') AS memo,
            NULLIF(BTRIM(source), '') AS source,
            NULLIF(BTRIM(user_id), '') AS user_id,
            NULLIF(BTRIM(deal_section), '') AS deal_section,
            file_hash,
            source_row_number,
            source_row_hash,
            updated_at::text AS updated_at
          FROM drilldown_trades
          ORDER BY
            trade_time NULLS LAST,
            deal_id NULLS LAST,
            leg_id NULLS LAST,
            source_row_number
          LIMIT $${RAW_ICE_TRADE_BLOTTER_BASE_PARAM_COUNT + 1}::integer
        ) raw_row
      ) AS raw_rows
  `;
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const filters = parseRawIceTradeBlotterFilters(searchParams);
  const limit = parseDrilldownLimit(searchParams.get("limit"));
  const drilldown = parseDrilldownFilter(searchParams.get("drilldown"));
  const drilldownWhere = buildRawIceTradeBlotterDrilldownWhere({
    filter: drilldown,
    firstParameterIndex: RAW_ICE_TRADE_BLOTTER_BASE_PARAM_COUNT + 2,
  });
  const rows = await query<BundleDbRow>(bundleSql(drilldownWhere.sql), [
    ...baseArgs(filters),
    limit,
    ...drilldownWhere.args,
  ]);
  const bundle = rows[0] ?? { snapshot: {}, summary: {}, raw_rows: [] };
  const snapshot = objectRecord(bundle.snapshot) as unknown as SnapshotDbRow;
  const summary = objectRecord(bundle.summary) as unknown as SummaryDbRow;
  const rawRows = rowArray<RawRowDbRow>(bundle.raw_rows);
  const rowCount = toInteger(summary.row_count);
  const asOf = isoOrText(summary.latest_loaded_at ?? summary.latest_updated_at ?? null);

  const payload: IceTradeBlotterDebugPayload = {
    source: `postgres:${RAW_ICE_TRADE_BLOTTER_SOURCE_TABLE}`,
    selectedDate:
      snapshot.selected_trade_date ?? filters.requestedDate ?? snapshot.latest_trade_date ?? null,
    latestDate: snapshot.latest_trade_date ?? null,
    requestedDate: filters.requestedDate,
    asOf,
    latestLoadedAt: isoOrText(summary.latest_loaded_at ?? null),
    filters: appliedFilters(filters),
    summary: {
      rowCount,
      returnedRowCount: rawRows.length,
      limit,
    },
    rows: rawRows.map(mapRawRow),
    metadata: {
      drilldown,
      sourceTable: RAW_ICE_TRADE_BLOTTER_SOURCE_TABLE,
      fileManifestTable: RAW_ICE_TRADE_BLOTTER_FILE_MANIFEST_TABLE,
    },
  };

  return {
    payload,
    headers: responseCacheHeaders(),
    rowCount,
    dataAsOf: asOf,
  };
});

export async function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
