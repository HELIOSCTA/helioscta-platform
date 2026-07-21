import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import type {
  IceTradeBlotterAggregateRow,
  IceTradeBlotterAvailableDate,
  IceTradeBlotterPayload,
  IceTradeBlotterSummary,
} from "@/lib/positionsAndTrades/iceTradeBlotterTypes";
import {
  RAW_ICE_TRADE_BLOTTER_AGGREGATE_LIMIT,
  RAW_ICE_TRADE_BLOTTER_FILE_MANIFEST_TABLE,
  RAW_ICE_TRADE_BLOTTER_SOURCE_TABLE,
  appliedFilters,
  baseArgs,
  parseRawIceTradeBlotterFilters,
  selectedRawIceTradeBlotterCte,
} from "@/lib/server/rawIceTradeBlotterSql";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "private, no-store";
const NO_STORE_HEADER = "no-store";
const ROUTE_CONFIG = {
  route: "/api/ice-trade-blotter/raw",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "deployment-protected no-store",
  owner: "frontend",
  purpose: "Raw ICE trade blotter summary and aggregate rows",
  p95TargetMs: 2_000,
  freshnessSource:
    "ice_trade_blotter.ice_trade_blotter.updated_at and ice_trade_blotter.file_manifest.loaded_at",
} as const;

interface AvailableDateDbRow {
  trade_date: string;
  row_count: number | string;
  distinct_deal_count: number | string;
  latest_report_date: string | null;
  latest_loaded_at: string | null;
  latest_updated_at: string | null;
}

interface SummaryDbRow {
  min_trade_date: string | null;
  max_trade_date: string | null;
  latest_report_date: string | null;
  latest_loaded_at: string | null;
  latest_updated_at: string | null;
  row_count: number | string;
  distinct_deal_count: number | string;
  product_count: number | string;
  hub_count: number | string;
  contract_count: number | string;
  trader_count: number | string;
  account_count: number | string;
  total_lots: number | string | null;
  net_quantity: number | string | null;
  gross_quantity: number | string | null;
}

interface SnapshotDbRow {
  selected_trade_date: string | null;
  latest_trade_date: string | null;
}

interface FilterDbRow {
  sides: unknown;
  traders: unknown;
  clearing_accounts: unknown;
  customer_accounts: unknown;
  clearing_firms: unknown;
  products: unknown;
  hubs: unknown;
  ccs: unknown;
  contracts: unknown;
  options: unknown;
  deal_sections: unknown;
  sources: unknown;
  user_ids: unknown;
}

interface AggregateDbRow {
  product: string | null;
  hub: string | null;
  contract: string | null;
  begin_date: string | null;
  end_date: string | null;
  option: string | null;
  strike: number | string | null;
  strike_2: number | string | null;
  cc: string | null;
  strip: string | null;
  deal_section: string | null;
  sides: string | null;
  traders: string | null;
  clearing_accounts: string | null;
  customer_accounts: string | null;
  row_count: number | string;
  distinct_deal_count: number | string;
  total_lots: number | string | null;
  net_lots: number | string | null;
  net_quantity: number | string | null;
  gross_quantity: number | string | null;
  avg_price: number | string | null;
  latest_trade_time: string | null;
  latest_updated_at: string | null;
}

