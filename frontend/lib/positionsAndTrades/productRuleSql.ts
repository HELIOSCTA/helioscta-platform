import { PRODUCT_ALIASES, PRODUCT_DEFINITIONS } from "./productLookup";

export interface ProductRuleSqlParams {
  selectedDate?: string | null;
  fund?: string | null;
  accountGroup?: string | null;
  productSearch?: string | null;
}

export interface ProductRuleSqlDownload {
  group: "Validation" | "Marts";
  label: string;
  fileName: string;
  sql: string;
}

function sqlText(value: string | null | undefined): string {
  return value === null || value === undefined
    ? "NULL"
    : `'${value.replaceAll("'", "''")}'`;
}

function nullableFilterValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === "all") return null;
  return trimmed;
}

function valuesRows(rows: string[][]): string {
  return rows.map((row) => `    (${row.join(", ")})`).join(",\n");
}

function productCatalogValues(): string {
  return valuesRows(
    PRODUCT_DEFINITIONS.map((definition) => [
      sqlText(definition.exchangeCode),
      sqlText(definition.ruleGroup),
      sqlText(definition.ruleRegion),
      sqlText(definition.exchangeCodeUnderlying),
      sqlText(definition.bbgExchangeCode),
      sqlText(definition.defaultExchangeName),
    ])
  );
}

function navAliasValues(): string {
  return valuesRows(
    PRODUCT_ALIASES.filter((alias) => alias.source === "nav" || alias.source === "any").map(
      (alias, index) => [
        String(index + 1),
        sqlText(alias.matchType),
        sqlText(alias.pattern),
        sqlText(alias.exchangeCode),
        sqlText(alias.optionType ?? null),
      ]
    )
  );
}

function baseCte(params: ProductRuleSqlParams): string {
  const selectedDate = nullableFilterValue(params.selectedDate);
  const fund = nullableFilterValue(params.fund);
  const accountGroup = nullableFilterValue(params.accountGroup);
  const productSearch = nullableFilterValue(params.productSearch);

  return `
WITH params AS (
  SELECT
    ${sqlText(selectedDate)}::date AS requested_nav_date,
    ${sqlText(fund)}::text AS fund_filter,
    ${sqlText(accountGroup)}::text AS account_group_filter,
    ${sqlText(productSearch)}::text AS product_search
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
  SELECT p.*
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
selected_positions AS (
  SELECT base_positions.*
  FROM base_positions
  INNER JOIN latest_upload_by_fund latest
    ON latest.fund_code = base_positions.fund_code
   AND latest.nav_date = base_positions.nav_date
   AND latest.sftp_upload_timestamp = base_positions.sftp_upload_timestamp
  CROSS JOIN params
  WHERE (params.account_group_filter IS NULL OR base_positions.account_group = params.account_group_filter)
    AND (
      params.product_search IS NULL
      OR base_positions.product ILIKE '%' || params.product_search || '%'
      OR base_positions.product_id_internal ILIKE '%' || params.product_search || '%'
      OR base_positions.client_symbol ILIKE '%' || params.product_search || '%'
      OR base_positions.source_1_symbol ILIKE '%' || params.product_search || '%'
      OR base_positions.source_3_symbol ILIKE '%' || params.product_search || '%'
      OR base_positions.account ILIKE '%' || params.product_search || '%'
    )
),
normalized AS (
  SELECT
    p.*,
    upper(regexp_replace(coalesce(p.product, ''), '[[:space:]]+', ' ', 'g')) AS product_norm,
    (
      upper(coalesce(p.call_put, '')) IN ('CALL', 'PUT', 'C', 'P')
      OR upper(coalesce(p.type, '')) LIKE '%OPTION%'
    ) AS is_option,
    CASE
      WHEN upper(coalesce(p.call_put, '')) IN ('CALL', 'C') THEN 'C'
      WHEN upper(coalesce(p.call_put, '')) IN ('PUT', 'P') THEN 'P'
      ELSE NULL
    END AS put_call_code,
    CASE
      WHEN p.month_year ~ '^\\s*\\d{1,2}/\\d{1,2}/\\d{4}\\s*$'
        THEN to_char(to_date(trim(p.month_year), 'MM/DD/YYYY'), 'YYYY-MM')
      WHEN upper(trim(coalesce(p.month_year, ''))) ~ '^[A-Z]{3}\\d{2}$'
        THEN to_char(to_date(upper(trim(p.month_year)), 'MONYY'), 'YYYY-MM')
      ELSE NULL
    END AS contract_month,
    CASE
      WHEN p.month_year ~ '^\\s*\\d{1,2}/\\d{1,2}/\\d{4}\\s*$'
        THEN extract(day FROM to_date(trim(p.month_year), 'MM/DD/YYYY'))::integer
      ELSE NULL
    END AS contract_day
  FROM selected_positions p
),
rule_eval AS (
  SELECT
    n.*,
    alias.exchange_code AS rule_exchange_code,
    alias.match_type AS alias_match_type,
    alias.pattern AS alias_pattern,
    catalog.rule_group,
    catalog.rule_region,
    catalog.exchange_code_underlying AS rule_underlying,
    catalog.bbg_exchange_code AS rule_bbg_exchange_code,
    catalog.default_exchange_name AS rule_default_exchange_name
  FROM normalized n
  LEFT JOIN LATERAL (
    SELECT product_aliases.*
    FROM product_aliases
    WHERE (
        (product_aliases.match_type = 'exact' AND n.product_norm = product_aliases.pattern)
        OR (product_aliases.match_type = 'regex' AND n.product_norm ~* product_aliases.pattern)
      )
      AND (
        product_aliases.option_type IS NULL
        OR product_aliases.option_type = CASE WHEN n.is_option THEN 'option' ELSE 'future' END
      )
    ORDER BY product_aliases.priority
    LIMIT 1
  ) alias ON TRUE
  LEFT JOIN product_catalog catalog
    ON catalog.exchange_code = alias.exchange_code
)`;
}

