import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  getPositionsAndTradesArtifact,
  type PositionsAndTradesManifestArtifact,
} from "@/lib/server/positionsAndTradesManifest";

export const NAV_POSITIONS_ALL_HISTORY_ARTIFACT_ID = "nav_frontend_all_history";
export const NAV_POSITIONS_LATEST_ARTIFACT_ID = "nav_frontend_latest";

export interface PromotedNavPositionsSql {
  sql: string;
  promotedSqlPath: string;
  dbtModelPath: string;
  dbtCompiledPath: string;
  artifactId: string;
  artifactDisplayName: string;
  contractId: string;
  contractDisplayName: string;
  dbtModelFamily: string;
  referenceSchema: string;
  referenceTables: string[];
}

let cachedAllHistorySql: string | null = null;
let cachedLatestSql: string | null = null;

function runtimePathsForPromotedSql(promotedSqlPath: string): string[] {
  const frontendRelativePath = promotedSqlPath.startsWith("frontend/")
    ? promotedSqlPath.slice("frontend/".length)
    : promotedSqlPath;
  return [
    path.join(process.cwd(), ...frontendRelativePath.split("/")),
    path.join(process.cwd(), ...promotedSqlPath.split("/")),
  ];
}

async function loadPromotedSql({
  artifact,
}: {
  artifact: PositionsAndTradesManifestArtifact;
}): Promise<string> {
  let content: string | null = null;
  for (const candidatePath of runtimePathsForPromotedSql(artifact.promotedSql)) {
    try {
      content = await readFile(candidatePath, "utf8");
      break;
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: unknown }).code
          : null;
      if (code !== "ENOENT") throw error;
    }
  }
  if (content === null) {
    throw new Error(
      `Unable to read ${artifact.promotedSql}. Run dbt/azure_postgres/scripts/promote_positions_trades_sql.py.`,
    );
  }

  const sql = stripFinalOrderBy(content.trim().replace(/;\s*$/, ""));
  if (
    !sql.toLowerCase().includes("normalization_status") ||
    !sql.toLowerCase().includes("product_norm") ||
    !sql.includes("__dbt__cte__")
  ) {
    throw new Error(`${artifact.promotedSql} is not a compiled dbt NAV positions frontend contract.`);
  }

  return sql;
}

function stripFinalOrderBy(sql: string): string {
  const orderByIndex = sql.toLowerCase().lastIndexOf("\norder by");
  return orderByIndex >= 0 ? sql.slice(0, orderByIndex).trimEnd() : sql;
}

export async function loadPromotedNavPositionsSql({
  requestedDate,
}: {
  requestedDate: string | null;
}): Promise<PromotedNavPositionsSql> {
  const artifactId = requestedDate
    ? NAV_POSITIONS_ALL_HISTORY_ARTIFACT_ID
    : NAV_POSITIONS_LATEST_ARTIFACT_ID;
  const { manifest, artifact } = await getPositionsAndTradesArtifact(artifactId);

  if (requestedDate) {
    cachedAllHistorySql ??= await loadPromotedSql({
      artifact,
    });
    return {
      sql: cachedAllHistorySql,
      promotedSqlPath: artifact.promotedSql,
      dbtModelPath: artifact.dbtModel,
      dbtCompiledPath: artifact.dbtCompiledSql,
      artifactId,
      artifactDisplayName: artifact.displayName,
      contractId: manifest.contractId,
      contractDisplayName: manifest.displayName,
      dbtModelFamily: manifest.dbtModelFamily,
      referenceSchema: manifest.referenceSchema,
      referenceTables: manifest.referenceTables,
    };
  }

  cachedLatestSql ??= await loadPromotedSql({
    artifact,
  });
  return {
    sql: cachedLatestSql,
    promotedSqlPath: artifact.promotedSql,
    dbtModelPath: artifact.dbtModel,
    dbtCompiledPath: artifact.dbtCompiledSql,
    artifactId,
    artifactDisplayName: artifact.displayName,
    contractId: manifest.contractId,
    contractDisplayName: manifest.displayName,
    dbtModelFamily: manifest.dbtModelFamily,
    referenceSchema: manifest.referenceSchema,
    referenceTables: manifest.referenceTables,
  };
}