interface BundleDbRow {
  snapshot: unknown;
  filters: unknown;
  summary: unknown;
  product_summary: unknown;
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

function round(value: unknown, digits = 2): number | null {
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
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

function mapAvailableDate(row: AvailableDateDbRow): IceTradeBlotterAvailableDate {
  return {
    tradeDate: row.trade_date,
    rowCount: toInteger(row.row_count),
    distinctDealCount: toInteger(row.distinct_deal_count),
    latestReportDate: row.latest_report_date,
    latestLoadedAt: isoOrText(row.latest_loaded_at),
    latestUpdatedAt: isoOrText(row.latest_updated_at),
  };
}

function mapSummary(row: SummaryDbRow | undefined): IceTradeBlotterSummary {
  return {
    rowCount: toInteger(row?.row_count),
    distinctDealCount: toInteger(row?.distinct_deal_count),
    productCount: toInteger(row?.product_count),
    hubCount: toInteger(row?.hub_count),
    contractCount: toInteger(row?.contract_count),
    traderCount: toInteger(row?.trader_count),
    accountCount: toInteger(row?.account_count),
    totalLots: round(row?.total_lots, 6),
    netQuantity: round(row?.net_quantity, 6),
    grossQuantity: round(row?.gross_quantity, 6),
    minTradeDate: row?.min_trade_date ?? null,
    maxTradeDate: row?.max_trade_date ?? null,
    latestReportDate: row?.latest_report_date ?? null,
    latestLoadedAt: isoOrText(row?.latest_loaded_at ?? null),
    latestUpdatedAt: isoOrText(row?.latest_updated_at ?? null),
  };
}

function mapAggregateRow(row: AggregateDbRow): IceTradeBlotterAggregateRow {
  return {
    product: row.product,
    hub: row.hub,
    contract: row.contract,
    beginDate: row.begin_date,
    endDate: row.end_date,
    option: row.option,
    strike: round(row.strike, 8),
    strike2: round(row.strike_2, 8),
    cc: row.cc,
    strip: row.strip,
    dealSection: row.deal_section,
    sides: row.sides,
    traders: row.traders,
    clearingAccounts: row.clearing_accounts,
    customerAccounts: row.customer_accounts,
    rowCount: toInteger(row.row_count),
    distinctDealCount: toInteger(row.distinct_deal_count),
    totalLots: round(row.total_lots, 6),
    netLots: round(row.net_lots, 6),
    netQuantity: round(row.net_quantity, 6),
    grossQuantity: round(row.gross_quantity, 6),
    avgPrice: round(row.avg_price, 6),
    latestTradeTime: row.latest_trade_time,
    latestUpdatedAt: isoOrText(row.latest_updated_at),
  };
}

function availableDatesSql(): string {
  return `
    SELECT
      to_char(trades.trade_date, 'YYYY-MM-DD') AS trade_date,
      count(*)::integer AS row_count,
      count(DISTINCT NULLIF(BTRIM(trades.deal_id), ''))::integer AS distinct_deal_count,
      to_char(MAX(trades.report_date), 'YYYY-MM-DD') AS latest_report_date,
      MAX(manifest.loaded_at)::text AS latest_loaded_at,
      MAX(trades.updated_at)::text AS latest_updated_at
    FROM ice_trade_blotter.ice_trade_blotter AS trades
    LEFT JOIN ice_trade_blotter.file_manifest AS manifest
      ON manifest.file_hash = trades.file_hash
    GROUP BY trades.trade_date
    ORDER BY trades.trade_date DESC
    LIMIT 90
  `;
}

function bundleSql(): string {
  return `
    ${selectedRawIceTradeBlotterCte()}
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
        SELECT jsonb_build_object(
          'sides',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(b_s), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(b_s), '') IS NOT NULL
            ) values
          ),
          'traders',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(trader), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(trader), '') IS NOT NULL
              LIMIT 300
            ) values
          ),
          'clearing_accounts',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(clearing_acct), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(clearing_acct), '') IS NOT NULL
              LIMIT 300
            ) values
          ),
          'customer_accounts',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(cust_acct), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(cust_acct), '') IS NOT NULL
              LIMIT 300
            ) values
          ),
          'clearing_firms',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(clearing_firm), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(clearing_firm), '') IS NOT NULL
              LIMIT 300
            ) values
          ),
          'products',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(product), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(product), '') IS NOT NULL
              LIMIT 400
            ) values
          ),
          'hubs',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(hub), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(hub), '') IS NOT NULL
              LIMIT 400
            ) values
          ),
          'ccs',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(cc), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(cc), '') IS NOT NULL
              LIMIT 300
            ) values
          ),
          'contracts',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(contract), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(contract), '') IS NOT NULL
              LIMIT 400
            ) values
          ),
          'options',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(option), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(option), '') IS NOT NULL
              LIMIT 200
            ) values
          ),
          'deal_sections',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(deal_section), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(deal_section), '') IS NOT NULL
              LIMIT 200
            ) values
          ),
          'sources',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(source), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(source), '') IS NOT NULL
              LIMIT 200
            ) values
          ),
          'user_ids',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(user_id), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(user_id), '') IS NOT NULL
              LIMIT 300
            ) values
          )
        )
      ) AS filters,
      (
        SELECT to_jsonb(summary_row)
        FROM (
          SELECT
            to_char(MIN(trade_date), 'YYYY-MM-DD') AS min_trade_date,
            to_char(MAX(trade_date), 'YYYY-MM-DD') AS max_trade_date,
            to_char(MAX(report_date), 'YYYY-MM-DD') AS latest_report_date,
            MAX(manifest_loaded_at)::text AS latest_loaded_at,
            MAX(updated_at)::text AS latest_updated_at,
            count(*)::integer AS row_count,
            count(DISTINCT NULLIF(BTRIM(deal_id), ''))::integer AS distinct_deal_count,
            count(DISTINCT NULLIF(BTRIM(product), ''))::integer AS product_count,
            count(DISTINCT NULLIF(BTRIM(hub), ''))::integer AS hub_count,
            count(DISTINCT NULLIF(BTRIM(contract), ''))::integer AS contract_count,
            count(DISTINCT NULLIF(BTRIM(trader), ''))::integer AS trader_count,
            count(DISTINCT NULLIF(CONCAT_WS('|', NULLIF(BTRIM(clearing_acct), ''), NULLIF(BTRIM(cust_acct), '')), ''))::integer AS account_count,
            SUM(lots)::double precision AS total_lots,
            SUM(signed_quantity)::double precision AS net_quantity,
            SUM(ABS(total_quantity))::double precision AS gross_quantity
          FROM source_trades
        ) summary_row
      ) AS summary,
      (
        SELECT coalesce(jsonb_agg(to_jsonb(product_row)), '[]'::jsonb)
        FROM (
          SELECT
            NULLIF(BTRIM(product), '') AS product,
            NULLIF(BTRIM(hub), '') AS hub,
            NULLIF(BTRIM(contract), '') AS contract,
            NULLIF(BTRIM(begin_date), '') AS begin_date,
            NULLIF(BTRIM(end_date), '') AS end_date,
            NULLIF(BTRIM(option), '') AS option,
            strike::double precision AS strike,
            strike_2::double precision AS strike_2,
            NULLIF(BTRIM(cc), '') AS cc,
            NULLIF(BTRIM(strip), '') AS strip,
            NULLIF(BTRIM(deal_section), '') AS deal_section,
            string_agg(DISTINCT NULLIF(BTRIM(b_s), ''), ', ' ORDER BY NULLIF(BTRIM(b_s), '')) FILTER (
              WHERE NULLIF(BTRIM(b_s), '') IS NOT NULL
            ) AS sides,
            string_agg(DISTINCT NULLIF(BTRIM(trader), ''), ', ' ORDER BY NULLIF(BTRIM(trader), '')) FILTER (
              WHERE NULLIF(BTRIM(trader), '') IS NOT NULL
            ) AS traders,
            string_agg(DISTINCT NULLIF(BTRIM(clearing_acct), ''), ', ' ORDER BY NULLIF(BTRIM(clearing_acct), '')) FILTER (
              WHERE NULLIF(BTRIM(clearing_acct), '') IS NOT NULL
            ) AS clearing_accounts,
            string_agg(DISTINCT NULLIF(BTRIM(cust_acct), ''), ', ' ORDER BY NULLIF(BTRIM(cust_acct), '')) FILTER (
              WHERE NULLIF(BTRIM(cust_acct), '') IS NOT NULL
            ) AS customer_accounts,
            count(*)::integer AS row_count,
            count(DISTINCT NULLIF(BTRIM(deal_id), ''))::integer AS distinct_deal_count,
            SUM(lots)::double precision AS total_lots,
            SUM(signed_lots)::double precision AS net_lots,
            SUM(signed_quantity)::double precision AS net_quantity,
            SUM(ABS(total_quantity))::double precision AS gross_quantity,
            (
              SUM(price * ABS(total_quantity))
              / NULLIF(SUM(ABS(total_quantity)), 0)
            )::double precision AS avg_price,
            MAX(NULLIF(BTRIM(trade_time), '')) AS latest_trade_time,
            MAX(updated_at)::text AS latest_updated_at
          FROM source_trades
          GROUP BY
            NULLIF(BTRIM(product), ''),
            NULLIF(BTRIM(hub), ''),
            NULLIF(BTRIM(contract), ''),
            NULLIF(BTRIM(begin_date), ''),
            NULLIF(BTRIM(end_date), ''),
            NULLIF(BTRIM(option), ''),
            strike,
            strike_2,
            NULLIF(BTRIM(cc), ''),
            NULLIF(BTRIM(strip), ''),
            NULLIF(BTRIM(deal_section), '')
          ORDER BY
            ABS(SUM(signed_quantity)) DESC,
            NULLIF(BTRIM(product), '') NULLS LAST,
            NULLIF(BTRIM(hub), '') NULLS LAST,
            NULLIF(BTRIM(contract), '') NULLS LAST,
            NULLIF(BTRIM(begin_date), '') NULLS LAST,
            NULLIF(BTRIM(end_date), '') NULLS LAST
          LIMIT ${RAW_ICE_TRADE_BLOTTER_AGGREGATE_LIMIT}
        ) product_row
      ) AS product_summary
  `;
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const filters = parseRawIceTradeBlotterFilters(searchParams);
  const cacheHeaders = responseCacheHeaders();

  const [availableRows, bundleRows] = await Promise.all([
    query<AvailableDateDbRow>(availableDatesSql()),
    query<BundleDbRow>(bundleSql(), baseArgs(filters)),
  ]);

  const availableDates = availableRows.map(mapAvailableDate);
  const bundle = bundleRows[0] ?? {
    snapshot: {},
    filters: {},
    summary: {},
    product_summary: [],
  };
  const snapshot = objectRecord(bundle.snapshot) as unknown as SnapshotDbRow;
  const filterRow = objectRecord(bundle.filters) as unknown as FilterDbRow;
  const summary = mapSummary(objectRecord(bundle.summary) as unknown as SummaryDbRow);
  const productRows = rowArray<AggregateDbRow>(bundle.product_summary);
  const selectedDate =
    snapshot.selected_trade_date ?? filters.requestedDate ?? availableDates[0]?.tradeDate ?? null;
  const latestDate = snapshot.latest_trade_date ?? availableDates[0]?.tradeDate ?? null;
  const asOf = summary.latestLoadedAt ?? summary.latestUpdatedAt ?? null;

  const payload: IceTradeBlotterPayload = {
    source: `postgres:${RAW_ICE_TRADE_BLOTTER_SOURCE_TABLE}`,
    selectedDate,
    latestDate,
    requestedDate: filters.requestedDate,
    asOf,
    latestLoadedAt: summary.latestLoadedAt,
    latestReportDate: summary.latestReportDate,
    availableDates,
    filters: appliedFilters(filters),
    summary,
    productSummary: productRows.map(mapAggregateRow),
    metadata: {
      sides: stringArray(filterRow.sides),
      traders: stringArray(filterRow.traders),
      clearingAccounts: stringArray(filterRow.clearing_accounts),
      customerAccounts: stringArray(filterRow.customer_accounts),
      clearingFirms: stringArray(filterRow.clearing_firms),
      products: stringArray(filterRow.products),
      hubs: stringArray(filterRow.hubs),
      ccs: stringArray(filterRow.ccs),
      contracts: stringArray(filterRow.contracts),
      options: stringArray(filterRow.options),
      dealSections: stringArray(filterRow.deal_sections),
      sources: stringArray(filterRow.sources),
      userIds: stringArray(filterRow.user_ids),
      aggregationGrain: [
        "product",
        "hub",
        "contract",
        "begin_date",
        "end_date",
        "option",
        "strike",
        "strike_2",
        "cc",
        "strip",
        "deal_section",
      ],
      productSummaryLimit: RAW_ICE_TRADE_BLOTTER_AGGREGATE_LIMIT,
      sourceTable: RAW_ICE_TRADE_BLOTTER_SOURCE_TABLE,
      fileManifestTable: RAW_ICE_TRADE_BLOTTER_FILE_MANIFEST_TABLE,
      units: {
        quantity: "ICE Deal Report total_quantity",
        price: "ICE Deal Report price",
      },
    },
  };

  return {
    payload,
    headers: cacheHeaders,
    rowCount: summary.rowCount,
    dataAsOf: asOf,
  };
});

export async function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