export function buildProductRuleCoverageSql(params: ProductRuleSqlParams = {}): string {
  return `${baseCte(params)},
final AS (
  SELECT
    fund_code,
    product,
    type,
    month_year,
    contract_month,
    contract_day,
    rule_exchange_code,
    rule_group,
    rule_region,
    rule_underlying,
    alias_match_type,
    alias_pattern,
    count(*)::integer AS row_count,
    count(DISTINCT account)::integer AS account_count,
    sum(coalesce(quantity_1, 0))::double precision AS net_quantity,
    sum(coalesce(market_value_in_base_currency, 0))::double precision AS market_value_base
  FROM rule_eval
  GROUP BY
    fund_code,
    product,
    type,
    month_year,
    contract_month,
    contract_day,
    rule_exchange_code,
    rule_group,
    rule_region,
    rule_underlying,
    alias_match_type,
    alias_pattern
)
SELECT *
FROM final
ORDER BY row_count DESC, product NULLS LAST;`;
}

export function buildProductRuleExceptionsSql(params: ProductRuleSqlParams = {}): string {
  return `${baseCte(params)},
final AS (
  SELECT
    fund_code,
    nav_date,
    source_file_name,
    source_file_row_number,
    account_group,
    account,
    product,
    type,
    month_year,
    exchange_name,
    call_put,
    strike_price,
    market_value_in_base_currency,
    rule_exchange_code,
    rule_group,
    rule_region,
    contract_month,
    contract_day,
    CASE
      WHEN rule_exchange_code IS NULL THEN 'unresolved product'
      WHEN month_year IS NOT NULL AND contract_month IS NULL THEN 'unparsed contract'
      WHEN is_option AND put_call_code IS NULL THEN 'option missing put/call'
      WHEN is_option AND strike_price IS NULL THEN 'option missing strike'
      ELSE 'ok'
    END AS rule_exception
  FROM rule_eval
  WHERE rule_exchange_code IS NULL
     OR (month_year IS NOT NULL AND contract_month IS NULL)
     OR (is_option AND put_call_code IS NULL)
     OR (is_option AND strike_price IS NULL)
)
SELECT *
FROM final
ORDER BY
  rule_exception,
  abs(coalesce(market_value_in_base_currency, 0)) DESC,
  fund_code,
  source_file_row_number;`;
}

export function buildProductRuleDetailSql(params: ProductRuleSqlParams = {}): string {
  return `${baseCte(params)},
final AS (
  SELECT
    fund_code,
    nav_date,
    account_group,
    account,
    product,
    type,
    month_year,
    contract_month,
    contract_day,
    exchange_name,
    rule_default_exchange_name,
    rule_exchange_code,
    rule_group,
    rule_region,
    rule_underlying,
    rule_bbg_exchange_code,
    call_put,
    put_call_code,
    strike_price,
    quantity_1,
    market_value_in_base_currency,
    alias_match_type,
    alias_pattern,
    source_file_name,
    source_file_row_number
  FROM rule_eval
)
SELECT *
FROM final
ORDER BY
  abs(coalesce(market_value_in_base_currency, 0)) DESC,
  fund_code,
  account_group NULLS LAST,
  product NULLS LAST,
  source_file_row_number;`;
}

