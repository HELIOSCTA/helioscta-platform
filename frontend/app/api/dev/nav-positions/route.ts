import { PRODUCT_ALIASES, PRODUCT_DEFINITIONS } from "@/lib/positionsAndTrades/productLookup";
import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "no-store";
const PRODUCT_SUMMARY_LIMIT = 600;
const DEFAULT_RAW_LIMIT = 200;
const MIN_RAW_LIMIT = 25;
const MAX_RAW_LIMIT = 500;

const RAW_POSITION_COLUMNS = [
  "fund_code",
  "source_legal_entity",
  "source_file_name",
  "source_file_row_number",
  "nav_date",
  "sftp_upload_timestamp",
  "broker_name",
  "account_group",
  "account",
  "trade_date",
  "product_id_internal",
  "product",
  "type",
  "month_year",
  "client_symbol",
  "strike_price",
  "call_put",
  "product_currency_1",
  "long_short",
  "quantity_1",
  "counter_currency_ccy2",
  "ccy2_long_short",
  "ccy2_quantity_2",
  "trade_price",
  "multiplier_and_tick_value",
  "cost_in_native_currency",
  "open_exchange_rate",
  "cost_in_base_currency",
  "market_settlement_price",
  "market_value_in_native_currency",
  "close_exchange_rate",
  "market_value_in_base_currency",
  "sector",
  "sub_sector",
  "country",
  "exchange_name",
  "source_1_symbol",
  "source_3_symbol",
  "one_chicago_symbol",
  "fas_level",
  "option_style",
  "updated_at",
] as const;

function sqlLiteral(value: string | null | undefined): string {
  return value === null || value === undefined ? "NULL" : `'${value.replaceAll("'", "''")}'`;
}

function valuesRows(rows: string[][]): string {
  return rows.map((row) => `      (${row.join(", ")})`).join(",\n");
}

function productCatalogValues(): string {
  return valuesRows(
    PRODUCT_DEFINITIONS.map((definition) => [
      sqlLiteral(definition.exchangeCode),
      sqlLiteral(definition.ruleGroup),
      sqlLiteral(definition.ruleRegion),
      sqlLiteral(definition.exchangeCodeUnderlying),
      sqlLiteral(definition.bbgExchangeCode),
      sqlLiteral(definition.defaultExchangeName),
    ]),
  );
}

function navAliasValues(): string {
  return valuesRows(
    PRODUCT_ALIASES.filter((alias) => alias.source === "nav" || alias.source === "any").map(
      (alias, index) => [
        String(index + 1),
        sqlLiteral(alias.matchType),
        sqlLiteral(alias.pattern),
        sqlLiteral(alias.exchangeCode),
        sqlLiteral(alias.optionType ?? null),
      ],
    ),
  );
}

function rawPositionSelect(tableAlias: string): string {
  return RAW_POSITION_COLUMNS.map((column) => `${tableAlias}.${column}`).join(",\n      ");
}