export function selectedNavPositionsCte(promotedSql: string): string {
  return `
  WITH params AS (
    SELECT
      $1::date AS requested_nav_date,
      $2::text AS fund_filter,
      NULLIF($3::text, '') AS account_group_filter,
      NULLIF($4::text, '') AS search_text,
      $5::text[] AS product_group_filters,
      $6::text[] AS product_region_filters,
      $7::text[] AS product_code_filters,
      NULLIF($8::text, '') AS instrument_type_filter,
      NULLIF($9::text, '') AS put_call_filter
  ),
  modelled_nav_positions AS (
    ${promotedSql}
  ),
  filtered_history AS (
    SELECT modelled_nav_positions.*
    FROM modelled_nav_positions
    CROSS JOIN params
    WHERE (params.fund_filter IS NULL OR modelled_nav_positions.fund_code = params.fund_filter)
      AND (params.requested_nav_date IS NULL OR modelled_nav_positions.nav_date = params.requested_nav_date)
  ),
  latest_nav_by_fund AS (
    SELECT
      filtered_history.fund_code,
      COALESCE((SELECT requested_nav_date FROM params), max(filtered_history.nav_date)) AS nav_date
    FROM filtered_history
    GROUP BY filtered_history.fund_code
  ),
  latest_upload_by_fund AS (
    SELECT
      filtered_history.fund_code,
      filtered_history.nav_date,
      max(filtered_history.sftp_upload_timestamp) AS sftp_upload_timestamp
    FROM filtered_history
    INNER JOIN latest_nav_by_fund latest
      ON latest.fund_code = filtered_history.fund_code
     AND latest.nav_date = filtered_history.nav_date
    GROUP BY filtered_history.fund_code, filtered_history.nav_date
  ),
  latest_positions AS (
    SELECT filtered_history.*
    FROM filtered_history
    INNER JOIN latest_upload_by_fund latest
      ON latest.fund_code = filtered_history.fund_code
     AND latest.nav_date = filtered_history.nav_date
     AND latest.sftp_upload_timestamp = filtered_history.sftp_upload_timestamp
  ),
  filter_source_positions AS MATERIALIZED (
    SELECT
      latest_positions.fund_code,
      latest_positions.nav_date,
      latest_positions.sftp_upload_timestamp,
      latest_positions.account_group,
      latest_positions.account,
      latest_positions.source_account_key,
      latest_positions.account_code,
      latest_positions.account_name,
      latest_positions.account_lookup_status,
      latest_positions.trade_date,
      latest_positions.product_id_internal,
      latest_positions.product,
      latest_positions.product_norm,
      latest_positions.client_symbol,
      latest_positions.source_1_symbol,
      latest_positions.source_3_symbol,
      latest_positions.updated_at,
      latest_positions.product_code,
      latest_positions.product_group,
      latest_positions.product_region,
      latest_positions.underlying_product_code,
      latest_positions.source_exchange_name,
      latest_positions.exchange_route_code,
      latest_positions.route_family,
      latest_positions.is_product_record,
      latest_positions.contract_yyyymm,
      latest_positions.contract_day,
      latest_positions.put_call,
      latest_positions.normalized_strike_price,
      latest_positions.instrument_type,
      latest_positions.quantity_1,
      latest_positions.multiplier_and_tick_value,
      latest_positions.trade_price,
      latest_positions.cost_in_base_currency,
      latest_positions.market_settlement_price,
      latest_positions.market_value_in_base_currency,
      latest_positions.long_short,
      latest_positions.normalization_status,
      latest_positions.rule_priority,
      latest_positions.rule_match_type,
      latest_positions.rule_pattern
    FROM latest_positions
    CROSS JOIN params
    WHERE (params.account_group_filter IS NULL OR latest_positions.account_group = params.account_group_filter)
      AND (
        params.search_text IS NULL
        OR latest_positions.product ILIKE '%' || params.search_text || '%'
        OR latest_positions.product_code ILIKE '%' || params.search_text || '%'
        OR latest_positions.product_group ILIKE '%' || params.search_text || '%'
        OR latest_positions.product_region ILIKE '%' || params.search_text || '%'
        OR latest_positions.product_id_internal ILIKE '%' || params.search_text || '%'
        OR latest_positions.client_symbol ILIKE '%' || params.search_text || '%'
        OR latest_positions.source_1_symbol ILIKE '%' || params.search_text || '%'
        OR latest_positions.source_3_symbol ILIKE '%' || params.search_text || '%'
        OR latest_positions.account ILIKE '%' || params.search_text || '%'
      )
  ),
  selected_positions AS MATERIALIZED (
    SELECT filter_source_positions.*
    FROM filter_source_positions
    CROSS JOIN params
    WHERE (
        cardinality(params.product_group_filters) = 0
        OR lower(coalesce(filter_source_positions.product_group, '')) = ANY(params.product_group_filters)
      )
      AND (
        cardinality(params.product_region_filters) = 0
        OR lower(coalesce(filter_source_positions.product_region, '')) = ANY(params.product_region_filters)
      )
      AND (
        cardinality(params.product_code_filters) = 0
        OR lower(coalesce(filter_source_positions.product_code, '')) = ANY(params.product_code_filters)
      )
      AND (
        params.instrument_type_filter IS NULL
        OR filter_source_positions.instrument_type = params.instrument_type_filter
      )
      AND (
        params.put_call_filter IS NULL
        OR filter_source_positions.put_call = params.put_call_filter
      )
  )
`;
}