export function buildPositionsMartGroupedSql(params: ProductRuleSqlParams = {}): string {
  return `${baseCte(params)},
instrument_rows AS (
  SELECT
    nav_date,
    sftp_upload_timestamp,
    fund_code,
    account_group,
    account,
    product_id_internal,
    product,
    type,
    month_year,
    client_symbol,
    source_1_symbol,
    source_3_symbol,
    product_currency_1,
    counter_currency_ccy2,
    long_short,
    quantity_1,
    ccy2_quantity_2,
    trade_price,
    multiplier_and_tick_value,
    cost_in_native_currency,
    cost_in_base_currency,
    market_settlement_price,
    market_value_in_native_currency,
    market_value_in_base_currency,
    open_exchange_rate,
    close_exchange_rate,
    sector,
    sub_sector,
    country,
    exchange_name,
    option_style,
    rule_group,
    rule_region,
    rule_exchange_code AS exchange_code,
    rule_underlying AS exchange_code_underlying,
    rule_bbg_exchange_code AS bbg_exchange_code,
    rule_default_exchange_name AS default_exchange_name,
    is_option,
    put_call_code AS put_call,
    strike_price,
    contract_month,
    CASE
      WHEN contract_month ~ '^\\d{4}-\\d{2}$' THEN replace(contract_month, '-', '')
      ELSE NULL
    END AS contract_yyyymm,
    CASE
      WHEN contract_month ~ '^\\d{4}-\\d{2}$' AND contract_day IS NOT NULL
        THEN replace(contract_month, '-', '') || lpad(contract_day::text, 2, '0')
      ELSE NULL
    END AS contract_yyyymmdd,
    CASE
      WHEN contract_month ~ '^\\d{4}-\\d{2}$' THEN substring(contract_month, 1, 4)::integer
      ELSE NULL
    END AS contract_year,
    CASE
      WHEN contract_month ~ '^\\d{4}-\\d{2}$' THEN substring(contract_month, 6, 2)::integer
      ELSE NULL
    END AS contract_month_number,
    contract_day
  FROM rule_eval
),
instrument_with_codes AS (
  SELECT
    instrument_rows.*,
    CASE contract_month_number
      WHEN 1 THEN 'F'
      WHEN 2 THEN 'G'
      WHEN 3 THEN 'H'
      WHEN 4 THEN 'J'
      WHEN 5 THEN 'K'
      WHEN 6 THEN 'M'
      WHEN 7 THEN 'N'
      WHEN 8 THEN 'Q'
      WHEN 9 THEN 'U'
      WHEN 10 THEN 'V'
      WHEN 11 THEN 'X'
      WHEN 12 THEN 'Z'
      ELSE NULL
    END AS futures_contract_month
  FROM instrument_rows
),
instrument_with_symbols AS (
  SELECT
    instrument_with_codes.*,
    CASE
      WHEN futures_contract_month IS NOT NULL AND contract_year IS NOT NULL
        THEN futures_contract_month || right(contract_year::text, 1)
      ELSE NULL
    END AS futures_contract_month_y,
    CASE
      WHEN futures_contract_month IS NOT NULL AND contract_year IS NOT NULL
        THEN futures_contract_month || right(contract_year::text, 2)
      ELSE NULL
    END AS futures_contract_month_yy,
    trim(trailing '.' FROM trim(trailing '0' FROM to_char(strike_price, 'FM999999999.999'))) AS strike_text
  FROM instrument_with_codes
),
instrument_final AS (
  SELECT
    instrument_with_symbols.*,
    CASE
      WHEN exchange_name = 'IFED' AND exchange_code = 'HHD' THEN exchange_code || ' B0-IUS'
      WHEN exchange_code IN ('PDP', 'PWA', 'DDP') THEN exchange_code || ' D0-IUS'
      WHEN exchange_name = 'IFED' AND is_option AND put_call IS NOT NULL AND strike_price IS NOT NULL AND futures_contract_month_yy IS NOT NULL
        THEN exchange_code || ' ' || futures_contract_month_yy || put_call || round(strike_price)::integer::text || '-IUS'
      WHEN exchange_name = 'IFED' AND NOT is_option AND contract_day IS NULL AND futures_contract_month_yy IS NOT NULL
        THEN exchange_code || ' ' || futures_contract_month_yy || '-IUS'
      ELSE NULL
    END AS ice_xl_symbol,
    CASE
      WHEN exchange_name = 'IFED' AND is_option AND exchange_code_underlying IS NOT NULL AND futures_contract_month_yy IS NOT NULL
        THEN exchange_code_underlying || ' ' || futures_contract_month_yy || '-IUS'
      ELSE NULL
    END AS ice_xl_symbol_underlying,
    CASE
      WHEN exchange_code IN ('HP', 'PHH', 'HH', 'H', 'NG') AND contract_yyyymm IS NOT NULL
        THEN '1|G|XNYM:F:NG:' || contract_yyyymm
      WHEN exchange_code IN ('LN', 'PHE') AND contract_yyyymm IS NOT NULL AND put_call IS NOT NULL AND strike_price IS NOT NULL
        THEN '1|G|XNYM:O:LN:' || contract_yyyymm || ':' || put_call || ':' || strike_text
      WHEN (exchange_code IN ('LN1', 'LN2', 'LN3', 'LN4', 'LN5') OR exchange_code = 'KN4')
        AND contract_yyyymm IS NOT NULL AND put_call IS NOT NULL AND strike_price IS NOT NULL
        THEN '1|G|XNYM:O:KN' || substring(exchange_code FROM 3) || ':' || contract_yyyymm || ':' || put_call || ':' || strike_text
      WHEN exchange_code IN ('G3', 'G4') THEN 'CAL_SPREAD_CME_EXCEL_CODE'
      ELSE NULL
    END AS cme_excel_symbol,
    CASE
      WHEN is_option AND exchange_code IN ('LN', 'PHE') AND bbg_exchange_code IS NOT NULL
        AND futures_contract_month_y IS NOT NULL AND put_call IS NOT NULL AND strike_price IS NOT NULL
        THEN bbg_exchange_code || futures_contract_month_y || put_call || ' ' || strike_text
      ELSE NULL
    END AS bbg_symbol,
    CASE
      WHEN is_option AND exchange_code IN ('LN', 'PHE') AND put_call IS NOT NULL AND contract_month_number IS NOT NULL AND contract_year IS NOT NULL AND strike_price IS NOT NULL
        THEN CASE WHEN put_call = 'C' THEN 'CALL ' ELSE 'PUT ' END
          || upper(to_char(to_date(contract_month_number::text, 'MM'), 'MON'))
          || ' ' || contract_year::text || ' ' || to_char(strike_price, 'FM999999999.00')
      WHEN is_option AND exchange_code IN ('LN1', 'LN2', 'LN3', 'LN4', 'LN5') AND put_call IS NOT NULL AND contract_month_number IS NOT NULL AND contract_year IS NOT NULL AND strike_price IS NOT NULL
        THEN CASE WHEN put_call = 'C' THEN 'CALL ' ELSE 'PUT ' END
          || upper(to_char(to_date(contract_month_number::text, 'MM'), 'MON'))
          || ' ' || contract_year::text || ' WKLY WEEK' || substring(exchange_code FROM 3)
          || ' ' || to_char(strike_price, 'FM999999999.00')
      WHEN is_option AND exchange_code IN ('G3', 'G4') AND put_call IS NOT NULL AND contract_month_number IS NOT NULL AND contract_year IS NOT NULL AND strike_price IS NOT NULL
        THEN CASE WHEN put_call = 'C' THEN 'CALL ' ELSE 'PUT ' END
          || upper(to_char(to_date(contract_month_number::text, 'MM'), 'MON'))
          || ' ' || contract_year::text || ' CAL SPREAD ' || substring(exchange_code FROM 2 FOR 1)
          || ' MONTHS ' || to_char(strike_price, 'FM999999999.00')
      ELSE NULL
    END AS bbg_option_description
  FROM instrument_with_symbols
),
final AS (
  SELECT
  nav_date,
  max(sftp_upload_timestamp)::text AS latest_upload_at,
  string_agg(DISTINCT fund_code, ', ' ORDER BY fund_code) AS fund_codes,
  string_agg(DISTINCT account_group, ', ' ORDER BY account_group) FILTER (
    WHERE account_group IS NOT NULL AND account_group <> ''
  ) AS account_groups,
  count(DISTINCT fund_code)::integer AS fund_count,
  count(DISTINCT account_group)::integer AS account_group_count,
  count(DISTINCT account)::integer AS account_count,
  rule_group,
  rule_region,
  exchange_name,
  default_exchange_name,
  exchange_code,
  exchange_code_underlying,
  bbg_exchange_code,
  product,
  type,
  month_year,
  client_symbol,
  source_1_symbol,
  source_3_symbol,
  product_currency_1,
  counter_currency_ccy2,
  contract_month,
  contract_yyyymm,
  contract_yyyymmdd,
  contract_year,
  contract_month_number,
  contract_day,
  futures_contract_month,
  futures_contract_month_y,
  futures_contract_month_yy,
  is_option,
  put_call,
  strike_price,
  option_style,
  multiplier_and_tick_value,
  ice_xl_symbol,
  ice_xl_symbol_underlying,
  cme_excel_symbol,
  bbg_symbol,
  bbg_option_description,
  min(sector) AS sector,
  min(sub_sector) AS sub_sector,
  min(country) AS country,
  count(*)::integer AS row_count,
  sum(coalesce(quantity_1, 0))::double precision AS net_quantity,
  sum(abs(coalesce(quantity_1, 0)))::double precision AS gross_quantity,
  sum(coalesce(ccy2_quantity_2, 0))::double precision AS net_ccy2_quantity,
  sum(coalesce(cost_in_native_currency, 0))::double precision AS cost_native_total,
  sum(coalesce(cost_in_base_currency, 0))::double precision AS cost_base_total,
  sum(coalesce(market_value_in_native_currency, 0))::double precision AS market_value_native_total,
  sum(coalesce(market_value_in_base_currency, 0))::double precision AS market_value_base_total,
  sum(
    coalesce(market_value_in_base_currency, 0) - coalesce(cost_in_base_currency, 0)
  )::double precision AS unrealized_pnl_base_total,
  sum(
    coalesce(market_value_in_native_currency, 0) - coalesce(cost_in_native_currency, 0)
  )::double precision AS unrealized_pnl_native_total,
  (
    sum(
      CASE
        WHEN trade_price IS NOT NULL THEN trade_price * abs(coalesce(quantity_1, 0))
        ELSE 0
      END
    )
    / nullif(sum(CASE WHEN trade_price IS NOT NULL THEN abs(coalesce(quantity_1, 0)) ELSE 0 END), 0)
  )::double precision AS avg_trade_price,
  min(trade_price)::double precision AS min_trade_price,
  max(trade_price)::double precision AS max_trade_price,
  (
    sum(
      CASE
        WHEN market_settlement_price IS NOT NULL THEN market_settlement_price * abs(coalesce(quantity_1, 0))
        ELSE 0
      END
    )
    / nullif(sum(CASE WHEN market_settlement_price IS NOT NULL THEN abs(coalesce(quantity_1, 0)) ELSE 0 END), 0)
  )::double precision AS avg_settlement_price,
  min(market_settlement_price)::double precision AS min_settlement_price,
  max(market_settlement_price)::double precision AS max_settlement_price,
  count(DISTINCT market_settlement_price)::integer AS settlement_price_count,
  (
    sum(
      CASE
        WHEN open_exchange_rate IS NOT NULL THEN open_exchange_rate * abs(coalesce(market_value_in_base_currency, 0))
        ELSE 0
      END
    )
    / nullif(sum(CASE WHEN open_exchange_rate IS NOT NULL THEN abs(coalesce(market_value_in_base_currency, 0)) ELSE 0 END), 0)
  )::double precision AS avg_open_exchange_rate,
  (
    sum(
      CASE
        WHEN close_exchange_rate IS NOT NULL THEN close_exchange_rate * abs(coalesce(market_value_in_base_currency, 0))
        ELSE 0
      END
    )
    / nullif(sum(CASE WHEN close_exchange_rate IS NOT NULL THEN abs(coalesce(market_value_in_base_currency, 0)) ELSE 0 END), 0)
  )::double precision AS avg_close_exchange_rate
FROM instrument_final
GROUP BY
  nav_date,
  rule_group,
  rule_region,
  exchange_name,
  default_exchange_name,
  exchange_code,
  exchange_code_underlying,
  bbg_exchange_code,
  product,
  type,
  month_year,
  client_symbol,
  source_1_symbol,
  source_3_symbol,
  product_currency_1,
  counter_currency_ccy2,
  contract_month,
  contract_yyyymm,
  contract_yyyymmdd,
  contract_year,
  contract_month_number,
  contract_day,
  is_option,
  put_call,
  strike_price,
  option_style,
  multiplier_and_tick_value,
  futures_contract_month,
  futures_contract_month_y,
  futures_contract_month_yy,
  ice_xl_symbol,
  ice_xl_symbol_underlying,
  cme_excel_symbol,
  bbg_symbol,
  bbg_option_description
)
SELECT *
FROM final
ORDER BY
  abs(coalesce(market_value_base_total, 0)) DESC,
  rule_group NULLS LAST,
  rule_region NULLS LAST,
  exchange_code NULLS LAST,
  contract_month NULLS LAST,
  product NULLS LAST;`;
}