const ROUTE_CONFIG = {
  route: "/api/dev/nav-positions",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "local-dev-only, no-store",
  owner: "frontend",
  purpose: "DEV-only NAV positions product aggregation and raw row browser",
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

interface RawPositionDbRow {
  fund_code: string;
  source_legal_entity: string;
  source_file_name: string;
  source_file_row_number: number | string;
  nav_date: string;
  sftp_upload_timestamp: string;
  broker_name: string | null;
  account_group: string | null;
  account: string | null;
  trade_date: string | null;
  product_id_internal: string | null;
  product: string | null;
  type: string | null;
  month_year: string | null;
  client_symbol: string | null;
  strike_price: number | string | null;
  call_put: string | null;
  product_currency_1: string | null;
  long_short: string | null;
  quantity_1: number | string | null;
  counter_currency_ccy2: string | null;
  ccy2_long_short: string | null;
  ccy2_quantity_2: number | string | null;
  trade_price: number | string | null;
  multiplier_and_tick_value: number | string | null;
  cost_in_native_currency: number | string | null;
  open_exchange_rate: number | string | null;
  cost_in_base_currency: number | string | null;
  market_settlement_price: number | string | null;
  market_value_in_native_currency: number | string | null;
  close_exchange_rate: number | string | null;
  market_value_in_base_currency: number | string | null;
  sector: string | null;
  sub_sector: string | null;
  country: string | null;
  exchange_name: string | null;
  source_1_symbol: string | null;
  source_3_symbol: string | null;
  one_chicago_symbol: string | null;
  fas_level: string | null;
  option_style: string | null;
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

const SELECTED_POSITIONS_CTE = `
  WITH params AS (
    SELECT
      $1::date AS requested_nav_date,
      $2::text AS fund_filter,
      NULLIF($3::text, '') AS account_group_filter,
      NULLIF($4::text, '') AS search_text,
      $5::jsonb AS group_filter
  ),
  product_catalog AS (
    SELECT *
    FROM (
      VALUES
${productCatalogValues()}
    ) AS t(
      exchange_code,
      rule_group,
      rule_region,
      exchange_code_underlying,
      bbg_exchange_code,
      default_exchange_name
    )
  ),
  product_aliases AS (
    SELECT *
    FROM (
      VALUES
${navAliasValues()}
    ) AS t(
      priority,
      match_type,
      pattern,
      exchange_code,
      option_type
    )
  ),
  base_positions AS (
    SELECT
      ${rawPositionSelect("p")}
    FROM nav.positions p
    CROSS JOIN params
    WHERE (params.fund_filter IS NULL OR p.fund_code = params.fund_filter)
      AND (params.requested_nav_date IS NULL OR p.nav_date = params.requested_nav_date)
  ),
  latest_nav_by_fund AS (
    SELECT
      base_positions.fund_code,
      COALESCE((SELECT requested_nav_date FROM params), max(base_positions.nav_date)) AS nav_date
    FROM base_positions
    GROUP BY base_positions.fund_code
  ),
  latest_upload_by_fund AS (
    SELECT
      base_positions.fund_code,
      base_positions.nav_date,
      max(base_positions.sftp_upload_timestamp) AS sftp_upload_timestamp
    FROM base_positions
    INNER JOIN latest_nav_by_fund latest
      ON latest.fund_code = base_positions.fund_code
     AND latest.nav_date = base_positions.nav_date
    GROUP BY base_positions.fund_code, base_positions.nav_date
  ),
  latest_raw_positions AS (
    SELECT
      ${rawPositionSelect("base_positions")}
    FROM base_positions
    INNER JOIN latest_upload_by_fund latest
      ON latest.fund_code = base_positions.fund_code
     AND latest.nav_date = base_positions.nav_date
     AND latest.sftp_upload_timestamp = base_positions.sftp_upload_timestamp
  ),
  normalized AS (
    SELECT
      latest_raw_positions.*,
      upper(regexp_replace(coalesce(latest_raw_positions.product, ''), '[[:space:]]+', ' ', 'g')) AS product_norm,
      (
        upper(coalesce(latest_raw_positions.call_put, '')) IN ('CALL', 'PUT', 'C', 'P')
        OR upper(coalesce(latest_raw_positions.type, '')) LIKE '%OPTION%'
      ) AS is_option,
      CASE
        WHEN upper(coalesce(latest_raw_positions.call_put, '')) IN ('CALL', 'C') THEN 'C'
        WHEN upper(coalesce(latest_raw_positions.call_put, '')) IN ('PUT', 'P') THEN 'P'
        ELSE NULL
      END AS put_call_code,
      CASE
        WHEN latest_raw_positions.month_year ~ '^\\s*\\d{1,2}/\\d{1,2}/\\d{4}\\s*$'
          THEN to_char(to_date(trim(latest_raw_positions.month_year), 'MM/DD/YYYY'), 'YYYY-MM')
        WHEN upper(trim(coalesce(latest_raw_positions.month_year, ''))) ~ '^[A-Z]{3}\\d{2}$'
          THEN to_char(to_date(upper(trim(latest_raw_positions.month_year)), 'MONYY'), 'YYYY-MM')
        ELSE NULL
      END AS rule_contract_month,
      CASE
        WHEN latest_raw_positions.month_year ~ '^\\s*\\d{1,2}/\\d{1,2}/\\d{4}\\s*$'
          THEN extract(day FROM to_date(trim(latest_raw_positions.month_year), 'MM/DD/YYYY'))::integer
        ELSE NULL
      END AS rule_contract_day
    FROM latest_raw_positions
  ),
  rule_eval AS (
    SELECT
      normalized.*,
      alias.exchange_code AS rule_exchange_code,
      catalog.rule_group,
      catalog.rule_region,
      catalog.exchange_code_underlying AS rule_underlying
    FROM normalized
    LEFT JOIN LATERAL (
      SELECT product_aliases.*
      FROM product_aliases
      WHERE (
          (product_aliases.match_type = 'exact' AND normalized.product_norm = product_aliases.pattern)
          OR (product_aliases.match_type = 'regex' AND normalized.product_norm ~* product_aliases.pattern)
        )
        AND (
          product_aliases.option_type IS NULL
          OR product_aliases.option_type = CASE WHEN normalized.is_option THEN 'option' ELSE 'future' END
        )
      ORDER BY product_aliases.priority
      LIMIT 1
    ) alias ON TRUE
    LEFT JOIN product_catalog catalog
      ON catalog.exchange_code = alias.exchange_code
  ),
  enriched_positions AS (
    SELECT
      ${rawPositionSelect("rule_eval")},
      rule_exchange_code AS product_code,
      rule_group AS product_group,
      rule_region AS product_region,
      CASE WHEN is_option THEN rule_underlying ELSE NULL END AS underlying_product_code,
      CASE
        WHEN rule_contract_month ~ '^\\d{4}-\\d{2}$' THEN replace(rule_contract_month, '-', '')
        ELSE NULL
      END AS contract_yyyymm,
      rule_contract_day AS contract_day,
      put_call_code AS put_call,
      CASE
        WHEN strike_price IS NULL THEN NULL
        ELSE round(strike_price::numeric, 3)::double precision
      END AS normalized_strike_price,
      CASE
        WHEN rule_exchange_code IS NULL THEN 'unresolved_product'
        WHEN coalesce(trim(month_year), '') <> '' AND rule_contract_month IS NULL THEN 'unparsed_contract'
        WHEN is_option AND put_call_code IS NULL THEN 'option_missing_put_call'
        WHEN is_option AND strike_price IS NULL THEN 'option_missing_strike'
        ELSE 'ok'
      END AS normalization_status
    FROM rule_eval
  ),
  selected_positions AS (
    SELECT enriched_positions.*
    FROM enriched_positions
    CROSS JOIN params
    WHERE (params.account_group_filter IS NULL OR enriched_positions.account_group = params.account_group_filter)
      AND (
        params.search_text IS NULL
        OR enriched_positions.product ILIKE '%' || params.search_text || '%'
        OR enriched_positions.product_code ILIKE '%' || params.search_text || '%'
        OR enriched_positions.product_group ILIKE '%' || params.search_text || '%'
        OR enriched_positions.product_region ILIKE '%' || params.search_text || '%'
        OR enriched_positions.product_id_internal ILIKE '%' || params.search_text || '%'
        OR enriched_positions.client_symbol ILIKE '%' || params.search_text || '%'
        OR enriched_positions.source_1_symbol ILIKE '%' || params.search_text || '%'
        OR enriched_positions.source_3_symbol ILIKE '%' || params.search_text || '%'
        OR enriched_positions.account ILIKE '%' || params.search_text || '%'
      )
      AND (
        params.group_filter IS NULL
        OR (
          enriched_positions.product_code IS NOT DISTINCT FROM (params.group_filter->>'productCode')
          AND enriched_positions.product_group IS NOT DISTINCT FROM (params.group_filter->>'productGroup')
          AND enriched_positions.product_region IS NOT DISTINCT FROM (params.group_filter->>'productRegion')
          AND enriched_positions.underlying_product_code IS NOT DISTINCT FROM (params.group_filter->>'underlyingProductCode')
          AND enriched_positions.contract_yyyymm IS NOT DISTINCT FROM (params.group_filter->>'contractYyyymm')
          AND enriched_positions.contract_day IS NOT DISTINCT FROM
            CASE
              WHEN params.group_filter->>'contractDay' IS NULL THEN NULL::integer
              ELSE (params.group_filter->>'contractDay')::integer
            END
          AND enriched_positions.put_call IS NOT DISTINCT FROM (params.group_filter->>'putCall')
          AND enriched_positions.normalized_strike_price IS NOT DISTINCT FROM
            CASE
              WHEN params.group_filter->>'strikePrice' IS NULL THEN NULL::double precision
              ELSE (params.group_filter->>'strikePrice')::double precision
            END
        )
      )
  )
`;

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

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRawLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed)) return DEFAULT_RAW_LIMIT;
  return Math.min(Math.max(parsed, MIN_RAW_LIMIT), MAX_RAW_LIMIT);
}

