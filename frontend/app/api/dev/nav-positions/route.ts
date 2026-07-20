import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import {
  loadPromotedNavPositionsSql,
  selectedNavPositionsCte,
} from "@/lib/server/navPositionsSql";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "no-store";
const PRODUCT_SUMMARY_LIMIT = 600;
const DEFAULT_DEBUG_ROW_LIMIT = 500;
const MAX_DEBUG_ROW_LIMIT = 1_000;
const ROUTE_CONFIG = {
  route: "/api/dev/nav-positions",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "local-dev-only, no-store",
  owner: "frontend",
  purpose: "DEV-only NAV positions product summary and debug rows",
  p95TargetMs: 2_000,
  freshnessSource: "nav.positions.updated_at and nav.positions.sftp_upload_timestamp",
} as const;

interface AvailableDateDbRow {
  nav_date: string;
  fund_count: number | string;
  row_count: number | string;
  latest_upload_at: string | null;
}

interface FilterDbRow {
  funds: unknown;
  account_groups: unknown;
  products: unknown;
}

interface SummaryDbRow {
  min_nav_date: string | null;
  max_nav_date: string | null;
  latest_upload_at: string | null;
  as_of: string | null;
  row_count: number | string;
  fund_count: number | string;
  account_group_count: number | string;
  account_count: number | string;
  product_group_count: number | string;
  cost_base: number | string | null;
  market_value_base: number | string | null;
  unrealized_pnl_base: number | string | null;
  net_quantity: number | string | null;
  gross_quantity: number | string | null;
}

interface ProductSummaryDbRow {
  product_code: string | null;
  product_group: string | null;
  product_region: string | null;
  underlying_product_code: string | null;
  contract_yyyymm: string | null;
  contract_day: number | string | null;
  put_call: string | null;
  normalized_strike_price: number | string | null;
  fund_codes: string | null;
  account_groups: string | null;
  fund_count: number | string;
  account_group_count: number | string;
  row_count: number | string;
  account_count: number | string;
  net_quantity: number | string | null;
  gross_quantity: number | string | null;
  cost_base: number | string | null;
  market_value_base: number | string | null;
  unrealized_pnl_base: number | string | null;
  avg_trade_price: number | string | null;
  avg_settlement_price: number | string | null;
}

interface NavPositionsBundleDbRow {
  filters: unknown;
  summary: unknown;
  product_summary: unknown;
}

interface NavPositionsDebugBundleDbRow {
  summary: unknown;
  raw_rows: unknown;
}

interface DebugDrilldownFilter {
  productCode: string | null;
  productGroup: string | null;
  productRegion: string | null;
  underlyingProductCode: string | null;
  putCall: string | null;
  strikePrice: number | null;
  bucketKey: string;
  startIso: string | null;
  endIso: string | null;
  anchorDate: string | null;
  visibleEndIso: string | null;
  monthYyyymm: string | null;
  label: string | null;
}

interface RawPositionDbRow {
  fund_code: string;
  nav_date: string;
  sftp_upload_timestamp: string | null;
  account_group: string | null;
  account: string | null;
  source_file_name: string | null;
  source_file_row_number: number | string;
  product: string | null;
  type: string | null;
  month_year: string | null;
  exchange_name: string | null;
  client_symbol: string | null;
  quantity_1: number | string | null;
  cost_in_base_currency: number | string | null;
  market_value_in_base_currency: number | string | null;
  product_code: string | null;
  product_group: string | null;
  product_region: string | null;
  underlying_product_code: string | null;
  contract_yyyymm: string | null;
  contract_day: number | string | null;
  put_call: string | null;
  normalized_strike_price: number | string | null;
  normalization_status: string | null;
  updated_at: string | null;
}

function parseDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseFund(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "all") return null;
  return /^[a-z0-9_-]{1,40}$/.test(normalized) ? normalized : null;
}

function parseText(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function parseFilterText(value: string | null, maxLength: number): string | null {
  const normalized = parseText(value, maxLength);
  return normalized?.toLowerCase() === "all" ? null : normalized;
}

function parseDebugLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed)) return DEFAULT_DEBUG_ROW_LIMIT;
  return Math.min(Math.max(parsed, 25), MAX_DEBUG_ROW_LIMIT);
}

