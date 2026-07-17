import { NextResponse } from "next/server";
import { query as serverQuery } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import { buildProductDictionaryCte } from "@/lib/iceTradeBlotterProductDictionary";
import {
  parseIceTradeProductScope,
  productDictionaryScopePredicateSql,
  type IceTradeProductScope,
} from "@/lib/iceTradeBlotterRules";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_TTL_MS = 5 * 60 * 1000;
const FRESH_CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=300";
const RESPONSE_CACHE = new Map<string, { expiresAt: number; payload: ProductDictionaryPayload }>();

async function query<T>(text: string, values?: ReadonlyArray<unknown>): Promise<{ rows: T[] }> {
  return { rows: await serverQuery<T>(text, values) };
}

interface ProductDictionaryRow {
  cc: string;
  blotter_cc: string;
  asset_class: string;
  region: string;
  product_group: string;
  ice_symbol_pattern: string;
  product_name: string;
  market: string;
  hub: string;
  blotter_hub_aliases: string;
  pjm_pnode_name: string;
  contract_family: string;
  contract_code: string;
  contract_label: string;
  hour_bucket: string;
  shape: string;
  ice_product_type: string;
  settlement_source: string;
  settlement_source_key: string;
  settlement_priority: number | string;
  active: boolean;
  ice_product_id: string | null;
  ice_product_url: string | null;
  ice_product_title: string | null;
  ice_contract_symbol: string | null;
  ice_contract_size: string | null;
  ice_trading_screen_product_name: string | null;
  ice_trading_screen_hub_name: string | null;
  ice_reference_price: string | null;
  ice_specified_price: string | null;
  ice_metadata_status: string;
  notes: string;
}

interface ProductDictionaryPayload {
  scope: IceTradeProductScope;
  rowCount: number;
  summary: {
    rowCount: number;
    activeRowCount: number;
    pjmRowCount: number;
    iceRowCount: number;
    optionRowCount: number;
    assetClassCounts: Record<string, number>;
    regionCounts: Record<string, number>;
    groupCounts: Record<string, number>;
  };
  rows: ProductDictionaryRow[];
}

