-- Positions/trades dbt validation summary for frontend health display.
--
-- Grain: one row per active validation check and validation scope. These
-- predicates intentionally mirror the data tests under
-- tests/positions_and_trades/2026_07_22_ref_tables and the drilldown model
-- pat_ref_96_validation_failures.

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
),  __dbt__cte__cs_ref_60_int_export_codes as (
-- Vendor product-code construction.
--
-- This stage derives product identifiers used by downstream MUFG review/export
-- workflows. It intentionally runs after rule resolution so vendor codes are
-- based on canonical product_code, rule_exchange_name, option side, strike, and
-- contract month helpers rather than raw Clear Street strings.

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
), trades as (
    select * from __dbt__cte__cs_ref_50_int_rules
),

strike_base_raw as (
    select
        contract_base.*,

        -- Format strikes without meaningless trailing zeros for vendor symbols.
        -- Example: 3.750 becomes 3.75 so option symbols do not carry
        -- vendor-hostile padding.
        trim(
            trailing '.'
            from trim(
                trailing '0'
                from to_char(strike_price_normalized, 'FM999999999.999')
            )
        ) as strike_text_raw,

        -- Daily/weekly ICE short-term symbols are not based on contract_yyyymm.
        -- For Clear Street rows, the most precise delivery date is usually the
        -- trailing YYYYMMDD embedded in CUSIP, e.g. IFEDPDP20260720. If CUSIP
        -- does not carry a valid date, fall back to the parsed contract parts.
        coalesce(
            contract_base.cusip_contract_date,
            contract_base.contract_date_from_parts
        ) as daily_contract_date,
        extract(isodow from coalesce(
            contract_base.cusip_contract_date,
            contract_base.contract_date_from_parts
        ))::integer between 1 and 5 as daily_contract_is_weekday,

        -- Prefer the Clear Street trade date; sftp_date is only a fallback for
        -- malformed or missing trade_date strings.
        coalesce(contract_base.trade_date_parsed, contract_base.sftp_date) as daily_trade_date,

        -- Calendar-day offset from trade date to delivery date. Keep this for
        -- audit/debugging; D0/D1 symbol classification uses the weekday-only
        -- business offset below.
        coalesce(
            contract_base.cusip_contract_date,
            contract_base.contract_date_from_parts
        ) - coalesce(contract_base.trade_date_parsed, contract_base.sftp_date) as daily_contract_calendar_offset_days,

        -- Backward-compatible alias for the original calendar offset.
        coalesce(
            contract_base.cusip_contract_date,
            contract_base.contract_date_from_parts
        ) - coalesce(contract_base.trade_date_parsed, contract_base.sftp_date) as daily_contract_offset_days,

        -- Mon-Fri business-day offset from trade date to delivery date.
        -- Friday trade / Monday delivery is therefore D1, while true forward
        -- daily strips remain greater than one business day.
        case
            when coalesce(
                    contract_base.cusip_contract_date,
                    contract_base.contract_date_from_parts
                ) is null
                or coalesce(contract_base.trade_date_parsed, contract_base.sftp_date) is null
            then null
            when coalesce(
                    contract_base.cusip_contract_date,
                    contract_base.contract_date_from_parts
                ) >= coalesce(contract_base.trade_date_parsed, contract_base.sftp_date)
            then (
                select count(*)::integer
                from generate_series(
                    coalesce(contract_base.trade_date_parsed, contract_base.sftp_date) + interval '1 day',
                    coalesce(
                        contract_base.cusip_contract_date,
                        contract_base.contract_date_from_parts
                    ),
                    interval '1 day'
                ) as business_days(calendar_date)
                where extract(isodow from business_days.calendar_date)::integer between 1 and 5
            )
            else -1 * (
                select count(*)::integer
                from generate_series(
                    coalesce(
                        contract_base.cusip_contract_date,
                        contract_base.contract_date_from_parts
                    ) + interval '1 day',
                    coalesce(contract_base.trade_date_parsed, contract_base.sftp_date),
                    interval '1 day'
                ) as business_days(calendar_date)
                where extract(isodow from business_days.calendar_date)::integer between 1 and 5
            )
        end as daily_contract_business_offset_days,

        -- Monday-start week offset between trade week and delivery week.
        -- This supports PDP/PWA W0-W4 mapping. Other products are left null
        -- unless explicitly supported.
        floor((
            date_trunc('week', coalesce(
                contract_base.cusip_contract_date,
                contract_base.contract_date_from_parts
            ))::date
            - date_trunc('week', coalesce(contract_base.trade_date_parsed, contract_base.sftp_date))::date
        ) / 7.0)::integer as daily_contract_week_offset
    from (
        select
            trades.*,

            -- Clear Street IFED CUSIPs commonly end with the delivery date.
            -- Validate the suffix before to_date so malformed identifiers do
            -- not silently become incorrect dates.
            case
                when substring(trades.cusip from '([0-9]{8})$') ~ '^(19|20|21)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$'
                then to_date(substring(trades.cusip from '([0-9]{8})$'), 'YYYYMMDD')
            end as cusip_contract_date,

            -- Generic fallback for source rows with explicit year/month/day
            -- pieces. This is less source-specific than CUSIP and is therefore
            -- only used when CUSIP does not contain a valid delivery date.
            case
                when trades.contract_year is not null
                    and trades.contract_month_number is not null
                    and trades.contract_day is not null
                then make_date(trades.contract_year, trades.contract_month_number, trades.contract_day)
            end as contract_date_from_parts
        from trades
    ) as contract_base
),

strike_base as (
    select
        strike_base_raw.*,
        case
            when strike_base_raw.strike_text_raw like '.%' then '0' || strike_base_raw.strike_text_raw
            when strike_base_raw.strike_text_raw like '-.%' then '-0' || substring(strike_base_raw.strike_text_raw from 2)
            else strike_base_raw.strike_text_raw
        end as strike_text
    from strike_base_raw
),

effective_product_base as (
    select
        strike_base.*,

        -- Clear Street can label PJM Western Hub day-ahead weekend deliveries
        -- as PDA in source/CUSIP. The effective ICE short-term weekend product
        -- is PDO, while the raw source fields remain available for audit.
        case
            when
                strike_base.product_code = 'PDA'
                and not strike_base.is_option
                and strike_base.daily_contract_date is not null
                and not strike_base.daily_contract_is_weekday
            then 'PDO'
            else strike_base.product_code
        end as product_code_effective
    from strike_base
),

export_base as (
    select
        effective_product_base.*,

        -- ICE codes cover IFED futures/options plus daily and weekly products.
        -- For short-term products, derive only symbols supported by the local
        -- PJM/ICE registries from Clear Street trade date and CUSIP date.
        case
            -- Weekend day-ahead rows map to the explicit PJM DA off-peak
            -- weekend short-term symbol.
            when
                effective_product_base.rule_exchange_name = 'IFED'
                and not effective_product_base.is_option
                and effective_product_base.product_code_effective = 'PDO'
                and effective_product_base.daily_contract_date is not null
                and not effective_product_base.daily_contract_is_weekday
            then 'PDO P1-IUS'

            -- Same-day RT daily products with exact symbols in the local ICE registry.
            when
                effective_product_base.rule_exchange_name = 'IFED'
                and not effective_product_base.is_option
                and effective_product_base.product_code_effective in ('PDP', 'PWA', 'DDP', 'ERA', 'END')
                and effective_product_base.daily_contract_is_weekday
                and effective_product_base.daily_contract_business_offset_days = 0
            then effective_product_base.product_code_effective || ' D0-IUS'

            -- Next-day daily products with exact symbols in the local ICE registry.
            -- Larger offsets may be weekly/forward strips and should not be
            -- forced into a D1 symbol.
            when
                effective_product_base.rule_exchange_name = 'IFED'
                and not effective_product_base.is_option
                and effective_product_base.product_code_effective in ('PDP', 'PWA', 'PDA', 'PJL', 'SDP', 'ERA', 'END', 'NEZ')
                and effective_product_base.daily_contract_is_weekday
                and effective_product_base.daily_contract_business_offset_days = 1
            then effective_product_base.product_code_effective || ' D1-IUS'

            -- PDP/PWA have weekly W0-W4 symbol patterns. Map only weekday
            -- delivery rows with a forward business offset greater than D1.
            when
                effective_product_base.rule_exchange_name = 'IFED'
                and not effective_product_base.is_option
                and effective_product_base.product_code_effective in ('PDP', 'PWA')
                and effective_product_base.daily_contract_is_weekday
                and effective_product_base.daily_contract_business_offset_days > 1
                and effective_product_base.daily_contract_week_offset between 0 and 4
            then effective_product_base.product_code_effective || ' W' || effective_product_base.daily_contract_week_offset::text || '-IUS'

            -- Henry Hub daily swing style code.
            when effective_product_base.rule_exchange_name = 'IFED' and effective_product_base.product_code_effective = 'HHD'
            then effective_product_base.product_code_effective || ' B0-IUS'

            -- ICE option symbols include product, month/year, put/call, and
            -- strike. Use strike_text so decimal strikes such as 3.75 are not
            -- rounded to whole numbers.
            when
                effective_product_base.rule_exchange_name = 'IFED'
                and effective_product_base.is_option
                and effective_product_base.put_call_code is not null
                and effective_product_base.strike_text is not null
                and effective_product_base.futures_month_code_yy is not null
            then effective_product_base.product_code_effective || ' ' || effective_product_base.futures_month_code_yy || effective_product_base.put_call_code
                || effective_product_base.strike_text || '-IUS'

            -- Standard monthly IFED futures.
            when
                effective_product_base.rule_exchange_name = 'IFED'
                and not effective_product_base.is_option
                and effective_product_base.contract_day is null
                and effective_product_base.futures_month_code_yy is not null
            then effective_product_base.product_code_effective || ' ' || effective_product_base.futures_month_code_yy || '-IUS'
        end as ice_product_code
    from effective_product_base
),