export function buildPositionsMartRuleGroupSummarySql(
  params: ProductRuleSqlParams = {}
): string {
  return `${baseCte(params)},
final AS (
  SELECT
    nav_date,
    max(sftp_upload_timestamp)::text AS latest_upload_at,
    fund_code,
    account_group,
    rule_group,
    rule_region,
    rule_exchange_code,
    rule_underlying,
    count(*)::integer AS row_count,
    count(DISTINCT account)::integer AS account_count,
    count(DISTINCT product)::integer AS product_count,
    sum(coalesce(quantity_1, 0))::double precision AS net_quantity,
    sum(abs(coalesce(quantity_1, 0)))::double precision AS gross_quantity,
    sum(coalesce(cost_in_base_currency, 0))::double precision AS cost_base,
    sum(coalesce(market_value_in_base_currency, 0))::double precision AS market_value_base,
    sum(
      coalesce(market_value_in_base_currency, 0) - coalesce(cost_in_base_currency, 0)
    )::double precision AS unrealized_pnl_base
  FROM rule_eval
  GROUP BY
    nav_date,
    fund_code,
    account_group,
    rule_group,
    rule_region,
    rule_exchange_code,
    rule_underlying
)
SELECT *
FROM final
ORDER BY
  rule_group NULLS LAST,
  rule_region NULLS LAST,
  abs(coalesce(market_value_base, 0)) DESC,
  fund_code,
  account_group NULLS LAST;`;
}