function parseDrilldownText(value: unknown, maxLength = 120): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function parseDrilldownNumber(value: unknown): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDrilldownDate(value: unknown): string | null {
  return typeof value === "string" ? parseDate(value) : null;
}

function parseYyyymm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^\d{6}$/.test(normalized) ? normalized : null;
}

function parseDrilldownFilter(value: string | null): DebugDrilldownFilter | null {
  if (!value) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const bucketKey = parseDrilldownText(record.bucketKey, 20);
  const isMonthBucket = /^month:\d{6}$/.test(bucketKey ?? "");
  if (
    !bucketKey ||
    (!isMonthBucket &&
      ![
      "prior",
      "bal-day",
      "next-day",
      "bal-week",
      "weekend",
      "next-week",
      "2nd-week",
      "3rd-week",
      "4th-week",
      "other",
    ].includes(bucketKey))
  ) {
    return null;
  }

  return {
    productCode: parseDrilldownText(record.productCode),
    productGroup: parseDrilldownText(record.productGroup),
    productRegion: parseDrilldownText(record.productRegion),
    underlyingProductCode: parseDrilldownText(record.underlyingProductCode),
    putCall: parseDrilldownText(record.putCall, 12),
    strikePrice: parseDrilldownNumber(record.strikePrice),
    bucketKey,
    startIso: parseDrilldownDate(record.startIso),
    endIso: parseDrilldownDate(record.endIso),
    anchorDate: parseDrilldownDate(record.anchorDate),
    visibleEndIso: parseDrilldownDate(record.visibleEndIso),
    monthYyyymm: parseYyyymm(record.monthYyyymm) ?? (isMonthBucket ? bucketKey.slice(6) : null),
    label: parseDrilldownText(record.label, 180),
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

function compactDateKey(value: string | null): string | null {
  return value?.replace(/-/g, "") ?? null;
}

function buildDebugDrilldownWhere({
  filter,
  firstParameterIndex,
}: {
  filter: DebugDrilldownFilter | null;
  firstParameterIndex: number;
}): { sql: string; args: unknown[] } {
  if (!filter) return { sql: "TRUE", args: [] };

  const clauses: string[] = [];
  const args: unknown[] = [];
  let parameterIndex = firstParameterIndex;
  const contractDateKeyExpression = `
    CASE
      WHEN contract_yyyymm ~ '^\\d{6}$' AND contract_day IS NOT NULL
      THEN contract_yyyymm || lpad(contract_day::integer::text, 2, '0')
      ELSE NULL
    END
  `;

  const addTextIdentity = (column: string, value: string | null) => {
    args.push(value);
    clauses.push(`${column} IS NOT DISTINCT FROM $${parameterIndex}::text`);
    parameterIndex += 1;
  };

  addTextIdentity("product_code", filter.productCode);
  addTextIdentity("product_group", filter.productGroup);
  addTextIdentity("product_region", filter.productRegion);
  addTextIdentity("underlying_product_code", filter.underlyingProductCode);
  addTextIdentity("put_call", filter.putCall);

  args.push(filter.strikePrice);
  clauses.push(
    `round(normalized_strike_price::numeric, 6) IS NOT DISTINCT FROM round($${parameterIndex}::numeric, 6)`,
  );
  parameterIndex += 1;

  if (filter.bucketKey.startsWith("month:") && filter.monthYyyymm) {
    const visibleEndDateKey = compactDateKey(filter.visibleEndIso);
    args.push(filter.monthYyyymm);
    clauses.push(`contract_yyyymm = $${parameterIndex}::text`);
    parameterIndex += 1;
    if (visibleEndDateKey) {
      args.push(visibleEndDateKey);
      clauses.push(
        `(contract_day IS NULL OR (${contractDateKeyExpression}) IS NULL OR (${contractDateKeyExpression}) > $${parameterIndex}::text)`,
      );
      parameterIndex += 1;
    }
  } else if (filter.bucketKey === "prior") {
    const anchorDateKey = compactDateKey(filter.anchorDate);
    if (anchorDateKey) {
      args.push(anchorDateKey);
      clauses.push(`(${contractDateKeyExpression}) IS NOT NULL`);
      clauses.push(`(${contractDateKeyExpression}) < $${parameterIndex}::text`);
      parameterIndex += 1;
    }
  } else if (filter.bucketKey === "other") {
    clauses.push(`(contract_yyyymm IS NULL OR contract_yyyymm !~ '^\\d{6}$')`);
  } else {
    const startDateKey = compactDateKey(filter.startIso);
    const endDateKey = compactDateKey(filter.endIso);
    if (startDateKey && endDateKey) {
      args.push(startDateKey, endDateKey);
      clauses.push(`(${contractDateKeyExpression}) BETWEEN $${parameterIndex}::text AND $${parameterIndex + 1}::text`);
      parameterIndex += 2;
    }
  }

  return { sql: clauses.join("\n          AND "), args };
}

function mapProductSummary(row: ProductSummaryDbRow) {
  return {
    productCode: row.product_code,
    productGroup: row.product_group,
    productRegion: row.product_region,
    underlyingProductCode: row.underlying_product_code,
    contractYyyymm: row.contract_yyyymm,
    contractDay: toNumber(row.contract_day),
    putCall: row.put_call,
    strikePrice: round(row.normalized_strike_price, 6),
    fundCodes: row.fund_codes,
    accountGroups: row.account_groups,
    fundCount: toInteger(row.fund_count),
    accountGroupCount: toInteger(row.account_group_count),
    rowCount: toInteger(row.row_count),
    accountCount: toInteger(row.account_count),
    netQuantity: round(row.net_quantity, 6),
    grossQuantity: round(row.gross_quantity, 6),
    costBase: round(row.cost_base),
    marketValueBase: round(row.market_value_base),
    unrealizedPnlBase: round(row.unrealized_pnl_base),
    avgTradePrice: round(row.avg_trade_price, 6),
    avgSettlementPrice: round(row.avg_settlement_price, 6),
  };
}

function mapDebugRow(row: RawPositionDbRow) {
  return {
    fundCode: row.fund_code,
    navDate: row.nav_date,
    sftpUploadTimestamp: isoOrText(row.sftp_upload_timestamp),
    accountGroup: row.account_group,
    account: row.account,
    sourceFileName: row.source_file_name ?? "",
    sourceFileRowNumber: toInteger(row.source_file_row_number),
    product: row.product,
    type: row.type,
    monthYear: row.month_year,
    exchangeName: row.exchange_name,
    clientSymbol: row.client_symbol,
    quantity1: round(row.quantity_1, 6),
    costInBaseCurrency: round(row.cost_in_base_currency),
    marketValueInBaseCurrency: round(row.market_value_in_base_currency),
    productCode: row.product_code,
    productGroup: row.product_group,
    productRegion: row.product_region,
    underlyingProductCode: row.underlying_product_code,
    contractYyyymm: row.contract_yyyymm,
    contractDay: toNumber(row.contract_day),
    putCall: row.put_call,
    normalizedStrikePrice: round(row.normalized_strike_price, 6),
    normalizationStatus: row.normalization_status,
    updatedAt: isoOrText(row.updated_at),
  };
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const requestedDate = parseDate(searchParams.get("date"));
  const fund = parseFund(searchParams.get("fund"));
  const accountGroup = parseFilterText(searchParams.get("accountGroup"), 120);
  const productSearch = parseText(searchParams.get("product"), 100);
  const debugRows = searchParams.get("mode") === "debug" || searchParams.get("debug") === "rows";
  const drilldownFilter = parseDrilldownFilter(searchParams.get("drilldown"));
  const baseArgs = [requestedDate, fund, accountGroup, productSearch] as const;
  const promotedArtifact = await loadPromotedNavPositionsSql({ requestedDate });
  const selectedPositionsSql = selectedNavPositionsCte(promotedArtifact.sql);

  if (debugRows) {
    const limit = parseDebugLimit(searchParams.get("limit"));
    const drilldownWhere = buildDebugDrilldownWhere({
      filter: drilldownFilter,
      firstParameterIndex: 6,
    });
    const debugRowsResult = await query<NavPositionsDebugBundleDbRow>(
      `
        ${selectedPositionsSql},
        debug_positions AS MATERIALIZED (
          SELECT *
          FROM selected_positions
          WHERE ${drilldownWhere.sql}
        )
        SELECT
          (
            SELECT to_jsonb(summary_row)
            FROM (
              SELECT
                to_char(min(nav_date), 'YYYY-MM-DD') AS min_nav_date,
                to_char(max(nav_date), 'YYYY-MM-DD') AS max_nav_date,
                max(sftp_upload_timestamp)::text AS latest_upload_at,
                max(updated_at)::text AS as_of,
                count(*)::integer AS row_count
              FROM debug_positions
            ) summary_row
          ) AS summary,
          (
            SELECT coalesce(jsonb_agg(to_jsonb(raw_row)), '[]'::jsonb)
            FROM (
              SELECT
                fund_code,
                to_char(nav_date, 'YYYY-MM-DD') AS nav_date,
                sftp_upload_timestamp::text AS sftp_upload_timestamp,
                account_group,
                account,
                source_file_name,
                source_file_row_number,
                product,
                type,
                month_year,
                exchange_name,
                client_symbol,
                quantity_1::double precision AS quantity_1,
                cost_in_base_currency::double precision AS cost_in_base_currency,
                market_value_in_base_currency::double precision AS market_value_in_base_currency,
                product_code,
                product_group,
                product_region,
                underlying_product_code,
                contract_yyyymm,
                contract_day,
                put_call,
                normalized_strike_price::double precision AS normalized_strike_price,
                normalization_status,
                updated_at::text AS updated_at
              FROM debug_positions
              ORDER BY
                abs(coalesce(market_value_in_base_currency, 0)) DESC,
                fund_code,
                account_group NULLS LAST,
                product NULLS LAST,
                source_file_row_number
              LIMIT $5::integer
            ) raw_row
          ) AS raw_rows
      `,
      [...baseArgs, limit, ...drilldownWhere.args],
    );

    const debugBundle = debugRowsResult[0] ?? { summary: {}, raw_rows: [] };
    const summaryRow = objectRecord(debugBundle.summary) as unknown as SummaryDbRow;
    const rawRows = rowArray<RawPositionDbRow>(debugBundle.raw_rows);
    const rowCount = toInteger(summaryRow?.row_count);
    const asOf = isoOrText(summaryRow?.as_of ?? summaryRow?.latest_upload_at ?? null);
    const selectedDate = requestedDate ?? summaryRow?.max_nav_date ?? null;

    return {
      payload: {
        source: `dbt:${promotedArtifact.dbtModelPath}`,
        selectedDate,
        requestedDate,
        asOf,
        latestUploadAt: isoOrText(summaryRow?.latest_upload_at ?? null),
        filters: {
          fund: fund ?? "all",
          accountGroup: accountGroup ?? "all",
          productSearch: productSearch ?? "",
        },
        summary: {
          rowCount,
          returnedRowCount: rawRows.length,
          limit,
        },
        rows: rawRows.map(mapDebugRow),
        metadata: {
          dbtModel: promotedArtifact.dbtModelPath,
          promotedSql: promotedArtifact.promotedSqlPath,
          compiledSql: promotedArtifact.dbtCompiledPath,
          drilldown: drilldownFilter,
        },
      },
      headers: { "Cache-Control": CACHE_HEADER },
      rowCount,
      dataAsOf: asOf,
    };
  }

  const [availableRows, bundleRows] = await Promise.all([
    query<AvailableDateDbRow>(`
      SELECT
        to_char(nav_date, 'YYYY-MM-DD') AS nav_date,
        count(DISTINCT fund_code)::integer AS fund_count,
        count(*)::integer AS row_count,
        max(sftp_upload_timestamp)::text AS latest_upload_at
      FROM nav.positions
      GROUP BY nav_date
      ORDER BY nav_date DESC
      LIMIT 90
    `),
    query<NavPositionsBundleDbRow>(
      `
        ${selectedPositionsSql}
        SELECT
          (
            SELECT jsonb_build_object(
              'funds',
              (
                SELECT coalesce(jsonb_agg(fund_code ORDER BY fund_code), '[]'::jsonb)
                FROM (SELECT DISTINCT fund_code FROM selected_positions WHERE fund_code IS NOT NULL) funds
              ),
              'account_groups',
              (
                SELECT coalesce(jsonb_agg(account_group ORDER BY account_group), '[]'::jsonb)
                FROM (
                  SELECT DISTINCT account_group
                  FROM selected_positions
                  WHERE account_group IS NOT NULL AND account_group <> ''
                ) account_groups
              ),
              'products',
              (
                SELECT coalesce(jsonb_agg(product ORDER BY product), '[]'::jsonb)
                FROM (
                  SELECT DISTINCT product
                  FROM selected_positions
                  WHERE product IS NOT NULL AND product <> ''
                  ORDER BY product
                  LIMIT 300
                ) products
              )
            )
          ) AS filters,
          (
            SELECT to_jsonb(summary_row)
            FROM (
              SELECT
                to_char(min(nav_date), 'YYYY-MM-DD') AS min_nav_date,
                to_char(max(nav_date), 'YYYY-MM-DD') AS max_nav_date,
                max(sftp_upload_timestamp)::text AS latest_upload_at,
                max(updated_at)::text AS as_of,
                count(*)::integer AS row_count,
                count(DISTINCT fund_code)::integer AS fund_count,
                count(DISTINCT account_group)::integer AS account_group_count,
                count(DISTINCT account)::integer AS account_count,
                count(DISTINCT (
                  product_code,
                  product_group,
                  product_region,
                  underlying_product_code,
                  contract_yyyymm,
                  contract_day,
                  put_call,
                  normalized_strike_price
                ))::integer AS product_group_count,
                sum(coalesce(cost_in_base_currency, 0))::double precision AS cost_base,
                sum(coalesce(market_value_in_base_currency, 0))::double precision AS market_value_base,
                sum(
                  coalesce(market_value_in_base_currency, 0) - coalesce(cost_in_base_currency, 0)
                )::double precision AS unrealized_pnl_base,
                sum(coalesce(quantity_1, 0))::double precision AS net_quantity,
                sum(abs(coalesce(quantity_1, 0)))::double precision AS gross_quantity
              FROM selected_positions
            ) summary_row
          ) AS summary,
          (
            SELECT coalesce(jsonb_agg(to_jsonb(product_row)), '[]'::jsonb)
            FROM (
              SELECT
                product_code,
                product_group,
                product_region,
                underlying_product_code,
                contract_yyyymm,
                contract_day,
                put_call,
                normalized_strike_price::double precision AS normalized_strike_price,
                string_agg(DISTINCT fund_code, ', ' ORDER BY fund_code) AS fund_codes,
                string_agg(DISTINCT account_group, ', ' ORDER BY account_group) FILTER (
                  WHERE account_group IS NOT NULL AND account_group <> ''
                ) AS account_groups,
                count(DISTINCT fund_code)::integer AS fund_count,
                count(DISTINCT account_group)::integer AS account_group_count,
                count(*)::integer AS row_count,
                count(DISTINCT account)::integer AS account_count,
                sum(coalesce(quantity_1, 0))::double precision AS net_quantity,
                sum(abs(coalesce(quantity_1, 0)))::double precision AS gross_quantity,
                sum(coalesce(cost_in_base_currency, 0))::double precision AS cost_base,
                sum(coalesce(market_value_in_base_currency, 0))::double precision AS market_value_base,
                sum(
                  coalesce(market_value_in_base_currency, 0) - coalesce(cost_in_base_currency, 0)
                )::double precision AS unrealized_pnl_base,
                (
                  sum(
                    CASE
                      WHEN trade_price IS NOT NULL THEN trade_price * abs(coalesce(quantity_1, 0))
                      ELSE 0
                    END
                  )
                  / nullif(sum(CASE WHEN trade_price IS NOT NULL THEN abs(coalesce(quantity_1, 0)) ELSE 0 END), 0)
                )::double precision AS avg_trade_price,
                (
                  sum(
                    CASE
                      WHEN market_settlement_price IS NOT NULL
                      THEN market_settlement_price * abs(coalesce(quantity_1, 0))
                      ELSE 0
                    END
                  )
                  / nullif(
                    sum(CASE WHEN market_settlement_price IS NOT NULL THEN abs(coalesce(quantity_1, 0)) ELSE 0 END),
                    0
                  )
                )::double precision AS avg_settlement_price
              FROM selected_positions
              GROUP BY
                product_code,
                product_group,
                product_region,
                underlying_product_code,
                contract_yyyymm,
                contract_day,
                put_call,
                normalized_strike_price
              ORDER BY
                abs(sum(coalesce(market_value_in_base_currency, 0))) DESC,
                product_group NULLS LAST,
                product_region NULLS LAST,
                product_code NULLS LAST,
                contract_yyyymm NULLS LAST,
                contract_day NULLS LAST,
                put_call NULLS LAST,
                normalized_strike_price NULLS LAST
              LIMIT ${PRODUCT_SUMMARY_LIMIT}
            ) product_row
          ) AS product_summary
      `,
      baseArgs,
    ),
  ]);

  const availableDates = availableRows.map((row) => ({
    navDate: row.nav_date,
    fundCount: toInteger(row.fund_count),
    rowCount: toInteger(row.row_count),
    latestUploadAt: isoOrText(row.latest_upload_at),
  }));

  const bundleRow = bundleRows[0] ?? {
    filters: { funds: [], account_groups: [], products: [] },
    summary: {},
    product_summary: [],
  };
  const filters = objectRecord(bundleRow.filters) as unknown as FilterDbRow;
  const summaryRow = objectRecord(bundleRow.summary) as unknown as SummaryDbRow;
  const productRows = rowArray<ProductSummaryDbRow>(bundleRow.product_summary);
  const rowCount = toInteger(summaryRow?.row_count);
  const asOf = isoOrText(summaryRow?.as_of ?? summaryRow?.latest_upload_at ?? null);
  const selectedDate = requestedDate ?? summaryRow?.max_nav_date ?? availableDates[0]?.navDate ?? null;
  const latestDate = availableDates[0]?.navDate ?? summaryRow?.max_nav_date ?? null;

  const payload = {
    source: `dbt:${promotedArtifact.dbtModelPath}`,
    selectedDate,
    latestDate,
    selectedDateRange: {
      min: summaryRow?.min_nav_date ?? selectedDate,
      max: summaryRow?.max_nav_date ?? selectedDate,
    },
    requestedDate,
    asOf,
    latestUploadAt: isoOrText(summaryRow?.latest_upload_at ?? null),
    availableDates,
    filters: {
      fund: fund ?? "all",
      accountGroup: accountGroup ?? "all",
      productSearch: productSearch ?? "",
    },
    summary: {
      rowCount,
      fundCount: toInteger(summaryRow?.fund_count),
      accountGroupCount: toInteger(summaryRow?.account_group_count),
      accountCount: toInteger(summaryRow?.account_count),
      productGroupCount: toInteger(summaryRow?.product_group_count),
      costBase: round(summaryRow?.cost_base),
      marketValueBase: round(summaryRow?.market_value_base),
      unrealizedPnlBase: round(summaryRow?.unrealized_pnl_base),
      netQuantity: round(summaryRow?.net_quantity, 6),
      grossQuantity: round(summaryRow?.gross_quantity, 6),
    },
    productSummary: productRows.map(mapProductSummary),
    metadata: {
      funds: stringArray(filters.funds),
      accountGroups: stringArray(filters.account_groups),
      products: stringArray(filters.products),
      aggregationGrain: [
        "product_code",
        "product_group",
        "product_region",
        "underlying_product_code",
        "contract_yyyymm",
        "contract_day",
        "put_call",
        "normalized_strike_price",
      ],
      productSummaryLimit: PRODUCT_SUMMARY_LIMIT,
      dbtModel: promotedArtifact.dbtModelPath,
      promotedSql: promotedArtifact.promotedSqlPath,
      compiledSql: promotedArtifact.dbtCompiledPath,
      units: {
        valuation: "base currency from source file",
        quantity: "source NAV position quantity",
      },
    },
  };

  return {
    payload,
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount,
    dataAsOf: asOf,
  };
});

export async function GET(request: Request): Promise<Response> {
  if (!isLocalOnlyFeatureEnabled()) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return observedGET(request);
}