FINAL as (
    select
    export_base.*,

    -- CME Excel codes are emitted for NYMEX-routed rows and the PHE Excel
    -- exception. MUFG-specific models mask ICE-routed CME/BBG fields back to
    -- null so the handoff remains ICE-code only for ICE rows.
    -- Products outside this explicit list intentionally remain null until a
    -- verified vendor-code pattern is added.
    case
        when
            route_family = 'nymex'
            and product_code in ('HP', 'PHH', 'HH', 'H', 'NG')
            and contract_yyyymm is not null
        then '1|G|XNYM:F:NG:' || contract_yyyymm
        when
            route_family = 'nymex'
            and product_code = 'LN'
            and contract_yyyymm is not null
            and put_call_code is not null
            and strike_price_normalized is not null
        then '1|G|XNYM:O:LN:' || contract_yyyymm || ':' || put_call_code || ':' || strike_text
        when
            product_code = 'PHE'
            and contract_yyyymm is not null
            and put_call_code is not null
            and strike_price_normalized is not null
        then '1|G|XNYM:O:LN:' || contract_yyyymm || ':' || put_call_code || ':' || strike_text
        when
            route_family = 'nymex'
            and product_code in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5')
            and contract_yyyymm is not null
            and put_call_code is not null
            and strike_price_normalized is not null
        then '1|G|XNYM:O:KN' || substring(product_code from 3) || ':'
            || contract_yyyymm || ':' || put_call_code || ':' || strike_text
        when
            route_family = 'nymex'
            and product_code in ('JN1', 'KN2', 'KN3', 'KN4')
            and contract_yyyymm is not null
            and put_call_code is not null
            and strike_price_normalized is not null
        then '1|G|XNYM:O:' || product_code || ':'
            || contract_yyyymm || ':' || put_call_code || ':' || strike_text
        when
            route_family = 'nymex'
            and product_code = 'G4'
            and contract_yyyymm is not null
            and put_call_code is not null
            and strike_price_normalized is not null
        then '1|G|XNYM:O:G4:' || contract_yyyymm || ':' || put_call_code || ':' || strike_text
    end as cme_product_code,

    -- Bloomberg codes depend on product-specific exchange prefixes.
    -- These mappings are intentionally narrow; unsupported products should
    -- stay null so review queries can find gaps instead of receiving invented
    -- Bloomberg symbols.
    case
        when
            route_family = 'nymex'
            and product_code = 'HP'
            and bbg_exchange_code = 'ZA'
            and futures_month_code_y is not null
        then bbg_exchange_code || futures_month_code_y || ' COMDTY'
        when
            route_family = 'nymex'
            and product_code = 'HH'
            and bbg_exchange_code = 'IW'
            and futures_month_code_y is not null
        then bbg_exchange_code || futures_month_code_y || ' COMDTY'
        when
            route_family = 'nymex'
            and product_code = 'NG'
            and bbg_exchange_code = 'NG'
            and futures_month_code_yy is not null
        then bbg_exchange_code || futures_month_code_yy || ' COMDTY'
        when
            route_family = 'nymex'
            and product_code = 'LN'
            and bbg_exchange_code = 'NG'
            and futures_month_code_y is not null
            and put_call_code is not null
            and strike_text is not null
        then bbg_exchange_code || futures_month_code_y || put_call_code || ' '
            || strike_text || ' COMDTY'
        when
            product_code = 'PHE'
            and futures_month_code_y is not null
            and put_call_code is not null
            and strike_text is not null
        then coalesce(bbg_exchange_code, 'NG') || futures_month_code_y || put_call_code || ' '
            || strike_text || ' COMDTY'
        when
            route_family = 'nymex'
            and product_code in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5')
            and futures_month_code_yy is not null
            and put_call_code is not null
            and strike_text is not null
        then bbg_exchange_code || futures_month_code_yy || put_call_code
            || substring(product_code from 3) || ' ' || strike_text || ' COMB'
        when
            route_family = 'nymex'
            and product_code in ('JN1', 'KN2', 'KN3', 'KN4')
            and futures_month_code_yy is not null
            and put_call_code is not null
            and strike_text is not null
        then bbg_exchange_code || futures_month_code_yy || put_call_code
            || substring(product_code from 3) || ' ' || strike_text || ' Comdty'
        when
            route_family = 'nymex'
            and product_code = 'G4'
            and futures_month_code_y is not null
            and put_call_code is not null
            and strike_text is not null
        then coalesce(bbg_exchange_code, 'G4X') || futures_month_code_y || put_call_code
            || ' ' || strike_text || ' COMDTY'
    end as bbg_product_code
from export_base
)