function latestVsPriorBaseCte(params: ProductRuleSqlParams): string {
  const selectedDate = nullableFilterValue(params.selectedDate);
  const fund = nullableFilterValue(params.fund);
  const accountGroup = nullableFilterValue(params.accountGroup);
  const productSearch = nullableFilterValue(params.productSearch);

  return `
WITH params AS (
  SELECT
    ${sqlText(selectedDate)}::date AS requested_nav_date,
    ${sqlText(fund)}::text AS fund_filter,
    ${sqlText(accountGroup)}::text AS account_group_filter,
    ${sqlText(productSearch)}::text AS product_search
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
  SELECT p.*
  FROM nav.positions p
  CROSS JOIN params
  WHERE params.fund_filter IS NULL OR p.fund_code = params.fund_filter
),
current_nav_by_fund AS (
  SELECT
    base_positions.fund_code,
    COALESCE((SELECT requested_nav_date FROM params), max(base_positions.nav_date)) AS current_nav_date
  FROM base_positions
  CROSS JOIN params
  WHERE params.requested_nav_date IS NULL OR base_positions.nav_date = params.requested_nav_date
  GROUP BY base_positions.fund_code
),
previous_nav_by_fund AS (
  SELECT
    current_nav_by_fund.fund_code,
    max(base_positions.nav_date) AS previous_nav_date
  FROM current_nav_by_fund
  INNER JOIN base_positions
    ON base_positions.fund_code = current_nav_by_fund.fund_code
   AND base_positions.nav_date < current_nav_by_fund.current_nav_date
  GROUP BY current_nav_by_fund.fund_code
),
selected_nav_dates AS (
  SELECT
    fund_code,
    current_nav_date AS nav_date,
    'current'::text AS date_role
  FROM current_nav_by_fund
  UNION ALL
  SELECT
    fund_code,
    previous_nav_date AS nav_date,
    'previous'::text AS date_role
  FROM previous_nav_by_fund
  WHERE previous_nav_date IS NOT NULL
),
latest_upload_by_fund_date AS (
  SELECT
    base_positions.fund_code,
    base_positions.nav_date,
    selected_nav_dates.date_role,
    max(base_positions.sftp_upload_timestamp) AS sftp_upload_timestamp
  FROM base_positions
  INNER JOIN selected_nav_dates
    ON selected_nav_dates.fund_code = base_positions.fund_code
   AND selected_nav_dates.nav_date = base_positions.nav_date
  GROUP BY
    base_positions.fund_code,
    base_positions.nav_date,
    selected_nav_dates.date_role
),
selected_positions AS (
  SELECT
    latest.date_role,
    base_positions.*
  FROM base_positions
  INNER JOIN latest_upload_by_fund_date latest
    ON latest.fund_code = base_positions.fund_code
   AND latest.nav_date = base_positions.nav_date
   AND latest.sftp_upload_timestamp = base_positions.sftp_upload_timestamp
  CROSS JOIN params
  WHERE (params.account_group_filter IS NULL OR base_positions.account_group = params.account_group_filter)
    AND (
      params.product_search IS NULL
      OR base_positions.product ILIKE '%' || params.product_search || '%'
      OR base_positions.product_id_internal ILIKE '%' || params.product_search || '%'
      OR base_positions.client_symbol ILIKE '%' || params.product_search || '%'
      OR base_positions.source_1_symbol ILIKE '%' || params.product_search || '%'
      OR base_positions.source_3_symbol ILIKE '%' || params.product_search || '%'
      OR base_positions.account ILIKE '%' || params.product_search || '%'
    )
),
normalized AS (
  SELECT
    p.*,
    upper(regexp_replace(coalesce(p.product, ''), '[[:space:]]+', ' ', 'g')) AS product_norm,
    (
      upper(coalesce(p.call_put, '')) IN ('CALL', 'PUT', 'C', 'P')
      OR upper(coalesce(p.type, '')) LIKE '%OPTION%'
    ) AS is_option,
    CASE
      WHEN upper(coalesce(p.call_put, '')) IN ('CALL', 'C') THEN 'C'
      WHEN upper(coalesce(p.call_put, '')) IN ('PUT', 'P') THEN 'P'
      ELSE NULL
    END AS put_call_code,
    CASE
      WHEN p.month_year ~ '^\\s*\\d{1,2}/\\d{1,2}/\\d{4}\\s*$'
        THEN to_char(to_date(trim(p.month_year), 'MM/DD/YYYY'), 'YYYY-MM')
      WHEN upper(trim(coalesce(p.month_year, ''))) ~ '^[A-Z]{3}\\d{2}$'
        THEN to_char(to_date(upper(trim(p.month_year)), 'MONYY'), 'YYYY-MM')
      ELSE NULL
    END AS contract_month,
    CASE
      WHEN p.month_year ~ '^\\s*\\d{1,2}/\\d{1,2}/\\d{4}\\s*$'
        THEN extract(day FROM to_date(trim(p.month_year), 'MM/DD/YYYY'))::integer
      ELSE NULL
    END AS contract_day
  FROM selected_positions p
),
rule_eval AS (
  SELECT
    n.*,
    alias.exchange_code AS rule_exchange_code,
    alias.match_type AS alias_match_type,
    alias.pattern AS alias_pattern,
    catalog.rule_group,
    catalog.rule_region,
    catalog.exchange_code_underlying AS rule_underlying,
    catalog.bbg_exchange_code AS rule_bbg_exchange_code,
    catalog.default_exchange_name AS rule_default_exchange_name
  FROM normalized n
  LEFT JOIN LATERAL (
    SELECT product_aliases.*
    FROM product_aliases
    WHERE (
        (product_aliases.match_type = 'exact' AND n.product_norm = product_aliases.pattern)
        OR (product_aliases.match_type = 'regex' AND n.product_norm ~* product_aliases.pattern)
      )
      AND (
        product_aliases.option_type IS NULL
        OR product_aliases.option_type = CASE WHEN n.is_option THEN 'option' ELSE 'future' END
      )
    ORDER BY product_aliases.priority
    LIMIT 1
  ) alias ON TRUE
  LEFT JOIN product_catalog catalog
    ON catalog.exchange_code = alias.exchange_code
)`;
}

