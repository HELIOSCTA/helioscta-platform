-- All Clear Street source files.
--
-- Clear Street can send multiple uploads for the same SFTP trade date. This
-- model keeps every loaded source row with the same curated review/export
-- contract used by cs_ref_70_eod_latest, without narrowing to the latest file.

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

with trades as (
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
), trades as (
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