with  __dbt__cte__cs_ref_00_src_eod_txns as (
-- Clear Street source projection.
--
-- Keep this model intentionally close to the raw source table contract:
-- one row per trade_date_from_sftp x sftp_upload_timestamp x row_number_for_trades.
-- Downstream models handle string cleanup, parsed dates, product rules, and
-- export-specific fields so this model remains easy to compare to the loader DDL.

with source_rows as (
    select * from "helios_prod"."clear_street"."eod_transactions"
),

FINAL as (
    select
    -- Loader grain and source freshness fields.
    trade_date_from_sftp,
    to_date(trade_date_from_sftp, 'YYYYMMDD') as sftp_date,
    sftp_upload_timestamp::timestamp as sftp_upload_timestamp,
    row_number_for_trades,

    -- Raw Clear Street transaction columns, kept in source-table order.
    record_id,
    firm,
    organization,
    account_number,
    account_type,
    currency_symbol,
    rr,
    trade_date,
    buy_sell,
    quantity,
    exchange,
    futures_code,
    symbol,
    contract_year_month,
    prompt_day,
    strike_price,
    put_call,
    security_description,
    trade_price,
    printable_price,
    trade_type,
    order_number,
    security_type_code,
    cusip,
    comment_code,
    give_in_out_code,
    give_in_out_firm_num,
    spread_code,
    open_close_code,
    trace_num_or_unique_identifier,
    round_turn_half_turn_account,
    executing_broker,
    opposing_broker,
    oppos_firm,
    commission,
    comm_act_type,
    fee_amt_1,
    fee_1_atype,
    fee_amt_2,
    fee_2_atype,
    fee_amt_3,
    fee_3_atype,
    brokerage,
    brkrage_atype,
    give_io_charge,
    give_io_atype,
    other_charges,
    other_atype,
    wire_charge,
    wire_chg_atype,
    fee_type_6,
    fee_type_6_atype,
    date,
    option_exp_date,
    last_trd_date,
    net_amount,
    traded_exchg,
    sub_exchange,
    exchange_name,
    exch_comm_cd,
    multiplication_factor,
    subaccount,
    instr_type,
    cash_settled,
    instrument_description,
    fee_amt_4,
    fee_4_atype,
    fee_amt_5,
    fee_5_atype,
    fee_amt_7,
    fee_7_atype,
    fee_amt_8,
    fee_8_atype,
    fee_amt_9,
    fee_9_atype,
    fee_amt_10,
    fee_10_atype,
    fee_amt_11,
    fee_11_atype,
    fee_amt_12,
    fee_12_atype,
    fee_amt_13,
    fee_13_atype,
    clearing_time_hhmmss,
    settlement_price,
    broker,
    isin,
    mic,
    created_at::timestamp as created_at,
    updated_at::timestamp as updated_at
from source_rows
)

select *
from FINAL
),  __dbt__cte__cs_ref_10_int_clean_fields as (
-- Field-level cleanup for raw Clear Street strings.
--
-- The source table preserves the CSV payload as loaded. Some text fields can
-- contain blank strings or the literal string 'nan'. This model creates
-- targeted *_clean helper columns for fields used later by joins, parsing, or
-- rule matching while preserving the original raw columns from trades.*.

with trades as (
    select * from __dbt__cte__cs_ref_00_src_eod_txns
),

FINAL as (
    select
    trades.*,

    -- Account and side fields used by downstream account and quantity logic.
    case when lower(trim(trades.account_number)) = 'nan' then null else nullif(trim(trades.account_number), '') end as account_number_clean,
    case when lower(trim(trades.buy_sell)) = 'nan' then null else nullif(trim(trades.buy_sell), '') end as buy_sell_clean,

    -- Product identity fields used by product matching and review diagnostics.
    case when lower(trim(trades.futures_code)) = 'nan' then null else nullif(trim(trades.futures_code), '') end as futures_code_clean,
    case when lower(trim(trades.symbol)) = 'nan' then null else nullif(trim(trades.symbol), '') end as symbol_clean,
    case when lower(trim(trades.put_call)) = 'nan' then null else nullif(trim(trades.put_call), '') end as put_call_clean,
    case when lower(trim(trades.security_description)) = 'nan' then null else nullif(trim(trades.security_description), '') end as security_description_clean,
    case when lower(trim(trades.give_in_out_firm_num)) = 'nan' then null else nullif(trim(trades.give_in_out_firm_num), '') end as give_in_out_firm_num_clean,
    case when lower(trim(trades.security_type_code)) = 'nan' then null else nullif(trim(trades.security_type_code), '') end as security_type_code_clean,

    -- Date strings are parsed in cs_20 after this cleanup.
    case when lower(trim(trades.date)) = 'nan' then null else nullif(trim(trades.date), '') end as date_clean,
    case when lower(trim(trades.option_exp_date)) = 'nan' then null else nullif(trim(trades.option_exp_date), '') end as option_exp_date_clean,
    case when lower(trim(trades.last_trd_date)) = 'nan' then null else nullif(trim(trades.last_trd_date), '') end as last_trd_date_clean,

    -- Exchange and instrument fields used by option/exchange normalization.
    case when lower(trim(trades.exchange_name)) = 'nan' then null else nullif(trim(trades.exchange_name), '') end as exchange_name_clean,
    case when lower(trim(trades.exch_comm_cd)) = 'nan' then null else nullif(trim(trades.exch_comm_cd), '') end as exch_comm_cd_clean,
    case when lower(trim(trades.instr_type)) = 'nan' then null else nullif(trim(trades.instr_type), '') end as instr_type_clean,
    case when lower(trim(trades.instrument_description)) = 'nan' then null else nullif(trim(trades.instrument_description), '') end as instrument_description_clean,
    case when lower(trim(trades.trade_date)) = 'nan' then null else nullif(trim(trades.trade_date), '') end as trade_date_clean
from trades
)

select *
from FINAL
),  __dbt__cte__utils_ref_positions_and_trades_month_codes as (
with source_rows as (
    select * from "helios_prod"."positions_and_trades_ref"."month_codes"
),

FINAL as (
    select
        month_number,
        month_name,
        month_code
    from source_rows
)

select *
from FINAL
),  __dbt__cte__cs_ref_20_int_contracts as (
-- Contract and date parsing.
--
-- This stage turns cleaned source strings into typed date/contract helpers.
-- It does not join accounts or apply product rules; that keeps contract parsing
-- independently reviewable when source files contain malformed dates or months.

with trades as (
    select * from __dbt__cte__cs_ref_10_int_clean_fields
),

month_codes as (
    select * from __dbt__cte__utils_ref_positions_and_trades_month_codes
),

contract_base as (
    select
        trades.*,

        -- Clear Street date fields arrive as YYYYMMDD-like text in the raw CSV.
        case when trades.trade_date_clean ~ '^\d{8}$' then to_date(trades.trade_date_clean, 'YYYYMMDD') end as trade_date_parsed,
        case when trades.date_clean ~ '^\d{8}$' then to_date(trades.date_clean, 'YYYYMMDD') end as date_parsed,
        case when trades.option_exp_date_clean ~ '^\d{8}$' then to_date(split_part(trades.option_exp_date_clean, '.', 1), 'YYYYMMDD') end as option_exp_date_parsed,
        case when trades.last_trd_date_clean ~ '^\d{8}$' then to_date(split_part(trades.last_trd_date_clean, '.', 1), 'YYYYMMDD') end as last_trd_date_parsed,

        -- Contract month must be a real six-digit YYYYMM value before reuse.
        case
            when trades.contract_year_month is not null
                and trades.contract_year_month <> 0
                and lpad(trades.contract_year_month::text, 6, '0') ~ '^(19|20|21)[0-9]{2}(0[1-9]|1[0-2])$'
            then lpad(trades.contract_year_month::text, 6, '0')
        end as contract_yyyymm,

        -- Prompt day is only meaningful for daily/swing-style contracts.
        case when trades.prompt_day between 1 and 31 then trades.prompt_day end as contract_day
    from trades
),

FINAL as (
    select
    contract_base.*,

    -- Split YYYYMM once so later product/export models do not repeat parsing.
    case
        when contract_base.contract_yyyymm is not null
        then left(contract_base.contract_yyyymm, 4)::integer
    end as contract_year,
    case
        when contract_base.contract_yyyymm is not null
        then right(contract_base.contract_yyyymm, 2)::integer
    end as contract_month_number,

    -- Futures month letters feed ICE/Bloomberg export-code construction.
    month_codes.month_code as futures_month_code
from contract_base
left join month_codes
    on month_codes.month_number = (
        case
            when contract_base.contract_yyyymm is not null
            then right(contract_base.contract_yyyymm, 2)::integer
        end
    )
)

select *
from FINAL
),  __dbt__cte__utils_ref_positions_and_trades_account_lookup as (
with source_rows as (
    select * from "helios_prod"."positions_and_trades_ref"."account_lookup"
),

FINAL as (
    select
        account_name,
        account,
        source,
        source_label
    from source_rows
)

select *
from FINAL
),  __dbt__cte__cs_ref_30_int_trade_attrs as (
-- Trade attributes used by account, option, and product-rule logic.
--
-- This stage adds business-facing helpers that are not raw source fields:
-- account names, normalized buy/sell quantities, option side/type indicators,
-- exchange-name normalization, and source product text for review diagnostics.

with trades as (
    select * from __dbt__cte__cs_ref_20_int_contracts
),

accounts as (
    select * from __dbt__cte__utils_ref_positions_and_trades_account_lookup
    where source = 'clear_street'
),

prepared_trades as (
    select
        trades.*,

        -- Normalize option side to the compact vendor-code form.
        case upper(trades.put_call_clean)
            when 'CALL' then 'C'
            when 'C' then 'C'
            when 'PUT' then 'P'
            when 'P' then 'P'
        end as put_call_code,

        -- Keep upper-case instrument flags available for option detection.
        upper(trades.security_type_code_clean) as security_type_code_norm,
        upper(trades.instr_type_clean) as instr_type_norm,

        -- Clear Street uses several source labels and short codes for the same exchange family.
        case upper(trades.exchange_name_clean)
            when 'NYM' then 'NYME'
            when 'NYME' then 'NYME'
            when 'NYMEX' then 'NYME'
            when 'NMY' then 'NYME'
            when 'IFE' then 'IFED'
            when 'IPE' then 'IFED'
            when 'IFED' then 'IFED'
        end as exchange_name_normalized
    from trades
),

with_trade_flags as (
    select
    prepared_trades.*,

    -- Residual cash adjustment rows should not be treated as missing products.
    (
        coalesce(prepared_trades.quantity, 0) = 0
        and coalesce(prepared_trades.contract_year_month, 0) = 0
        and upper(coalesce(prepared_trades.security_description_clean, '')) = 'UNITED STATES DOLLAR'
        and (
            upper(coalesce(prepared_trades.instrument_description_clean, '')) like 'RESID ADJ%'
            or upper(coalesce(prepared_trades.instrument_description_clean, '')) like 'RESUD ADH%'
            or upper(coalesce(prepared_trades.instrument_description_clean, '')) = 'APS RES'
            or upper(coalesce(prepared_trades.instrument_description_clean, '')) like '%EXCHANGE FEE ADJ%'
        )
    ) as is_non_product_cash_adjustment,

    -- Options can be indicated by put/call, security type, or instrument type.
    (
        prepared_trades.put_call_code is not null
        or prepared_trades.security_type_code_norm in ('O', 'OPT', 'OPTION')
        or prepared_trades.security_type_code_norm like '%OPTION%'
        or prepared_trades.instr_type_norm in ('O', 'OPT', 'OPTION')
        or prepared_trades.instr_type_norm like '%OPTION%'
    ) as is_option
    from prepared_trades
),

FINAL as (
    select
    with_trade_flags.*,
    with_trade_flags.give_in_out_firm_num_clean as source_account_key,
    accounts.account_name as account_code,
    accounts.account_name,
    case
        when accounts.account_name is not null then 'matched'
        when nullif(trim(with_trade_flags.give_in_out_firm_num_clean), '') is null then 'missing_source_account'
        else 'unmapped'
    end as account_lookup_status,
    with_trade_flags.exchange_name as source_exchange_name,
    not with_trade_flags.is_non_product_cash_adjustment as is_product_record,

    -- Prefer the explicit security description, falling back to instrument/symbol.
    coalesce(
        with_trade_flags.security_description_clean,
        with_trade_flags.instrument_description_clean,
        with_trade_flags.symbol_clean
    ) as rule_product,

    -- Upper/space-normalized product text is kept for diagnostics and review.
    nullif(
        upper(regexp_replace(coalesce(
            with_trade_flags.security_description_clean,
            with_trade_flags.instrument_description_clean,
            with_trade_flags.symbol_clean,
            ''
        ), '[[:space:]]+', ' ', 'g')),
        ''
    ) as rule_product_norm,

    -- Clear Street side codes: 1 = buy, 2 = sell.
    case
        when with_trade_flags.buy_sell_clean ~ '^\d+$' and with_trade_flags.buy_sell_clean::integer = 1 then 'B'
        when with_trade_flags.buy_sell_clean ~ '^\d+$' and with_trade_flags.buy_sell_clean::integer = 2 then 'S'
    end as buy_sell_cleaned,

    -- Signed quantity lets grouped views sum buys and sells directly.
    case
        when with_trade_flags.buy_sell_clean ~ '^\d+$' and with_trade_flags.buy_sell_clean::integer = 1 then with_trade_flags.quantity
        when with_trade_flags.buy_sell_clean ~ '^\d+$' and with_trade_flags.buy_sell_clean::integer = 2 then -1 * with_trade_flags.quantity
    end as quantity_cleaned,
    case
        when with_trade_flags.strike_price is not null and with_trade_flags.strike_price <> 0
        then round(with_trade_flags.strike_price::numeric, 3)::double precision
    end as strike_price_normalized
from with_trade_flags
left join accounts
    on with_trade_flags.give_in_out_firm_num_clean = accounts.account
)

select *
from FINAL
),  __dbt__cte__utils_ref_positions_and_trades_product_catalog as (
with source_rows as (
    select * from "helios_prod"."positions_and_trades_ref"."product_catalog"
),

FINAL as (
    select
        product_code,
        product_family,
        market_name,
        underlying_product_code,
        bbg_exchange_code,
        default_exchange_name
    from source_rows
)

select *
from FINAL
),  __dbt__cte__utils_ref_positions_and_trades_product_aliases as (
with source_rows as (
    select * from "helios_prod"."positions_and_trades_ref"."product_alias_rules"
),

FINAL as (
    select
        source_priority,
        source,
        match_type,
        pattern,
        product_code,
        option_type,
        marex_product
    from source_rows
)

select *
from FINAL
),  __dbt__cte__cs_ref_40_int_product_matches as (
-- Product match candidates for Clear Street rows.
--
-- Matching runs in priority order:
-- 1. reviewed Clear Street CUSIP-prefix alias rules
-- 2. explicit Clear Street exchange commodity code in the product catalog

with trades as (
    select * from __dbt__cte__cs_ref_30_int_trade_attrs
),

product_catalog as (
    select * from __dbt__cte__utils_ref_positions_and_trades_product_catalog
),

product_aliases as (
    select * from __dbt__cte__utils_ref_positions_and_trades_product_aliases
    where source = 'clear_street'
),

FINAL as (
    select
    trades.*,

    -- Clear Street CUSIP-prefix alias rules handle option rows where the CUSIP
    -- is the clearest product discriminator.
    cusip_match.product_code as cusip_product_code,
    cusip_match.product_family as cusip_product_family,
    cusip_match.market_name as cusip_market_name,
    cusip_match.underlying_product_code as cusip_underlying_product_code,
    cusip_match.bbg_exchange_code as cusip_bbg_exchange_code,
    cusip_match.default_exchange_name as cusip_default_exchange_name,

    -- Direct product-code matches from Clear Street exchange commodity codes.
    explicit_catalog.product_code as explicit_product_code,
    explicit_catalog.product_family as explicit_product_family,
    explicit_catalog.market_name as explicit_market_name,
    explicit_catalog.underlying_product_code as explicit_underlying_product_code,
    explicit_catalog.bbg_exchange_code as explicit_bbg_exchange_code,
    explicit_catalog.default_exchange_name as explicit_default_exchange_name
from trades
left join lateral (
    select
        product_catalog.product_code,
        product_catalog.product_family,
        product_catalog.market_name,
        product_catalog.underlying_product_code,
        product_catalog.bbg_exchange_code,
        product_catalog.default_exchange_name
    from product_aliases
    inner join product_catalog
        on product_catalog.product_code = product_aliases.product_code
    where product_aliases.match_type = 'cusip_prefix'
        and trades.is_option
        and upper(trades.cusip) like product_aliases.pattern || '%'
        and (
            product_aliases.option_type is null
            or product_aliases.option_type = 'option'
        )
    order by product_aliases.source_priority
    limit 1
) as cusip_match on true
left join product_catalog as explicit_catalog
    on cusip_match.product_code is null
    and explicit_catalog.product_code = upper(trades.exch_comm_cd_clean)
)

select *
from FINAL
),  __dbt__cte__cs_ref_50_int_rules as (
-- Resolve product matches into canonical rule fields.
--
-- This stage collapses the explicit/CUSIP candidates into one product
-- contract per row and assigns a rule_status that review queries can filter on.

with product_matches as (
    select * from __dbt__cte__cs_ref_40_int_product_matches
),

resolved_rules as (
    select
    product_matches.*,

    -- Product identity is selected by the priority established in cs_40.
    coalesce(cusip_product_code, explicit_product_code) as product_code,
    coalesce(cusip_product_family, explicit_product_family) as product_code_family,
    case
        when
            coalesce(cusip_product_family, explicit_product_family) in ('Gas', 'Basis')
            and is_option
        then 'gas_option'
        when coalesce(cusip_product_family, explicit_product_family) in ('Gas', 'Basis')
        then 'gas_future'
        when
            coalesce(cusip_product_family, explicit_product_family) = 'Power'
            and is_option
        then 'power_option'
        when coalesce(cusip_product_family, explicit_product_family) = 'Power'
        then 'power_future'
    end as product_code_grouping,
    coalesce(cusip_market_name, explicit_market_name) as product_code_region,
    coalesce(cusip_product_family, explicit_product_family) as product_family,
    coalesce(cusip_market_name, explicit_market_name) as market_name,

    -- Underlying product is only relevant for option rows.
    case
        when is_option
        then coalesce(
            cusip_underlying_product_code,
            explicit_underlying_product_code
        )
    end as product_code_underlying,

    -- Legacy/internal alias retained for existing review consumers.
    case
        when is_option
        then coalesce(
            cusip_underlying_product_code,
            explicit_underlying_product_code
        )
    end as underlying_product_code,

    -- Prefer the source exchange label when present; otherwise use catalog defaults.
    coalesce(cusip_bbg_exchange_code, explicit_bbg_exchange_code) as bbg_exchange_code,
    coalesce(
        exchange_name_normalized,
        cusip_default_exchange_name,
        explicit_default_exchange_name
    ) as exchange_route_code,

    -- Rule status explains whether a row is ready for downstream export/review.
    case
        when is_non_product_cash_adjustment then 'non_product_cash_adjustment'
        when coalesce(cusip_product_code, explicit_product_code) is null then 'unresolved_product'
        when contract_yyyymm is null then 'missing_contract_yyyymm'
        when is_option and put_call_code is null then 'option_missing_put_call'
        when is_option and strike_price_normalized is null then 'option_missing_strike'
        else 'ok'
    end as rule_status,

    -- Keep match diagnostics so unresolved or surprising rows can be traced.
    case
        when cusip_product_code is not null then 'cusip'
        when explicit_product_code is not null then 'explicit'
    end as rule_match_source,

    -- Vendor export codes use one- and two-digit futures year suffixes.
    case
        when futures_month_code is not null and contract_year is not null
        then futures_month_code || right(contract_year::text, 1)
    end as futures_month_code_y,
    case
        when futures_month_code is not null and contract_year is not null
        then futures_month_code || right(contract_year::text, 2)
    end as futures_month_code_yy
from product_matches
),

FINAL as (
    select
    resolved_rules.*,
    resolved_rules.exchange_route_code as rule_exchange_name,
    case
        when resolved_rules.exchange_route_code in ('IFED', 'IFE', 'IPE') then 'ice'
        when resolved_rules.exchange_route_code in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
        when resolved_rules.exchange_route_code is null then 'missing'
        else 'unsupported'
    end as route_family
from resolved_rules
)

select *
from FINAL
),  __dbt__cte__nav_ref_00_src_positions as (
with source_rows as (
    select * from "helios_prod"."nav"."positions"
),

FINAL as (
    select
    fund_code,
    source_legal_entity,
    source_file_name,
    source_file_row_number,
    nav_date,
    sftp_upload_timestamp::timestamp as sftp_upload_timestamp,
    broker_name,
    account_group,
    account,
    trade_date,
    product_id_internal,
    product,
    type,
    month_year,
    client_symbol,
    strike_price,
    call_put,
    product_currency_1,
    long_short,
    quantity_1,
    counter_currency_ccy2,
    ccy2_long_short,
    ccy2_quantity_2,
    trade_price,
    multiplier_and_tick_value,
    cost_in_native_currency,
    open_exchange_rate,
    cost_in_base_currency,
    market_settlement_price,
    market_value_in_native_currency,
    close_exchange_rate,
    market_value_in_base_currency,
    sector,
    sub_sector,
    country,
    exchange_name,
    source_1_symbol,
    source_3_symbol,
    one_chicago_symbol,
    fas_level,
    option_style,
    created_at::timestamp as created_at,
    updated_at::timestamp as updated_at
from source_rows
)

select *
from FINAL
),  __dbt__cte__nav_ref_10_int_clean as (
with positions as (
    select * from __dbt__cte__nav_ref_00_src_positions
),

accounts as (
    select * from __dbt__cte__utils_ref_positions_and_trades_account_lookup
    where source = 'nav'
),

FINAL as (
    select
    positions.*,
    positions.account as source_account_key,
    accounts.account_name as account_code,
    accounts.account_name,
    case
        when accounts.account_name is not null then 'matched'
        when nullif(trim(positions.account), '') is null then 'missing_source_account'
        else 'unmapped'
    end as account_lookup_status,
    positions.exchange_name as source_exchange_name,
    true as is_product_record,
    upper(regexp_replace(coalesce(positions.product, ''), '[[:space:]]+', ' ', 'g')) as product_norm,
    (
        upper(coalesce(positions.call_put, '')) in ('CALL', 'PUT', 'C', 'P')
        or upper(coalesce(positions.type, '')) like '%OPTION%'
    ) as is_option,
    case
        when upper(coalesce(positions.call_put, '')) in ('CALL', 'C') then 'C'
        when upper(coalesce(positions.call_put, '')) in ('PUT', 'P') then 'P'
    end as put_call_code,
    case
        when positions.month_year ~ '^\s*\d{1,2}/\d{1,2}/\d{4}\s*$'
        then to_char(to_date(trim(positions.month_year), 'MM/DD/YYYY'), 'YYYYMM')
        when upper(trim(coalesce(positions.month_year, ''))) ~ '^[A-Z]{3}\d{2}$'
        then to_char(to_date(upper(trim(positions.month_year)), 'MONYY'), 'YYYYMM')
    end as contract_yyyymm,
    case
        when positions.month_year ~ '^\s*\d{1,2}/\d{1,2}/\d{4}\s*$'
        then extract(day from to_date(trim(positions.month_year), 'MM/DD/YYYY'))::integer
    end as contract_day,
    case
        when positions.strike_price is null then null
        else round(positions.strike_price::numeric, 3)::double precision
    end as strike_price_normalized
from positions
left join accounts
    on positions.account = accounts.account
)

select *
from FINAL
),  __dbt__cte__nav_ref_20_int_product_matches as (
with positions as (
    select * from __dbt__cte__nav_ref_10_int_clean
),

product_aliases as (
    select * from __dbt__cte__utils_ref_positions_and_trades_product_aliases
    where source = 'nav'
),

FINAL as (
    select
    positions.*,
    matched_alias.source_priority as rule_priority,
    matched_alias.match_type as rule_match_type,
    matched_alias.pattern as rule_pattern,
    matched_alias.product_code as matched_product_code
from positions
left join lateral (
    select product_aliases.*
    from product_aliases
    where (
            (
                product_aliases.match_type = 'exact'
                and positions.product_norm = product_aliases.pattern
            )
            or (
                product_aliases.match_type = 'regex'
                and positions.product_norm ~* product_aliases.pattern
            )
        )
      and (
            product_aliases.option_type is null
            or product_aliases.option_type = case when positions.is_option then 'option' else 'future' end
        )
    order by product_aliases.source_priority
    limit 1
) as matched_alias on true
)

select *
from FINAL
),  __dbt__cte__nav_ref_30_int_rules as (
with positions as (
    select * from __dbt__cte__nav_ref_20_int_product_matches
),

product_catalog as (
    select * from __dbt__cte__utils_ref_positions_and_trades_product_catalog
),

positions_with_effective_product as (
    select
        positions.*,

        -- NAV can label PJM Western Hub day-ahead weekend deliveries as PDA.
        -- Keep the source product/rule diagnostics intact, but expose the
        -- effective ICE short-term weekend product downstream.
        case
            when
                positions.matched_product_code = 'PDA'
                and not positions.is_option
                and positions.contract_yyyymm ~ '^\d{6}$'
                and positions.contract_day is not null
                and extract(isodow from to_date(
                    positions.contract_yyyymm
                    || lpad(positions.contract_day::text, 2, '0'),
                    'YYYYMMDD'
                ))::integer in (6, 7)
            then 'PDO'
            else positions.matched_product_code
        end as effective_product_code
    from positions
),

FINAL as (
    select
    positions.fund_code,
    positions.source_legal_entity,
    positions.source_file_name,
    positions.source_file_row_number,
    positions.nav_date,
    positions.sftp_upload_timestamp,
    positions.broker_name,
    positions.account_group,
    positions.account,
    positions.source_account_key,
    positions.account_code,
    positions.account_name,
    positions.account_lookup_status,
    positions.trade_date,
    positions.product_id_internal,
    positions.product,
    positions.type,
    positions.month_year,
    positions.client_symbol,
    positions.strike_price,
    positions.call_put,
    positions.product_currency_1,
    positions.long_short,
    positions.quantity_1,
    positions.counter_currency_ccy2,
    positions.ccy2_long_short,
    positions.ccy2_quantity_2,
    positions.trade_price,
    positions.multiplier_and_tick_value,
    positions.cost_in_native_currency,
    positions.open_exchange_rate,
    positions.cost_in_base_currency,
    positions.market_settlement_price,
    positions.market_value_in_native_currency,
    positions.close_exchange_rate,
    positions.market_value_in_base_currency,
    positions.sector,
    positions.sub_sector,
    positions.country,
    positions.exchange_name,
    positions.source_exchange_name,
    coalesce(
        product_catalog.default_exchange_name,
        case
            when upper(trim(coalesce(positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
            when trim(coalesce(positions.exchange_name, '')) <> '' then 'IFED'
        end
    ) as exchange_route_code,
    case
        when coalesce(
            product_catalog.default_exchange_name,
            case
                when upper(trim(coalesce(positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(positions.exchange_name, '')) <> '' then 'IFED'
            end
        ) in ('IFED', 'IFE', 'IPE') then 'ice'
        when coalesce(
            product_catalog.default_exchange_name,
            case
                when upper(trim(coalesce(positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(positions.exchange_name, '')) <> '' then 'IFED'
            end
        ) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
        when coalesce(
            product_catalog.default_exchange_name,
            case
                when upper(trim(coalesce(positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(positions.exchange_name, '')) <> '' then 'IFED'
            end
        ) is null then 'missing'
        else 'unsupported'
    end as route_family,
    positions.is_product_record,
    positions.source_1_symbol,
    positions.source_3_symbol,
    positions.one_chicago_symbol,
    positions.fas_level,
    positions.option_style,
    positions.created_at,
    positions.updated_at,
    positions.effective_product_code as product_code,
    coalesce(effective_product_catalog.product_family, product_catalog.product_family) as product_code_family,
    case
        when coalesce(effective_product_catalog.product_family, product_catalog.product_family) in ('Gas', 'Basis') and positions.is_option
        then 'gas_option'
        when coalesce(effective_product_catalog.product_family, product_catalog.product_family) in ('Gas', 'Basis')
        then 'gas_future'
        when coalesce(effective_product_catalog.product_family, product_catalog.product_family) = 'Power' and positions.is_option
        then 'power_option'
        when coalesce(effective_product_catalog.product_family, product_catalog.product_family) = 'Power'
        then 'power_future'
    end as product_code_grouping,
    coalesce(effective_product_catalog.market_name, product_catalog.market_name) as product_code_region,
    case when positions.is_option then coalesce(effective_product_catalog.underlying_product_code, product_catalog.underlying_product_code) end as product_code_underlying,
    coalesce(effective_product_catalog.product_family, product_catalog.product_family) as product_family,
    coalesce(effective_product_catalog.market_name, product_catalog.market_name) as market_name,
    case when positions.is_option then coalesce(effective_product_catalog.underlying_product_code, product_catalog.underlying_product_code) end as underlying_product_code,
    coalesce(effective_product_catalog.bbg_exchange_code, product_catalog.bbg_exchange_code) as bbg_exchange_code,
    coalesce(effective_product_catalog.default_exchange_name, product_catalog.default_exchange_name) as default_exchange_name,
    positions.contract_yyyymm,
    positions.contract_day,
    positions.put_call_code as put_call_code,
    positions.strike_price_normalized,
    case
        when product_catalog.product_code is null then 'unresolved_product'
        when coalesce(trim(positions.month_year), '') <> '' and positions.contract_yyyymm is null then 'unparsed_contract'
        when positions.is_option and positions.put_call_code is null then 'option_missing_put_call'
        when positions.is_option and positions.strike_price is null then 'option_missing_strike'
        else 'ok'
    end as rule_status,
    positions.rule_priority,
    positions.rule_match_type,
    positions.rule_pattern
from positions_with_effective_product as positions
left join product_catalog
    on product_catalog.product_code = positions.matched_product_code
left join product_catalog as effective_product_catalog
    on effective_product_catalog.product_code = positions.effective_product_code
)

select *
from FINAL
), clear_street_exceptions as (
    select
        'clear_street' as source,
        trade_date_from_sftp as source_date,
        sftp_upload_timestamp,
        null::text as fund_code,
        null::text as source_file_name,
        null::integer as source_file_row_number,
        source_account_key,
        account_code,
        account_name,
        account_lookup_status,
        null::text as account_group,
        account_number as account,
        rule_product as source_product,
        null::text as source_type,
        null::text as month_year,
        exchange_name,
        source_exchange_name,
        exchange_route_code,
        route_family,
        is_product_record,
        product_code,
        product_family,
        market_name,
        underlying_product_code,
        null::text as contract_yyyymm,
        null::integer as contract_day,
        put_call_code,
        strike_price_normalized,
        null::double precision as market_value_in_base_currency,
        rule_status,
        rule_match_source,
        null::text as rule_match_type,
        null::text as rule_match_pattern
    from __dbt__cte__cs_ref_50_int_rules
    where rule_status <> 'ok'
      and is_product_record
),

nav_exceptions as (
    select
        'nav' as source,
        nav_date::text as source_date,
        sftp_upload_timestamp,
        fund_code,
        source_file_name,
        source_file_row_number,
        source_account_key,
        account_code,
        account_name,
        account_lookup_status,
        account_group,
        account,
        product as source_product,
        type as source_type,
        month_year,
        exchange_name,
        source_exchange_name,
        exchange_route_code,
        route_family,
        is_product_record,
        product_code,
        product_family,
        market_name,
        underlying_product_code,
        contract_yyyymm,
        contract_day,
        put_call_code,
        strike_price_normalized,
        market_value_in_base_currency,
        rule_status,
        null::text as rule_match_source,
        rule_match_type,
        rule_pattern as rule_match_pattern
    from __dbt__cte__nav_ref_30_int_rules
    where rule_status <> 'ok'
      and is_product_record
),

FINAL as (
    select * from clear_street_exceptions
    union all
    select * from nav_exceptions
)

select *
from FINAL
order by source, source_date desc, rule_status, source_product