export function buildPositionsMartLatestVsPriorSql(
  params: ProductRuleSqlParams = {}
): string {
  return `${latestVsPriorBaseCte(params)},
enriched AS (
  SELECT
    date_role,
    nav_date AS sftp_date,
    sftp_upload_timestamp,
    trade_date AS last_trade_date,
    CASE
      WHEN trade_date IS NOT NULL THEN (trade_date - nav_date)::integer
      ELSE NULL
    END AS days_to_expiry,
    exchange_name,
    rule_group AS exchange_code_grouping,
    rule_region AS exchange_code_region,
    rule_exchange_code AS exchange_code,
    rule_underlying AS exchange_code_underlying,
    is_option,
    put_call_code AS put_call,
    strike_price,
    NULL::double precision AS marex_delta,
    CASE
      WHEN contract_month ~ '^\\d{4}-\\d{2}$' THEN replace(contract_month, '-', '')
      ELSE NULL
    END AS contract_yyyymm,
    CASE
      WHEN contract_month ~ '^\\d{4}-\\d{2}$' AND contract_day IS NOT NULL
        THEN to_date(replace(contract_month, '-', '') || lpad(contract_day::text, 2, '0'), 'YYYYMMDD')
      ELSE NULL
    END AS contract_yyyymmdd,
    CASE
      WHEN contract_month ~ '^\\d{4}-\\d{2}$' THEN substring(contract_month, 1, 4)::integer
      ELSE NULL
    END AS contract_year,
    CASE
      WHEN contract_month ~ '^\\d{4}-\\d{2}$' THEN substring(contract_month, 6, 2)::integer
      ELSE NULL
    END AS contract_month,
    contract_day,
    product::text AS marex_description,
    CASE
      WHEN coalesce(multiplier_and_tick_value, 0) = 2500
        AND rule_exchange_code IN ('HHD', 'H', 'PHH', 'PHE')
        THEN coalesce(quantity_1, 0) / 4
      ELSE coalesce(quantity_1, 0)
    END AS qty,
    CASE
      WHEN coalesce(multiplier_and_tick_value, 0) = 2500
        AND rule_exchange_code IN ('HHD', 'H', 'PHH', 'PHE')
        THEN multiplier_and_tick_value * 4
      ELSE multiplier_and_tick_value
    END AS lots,
    trade_price,
    market_settlement_price AS settlement_price,
    market_value_in_base_currency AS market_value,
    upper(coalesce(account_group, '')) AS account_group_norm,
    upper(coalesce(account, '')) AS account_norm,
    upper(coalesce(fund_code, '')) AS fund_code_norm,
    rule_bbg_exchange_code
  FROM rule_eval
),
enriched_with_codes AS (
  SELECT
    enriched.*,
    CASE contract_month
      WHEN 1 THEN 'F'
      WHEN 2 THEN 'G'
      WHEN 3 THEN 'H'
      WHEN 4 THEN 'J'
      WHEN 5 THEN 'K'
      WHEN 6 THEN 'M'
      WHEN 7 THEN 'N'
      WHEN 8 THEN 'Q'
      WHEN 9 THEN 'U'
      WHEN 10 THEN 'V'
      WHEN 11 THEN 'X'
      WHEN 12 THEN 'Z'
      ELSE NULL
    END AS futures_contract_month
  FROM enriched
),
enriched_with_symbols AS (
  SELECT
    enriched_with_codes.*,
    CASE
      WHEN futures_contract_month IS NOT NULL AND contract_year IS NOT NULL
        THEN futures_contract_month || right(contract_year::text, 1)
      ELSE NULL
    END AS futures_contract_month_y,
    CASE
      WHEN futures_contract_month IS NOT NULL AND contract_year IS NOT NULL
        THEN futures_contract_month || right(contract_year::text, 2)
      ELSE NULL
    END AS futures_contract_month_yy,
    trim(trailing '.' FROM trim(trailing '0' FROM to_char(strike_price, 'FM999999999.999'))) AS strike_text
  FROM enriched_with_codes
),
grouped AS (
  SELECT
    date_role,
    sftp_date,
    max(sftp_upload_timestamp)::text AS latest_upload_at,
    last_trade_date,
    days_to_expiry,
    exchange_name,
    exchange_code_grouping,
    exchange_code_region,
    exchange_code,
    exchange_code_underlying,
    is_option,
    put_call,
    strike_price,
    avg(marex_delta) AS marex_delta,
    contract_yyyymm,
    contract_yyyymmdd,
    contract_year,
    contract_month,
    contract_day,
    futures_contract_month,
    futures_contract_month_y,
    futures_contract_month_yy,
    marex_description,
    CASE
      WHEN exchange_name = 'IFED' AND exchange_code = 'HHD' THEN exchange_code || ' B0-IUS'
      WHEN exchange_code IN ('PDP', 'PWA', 'DDP') THEN exchange_code || ' D0-IUS'
      WHEN exchange_name = 'IFED' AND is_option AND put_call IS NOT NULL AND strike_price IS NOT NULL AND futures_contract_month_yy IS NOT NULL
        THEN exchange_code || ' ' || futures_contract_month_yy || put_call || round(strike_price)::integer::text || '-IUS'
      WHEN exchange_name = 'IFED' AND NOT is_option AND contract_day IS NULL AND futures_contract_month_yy IS NOT NULL
        THEN exchange_code || ' ' || futures_contract_month_yy || '-IUS'
      ELSE NULL
    END AS ice_xl_symbol,
    CASE
      WHEN exchange_name = 'IFED' AND is_option AND exchange_code_underlying IS NOT NULL AND futures_contract_month_yy IS NOT NULL
        THEN exchange_code_underlying || ' ' || futures_contract_month_yy || '-IUS'
      ELSE NULL
    END AS ice_xl_symbol_underlying,
    CASE
      WHEN exchange_code IN ('HP', 'PHH', 'HH', 'H', 'NG') AND contract_yyyymm IS NOT NULL
        THEN '1|G|XNYM:F:NG:' || contract_yyyymm
      WHEN exchange_code IN ('LN', 'PHE') AND contract_yyyymm IS NOT NULL AND put_call IS NOT NULL AND strike_price IS NOT NULL
        THEN '1|G|XNYM:O:LN:' || contract_yyyymm || ':' || put_call || ':' || strike_text
      WHEN (exchange_code IN ('LN1', 'LN2', 'LN3', 'LN4', 'LN5') OR exchange_code = 'KN4')
        AND contract_yyyymm IS NOT NULL AND put_call IS NOT NULL AND strike_price IS NOT NULL
        THEN '1|G|XNYM:O:KN' || substring(exchange_code FROM 3) || ':' || contract_yyyymm || ':' || put_call || ':' || strike_text
      WHEN exchange_code IN ('G3', 'G4') THEN 'CAL_SPREAD_CME_EXCEL_CODE'
      ELSE NULL
    END AS cme_excel_symbol,
    CASE
      WHEN is_option AND exchange_code IN ('LN', 'PHE') AND rule_bbg_exchange_code IS NOT NULL
        AND futures_contract_month_y IS NOT NULL AND put_call IS NOT NULL AND strike_price IS NOT NULL
        THEN rule_bbg_exchange_code || futures_contract_month_y || put_call || ' ' || strike_text
      ELSE NULL
    END AS bbg_symbol,
    CASE
      WHEN is_option AND exchange_code IN ('LN', 'PHE') AND put_call IS NOT NULL AND contract_month IS NOT NULL AND contract_year IS NOT NULL AND strike_price IS NOT NULL
        THEN CASE WHEN put_call = 'C' THEN 'CALL ' ELSE 'PUT ' END
          || upper(to_char(to_date(contract_month::text, 'MM'), 'MON'))
          || ' ' || contract_year::text || ' ' || to_char(strike_price, 'FM999999999.00')
      WHEN is_option AND exchange_code IN ('LN1', 'LN2', 'LN3', 'LN4', 'LN5') AND put_call IS NOT NULL AND contract_month IS NOT NULL AND contract_year IS NOT NULL AND strike_price IS NOT NULL
        THEN CASE WHEN put_call = 'C' THEN 'CALL ' ELSE 'PUT ' END
          || upper(to_char(to_date(contract_month::text, 'MM'), 'MON'))
          || ' ' || contract_year::text || ' WKLY WEEK' || substring(exchange_code FROM 3)
          || ' ' || to_char(strike_price, 'FM999999999.00')
      WHEN is_option AND exchange_code IN ('G3', 'G4') AND put_call IS NOT NULL AND contract_month IS NOT NULL AND contract_year IS NOT NULL AND strike_price IS NOT NULL
        THEN CASE WHEN put_call = 'C' THEN 'CALL ' ELSE 'PUT ' END
          || upper(to_char(to_date(contract_month::text, 'MM'), 'MON'))
          || ' ' || contract_year::text || ' CAL SPREAD ' || substring(exchange_code FROM 2 FOR 1)
          || ' MONTHS ' || to_char(strike_price, 'FM999999999.00')
      ELSE NULL
    END AS bbg_option_description,
    lots,
    sum(market_value)::double precision AS market_value_total,
    avg(settlement_price)::double precision AS settlement_price_total,
    avg(trade_price)::double precision AS trade_price_total,
    sum(qty)::double precision AS qty_total,
    sum(CASE WHEN account_group_norm = 'ACIM' OR account_norm LIKE '%ACIM%' OR fund_code_norm = 'ACIM' THEN qty ELSE 0 END)::double precision AS qty_acim,
    sum(CASE WHEN account_group_norm = 'ANDY' OR account_norm LIKE '%ANDY%' OR fund_code_norm = 'ANDY' THEN qty ELSE 0 END)::double precision AS qty_andy,
    sum(CASE WHEN account_group_norm = 'MAC' OR account_norm LIKE '%MAC%' OR fund_code_norm = 'MAC' THEN qty ELSE 0 END)::double precision AS qty_mac,
    sum(CASE WHEN account_group_norm = 'PNT' OR account_norm LIKE '%PNT%' OR fund_code_norm = 'PNT' THEN qty ELSE 0 END)::double precision AS qty_pnt,
    sum(CASE WHEN account_group_norm = 'DICKSON' OR account_norm LIKE '%DICKSON%' OR fund_code_norm = 'DICKSON' THEN qty ELSE 0 END)::double precision AS qty_dickson,
    sum(CASE WHEN account_group_norm = 'TITAN' OR account_norm LIKE '%TITAN%' OR fund_code_norm = 'TITAN' THEN qty ELSE 0 END)::double precision AS qty_titan
  FROM enriched_with_symbols
  GROUP BY
    date_role,
    sftp_date,
    last_trade_date,
    days_to_expiry,
    exchange_name,
    exchange_code_grouping,
    exchange_code_region,
    exchange_code,
    exchange_code_underlying,
    is_option,
    put_call,
    strike_price,
    contract_yyyymm,
    contract_yyyymmdd,
    contract_year,
    contract_month,
    contract_day,
    futures_contract_month,
    futures_contract_month_y,
    futures_contract_month_yy,
    marex_description,
    lots,
    rule_bbg_exchange_code,
    strike_text
),
current_grouped AS (
  SELECT *
  FROM grouped
  WHERE date_role = 'current'
),
previous_grouped AS (
  SELECT *
  FROM grouped
  WHERE date_role = 'previous'
),
final AS (
  SELECT
  current_grouped.sftp_date,
  previous_grouped.sftp_date AS previous_sftp_date,
  current_grouped.last_trade_date,
  current_grouped.days_to_expiry,
  current_grouped.exchange_name,
  current_grouped.exchange_code_grouping,
  current_grouped.exchange_code_region,
  current_grouped.exchange_code,
  current_grouped.exchange_code_underlying,
  current_grouped.is_option,
  current_grouped.put_call,
  current_grouped.strike_price,
  current_grouped.marex_delta,
  previous_grouped.marex_delta AS previous_marex_delta,
  current_grouped.contract_yyyymm,
  current_grouped.contract_yyyymmdd,
  current_grouped.contract_year,
  current_grouped.contract_month,
  current_grouped.contract_day,
  current_grouped.futures_contract_month,
  current_grouped.futures_contract_month_y,
  current_grouped.futures_contract_month_yy,
  current_grouped.marex_description,
  current_grouped.ice_xl_symbol,
  current_grouped.ice_xl_symbol_underlying,
  current_grouped.cme_excel_symbol,
  current_grouped.bbg_symbol,
  current_grouped.bbg_option_description,
  current_grouped.lots,
  round(
    CASE
      WHEN previous_grouped.sftp_date IS NOT NULL
        THEN (current_grouped.settlement_price_total - previous_grouped.settlement_price_total)
          * current_grouped.qty_total * coalesce(current_grouped.lots, 1)
      WHEN previous_grouped.sftp_date IS NULL AND current_grouped.trade_price_total IS NOT NULL
        THEN (current_grouped.settlement_price_total - current_grouped.trade_price_total)
          * current_grouped.qty_total * coalesce(current_grouped.lots, 1)
      ELSE NULL
    END::numeric,
    3
  )::double precision AS daily_pnl_total,
  round(current_grouped.market_value_total::numeric, 3)::double precision AS market_value_total,
  round(previous_grouped.market_value_total::numeric, 3)::double precision AS previous_market_value_total,
  round(current_grouped.settlement_price_total::numeric, 3)::double precision AS settlement_price_total,
  round(previous_grouped.settlement_price_total::numeric, 3)::double precision AS previous_settlement_price_total,
  round(
    CASE
      WHEN previous_grouped.sftp_date IS NOT NULL
        THEN current_grouped.settlement_price_total - previous_grouped.settlement_price_total
      WHEN previous_grouped.sftp_date IS NULL AND current_grouped.trade_price_total IS NOT NULL
        THEN current_grouped.settlement_price_total - current_grouped.trade_price_total
      ELSE NULL
    END::numeric,
    3
  )::double precision AS daily_change_total,
  round(current_grouped.trade_price_total::numeric, 3)::double precision AS trade_price_total,
  current_grouped.qty_total,
  previous_grouped.qty_total AS previous_qty_total,
  CASE
    WHEN previous_grouped.qty_total IS NOT NULL THEN current_grouped.qty_total - previous_grouped.qty_total
    ELSE NULL
  END AS dod_qty_total,
  current_grouped.qty_acim,
  current_grouped.qty_andy,
  current_grouped.qty_mac,
  current_grouped.qty_pnt,
  current_grouped.qty_dickson,
  current_grouped.qty_titan
FROM current_grouped
LEFT JOIN previous_grouped
  ON current_grouped.exchange_name IS NOT DISTINCT FROM previous_grouped.exchange_name
 AND current_grouped.exchange_code_grouping IS NOT DISTINCT FROM previous_grouped.exchange_code_grouping
 AND current_grouped.exchange_code_region IS NOT DISTINCT FROM previous_grouped.exchange_code_region
 AND current_grouped.exchange_code IS NOT DISTINCT FROM previous_grouped.exchange_code
 AND current_grouped.exchange_code_underlying IS NOT DISTINCT FROM previous_grouped.exchange_code_underlying
 AND current_grouped.is_option IS NOT DISTINCT FROM previous_grouped.is_option
 AND current_grouped.put_call IS NOT DISTINCT FROM previous_grouped.put_call
 AND current_grouped.strike_price IS NOT DISTINCT FROM previous_grouped.strike_price
 AND current_grouped.contract_yyyymm IS NOT DISTINCT FROM previous_grouped.contract_yyyymm
 AND current_grouped.contract_yyyymmdd IS NOT DISTINCT FROM previous_grouped.contract_yyyymmdd
 AND current_grouped.contract_year IS NOT DISTINCT FROM previous_grouped.contract_year
 AND current_grouped.contract_month IS NOT DISTINCT FROM previous_grouped.contract_month
 AND current_grouped.contract_day IS NOT DISTINCT FROM previous_grouped.contract_day
 AND current_grouped.marex_description IS NOT DISTINCT FROM previous_grouped.marex_description
 AND current_grouped.lots IS NOT DISTINCT FROM previous_grouped.lots
)
SELECT *
FROM final
ORDER BY
  sftp_date DESC,
  contract_yyyymm,
  contract_yyyymmdd,
  last_trade_date,
  marex_description;`;
}

export function buildProductRuleSqlDownloads(
  params: ProductRuleSqlParams = {}
): ProductRuleSqlDownload[] {
  return [
    {
      group: "Validation",
      label: "Coverage SQL",
      fileName: "positions_rule_coverage.sql",
      sql: buildProductRuleCoverageSql(params),
    },
    {
      group: "Validation",
      label: "Exceptions SQL",
      fileName: "positions_rule_exceptions.sql",
      sql: buildProductRuleExceptionsSql(params),
    },
    {
      group: "Validation",
      label: "Detail SQL",
      fileName: "positions_rule_detail.sql",
      sql: buildProductRuleDetailSql(params),
    },
    {
      group: "Marts",
      label: "Grouped Positions SQL",
      fileName: "positions_mart_grouped.sql",
      sql: buildPositionsMartGroupedSql(params),
    },
    {
      group: "Marts",
      label: "Rule Group Summary SQL",
      fileName: "positions_mart_rule_group_summary.sql",
      sql: buildPositionsMartRuleGroupSummarySql(params),
    },
    {
      group: "Marts",
      label: "Grouped Latest SQL",
      fileName: "positions_mart_grouped_latest.sql",
      sql: buildPositionsMartLatestVsPriorSql(params),
    },
  ];
}