function nullableString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" ? value.slice(0, maxLength) : null;
}

function parseGroupFilter(value: string | null): string | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const strikePrice = toNumber(parsed.strikePrice);
    const groupFilter = {
      productCode: nullableString(parsed.productCode, 40),
      productGroup: nullableString(parsed.productGroup, 40),
      productRegion: nullableString(parsed.productRegion, 120),
      underlyingProductCode: nullableString(parsed.underlyingProductCode, 40),
      contractYyyymm: nullableString(parsed.contractYyyymm, 6),
      contractDay: toNumber(parsed.contractDay),
      putCall: nullableString(parsed.putCall, 40),
      strikePrice,
    };

    return JSON.stringify(groupFilter);
  } catch {
    return null;
  }
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

function mapRawRow(row: RawPositionDbRow) {
  return {
    fundCode: row.fund_code,
    sourceLegalEntity: row.source_legal_entity,
    sourceFileName: row.source_file_name,
    sourceFileRowNumber: toInteger(row.source_file_row_number),
    navDate: row.nav_date,
    sftpUploadTimestamp: isoOrText(row.sftp_upload_timestamp),
    brokerName: row.broker_name,
    accountGroup: row.account_group,
    account: row.account,
    tradeDate: row.trade_date,
    productIdInternal: row.product_id_internal,
    product: row.product,
    type: row.type,
    monthYear: row.month_year,
    clientSymbol: row.client_symbol,
    strikePrice: round(row.strike_price, 6),
    callPut: row.call_put,
    productCurrency1: row.product_currency_1,
    longShort: row.long_short,
    quantity1: round(row.quantity_1, 6),
    counterCurrencyCcy2: row.counter_currency_ccy2,
    ccy2LongShort: row.ccy2_long_short,
    ccy2Quantity2: round(row.ccy2_quantity_2, 6),
    tradePrice: round(row.trade_price, 6),
    multiplierAndTickValue: round(row.multiplier_and_tick_value, 6),
    costInNativeCurrency: round(row.cost_in_native_currency),
    openExchangeRate: round(row.open_exchange_rate, 6),
    costInBaseCurrency: round(row.cost_in_base_currency),
    marketSettlementPrice: round(row.market_settlement_price, 6),
    marketValueInNativeCurrency: round(row.market_value_in_native_currency),
    closeExchangeRate: round(row.close_exchange_rate, 6),
    marketValueInBaseCurrency: round(row.market_value_in_base_currency),
    sector: row.sector,
    subSector: row.sub_sector,
    country: row.country,
    exchangeName: row.exchange_name,
    source1Symbol: row.source_1_symbol,
    source3Symbol: row.source_3_symbol,
    oneChicagoSymbol: row.one_chicago_symbol,
    fasLevel: row.fas_level,
    optionStyle: row.option_style,
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
  const groupFilter = parseGroupFilter(searchParams.get("group"));
  const rawLimit = parseRawLimit(searchParams.get("rawLimit"));
  const baseArgs = [requestedDate, fund, accountGroup, productSearch, groupFilter] as const;

  const [availableRows, filterRows, summaryRows, productRows, rawRows] = await Promise.all([
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
    query<FilterDbRow>(
      `
        ${SELECTED_POSITIONS_CTE}
        SELECT
          (
            SELECT coalesce(jsonb_agg(fund_code ORDER BY fund_code), '[]'::jsonb)
            FROM (SELECT DISTINCT fund_code FROM selected_positions WHERE fund_code IS NOT NULL) funds
          ) AS funds,
          (
            SELECT coalesce(jsonb_agg(account_group ORDER BY account_group), '[]'::jsonb)
            FROM (
              SELECT DISTINCT account_group
              FROM selected_positions
              WHERE account_group IS NOT NULL AND account_group <> ''
            ) account_groups
          ) AS account_groups,
          (
            SELECT coalesce(jsonb_agg(product ORDER BY product), '[]'::jsonb)
            FROM (
              SELECT DISTINCT product
              FROM selected_positions
              WHERE product IS NOT NULL AND product <> ''
              ORDER BY product
              LIMIT 300
            ) products
          ) AS products
      `,
      baseArgs,
    ),
    query<SummaryDbRow>(
      `
        ${SELECTED_POSITIONS_CTE}
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
      `,
      baseArgs,
    ),
    query<ProductSummaryDbRow>(
      `
        ${SELECTED_POSITIONS_CTE}
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
                WHEN market_settlement_price IS NOT NULL THEN market_settlement_price * abs(coalesce(quantity_1, 0))
                ELSE 0
              END
            )
            / nullif(sum(CASE WHEN market_settlement_price IS NOT NULL THEN abs(coalesce(quantity_1, 0)) ELSE 0 END), 0)
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
      `,
      baseArgs,
    ),
    query<RawPositionDbRow>(
      `
        ${SELECTED_POSITIONS_CTE}
        SELECT
          fund_code,
          source_legal_entity,
          source_file_name,
          source_file_row_number,
          to_char(nav_date, 'YYYY-MM-DD') AS nav_date,
          sftp_upload_timestamp::text AS sftp_upload_timestamp,
          broker_name,
          account_group,
          account,
          to_char(trade_date, 'YYYY-MM-DD') AS trade_date,
          product_id_internal,
          product,
          type,
          month_year,
          client_symbol,
          strike_price::double precision AS strike_price,
          call_put,
          product_currency_1,
          long_short,
          quantity_1::double precision AS quantity_1,
          counter_currency_ccy2,
          ccy2_long_short,
          ccy2_quantity_2::double precision AS ccy2_quantity_2,
          trade_price::double precision AS trade_price,
          multiplier_and_tick_value::double precision AS multiplier_and_tick_value,
          cost_in_native_currency::double precision AS cost_in_native_currency,
          open_exchange_rate::double precision AS open_exchange_rate,
          cost_in_base_currency::double precision AS cost_in_base_currency,
          market_settlement_price::double precision AS market_settlement_price,
          market_value_in_native_currency::double precision AS market_value_in_native_currency,
          close_exchange_rate::double precision AS close_exchange_rate,
          market_value_in_base_currency::double precision AS market_value_in_base_currency,
          sector,
          sub_sector,
          country,
          exchange_name,
          source_1_symbol,
          source_3_symbol,
          one_chicago_symbol,
          fas_level,
          option_style,
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
        FROM selected_positions
        ORDER BY
          abs(coalesce(market_value_in_base_currency, 0)) DESC,
          fund_code,
          account_group NULLS LAST,
          product NULLS LAST,
          source_file_row_number
        LIMIT $6::integer
      `,
      [...baseArgs, rawLimit],
    ),
  ]);

  const availableDates = availableRows.map((row) => ({
    navDate: row.nav_date,
    fundCount: toInteger(row.fund_count),
    rowCount: toInteger(row.row_count),
    latestUploadAt: isoOrText(row.latest_upload_at),
  }));

  const filters = filterRows[0] ?? { funds: [], account_groups: [], products: [] };
  const summaryRow = summaryRows[0];
  const rowCount = toInteger(summaryRow?.row_count);
  const asOf = isoOrText(summaryRow?.as_of ?? summaryRow?.latest_upload_at ?? null);
  const selectedDate = requestedDate ?? summaryRow?.max_nav_date ?? availableDates[0]?.navDate ?? null;
  const latestDate = availableDates[0]?.navDate ?? summaryRow?.max_nav_date ?? null;

  const payload = {
    source: "nav.positions",
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
      group: groupFilter ? JSON.parse(groupFilter) : null,
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
      rawLimit,
    },
    productSummary: productRows.map(mapProductSummary),
    rawRows: rawRows.map(mapRawRow),
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
      rawColumns: [
        "fund_code",
        "source_legal_entity",
        "source_file_name",
        "source_file_row_number",
        "nav_date",
        "sftp_upload_timestamp",
        "broker_name",
        "account_group",
        "account",
        "trade_date",
        "product_id_internal",
        "product",
        "type",
        "month_year",
        "client_symbol",
        "strike_price",
        "call_put",
        "product_currency_1",
        "long_short",
        "quantity_1",
        "counter_currency_ccy2",
        "ccy2_long_short",
        "ccy2_quantity_2",
        "trade_price",
        "multiplier_and_tick_value",
        "cost_in_native_currency",
        "open_exchange_rate",
        "cost_in_base_currency",
        "market_settlement_price",
        "market_value_in_native_currency",
        "close_exchange_rate",
        "market_value_in_base_currency",
        "sector",
        "sub_sector",
        "country",
        "exchange_name",
        "source_1_symbol",
        "source_3_symbol",
        "one_chicago_symbol",
        "fas_level",
        "option_style",
        "product_code",
        "product_group",
        "product_region",
        "underlying_product_code",
        "contract_yyyymm",
        "contract_day",
        "put_call",
        "normalized_strike_price",
        "normalization_status",
      ],
      productSummaryLimit: PRODUCT_SUMMARY_LIMIT,
      maxRawLimit: MAX_RAW_LIMIT,
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