select *
from FINAL
),  __dbt__cte__cs_ref_65_eod_all_history as (
-- All Clear Street source files.
--
-- Clear Street can send multiple uploads for the same SFTP trade date. This
-- model keeps every loaded source row with the same curated review/export
-- contract used by cs_ref_70_eod_latest, without narrowing to the latest file.

with trades as (
    select * from __dbt__cte__cs_ref_60_int_export_codes
),

FINAL as (
    select
        trade_date_from_sftp,
        sftp_date,
        sftp_upload_timestamp,
        row_number_for_trades,
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
        created_at,
        updated_at,

        -- Curated derived fields for review/export. Keep intermediate cleanup,
        -- match-candidate, and vendor-code helper columns in int models.
        source_account_key,
        account_code,
        account_name,
        account_lookup_status,
        source_exchange_name,
        exchange_route_code,
        route_family,
        is_product_record,
        buy_sell_cleaned,
        quantity_cleaned,
        contract_yyyymm,
        contract_day,
        daily_trade_date,
        daily_contract_date,
        daily_contract_is_weekday,
        daily_contract_calendar_offset_days,
        daily_contract_business_offset_days,
        daily_contract_week_offset,
        put_call_code,
        strike_price_normalized,
        product_code_effective as product_code,
        product_code_family,
        product_code_grouping,
        product_code_region,
        product_code_underlying,
        product_family,
        market_name,
        underlying_product_code,
        rule_status,
        rule_match_source,
        ice_product_code,
        cme_product_code,
        bbg_product_code
    from trades
)

select *
from FINAL
order by
    sftp_date desc,
    sftp_upload_timestamp desc,
    row_number_for_trades
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
),  __dbt__cte__nav_ref_40_positions_all_history as (
with positions as (
    select * from __dbt__cte__nav_ref_30_int_rules
),

FINAL as (
    select *
    from positions
)

select *
from FINAL
),  __dbt__cte__nav_ref_excel_05_recent_positions_all_history as (
with  __dbt__cte__nav_ref_00_src_positions as (
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
), source_rows as (
    select * from __dbt__cte__nav_ref_00_src_positions
),

latest_nav_dates as (
    select nav_date
    from (
        select distinct nav_date::date as nav_date
        from source_rows
        where nav_date is not null
        order by nav_date desc
        limit 2
    ) as recent_dates
),

recent_source_rows as (
    select source_rows.*
    from source_rows
    inner join latest_nav_dates
        on latest_nav_dates.nav_date = source_rows.nav_date::date
),

latest_upload_by_fund_date as (
    select
        fund_code,
        nav_date,
        max(sftp_upload_timestamp) as sftp_upload_timestamp
    from recent_source_rows
    group by fund_code, nav_date
),

latest_upload_source_rows as (
    select recent_source_rows.*
    from recent_source_rows
    inner join latest_upload_by_fund_date
        on latest_upload_by_fund_date.fund_code = recent_source_rows.fund_code
       and latest_upload_by_fund_date.nav_date = recent_source_rows.nav_date
       and latest_upload_by_fund_date.sftp_upload_timestamp = recent_source_rows.sftp_upload_timestamp
),

accounts as (
    select * from __dbt__cte__utils_ref_positions_and_trades_account_lookup
    where source = 'nav'
),

product_aliases as (
    select * from __dbt__cte__utils_ref_positions_and_trades_product_aliases
    where source = 'nav'
),

product_catalog as (
    select * from __dbt__cte__utils_ref_positions_and_trades_product_catalog
),

cleaned as (
    select
        latest_upload_source_rows.*,
        latest_upload_source_rows.account as source_account_key,
        accounts.account_name as account_code,
        accounts.account_name,
        case
            when accounts.account_name is not null then 'matched'
            when nullif(trim(latest_upload_source_rows.account), '') is null then 'missing_source_account'
            else 'unmapped'
        end as account_lookup_status,
        latest_upload_source_rows.exchange_name as source_exchange_name,
        true as is_product_record,
        upper(regexp_replace(coalesce(latest_upload_source_rows.product, ''), '[[:space:]]+', ' ', 'g')) as product_norm,
        (
            upper(coalesce(latest_upload_source_rows.call_put, '')) in ('CALL', 'PUT', 'C', 'P')
            or upper(coalesce(latest_upload_source_rows.type, '')) like '%OPTION%'
        ) as is_option,
        case
            when upper(coalesce(latest_upload_source_rows.call_put, '')) in ('CALL', 'C') then 'C'
            when upper(coalesce(latest_upload_source_rows.call_put, '')) in ('PUT', 'P') then 'P'
        end as put_call_code,
        case
            when latest_upload_source_rows.month_year ~ '^\s*\d{1,2}/\d{1,2}/\d{4}\s*$'
            then to_char(to_date(trim(latest_upload_source_rows.month_year), 'MM/DD/YYYY'), 'YYYYMM')
            when upper(trim(coalesce(latest_upload_source_rows.month_year, ''))) ~ '^[A-Z]{3}\d{2}$'
            then to_char(to_date(upper(trim(latest_upload_source_rows.month_year)), 'MONYY'), 'YYYYMM')
        end as contract_yyyymm,
        case
            when latest_upload_source_rows.month_year ~ '^\s*\d{1,2}/\d{1,2}/\d{4}\s*$'
            then extract(day from to_date(trim(latest_upload_source_rows.month_year), 'MM/DD/YYYY'))::integer
        end as contract_day,
        case
            when latest_upload_source_rows.strike_price is null then null
            else round(latest_upload_source_rows.strike_price::numeric, 3)::double precision
        end as strike_price_normalized
    from latest_upload_source_rows
    left join accounts
        on latest_upload_source_rows.account = accounts.account
),

position_matches as (
    select
        cleaned.*,
        matched_alias.source_priority as rule_priority,
        matched_alias.match_type as rule_match_type,
        matched_alias.pattern as rule_pattern,
        matched_alias.product_code as matched_product_code
    from cleaned
    left join lateral (
        select product_aliases.*
        from product_aliases
        where (
                (
                    product_aliases.match_type = 'exact'
                    and cleaned.product_norm = product_aliases.pattern
                )
                or (
                    product_aliases.match_type = 'regex'
                    and cleaned.product_norm ~* product_aliases.pattern
                )
            )
          and (
                product_aliases.option_type is null
                or product_aliases.option_type = case when cleaned.is_option then 'option' else 'future' end
            )
        order by product_aliases.source_priority
        limit 1
    ) as matched_alias on true
),

position_matches_with_effective_product as (
    select
        position_matches.*,
        case
            when
                position_matches.matched_product_code = 'PDA'
                and not position_matches.is_option
                and position_matches.contract_yyyymm ~ '^\d{6}$'
                and position_matches.contract_day is not null
                and extract(isodow from to_date(
                    position_matches.contract_yyyymm
                    || lpad(position_matches.contract_day::text, 2, '0'),
                    'YYYYMMDD'
                ))::integer in (6, 7)
            then 'PDO'
            else position_matches.matched_product_code
        end as effective_product_code
    from position_matches
),

with_rules as (
    select
        position_matches.fund_code,
        position_matches.source_legal_entity,
        position_matches.source_file_name,
        position_matches.source_file_row_number,
        position_matches.nav_date,
        position_matches.sftp_upload_timestamp,
        position_matches.broker_name,
        position_matches.account_group,
        position_matches.account,
        position_matches.source_account_key,
        position_matches.account_code,
        position_matches.account_name,
        position_matches.account_lookup_status,
        position_matches.trade_date,
        position_matches.product_id_internal,
        position_matches.product,
        position_matches.type,
        position_matches.month_year,
        position_matches.client_symbol,
        position_matches.strike_price,
        position_matches.call_put,
        position_matches.product_currency_1,
        position_matches.long_short,
        position_matches.quantity_1,
        position_matches.counter_currency_ccy2,
        position_matches.ccy2_long_short,
        position_matches.ccy2_quantity_2,
        position_matches.trade_price,
        position_matches.multiplier_and_tick_value,
        position_matches.cost_in_native_currency,
        position_matches.open_exchange_rate,
        position_matches.cost_in_base_currency,
        position_matches.market_settlement_price,
        position_matches.market_value_in_native_currency,
        position_matches.close_exchange_rate,
        position_matches.market_value_in_base_currency,
        position_matches.sector,
        position_matches.sub_sector,
        position_matches.country,
        position_matches.exchange_name,
        position_matches.source_exchange_name,
        coalesce(
            product_catalog.default_exchange_name,
            case
                when upper(trim(coalesce(position_matches.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(position_matches.exchange_name, '')) <> '' then 'IFED'
            end
        ) as exchange_route_code,
        case
            when coalesce(
                product_catalog.default_exchange_name,
                case
                    when upper(trim(coalesce(position_matches.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                    when trim(coalesce(position_matches.exchange_name, '')) <> '' then 'IFED'
                end
            ) in ('IFED', 'IFE', 'IPE') then 'ice'
            when coalesce(
                product_catalog.default_exchange_name,
                case
                    when upper(trim(coalesce(position_matches.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                    when trim(coalesce(position_matches.exchange_name, '')) <> '' then 'IFED'
                end
            ) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
            when coalesce(
                product_catalog.default_exchange_name,
                case
                    when upper(trim(coalesce(position_matches.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                    when trim(coalesce(position_matches.exchange_name, '')) <> '' then 'IFED'
                end
            ) is null then 'missing'
            else 'unsupported'
        end as route_family,
        position_matches.is_product_record,
        position_matches.is_option,
        position_matches.source_1_symbol,
        position_matches.source_3_symbol,
        position_matches.one_chicago_symbol,
        position_matches.fas_level,
        position_matches.option_style,
        position_matches.created_at,
        position_matches.updated_at,
        position_matches.effective_product_code as product_code,
        coalesce(effective_product_catalog.product_family, product_catalog.product_family) as product_code_family,
        case
            when coalesce(effective_product_catalog.product_family, product_catalog.product_family) in ('Gas', 'Basis') and position_matches.is_option
            then 'gas_option'
            when coalesce(effective_product_catalog.product_family, product_catalog.product_family) in ('Gas', 'Basis')
            then 'gas_future'
            when coalesce(effective_product_catalog.product_family, product_catalog.product_family) = 'Power' and position_matches.is_option
            then 'power_option'
            when coalesce(effective_product_catalog.product_family, product_catalog.product_family) = 'Power'
            then 'power_future'
        end as product_code_grouping,
        coalesce(effective_product_catalog.market_name, product_catalog.market_name) as product_code_region,
        case when position_matches.is_option then coalesce(effective_product_catalog.underlying_product_code, product_catalog.underlying_product_code) end as product_code_underlying,
        coalesce(effective_product_catalog.product_family, product_catalog.product_family) as product_family,
        coalesce(effective_product_catalog.market_name, product_catalog.market_name) as market_name,
        case when position_matches.is_option then coalesce(effective_product_catalog.underlying_product_code, product_catalog.underlying_product_code) end as underlying_product_code,
        coalesce(effective_product_catalog.bbg_exchange_code, product_catalog.bbg_exchange_code) as bbg_exchange_code,
        coalesce(effective_product_catalog.default_exchange_name, product_catalog.default_exchange_name) as default_exchange_name,
        position_matches.contract_yyyymm,
        position_matches.contract_day,
        position_matches.put_call_code as put_call_code,
        position_matches.strike_price_normalized,
        case
            when product_catalog.product_code is null then 'unresolved_product'
            when coalesce(trim(position_matches.month_year), '') <> '' and position_matches.contract_yyyymm is null then 'unparsed_contract'
            when position_matches.is_option and position_matches.put_call_code is null then 'option_missing_put_call'
            when position_matches.is_option and position_matches.strike_price is null then 'option_missing_strike'
            else 'ok'
        end as rule_status,
        position_matches.rule_priority,
        position_matches.rule_match_type,
        position_matches.rule_pattern
    from position_matches_with_effective_product as position_matches
    left join product_catalog
        on product_catalog.product_code = position_matches.matched_product_code
    left join product_catalog as effective_product_catalog
        on effective_product_catalog.product_code = position_matches.effective_product_code
),

FINAL as (
    select * from with_rules
)

select *
from FINAL
),  __dbt__cte__nav_ref_excel_10_position_rows as (
with positions as (
    select * from __dbt__cte__nav_ref_excel_05_recent_positions_all_history
),

product_aliases as (
    select * from __dbt__cte__utils_ref_positions_and_trades_product_aliases
    where source = 'nav'
),

month_codes as (
    select * from __dbt__cte__utils_ref_positions_and_trades_month_codes
),

latest_upload_positions as (
    select *
    from positions
),

normalized as (
    select
        latest_upload_positions.nav_date::date as sftp_date,
        latest_upload_positions.source_account_key::varchar as source_account_key,
        latest_upload_positions.account_code::varchar as account_code,
        latest_upload_positions.account_name::varchar as account_name,
        latest_upload_positions.account_lookup_status::varchar as account_lookup_status,
        latest_upload_positions.source_exchange_name::varchar as source_exchange_name,
        coalesce(
            latest_upload_positions.exchange_route_code,
            case
                when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
            end
        )::varchar as exchange_name,
        coalesce(
            latest_upload_positions.exchange_route_code,
            case
                when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
            end
        )::varchar as exchange_route_code,
        coalesce(
            latest_upload_positions.route_family,
            case
                when coalesce(
                    latest_upload_positions.exchange_route_code,
                    case
                        when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                        when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
                    end
                ) in ('IFED', 'IFE', 'IPE') then 'ice'
                when coalesce(
                    latest_upload_positions.exchange_route_code,
                    case
                        when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                        when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
                    end
                ) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
                when coalesce(
                    latest_upload_positions.exchange_route_code,
                    case
                        when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                        when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
                    end
                ) is null then 'missing'
                else 'unsupported'
            end
        )::varchar as route_family,
        latest_upload_positions.is_product_record::boolean as is_product_record,
        latest_upload_positions.product_code::varchar as exchange_code,
        case
            when latest_upload_positions.is_option and latest_upload_positions.product_code = 'PMI' then 'POWER_OPTIONS'
            when
                not latest_upload_positions.is_option
                and latest_upload_positions.product_code in ('PDP', 'PWA', 'DDP', 'ODP')
            then 'SHORT_TERM_POWER_RT'
            when latest_upload_positions.product_code = 'HHD' then 'BALMO'
            when latest_upload_positions.product_family = 'Basis' then 'BASIS'
            when latest_upload_positions.product_family = 'Gas'
                and latest_upload_positions.is_option
            then 'GAS_OPTIONS'
            when latest_upload_positions.product_family = 'Gas' then 'GAS_FUTURES'
            when latest_upload_positions.product_code = 'P1X'
                or (
                    latest_upload_positions.product_family = 'Power'
                    and latest_upload_positions.is_option
                )
            then 'POWER_OPTIONS'
            when
                not latest_upload_positions.is_option
                and latest_upload_positions.product_code in (
                    'PDA', 'PJL', 'PDO', 'ERA', 'END', 'NED', 'NDA', 'NEZ', 'SDP'
                )
            then 'SHORT_TERM_POWER'
            when latest_upload_positions.product_family = 'Power' then 'POWER_FUTURES'
        end::varchar as exchange_code_grouping,
        case
            when latest_upload_positions.product_family = 'Gas' then 'HENRY_HUB'
            when latest_upload_positions.product_family = 'Basis' then 'BASIS'
            when latest_upload_positions.market_name = 'Mid-C' then 'PAC_NW'
            else upper(latest_upload_positions.market_name)
        end::varchar as exchange_code_region,
        latest_upload_positions.is_option::boolean as is_option,
        latest_upload_positions.put_call_code::varchar as put_call,
        case
            when latest_upload_positions.is_option then latest_upload_positions.strike_price_normalized
        end::double precision as strike_price,
        latest_upload_positions.contract_yyyymm::varchar as contract_yyyymm,
        case
            when latest_upload_positions.contract_yyyymm is not null
                and latest_upload_positions.contract_day is not null
            then to_date(
                latest_upload_positions.contract_yyyymm
                || lpad(latest_upload_positions.contract_day::text, 2, '0'),
                'YYYYMMDD'
            )
        end as contract_yyyymmdd,
        latest_upload_positions.contract_day::integer as contract_day,
        product_aliases.marex_product::varchar as marex_product,
        latest_upload_positions.quantity_1::double precision as qty,
        latest_upload_positions.multiplier_and_tick_value::double precision as lots,
        latest_upload_positions.market_settlement_price::double precision as settlement_price,
        latest_upload_positions.trade_price::double precision as trade_price,
        month_codes.month_code::varchar as month_code,
        latest_upload_positions.bbg_exchange_code::varchar as bbg_exchange_code
    from latest_upload_positions
    left join product_aliases
        on product_aliases.source_priority = latest_upload_positions.rule_priority
       and product_aliases.match_type = latest_upload_positions.rule_match_type
       and product_aliases.pattern = latest_upload_positions.rule_pattern
       and product_aliases.product_code = latest_upload_positions.product_code
    left join month_codes
        on month_codes.month_number = case
            when latest_upload_positions.contract_yyyymm is not null
            then right(latest_upload_positions.contract_yyyymm, 2)::integer
        end
),

FINAL as (
    select
        sftp_date,
        source_account_key,
        account_code,
        account_name,
        account_lookup_status,
        source_exchange_name,
        exchange_name,
        exchange_route_code,
        route_family,
        is_product_record,
        exchange_code_grouping,
        exchange_code_region,
        exchange_code,
        is_option,
        put_call,
        strike_price,
        contract_yyyymm,
        contract_yyyymmdd,
        contract_day,
        marex_product,
        qty,
        case
            when lots = 2500
                and exchange_code in ('HHD', 'H', 'PHH', 'PHE')
            then qty / 4
            else qty
        end as gas_qty,
        lots,
        case
            when lots = 2500
                and exchange_code in ('HHD', 'H', 'PHH', 'PHE')
            then lots * 4
            else lots
        end as gas_lots,
        settlement_price,
        trade_price,
        case
            when month_code is not null
                and contract_yyyymm is not null
            then month_code || right(left(contract_yyyymm, 4), 1)
        end::varchar as futures_contract_month_y,
        case
            when month_code is not null
                and contract_yyyymm is not null
            then month_code || right(left(contract_yyyymm, 4), 2)
        end::varchar as futures_contract_month_yy,
        bbg_exchange_code
    from normalized
)

select *
from FINAL
order by
    sftp_date desc,
    contract_yyyymm,
    contract_yyyymmdd,
    account_name,
    exchange_code
),  __dbt__cte__nav_ref_excel_20_positions_grouped as (
with  __dbt__cte__nav_ref_00_src_positions as (
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
),  __dbt__cte__nav_ref_excel_05_recent_positions_all_history as (
with  __dbt__cte__nav_ref_00_src_positions as (
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
), source_rows as (
    select * from __dbt__cte__nav_ref_00_src_positions
),

latest_nav_dates as (
    select nav_date
    from (
        select distinct nav_date::date as nav_date
        from source_rows
        where nav_date is not null
        order by nav_date desc
        limit 2
    ) as recent_dates
),

recent_source_rows as (
    select source_rows.*
    from source_rows
    inner join latest_nav_dates
        on latest_nav_dates.nav_date = source_rows.nav_date::date
),

latest_upload_by_fund_date as (
    select
        fund_code,
        nav_date,
        max(sftp_upload_timestamp) as sftp_upload_timestamp
    from recent_source_rows
    group by fund_code, nav_date
),

latest_upload_source_rows as (
    select recent_source_rows.*
    from recent_source_rows
    inner join latest_upload_by_fund_date
        on latest_upload_by_fund_date.fund_code = recent_source_rows.fund_code
       and latest_upload_by_fund_date.nav_date = recent_source_rows.nav_date
       and latest_upload_by_fund_date.sftp_upload_timestamp = recent_source_rows.sftp_upload_timestamp
),

accounts as (
    select * from __dbt__cte__utils_ref_positions_and_trades_account_lookup
    where source = 'nav'
),

product_aliases as (
    select * from __dbt__cte__utils_ref_positions_and_trades_product_aliases
    where source = 'nav'
),

product_catalog as (
    select * from __dbt__cte__utils_ref_positions_and_trades_product_catalog
),

cleaned as (
    select
        latest_upload_source_rows.*,
        latest_upload_source_rows.account as source_account_key,
        accounts.account_name as account_code,
        accounts.account_name,
        case
            when accounts.account_name is not null then 'matched'
            when nullif(trim(latest_upload_source_rows.account), '') is null then 'missing_source_account'
            else 'unmapped'
        end as account_lookup_status,
        latest_upload_source_rows.exchange_name as source_exchange_name,
        true as is_product_record,
        upper(regexp_replace(coalesce(latest_upload_source_rows.product, ''), '[[:space:]]+', ' ', 'g')) as product_norm,
        (
            upper(coalesce(latest_upload_source_rows.call_put, '')) in ('CALL', 'PUT', 'C', 'P')
            or upper(coalesce(latest_upload_source_rows.type, '')) like '%OPTION%'
        ) as is_option,
        case
            when upper(coalesce(latest_upload_source_rows.call_put, '')) in ('CALL', 'C') then 'C'
            when upper(coalesce(latest_upload_source_rows.call_put, '')) in ('PUT', 'P') then 'P'
        end as put_call_code,
        case
            when latest_upload_source_rows.month_year ~ '^\s*\d{1,2}/\d{1,2}/\d{4}\s*$'
            then to_char(to_date(trim(latest_upload_source_rows.month_year), 'MM/DD/YYYY'), 'YYYYMM')
            when upper(trim(coalesce(latest_upload_source_rows.month_year, ''))) ~ '^[A-Z]{3}\d{2}$'
            then to_char(to_date(upper(trim(latest_upload_source_rows.month_year)), 'MONYY'), 'YYYYMM')
        end as contract_yyyymm,
        case
            when latest_upload_source_rows.month_year ~ '^\s*\d{1,2}/\d{1,2}/\d{4}\s*$'
            then extract(day from to_date(trim(latest_upload_source_rows.month_year), 'MM/DD/YYYY'))::integer
        end as contract_day,
        case
            when latest_upload_source_rows.strike_price is null then null
            else round(latest_upload_source_rows.strike_price::numeric, 3)::double precision
        end as strike_price_normalized
    from latest_upload_source_rows
    left join accounts
        on latest_upload_source_rows.account = accounts.account
),

position_matches as (
    select
        cleaned.*,
        matched_alias.source_priority as rule_priority,
        matched_alias.match_type as rule_match_type,
        matched_alias.pattern as rule_pattern,
        matched_alias.product_code as matched_product_code
    from cleaned
    left join lateral (
        select product_aliases.*
        from product_aliases
        where (
                (
                    product_aliases.match_type = 'exact'
                    and cleaned.product_norm = product_aliases.pattern
                )
                or (
                    product_aliases.match_type = 'regex'
                    and cleaned.product_norm ~* product_aliases.pattern
                )
            )
          and (
                product_aliases.option_type is null
                or product_aliases.option_type = case when cleaned.is_option then 'option' else 'future' end
            )
        order by product_aliases.source_priority
        limit 1
    ) as matched_alias on true
),

position_matches_with_effective_product as (
    select
        position_matches.*,
        case
            when
                position_matches.matched_product_code = 'PDA'
                and not position_matches.is_option
                and position_matches.contract_yyyymm ~ '^\d{6}$'
                and position_matches.contract_day is not null
                and extract(isodow from to_date(
                    position_matches.contract_yyyymm
                    || lpad(position_matches.contract_day::text, 2, '0'),
                    'YYYYMMDD'
                ))::integer in (6, 7)
            then 'PDO'
            else position_matches.matched_product_code
        end as effective_product_code
    from position_matches
),

with_rules as (
    select
        position_matches.fund_code,
        position_matches.source_legal_entity,
        position_matches.source_file_name,
        position_matches.source_file_row_number,
        position_matches.nav_date,
        position_matches.sftp_upload_timestamp,
        position_matches.broker_name,
        position_matches.account_group,
        position_matches.account,
        position_matches.source_account_key,
        position_matches.account_code,
        position_matches.account_name,
        position_matches.account_lookup_status,
        position_matches.trade_date,
        position_matches.product_id_internal,
        position_matches.product,
        position_matches.type,
        position_matches.month_year,
        position_matches.client_symbol,
        position_matches.strike_price,
        position_matches.call_put,
        position_matches.product_currency_1,
        position_matches.long_short,
        position_matches.quantity_1,
        position_matches.counter_currency_ccy2,
        position_matches.ccy2_long_short,
        position_matches.ccy2_quantity_2,
        position_matches.trade_price,
        position_matches.multiplier_and_tick_value,
        position_matches.cost_in_native_currency,
        position_matches.open_exchange_rate,
        position_matches.cost_in_base_currency,
        position_matches.market_settlement_price,
        position_matches.market_value_in_native_currency,
        position_matches.close_exchange_rate,
        position_matches.market_value_in_base_currency,
        position_matches.sector,
        position_matches.sub_sector,
        position_matches.country,
        position_matches.exchange_name,
        position_matches.source_exchange_name,
        coalesce(
            product_catalog.default_exchange_name,
            case
                when upper(trim(coalesce(position_matches.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(position_matches.exchange_name, '')) <> '' then 'IFED'
            end
        ) as exchange_route_code,
        case
            when coalesce(
                product_catalog.default_exchange_name,
                case
                    when upper(trim(coalesce(position_matches.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                    when trim(coalesce(position_matches.exchange_name, '')) <> '' then 'IFED'
                end
            ) in ('IFED', 'IFE', 'IPE') then 'ice'
            when coalesce(
                product_catalog.default_exchange_name,
                case
                    when upper(trim(coalesce(position_matches.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                    when trim(coalesce(position_matches.exchange_name, '')) <> '' then 'IFED'
                end
            ) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
            when coalesce(
                product_catalog.default_exchange_name,
                case
                    when upper(trim(coalesce(position_matches.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                    when trim(coalesce(position_matches.exchange_name, '')) <> '' then 'IFED'
                end
            ) is null then 'missing'
            else 'unsupported'
        end as route_family,
        position_matches.is_product_record,
        position_matches.is_option,
        position_matches.source_1_symbol,
        position_matches.source_3_symbol,
        position_matches.one_chicago_symbol,
        position_matches.fas_level,
        position_matches.option_style,
        position_matches.created_at,
        position_matches.updated_at,
        position_matches.effective_product_code as product_code,
        coalesce(effective_product_catalog.product_family, product_catalog.product_family) as product_code_family,
        case
            when coalesce(effective_product_catalog.product_family, product_catalog.product_family) in ('Gas', 'Basis') and position_matches.is_option
            then 'gas_option'
            when coalesce(effective_product_catalog.product_family, product_catalog.product_family) in ('Gas', 'Basis')
            then 'gas_future'
            when coalesce(effective_product_catalog.product_family, product_catalog.product_family) = 'Power' and position_matches.is_option
            then 'power_option'
            when coalesce(effective_product_catalog.product_family, product_catalog.product_family) = 'Power'
            then 'power_future'
        end as product_code_grouping,
        coalesce(effective_product_catalog.market_name, product_catalog.market_name) as product_code_region,
        case when position_matches.is_option then coalesce(effective_product_catalog.underlying_product_code, product_catalog.underlying_product_code) end as product_code_underlying,
        coalesce(effective_product_catalog.product_family, product_catalog.product_family) as product_family,
        coalesce(effective_product_catalog.market_name, product_catalog.market_name) as market_name,
        case when position_matches.is_option then coalesce(effective_product_catalog.underlying_product_code, product_catalog.underlying_product_code) end as underlying_product_code,
        coalesce(effective_product_catalog.bbg_exchange_code, product_catalog.bbg_exchange_code) as bbg_exchange_code,
        coalesce(effective_product_catalog.default_exchange_name, product_catalog.default_exchange_name) as default_exchange_name,
        position_matches.contract_yyyymm,
        position_matches.contract_day,
        position_matches.put_call_code as put_call_code,
        position_matches.strike_price_normalized,
        case
            when product_catalog.product_code is null then 'unresolved_product'
            when coalesce(trim(position_matches.month_year), '') <> '' and position_matches.contract_yyyymm is null then 'unparsed_contract'
            when position_matches.is_option and position_matches.put_call_code is null then 'option_missing_put_call'
            when position_matches.is_option and position_matches.strike_price is null then 'option_missing_strike'
            else 'ok'
        end as rule_status,
        position_matches.rule_priority,
        position_matches.rule_match_type,
        position_matches.rule_pattern
    from position_matches_with_effective_product as position_matches
    left join product_catalog
        on product_catalog.product_code = position_matches.matched_product_code
    left join product_catalog as effective_product_catalog
        on effective_product_catalog.product_code = position_matches.effective_product_code
),

FINAL as (
    select * from with_rules
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
),  __dbt__cte__nav_ref_excel_10_position_rows as (
with positions as (
    select * from __dbt__cte__nav_ref_excel_05_recent_positions_all_history
),

product_aliases as (
    select * from __dbt__cte__utils_ref_positions_and_trades_product_aliases
    where source = 'nav'
),

month_codes as (
    select * from __dbt__cte__utils_ref_positions_and_trades_month_codes
),

latest_upload_positions as (
    select *
    from positions
),

normalized as (
    select
        latest_upload_positions.nav_date::date as sftp_date,
        latest_upload_positions.source_account_key::varchar as source_account_key,
        latest_upload_positions.account_code::varchar as account_code,
        latest_upload_positions.account_name::varchar as account_name,
        latest_upload_positions.account_lookup_status::varchar as account_lookup_status,
        latest_upload_positions.source_exchange_name::varchar as source_exchange_name,
        coalesce(
            latest_upload_positions.exchange_route_code,
            case
                when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
            end
        )::varchar as exchange_name,
        coalesce(
            latest_upload_positions.exchange_route_code,
            case
                when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
            end
        )::varchar as exchange_route_code,
        coalesce(
            latest_upload_positions.route_family,
            case
                when coalesce(
                    latest_upload_positions.exchange_route_code,
                    case
                        when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                        when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
                    end
                ) in ('IFED', 'IFE', 'IPE') then 'ice'
                when coalesce(
                    latest_upload_positions.exchange_route_code,
                    case
                        when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                        when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
                    end
                ) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
                when coalesce(
                    latest_upload_positions.exchange_route_code,
                    case
                        when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                        when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
                    end
                ) is null then 'missing'
                else 'unsupported'
            end
        )::varchar as route_family,
        latest_upload_positions.is_product_record::boolean as is_product_record,
        latest_upload_positions.product_code::varchar as exchange_code,
        case
            when latest_upload_positions.is_option and latest_upload_positions.product_code = 'PMI' then 'POWER_OPTIONS'
            when
                not latest_upload_positions.is_option
                and latest_upload_positions.product_code in ('PDP', 'PWA', 'DDP', 'ODP')
            then 'SHORT_TERM_POWER_RT'
            when latest_upload_positions.product_code = 'HHD' then 'BALMO'
            when latest_upload_positions.product_family = 'Basis' then 'BASIS'
            when latest_upload_positions.product_family = 'Gas'
                and latest_upload_positions.is_option
            then 'GAS_OPTIONS'
            when latest_upload_positions.product_family = 'Gas' then 'GAS_FUTURES'
            when latest_upload_positions.product_code = 'P1X'
                or (
                    latest_upload_positions.product_family = 'Power'
                    and latest_upload_positions.is_option
                )
            then 'POWER_OPTIONS'
            when
                not latest_upload_positions.is_option
                and latest_upload_positions.product_code in (
                    'PDA', 'PJL', 'PDO', 'ERA', 'END', 'NED', 'NDA', 'NEZ', 'SDP'
                )
            then 'SHORT_TERM_POWER'
            when latest_upload_positions.product_family = 'Power' then 'POWER_FUTURES'
        end::varchar as exchange_code_grouping,
        case
            when latest_upload_positions.product_family = 'Gas' then 'HENRY_HUB'
            when latest_upload_positions.product_family = 'Basis' then 'BASIS'
            when latest_upload_positions.market_name = 'Mid-C' then 'PAC_NW'
            else upper(latest_upload_positions.market_name)
        end::varchar as exchange_code_region,
        latest_upload_positions.is_option::boolean as is_option,
        latest_upload_positions.put_call_code::varchar as put_call,
        case
            when latest_upload_positions.is_option then latest_upload_positions.strike_price_normalized
        end::double precision as strike_price,
        latest_upload_positions.contract_yyyymm::varchar as contract_yyyymm,
        case
            when latest_upload_positions.contract_yyyymm is not null
                and latest_upload_positions.contract_day is not null
            then to_date(
                latest_upload_positions.contract_yyyymm
                || lpad(latest_upload_positions.contract_day::text, 2, '0'),
                'YYYYMMDD'
            )
        end as contract_yyyymmdd,
        latest_upload_positions.contract_day::integer as contract_day,
        product_aliases.marex_product::varchar as marex_product,
        latest_upload_positions.quantity_1::double precision as qty,
        latest_upload_positions.multiplier_and_tick_value::double precision as lots,
        latest_upload_positions.market_settlement_price::double precision as settlement_price,
        latest_upload_positions.trade_price::double precision as trade_price,
        month_codes.month_code::varchar as month_code,
        latest_upload_positions.bbg_exchange_code::varchar as bbg_exchange_code
    from latest_upload_positions
    left join product_aliases
        on product_aliases.source_priority = latest_upload_positions.rule_priority
       and product_aliases.match_type = latest_upload_positions.rule_match_type
       and product_aliases.pattern = latest_upload_positions.rule_pattern
       and product_aliases.product_code = latest_upload_positions.product_code
    left join month_codes
        on month_codes.month_number = case
            when latest_upload_positions.contract_yyyymm is not null
            then right(latest_upload_positions.contract_yyyymm, 2)::integer
        end
),

FINAL as (
    select
        sftp_date,
        source_account_key,
        account_code,
        account_name,
        account_lookup_status,
        source_exchange_name,
        exchange_name,
        exchange_route_code,
        route_family,
        is_product_record,
        exchange_code_grouping,
        exchange_code_region,
        exchange_code,
        is_option,
        put_call,
        strike_price,
        contract_yyyymm,
        contract_yyyymmdd,
        contract_day,
        marex_product,
        qty,
        case
            when lots = 2500
                and exchange_code in ('HHD', 'H', 'PHH', 'PHE')
            then qty / 4
            else qty
        end as gas_qty,
        lots,
        case
            when lots = 2500
                and exchange_code in ('HHD', 'H', 'PHH', 'PHE')
            then lots * 4
            else lots
        end as gas_lots,
        settlement_price,
        trade_price,
        case
            when month_code is not null
                and contract_yyyymm is not null
            then month_code || right(left(contract_yyyymm, 4), 1)
        end::varchar as futures_contract_month_y,
        case
            when month_code is not null
                and contract_yyyymm is not null
            then month_code || right(left(contract_yyyymm, 4), 2)
        end::varchar as futures_contract_month_yy,
        bbg_exchange_code
    from normalized
)

select *
from FINAL
order by
    sftp_date desc,
    contract_yyyymm,
    contract_yyyymmdd,
    account_name,
    exchange_code
), position_rows as (
    select * from __dbt__cte__nav_ref_excel_10_position_rows
),

grouped as (
    select
        md5(concat_ws(
            '||',
            coalesce(exchange_name, '<null>'),
            coalesce(exchange_route_code, '<null>'),
            coalesce(route_family, '<null>'),
            coalesce(exchange_code_grouping, '<null>'),
            coalesce(exchange_code_region, '<null>'),
            coalesce(exchange_code, '<null>'),
            coalesce(is_option::text, '<null>'),
            coalesce(put_call, '<null>'),
            coalesce(strike_price::text, '<null>'),
            coalesce(contract_yyyymm, '<null>'),
            coalesce(contract_yyyymmdd::text, '<null>'),
            coalesce(contract_day::text, '<null>'),
            coalesce(gas_lots::text, '<null>')
        )) as position_group_key,
        sftp_date,
        exchange_name,
        exchange_route_code,
        route_family,
        bool_and(is_product_record) as is_product_record,
        exchange_code_grouping,
        exchange_code_region,
        exchange_code,
        is_option,
        put_call,
        strike_price,
        contract_yyyymm,
        contract_yyyymmdd,
        contract_day,
        futures_contract_month_y,
        futures_contract_month_yy,
        gas_lots::double precision as lots,
        max(marex_product)::varchar as marex_product,
        max(bbg_exchange_code)::varchar as bbg_exchange_code,
        avg(settlement_price) as settlement_price_total,
        avg(trade_price) as trade_price_total,
        sum(gas_qty) as qty_total,
        sum(case when account_name = 'ACIM' then gas_qty else 0 end) as qty_acim,
        sum(case when account_name = 'PNT' then gas_qty else 0 end) as qty_pnt,
        sum(case when account_name = 'DICKSON' then gas_qty else 0 end) as qty_dickson,
        sum(case when account_name = 'TITAN' then gas_qty else 0 end) as qty_titan
    from position_rows
    group by
        sftp_date,
        exchange_name,
        exchange_route_code,
        route_family,
        exchange_code_grouping,
        exchange_code_region,
        exchange_code,
        is_option,
        put_call,
        strike_price,
        contract_yyyymm,
        contract_yyyymmdd,
        contract_day,
        futures_contract_month_y,
        futures_contract_month_yy,
        gas_lots
),

with_display_fields as (
    select
        grouped.*,
        case
            when contract_yyyymmdd is not null and sftp_date is not null
            then contract_yyyymmdd - sftp_date
        end as daily_contract_calendar_offset_days,
        extract(isodow from contract_yyyymmdd)::integer between 1 and 5 as daily_contract_is_weekday,
        case
            when contract_yyyymmdd is null or sftp_date is null then null
            when contract_yyyymmdd >= sftp_date
            then (
                select count(*)::integer
                from generate_series(
                    sftp_date + interval '1 day',
                    contract_yyyymmdd,
                    interval '1 day'
                ) as business_days(calendar_date)
                where extract(isodow from business_days.calendar_date)::integer between 1 and 5
            )
            else -1 * (
                select count(*)::integer
                from generate_series(
                    contract_yyyymmdd + interval '1 day',
                    sftp_date,
                    interval '1 day'
                ) as business_days(calendar_date)
                where extract(isodow from business_days.calendar_date)::integer between 1 and 5
            )
        end as daily_contract_business_offset_days,
        case
            when contract_yyyymmdd is not null and sftp_date is not null
            then floor((
                date_trunc('week', contract_yyyymmdd)::date
                - date_trunc('week', sftp_date)::date
            ) / 7.0)::integer
        end as daily_contract_week_offset,
        trim(
            trailing '.'
            from trim(
                trailing '0'
                from to_char(strike_price, 'FM999999999.999')
            )
        ) as strike_text,
        case
            when is_option then trim(concat(
                case when put_call = 'C' then 'CALL' when put_call = 'P' then 'PUT' end,
                ' ',
                to_char(to_date(contract_yyyymm, 'YYYYMM'), 'MON YY'),
                ' ',
                exchange_name,
                ' ',
                marex_product,
                ' ',
                to_char(strike_price::numeric, 'FM999990.00'),
                ' '
            ))
            when contract_day is not null then trim(concat(
                to_char(contract_yyyymmdd::date, 'DD MON YY'),
                ' ',
                exchange_name,
                ' ',
                marex_product,
                ' '
            ))
            when contract_day is null and not is_option then trim(concat(
                to_char(to_date(contract_yyyymm, 'YYYYMM'), 'MON YY'),
                ' ',
                exchange_name,
                ' ',
                marex_product,
                ' '
            ))
        end as marex_description
    from grouped
),

with_symbols as (
    select
        with_display_fields.*,
        case
            when exchange_name = 'IFED' and exchange_code = 'HHD' then exchange_code || ' B0-IUS'
            when
                exchange_name = 'IFED'
                and not is_option
                and exchange_code = 'PDO'
                and contract_yyyymmdd is not null
                and not daily_contract_is_weekday
            then 'PDO P1-IUS'
            when
                exchange_name = 'IFED'
                and not is_option
                and exchange_code in ('PDP', 'PWA', 'DDP', 'ERA', 'END')
                and contract_yyyymmdd is not null
                and daily_contract_is_weekday
                and daily_contract_business_offset_days = 0
            then exchange_code || ' D0-IUS'
            when
                exchange_name = 'IFED'
                and not is_option
                and exchange_code in ('PDP', 'PWA', 'PDA', 'PJL', 'SDP', 'ERA', 'END', 'NEZ', 'NED', 'NDA')
                and contract_yyyymmdd is not null
                and daily_contract_is_weekday
                and daily_contract_business_offset_days = 1
            then exchange_code || ' D1-IUS'
            when
                exchange_name = 'IFED'
                and not is_option
                and contract_yyyymmdd is not null
                and daily_contract_is_weekday
                and daily_contract_business_offset_days > 1
                and (
                    (
                        exchange_code in ('PDP', 'PWA')
                        and daily_contract_week_offset between 0 and 4
                    )
                    or (
                        exchange_code in ('ERA', 'END')
                        and daily_contract_week_offset between 0 and 1
                    )
                    or (
                        exchange_code = 'NED'
                        and daily_contract_week_offset between 0 and 2
                    )
                    or (
                        exchange_code = 'NDA'
                        and daily_contract_week_offset = 0
                    )
                )
            then exchange_code || ' W' || daily_contract_week_offset::text || '-IUS'
            when exchange_name = 'IFED' and is_option then exchange_code || ' '
                || futures_contract_month_yy || put_call || strike_price::integer::text || '-IUS'
            when exchange_name = 'IFED' and not is_option and contract_day is null then exchange_code || ' '
                || futures_contract_month_yy || '-IUS'
        end as ice_xl_symbol,
        case
            when exchange_code in ('HP', 'PHH', 'HH', 'H', 'NG') then '1|G|XNYM:F:NG:' || contract_yyyymm
            when exchange_code in ('LN', 'PHE') then '1|G|XNYM:O:LN:' || contract_yyyymm
                || ':' || put_call || ':' || strike_text
            when exchange_code in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5') then '1|G|XNYM:O:KN'
                || substring(exchange_code from 3) || ':' || contract_yyyymm || ':' || put_call || ':' || strike_text
            when exchange_code in ('JN1', 'KN2', 'KN3', 'KN4') then '1|G|XNYM:O:'
                || exchange_code || ':' || contract_yyyymm || ':' || put_call || ':' || strike_text
            when exchange_code in ('G3', 'G4') then 'CAL_SPREAD_CME_EXCEL_CODE'
        end as cme_excel_symbol,
        case
            when is_option and exchange_code in ('LN', 'PHE') then concat(
                case when put_call = 'C' then 'CALL' else 'PUT' end,
                ' ',
                to_char(to_date(substring(contract_yyyymm, 5, 2), 'MM'), 'MON'),
                ' ',
                left(contract_yyyymm, 4),
                ' ',
                to_char(strike_price, 'FM90.00')
            )
            when is_option and exchange_code in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5') then concat(
                case when put_call = 'C' then 'CALL' else 'PUT' end,
                ' ',
                to_char(to_date(substring(contract_yyyymm, 5, 2), 'MM'), 'MON'),
                ' ',
                left(contract_yyyymm, 4),
                ' WKLY WEEK',
                substring(exchange_code, 3, 2),
                ' ',
                to_char(strike_price, 'FM90.00')
            )
            when is_option and exchange_code in ('G3', 'G4') then concat(
                case when put_call = 'C' then 'CALL' else 'PUT' end,
                ' ',
                to_char(to_date(substring(contract_yyyymm, 5, 2), 'MM'), 'MON'),
                ' ',
                left(contract_yyyymm, 4),
                ' CAL SPREAD ',
                substring(exchange_code, 2, 1),
                ' MONTHS ',
                to_char(strike_price, 'FM90.00')
            )
        end as bbg_option_description
    from with_display_fields
),

FINAL as (
    select
        position_group_key,
        sftp_date,
        exchange_name,
        exchange_route_code,
        route_family,
        is_product_record,
        exchange_code_grouping,
        exchange_code_region,
        exchange_code,
        is_option,
        put_call,
        strike_price,
        contract_yyyymm,
        contract_yyyymmdd,
        contract_day,
        daily_contract_is_weekday,
        daily_contract_calendar_offset_days,
        daily_contract_business_offset_days,
        daily_contract_week_offset,
        futures_contract_month_y,
        futures_contract_month_yy,
        marex_description,
        ice_xl_symbol,
        cme_excel_symbol,
        bbg_option_description,
        lots,
        settlement_price_total,
        trade_price_total,
        qty_total,
        qty_acim,
        qty_pnt,
        qty_dickson,
        qty_titan
    from with_symbols
)

select *
from FINAL
order by
    sftp_date desc,
    exchange_code_grouping,
    exchange_code,
    is_option,
    put_call,
    strike_price,
    contract_yyyymm
), check_definitions as (
    select *
    from (
        values
            (
                'latest',
                'Latest Files',
                'clear_street_latest_product_matching',
                'Clear Street Latest Product Matching',
                'Clear Street',
                'error',
                10
            ),
            (
                'latest',
                'Latest Files',
                'clear_street_latest_vendor_codes_by_exchange_route',
                'Clear Street Latest Vendor Codes By Exchange Route',
                'Clear Street',
                'warn',
                20
            ),
            (
                'latest',
                'Latest Files',
                'nav_latest_product_matching',
                'NAV Latest Product Matching',
                'NAV',
                'error',
                30
            ),
            (
                'latest',
                'Latest Files',
                'nav_latest_vendor_codes_by_exchange_route',
                'NAV Latest Vendor Codes By Exchange Route',
                'NAV',
                'warn',
                40
            ),
            (
                'all_history',
                'All History',
                'clear_street_all_history_product_matching',
                'Clear Street All-History Product Matching',
                'Clear Street',
                'error',
                110
            ),
            (
                'all_history',
                'All History',
                'clear_street_all_history_vendor_codes_by_exchange_route',
                'Clear Street All-History Vendor Codes By Exchange Route',
                'Clear Street',
                'warn',
                120
            ),
            (
                'all_history',
                'All History',
                'nav_all_history_product_matching',
                'NAV All-History Product Matching',
                'NAV',
                'error',
                130
            ),
            (
                'all_history',
                'All History',
                'nav_all_history_vendor_codes_by_exchange_route',
                'NAV All-History Vendor Codes By Exchange Route',
                'NAV',
                'warn',
                140
            )
    ) as definitions (
        validation_scope,
        scope_label,
        check_id,
        check_label,
        source_system,
        severity,
        sort_order
    )
),

clear_street_all_history as (
    select * from __dbt__cte__cs_ref_65_eod_all_history
),

nav_all_history as (
    select * from __dbt__cte__nav_ref_40_positions_all_history
),

nav_vendor_rows as (
    select * from __dbt__cte__nav_ref_excel_20_positions_grouped
),

clear_street_latest_file as (
    select
        clear_street_all_history.sftp_date,
        max(clear_street_all_history.sftp_upload_timestamp) as sftp_upload_timestamp
    from clear_street_all_history
    where clear_street_all_history.sftp_date = (
        select max(latest_dates.sftp_date)
        from clear_street_all_history as latest_dates
    )
    group by clear_street_all_history.sftp_date
),

clear_street_latest as (
    select clear_street_all_history.*
    from clear_street_all_history
    inner join clear_street_latest_file
        on clear_street_latest_file.sftp_date = clear_street_all_history.sftp_date
       and clear_street_latest_file.sftp_upload_timestamp = clear_street_all_history.sftp_upload_timestamp
),

clear_street_validation_rows as (
    select
        'latest'::text as validation_scope,
        clear_street_latest.*
    from clear_street_latest

    union all

    select
        'all_history'::text as validation_scope,
        clear_street_all_history.*
    from clear_street_all_history
),

clear_street_vendor_prepared as (
    select
        clear_street_validation_rows.*,
        coalesce(
            nullif(trim(clear_street_validation_rows.route_family::text), ''),
            case
                when upper(trim(coalesce(
                    nullif(trim(clear_street_validation_rows.exchange_route_code::text), ''),
                    nullif(trim(clear_street_validation_rows.exchange_name::text), ''),
                    nullif(trim(clear_street_validation_rows.exchange::text), '')
                ))) in ('IFED', 'IFE', 'IPE') then 'ice'
                when upper(trim(coalesce(
                    nullif(trim(clear_street_validation_rows.exchange_route_code::text), ''),
                    nullif(trim(clear_street_validation_rows.exchange_name::text), ''),
                    nullif(trim(clear_street_validation_rows.exchange::text), '')
                ))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
                when coalesce(
                    nullif(trim(clear_street_validation_rows.exchange_route_code::text), ''),
                    nullif(trim(clear_street_validation_rows.exchange_name::text), ''),
                    nullif(trim(clear_street_validation_rows.exchange::text), '')
                ) is null then 'missing'
                else 'unsupported'
            end
        ) as vendor_route_family
    from clear_street_validation_rows
),

nav_latest_dates_by_fund as (
    select
        nav_all_history.fund_code,
        max(nav_all_history.nav_date) as nav_date
    from nav_all_history
    group by nav_all_history.fund_code
),

nav_latest_files_by_fund as (
    select
        nav_all_history.fund_code,
        nav_all_history.nav_date,
        max(nav_all_history.sftp_upload_timestamp) as sftp_upload_timestamp
    from nav_all_history
    inner join nav_latest_dates_by_fund
        on nav_latest_dates_by_fund.fund_code = nav_all_history.fund_code
       and nav_latest_dates_by_fund.nav_date = nav_all_history.nav_date
    group by
        nav_all_history.fund_code,
        nav_all_history.nav_date
),

nav_latest as (
    select nav_all_history.*
    from nav_all_history
    inner join nav_latest_files_by_fund
        on nav_latest_files_by_fund.fund_code = nav_all_history.fund_code
       and nav_latest_files_by_fund.nav_date = nav_all_history.nav_date
       and nav_latest_files_by_fund.sftp_upload_timestamp = nav_all_history.sftp_upload_timestamp
),

nav_validation_rows as (
    select
        'latest'::text as validation_scope,
        nav_latest.*
    from nav_latest

    union all

    select
        'all_history'::text as validation_scope,
        nav_all_history.*
    from nav_all_history
),

nav_vendor_latest_date as (
    select max(nav_vendor_rows.sftp_date) as sftp_date
    from nav_vendor_rows
),

nav_vendor_latest_rows as (
    select nav_vendor_rows.*
    from nav_vendor_rows
    inner join nav_vendor_latest_date
        on nav_vendor_latest_date.sftp_date = nav_vendor_rows.sftp_date
),

nav_vendor_validation_rows as (
    select
        'latest'::text as validation_scope,
        nav_vendor_latest_rows.*
    from nav_vendor_latest_rows

    union all

    select
        'all_history'::text as validation_scope,
        nav_vendor_rows.*
    from nav_vendor_rows
),

nav_vendor_prepared as (
    select
        nav_vendor_validation_rows.*,
        coalesce(
            nullif(trim(nav_vendor_validation_rows.route_family::text), ''),
            case
                when upper(trim(coalesce(
                    nullif(trim(nav_vendor_validation_rows.exchange_route_code::text), ''),
                    nullif(trim(nav_vendor_validation_rows.exchange_name::text), '')
                ))) in ('IFED', 'IFE', 'IPE') then 'ice'
                when upper(trim(coalesce(
                    nullif(trim(nav_vendor_validation_rows.exchange_route_code::text), ''),
                    nullif(trim(nav_vendor_validation_rows.exchange_name::text), '')
                ))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
                when coalesce(
                    nullif(trim(nav_vendor_validation_rows.exchange_route_code::text), ''),
                    nullif(trim(nav_vendor_validation_rows.exchange_name::text), '')
                ) is null then 'missing'
                else 'unsupported'
            end
        ) as vendor_route_family
    from nav_vendor_validation_rows
),

clear_street_product_matching_failures as (
    select
        clear_street_validation_rows.validation_scope,
        case
            when clear_street_validation_rows.validation_scope = 'latest'
            then 'clear_street_latest_product_matching'
            else 'clear_street_all_history_product_matching'
        end as check_id,
        coalesce(
            clear_street_validation_rows.trade_date_from_sftp::text,
            clear_street_validation_rows.sftp_date::text
        ) as source_date,
        clear_street_validation_rows.product_code::text as product_code,
        clear_street_validation_rows.product_code_grouping::text as product_grouping,
        clear_street_validation_rows.route_family::text as route_family,
        coalesce(clear_street_validation_rows.rule_status::text, '<null>') as failure_reason
    from clear_street_validation_rows
    where clear_street_validation_rows.rule_status is distinct from 'ok'
      and clear_street_validation_rows.rule_status is distinct from 'non_product_cash_adjustment'
),

clear_street_vendor_code_failures as (
    select
        clear_street_vendor_prepared.validation_scope,
        case
            when clear_street_vendor_prepared.validation_scope = 'latest'
            then 'clear_street_latest_vendor_codes_by_exchange_route'
            else 'clear_street_all_history_vendor_codes_by_exchange_route'
        end as check_id,
        coalesce(
            clear_street_vendor_prepared.trade_date_from_sftp::text,
            clear_street_vendor_prepared.sftp_date::text
        ) as source_date,
        clear_street_vendor_prepared.product_code::text as product_code,
        clear_street_vendor_prepared.product_code_grouping::text as product_grouping,
        clear_street_vendor_prepared.vendor_route_family::text as route_family,
        case
            when nullif(trim(clear_street_vendor_prepared.product_code_grouping::text), '') is null
            then 'missing_product_code_grouping'
            when clear_street_vendor_prepared.vendor_route_family in ('missing', 'unsupported')
            then 'missing_or_unsupported_route_family'
            when clear_street_vendor_prepared.vendor_route_family not in ('ice', 'nymex')
            then 'invalid_route_family'
            when
                clear_street_vendor_prepared.vendor_route_family = 'ice'
                and nullif(trim(clear_street_vendor_prepared.ice_product_code::text), '') is null
            then 'missing_ice_product_code'
            when
                clear_street_vendor_prepared.vendor_route_family = 'nymex'
                and nullif(trim(clear_street_vendor_prepared.cme_product_code::text), '') is null
                and nullif(trim(clear_street_vendor_prepared.bbg_product_code::text), '') is null
            then 'missing_nymex_cme_or_bbg_code'
        end as failure_reason
    from clear_street_vendor_prepared
    where coalesce(clear_street_vendor_prepared.is_product_record, true)
      and (
        nullif(trim(clear_street_vendor_prepared.product_code_grouping::text), '') is null
       or clear_street_vendor_prepared.vendor_route_family in ('missing', 'unsupported')
       or clear_street_vendor_prepared.vendor_route_family not in ('ice', 'nymex')
       or (
            clear_street_vendor_prepared.vendor_route_family = 'ice'
            and nullif(trim(clear_street_vendor_prepared.ice_product_code::text), '') is null
        )
       or (
            clear_street_vendor_prepared.vendor_route_family = 'nymex'
            and nullif(trim(clear_street_vendor_prepared.cme_product_code::text), '') is null
            and nullif(trim(clear_street_vendor_prepared.bbg_product_code::text), '') is null
        )
    )
),

nav_product_matching_failures as (
    select
        nav_validation_rows.validation_scope,
        case
            when nav_validation_rows.validation_scope = 'latest'
            then 'nav_latest_product_matching'
            else 'nav_all_history_product_matching'
        end as check_id,
        nav_validation_rows.nav_date::text as source_date,
        nav_validation_rows.product_code::text as product_code,
        nav_validation_rows.product_code_grouping::text as product_grouping,
        nav_validation_rows.route_family::text as route_family,
        coalesce(nav_validation_rows.rule_status::text, '<null>') as failure_reason
    from nav_validation_rows
    where nav_validation_rows.rule_status is distinct from 'ok'
),

nav_vendor_code_failures as (
    select
        nav_vendor_prepared.validation_scope,
        case
            when nav_vendor_prepared.validation_scope = 'latest'
            then 'nav_latest_vendor_codes_by_exchange_route'
            else 'nav_all_history_vendor_codes_by_exchange_route'
        end as check_id,
        nav_vendor_prepared.sftp_date::text as source_date,
        nav_vendor_prepared.exchange_code::text as product_code,
        nav_vendor_prepared.exchange_code_grouping::text as product_grouping,
        nav_vendor_prepared.vendor_route_family::text as route_family,
        case
            when nullif(trim(nav_vendor_prepared.exchange_code_grouping::text), '') is null
            then 'missing_product_code_grouping'
            when nav_vendor_prepared.vendor_route_family in ('missing', 'unsupported')
            then 'missing_or_unsupported_route_family'
            when nav_vendor_prepared.vendor_route_family not in ('ice', 'nymex')
            then 'invalid_route_family'
            when
                nav_vendor_prepared.vendor_route_family = 'ice'
                and nullif(trim(nav_vendor_prepared.ice_xl_symbol::text), '') is null
            then 'missing_ice_xl_symbol'
            when
                nav_vendor_prepared.vendor_route_family = 'nymex'
                and nullif(trim(nav_vendor_prepared.cme_excel_symbol::text), '') is null
                and nullif(trim(nav_vendor_prepared.bbg_option_description::text), '') is null
            then 'missing_nymex_excel_or_bbg_code'
        end as failure_reason
    from nav_vendor_prepared
    where coalesce(nav_vendor_prepared.is_product_record, true)
      and (
        nullif(trim(nav_vendor_prepared.exchange_code_grouping::text), '') is null
       or nav_vendor_prepared.vendor_route_family in ('missing', 'unsupported')
       or nav_vendor_prepared.vendor_route_family not in ('ice', 'nymex')
       or (
            nav_vendor_prepared.vendor_route_family = 'ice'
            and nullif(trim(nav_vendor_prepared.ice_xl_symbol::text), '') is null
        )
       or (
            nav_vendor_prepared.vendor_route_family = 'nymex'
            and nullif(trim(nav_vendor_prepared.cme_excel_symbol::text), '') is null
            and nullif(trim(nav_vendor_prepared.bbg_option_description::text), '') is null
        )
    )
),

all_failures as (
    select * from clear_street_product_matching_failures
    union all
    select * from clear_street_vendor_code_failures
    union all
    select * from nav_product_matching_failures
    union all
    select * from nav_vendor_code_failures
),

failure_rollups as (
    select
        all_failures.validation_scope,
        all_failures.check_id,
        count(*)::integer as failing_count,
        min(all_failures.source_date) as first_observed_date,
        max(all_failures.source_date) as last_observed_date
    from all_failures
    group by
        all_failures.validation_scope,
        all_failures.check_id
),

failure_groups as (
    select
        all_failures.validation_scope,
        all_failures.check_id,
        all_failures.product_code,
        all_failures.product_grouping,
        all_failures.route_family,
        all_failures.failure_reason,
        count(*)::integer as group_count,
        row_number() over (
            partition by
                all_failures.validation_scope,
                all_failures.check_id
            order by count(*) desc,
                all_failures.product_code nulls last,
                all_failures.product_grouping nulls last,
                all_failures.route_family nulls last
        ) as group_rank
    from all_failures
    group by
        all_failures.validation_scope,
        all_failures.check_id,
        all_failures.product_code,
        all_failures.product_grouping,
        all_failures.route_family,
        all_failures.failure_reason
),

top_failure_groups as (
    select
        failure_groups.validation_scope,
        failure_groups.check_id,
        failure_groups.product_code,
        failure_groups.product_grouping,
        failure_groups.route_family,
        failure_groups.failure_reason,
        failure_groups.group_count
    from failure_groups
    where failure_groups.group_rank = 1
),

summary as (
    select
        check_definitions.validation_scope,
        check_definitions.scope_label,
        check_definitions.check_id,
        check_definitions.check_label,
        check_definitions.source_system,
        check_definitions.severity,
        case
            when coalesce(failure_rollups.failing_count, 0) = 0 then 'pass'
            when check_definitions.severity = 'warn' then 'warn'
            else 'fail'
        end as status,
        coalesce(failure_rollups.failing_count, 0)::integer as failing_count,
        top_failure_groups.product_code as sample_product_code,
        top_failure_groups.product_grouping as sample_product_grouping,
        top_failure_groups.route_family as sample_route_family,
        top_failure_groups.failure_reason as sample_failure_reason,
        top_failure_groups.group_count as sample_group_count,
        failure_rollups.first_observed_date,
        failure_rollups.last_observed_date,
        check_definitions.sort_order
    from check_definitions
    left join failure_rollups
        on check_definitions.validation_scope = failure_rollups.validation_scope
       and check_definitions.check_id = failure_rollups.check_id
    left join top_failure_groups
        on check_definitions.validation_scope = top_failure_groups.validation_scope
       and check_definitions.check_id = top_failure_groups.check_id
),

FINAL as (
    select
        summary.validation_scope,
        summary.scope_label,
        summary.check_id,
        summary.check_label,
        summary.source_system,
        summary.severity,
        summary.status,
        summary.failing_count,
        case
            when summary.failing_count = 0 then 'No failing rows.'
            when summary.status = 'warn' then concat(
                summary.failing_count::text,
                ' warning row(s). Top group: ',
                coalesce(summary.sample_product_code, '<null>'),
                ' / ',
                coalesce(summary.sample_product_grouping, '<null>'),
                ' / ',
                coalesce(summary.sample_route_family, '<null>'),
                ' (',
                coalesce(summary.sample_failure_reason, 'unknown_reason'),
                ').'
            )
            else concat(
                summary.failing_count::text,
                ' failing row(s). Top group: ',
                coalesce(summary.sample_product_code, '<null>'),
                ' / ',
                coalesce(summary.sample_product_grouping, '<null>'),
                ' / ',
                coalesce(summary.sample_route_family, '<null>'),
                ' (',
                coalesce(summary.sample_failure_reason, 'unknown_reason'),
                ').'
            )
        end as detail,
        summary.sample_product_code,
        summary.sample_product_grouping,
        summary.sample_route_family,
        summary.sample_failure_reason,
        summary.sample_group_count,
        summary.first_observed_date,
        summary.last_observed_date,
        summary.sort_order
    from summary
)

select *
from FINAL
order by sort_order