interface SummaryRow {
  row_count: number | string;
  active_row_count: number | string;
  pjm_row_count: number | string;
  ice_row_count: number | string;
  option_row_count: number | string;
  asset_class_counts: Record<string, number> | null;
  region_counts: Record<string, number> | null;
  group_counts: Record<string, number> | null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildRowsSql(): string {
  return `
    WITH params AS NOT MATERIALIZED (
      SELECT $1::text AS product_scope
    ),
    ${buildProductDictionaryCte()}
    SELECT
      COALESCE(product_dictionary.ice_contract_symbol, product_dictionary.cc) AS cc,
      product_dictionary.cc AS blotter_cc,
      product_dictionary.asset_class,
      product_dictionary.region,
      product_dictionary.product_group,
      product_dictionary.ice_symbol_pattern,
      product_dictionary.product_name,
      product_dictionary.market,
      product_dictionary.hub,
      array_to_string(product_dictionary.blotter_hub_aliases, ', ') AS blotter_hub_aliases,
      product_dictionary.pjm_pnode_name,
      product_dictionary.contract_family,
      product_dictionary.contract_code,
      product_dictionary.contract_label,
      product_dictionary.hour_bucket,
      product_dictionary.shape,
      product_dictionary.ice_product_type,
      product_dictionary.settlement_source,
      product_dictionary.settlement_source_key,
      product_dictionary.settlement_priority,
      product_dictionary.active,
      product_dictionary.ice_product_id,
      product_dictionary.ice_product_url,
      product_dictionary.product_name AS ice_product_title,
      product_dictionary.ice_contract_symbol,
      product_dictionary.ice_contract_size,
      product_dictionary.ice_trading_screen_product_name,
      product_dictionary.ice_trading_screen_hub_name,
      product_dictionary.ice_reference_price,
      product_dictionary.ice_specified_price,
      product_dictionary.ice_metadata_status,
      product_dictionary.notes
    FROM product_dictionary
    CROSS JOIN params
    WHERE ${productDictionaryScopePredicateSql("product_dictionary")}
    ORDER BY
      CASE product_dictionary.contract_family
        WHEN 'Daily' THEN 1
        WHEN 'Weekly' THEN 2
        WHEN 'Next Day' THEN 3
        WHEN 'BALMO' THEN 4
        WHEN 'Monthly' THEN 5
        ELSE 99
      END,
      product_dictionary.contract_family,
      CASE product_dictionary.settlement_source
        WHEN 'PJM_DA_LMP' THEN 1
        WHEN 'PJM_RT_LMP' THEN 2
        WHEN 'ERCOT_DA_LMP' THEN 3
        WHEN 'ERCOT_RT_LMP' THEN 4
        WHEN 'ICE_SETTLEMENT' THEN 5
        ELSE 99
      END,
      product_dictionary.settlement_source,
      product_dictionary.cc,
      product_dictionary.contract_code;
  `;
}

function buildSummarySql(): string {
  return `
    WITH rows AS (${buildRowsSql().trim().replace(/;$/, "")}),
    summary AS (
      SELECT
        COUNT(*)::int AS row_count,
        COUNT(*) FILTER (WHERE active)::int AS active_row_count,
        COUNT(*) FILTER (WHERE settlement_source IN ('PJM_RT_LMP', 'PJM_DA_LMP'))::int AS pjm_row_count,
        COUNT(*) FILTER (WHERE settlement_source = 'ICE_SETTLEMENT')::int AS ice_row_count,
        COUNT(*) FILTER (WHERE settlement_source = 'ICE_OPTION_SETTLEMENT')::int AS option_row_count
      FROM rows
    ),
    asset_class_counts AS (
      SELECT COALESCE(jsonb_object_agg(asset_class, row_count), '{}'::jsonb) AS asset_class_counts
      FROM (
        SELECT asset_class, COUNT(*)::int AS row_count
        FROM rows
        GROUP BY asset_class
      ) AS counts
    ),
    region_counts AS (
      SELECT COALESCE(jsonb_object_agg(region, row_count), '{}'::jsonb) AS region_counts
      FROM (
        SELECT region, COUNT(*)::int AS row_count
        FROM rows
        GROUP BY region
      ) AS counts
    ),
    group_counts AS (
      SELECT COALESCE(jsonb_object_agg(product_group, row_count), '{}'::jsonb) AS group_counts
      FROM (
        SELECT product_group, COUNT(*)::int AS row_count
        FROM rows
        GROUP BY product_group
      ) AS counts
    )
    SELECT
      summary.*,
      asset_class_counts.asset_class_counts,
      region_counts.region_counts,
      group_counts.group_counts
    FROM summary
    CROSS JOIN asset_class_counts
    CROSS JOIN region_counts
    CROSS JOIN group_counts;
  `;
}

function normalizeSummary(row: SummaryRow | undefined): ProductDictionaryPayload["summary"] {
  return {
    rowCount: toNumber(row?.row_count) ?? 0,
    activeRowCount: toNumber(row?.active_row_count) ?? 0,
    pjmRowCount: toNumber(row?.pjm_row_count) ?? 0,
    iceRowCount: toNumber(row?.ice_row_count) ?? 0,
    optionRowCount: toNumber(row?.option_row_count) ?? 0,
    assetClassCounts: row?.asset_class_counts ?? {},
    regionCounts: row?.region_counts ?? {},
    groupCounts: row?.group_counts ?? {},
  };
}

export async function GET(request: Request) {
  if (!isLocalOnlyFeatureEnabled()) {
    return NextResponse.json({ error: "ICE trade blotter is local-only while the settlement view is being validated." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const { searchParams } = new URL(request.url);
  const scope = parseIceTradeProductScope(searchParams.get("scope"));
  const refresh = searchParams.get("refresh") === "1";
  const cacheKey = ["ice-trade-blotter-product-dictionary", scope].join(":");

  if (!refresh) {
    const cached = RESPONSE_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload, {
        headers: {
          "Cache-Control": FRESH_CACHE_HEADER,
          "X-Ice-Trade-Blotter-Product-Dictionary-Cache": "HIT",
        },
      });
    }
  }

  try {
    const [rowsResult, summaryResult] = await Promise.all([
      query<ProductDictionaryRow>(buildRowsSql(), [scope]),
      query<SummaryRow>(buildSummarySql(), [scope]),
    ]);
    const payload: ProductDictionaryPayload = {
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
      headers: {
        "Cache-Control": FRESH_CACHE_HEADER,
        "X-Ice-Trade-Blotter-Product-Dictionary-Cache": "MISS",
      },
    });
  } catch (error) {
    console.error("[ice-trade-blotter-product-dictionary] DB query failed:", error);
    const stale = Array.from(RESPONSE_CACHE.values()).sort((first, second) => second.expiresAt - first.expiresAt)[0];
    if (stale) {
      return NextResponse.json(stale.payload, {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          "X-Ice-Trade-Blotter-Cache": "STALE",
        },
      });
    }
    return NextResponse.json({ error: "Failed to fetch ICE product dictionary" }, { status: 500 });
  }
}
