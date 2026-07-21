with  __dbt__cte__cs_00_src_eod_txns as (
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
),  __dbt__cte__cs_10_int_clean_fields as (
-- Field-level cleanup for raw Clear Street strings.
--
-- The source table preserves the CSV payload as loaded. Some text fields can
-- contain blank strings or the literal string 'nan'. This model creates
-- targeted *_clean helper columns for fields used later by joins, parsing, or
-- rule matching while preserving the original raw columns from trades.*.

with trades as (
    select * from __dbt__cte__cs_00_src_eod_txns
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
),  __dbt__cte__utils_v2_positions_and_trades_month_codes as (
with month_codes(month_number, month_name, month_code) as (
    values
        (1, 'Jan', 'F'),
        (2, 'Feb', 'G'),
        (3, 'Mar', 'H'),
        (4, 'Apr', 'J'),
        (5, 'May', 'K'),
        (6, 'Jun', 'M'),
        (7, 'Jul', 'N'),
        (8, 'Aug', 'Q'),
        (9, 'Sep', 'U'),
        (10, 'Oct', 'V'),
        (11, 'Nov', 'X'),
        (12, 'Dec', 'Z')
),

FINAL as (
    select * from month_codes
)

select *
from FINAL
),  __dbt__cte__cs_20_int_contracts as (
-- Contract and date parsing.
--
-- This stage turns cleaned source strings into typed date/contract helpers.
-- It does not join accounts or apply product rules; that keeps contract parsing
-- independently reviewable when source files contain malformed dates or months.

with trades as (
    select * from __dbt__cte__cs_10_int_clean_fields
),

month_codes as (
    select * from __dbt__cte__utils_v2_positions_and_trades_month_codes
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
),  __dbt__cte__utils_v2_positions_and_trades_account_lookup as (
with account_lookup(account_name, account, source, source_label) as (
    values

        -- ACIM
        ('ACIM', 'UBE 10051', 'nav', 'NAV Position File'),
        ('ACIM', '51014112.0', 'nav', 'NAV Position File'),
        ('ACIM', '51014112', 'nav', 'NAV Position File'),
        -- IOAGR ... EFD, 365
        ('ACIM', 'EFD', 'clear_street', 'Clear Street Trades'),
        ('ACIM', '365', 'clear_street', 'Clear Street Trades'),

        -- PNT
        ('PNT', 'ABN AMRO_1251PT034', 'nav', 'NAV Position File'),
        -- IOPNT ... FCR,  690
        ('PNT', 'FCR', 'clear_street', 'Clear Street Trades'),
        ('PNT', '690', 'clear_street', 'Clear Street Trades'),

        -- DICKSON
        ('DICKSON', 'RJO_35511229', 'nav', 'NAV Position File'),
        -- IOMOR ... RJO, 685
        ('DICKSON', 'RJO', 'clear_street', 'Clear Street Trades'),
        ('DICKSON', '685', 'clear_street', 'Clear Street Trades'),

        -- TITAN
        ('TITAN', '969 ESKHL', 'nav', 'NAV Position File'),
        -- ITITA ... ADU, 905
        ('TITAN', 'ADU', 'clear_street', 'Clear Street Trades'),
        ('TITAN', '905', 'clear_street', 'Clear Street Trades')
),

FINAL as (
    select * from account_lookup
)

select *
from FINAL
),  __dbt__cte__cs_30_int_trade_attrs as (
-- Trade attributes used by account, option, and product-rule logic.
--
-- This stage adds business-facing helpers that are not raw source fields:
-- account names, normalized buy/sell quantities, option side/type indicators,
-- exchange-name normalization, and source product text for review diagnostics.

with trades as (
    select * from __dbt__cte__cs_20_int_contracts
),

accounts as (
    select * from __dbt__cte__utils_v2_positions_and_trades_account_lookup
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

        -- Clear Street uses several source labels for the same exchange family.
        case upper(trades.exchange_name_clean)
            when 'NYM' then 'NYME'
            when 'NYME' then 'NYME'
            when 'IFE' then 'IFED'
            when 'IPE' then 'IFED'
            when 'IFED' then 'IFED'
        end as exchange_name_normalized
    from trades
),

FINAL as (
    select
    prepared_trades.*,
    accounts.account_name,

    -- Prefer the explicit security description, falling back to instrument/symbol.
    coalesce(
        prepared_trades.security_description_clean,
        prepared_trades.instrument_description_clean,
        prepared_trades.symbol_clean
    ) as rule_product,

    -- Upper/space-normalized product text is kept for diagnostics and review.
    nullif(
        upper(regexp_replace(coalesce(
            prepared_trades.security_description_clean,
            prepared_trades.instrument_description_clean,
            prepared_trades.symbol_clean,
            ''
        ), '[[:space:]]+', ' ', 'g')),
        ''
    ) as rule_product_norm,

    -- Clear Street side codes: 1 = buy, 2 = sell.
    case
        when prepared_trades.buy_sell_clean ~ '^\d+$' and prepared_trades.buy_sell_clean::integer = 1 then 'B'
        when prepared_trades.buy_sell_clean ~ '^\d+$' and prepared_trades.buy_sell_clean::integer = 2 then 'S'
    end as buy_sell_cleaned,

    -- Signed quantity lets grouped views sum buys and sells directly.
    case
        when prepared_trades.buy_sell_clean ~ '^\d+$' and prepared_trades.buy_sell_clean::integer = 1 then prepared_trades.quantity
        when prepared_trades.buy_sell_clean ~ '^\d+$' and prepared_trades.buy_sell_clean::integer = 2 then -1 * prepared_trades.quantity
    end as quantity_cleaned,
    case
        when prepared_trades.strike_price is not null and prepared_trades.strike_price <> 0
        then round(prepared_trades.strike_price::numeric, 3)::double precision
    end as strike_price_normalized,

    -- Residual cash adjustment rows should not be treated as missing products.
    (
        coalesce(prepared_trades.quantity, 0) = 0
        and coalesce(prepared_trades.contract_year_month, 0) = 0
        and upper(coalesce(prepared_trades.security_description_clean, '')) = 'UNITED STATES DOLLAR'
        and (
            upper(coalesce(prepared_trades.instrument_description_clean, '')) like 'RESID ADJ%'
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
left join accounts
    on prepared_trades.give_in_out_firm_num_clean = accounts.account
)

select *
from FINAL
),  __dbt__cte__utils_v2_positions_and_trades_product_catalog as (
with product_catalog(
    product_code,
    product_family,
    market_name,
    underlying_product_code,
    bbg_exchange_code,
    default_exchange_name
) as (
    values
        ('HHD', 'Gas', 'Henry Hub', null, null, 'IFED'),
        ('NG', 'Gas', 'Henry Hub', null, 'NG', 'NYME'),
        ('HH', 'Gas', 'Henry Hub', null, 'IW', 'NYME'),
        ('HP', 'Gas', 'Henry Hub', null, 'ZA', 'NYME'),
        ('H', 'Gas', 'Henry Hub', null, null, 'IFED'),
        ('PHH', 'Gas', 'Henry Hub', null, null, 'IFED'),
        ('PHE', 'Gas', 'Henry Hub', 'NG', null, 'IFED'),
        ('LN', 'Gas', 'Henry Hub', 'NG', 'NG', 'NYME'),
        ('LN1', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),
        ('LN2', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),
        ('LN3', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),
        ('LN4', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),
        ('LN5', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),
        ('JN1', 'Gas', 'Henry Hub', 'NG', null, 'NYME'),
        ('KN2', 'Gas', 'Henry Hub', 'NG', null, 'NYME'),
        ('KN3', 'Gas', 'Henry Hub', 'NG', null, 'NYME'),
        ('KN4', 'Gas', 'Henry Hub', 'NG', 'HZI', 'NYME'),
        ('G3', 'Gas', 'Henry Hub', 'NG', null, 'NYME'),
        ('G4', 'Gas', 'Henry Hub', 'NG', null, 'NYME'),
        ('PDP', 'Power', 'PJM', null, null, 'IFED'),
        ('PWA', 'Power', 'PJM', null, null, 'IFED'),
        ('DDP', 'Power', 'PJM', null, null, 'IFED'),
        ('PDA', 'Power', 'PJM', null, null, 'IFED'),
        ('PJL', 'Power', 'PJM', null, null, 'IFED'),
        ('PMI', 'Power', 'PJM', 'PMI', null, 'IFED'),
        ('P1X', 'Power', 'PJM', 'PMI', null, 'IFED'),
        ('OPJ', 'Power', 'PJM', null, null, 'IFED'),
        ('ODP', 'Power', 'PJM', null, null, 'IFED'),
        ('ERA', 'Power', 'ERCOT', null, null, 'IFED'),
        ('ERN', 'Power', 'ERCOT', null, null, 'IFED'),
        ('END', 'Power', 'ERCOT', null, null, 'IFED'),
        ('ECI', 'Power', 'ERCOT', null, null, 'IFED'),
        ('NEZ', 'Power', 'NEPOOL', null, null, 'IFED'),
        ('NEP', 'Power', 'NEPOOL', null, null, 'IFED'),
        ('SPM', 'Power', 'CAISO', null, null, 'IFED'),
        ('SDP', 'Power', 'CAISO', null, null, 'IFED'),
        ('NPM', 'Power', 'CAISO', null, null, 'IFED'),
        ('MDC', 'Power', 'Mid-C', null, null, 'IFED'),
        ('AEC', 'Basis', 'AECO', null, null, 'IFED'),
        ('ALQ', 'Basis', 'Algonquin', null, null, 'IFED'),
        ('CRI', 'Basis', 'CIG Rockies', null, null, 'IFED'),
        ('DGD', 'Basis', 'Chicago', null, null, 'IFED'),
        ('DOM', 'Basis', 'Eastern Gas South', null, null, 'IFED'),
        ('HXS', 'Basis', 'Houston Ship Channel', null, null, 'IFED'),
        ('UCS', 'Basis', 'Houston Ship Channel', null, null, 'IFED'),
        ('NTO', 'Basis', 'NGPL TXOK', null, null, 'IFED'),
        ('NWR', 'Basis', 'Northwest Rockies', null, null, 'IFED'),
        ('PGE', 'Basis', 'PG&E Citygate', null, null, 'IFED'),
        ('TMT', 'Basis', 'Tetco M3', null, null, 'IFED'),
        ('TRZ', 'Basis', 'Transco Zone 4', null, null, 'IFED')
),

FINAL as (
    select * from product_catalog
)

select *
from FINAL
),  __dbt__cte__cs_40_int_product_matches as (
-- Product match candidates for Clear Street rows.
--
-- Matching runs in priority order:
-- 1. targeted CUSIP override for PMI/P1X options
-- 2. explicit Clear Street exchange commodity code in the product catalog

with trades as (
    select * from __dbt__cte__cs_30_int_trade_attrs
),

product_catalog as (
    select * from __dbt__cte__utils_v2_positions_and_trades_product_catalog
),

FINAL as (
    select
    trades.*,

    -- Targeted CUSIP override handles PMI/P1X option rows where the CUSIP is
    -- the clearest product discriminator.
    cusip_catalog.product_code as cusip_product_code,
    cusip_catalog.product_family as cusip_product_family,
    cusip_catalog.market_name as cusip_market_name,
    cusip_catalog.underlying_product_code as cusip_underlying_product_code,
    cusip_catalog.bbg_exchange_code as cusip_bbg_exchange_code,
    cusip_catalog.default_exchange_name as cusip_default_exchange_name,

    -- Direct product-code matches from Clear Street exchange commodity codes.
    explicit_catalog.product_code as explicit_product_code,
    explicit_catalog.product_family as explicit_product_family,
    explicit_catalog.market_name as explicit_market_name,
    explicit_catalog.underlying_product_code as explicit_underlying_product_code,
    explicit_catalog.bbg_exchange_code as explicit_bbg_exchange_code,
    explicit_catalog.default_exchange_name as explicit_default_exchange_name
from trades
left join product_catalog as cusip_catalog
    on trades.is_option
    and (
        (
            upper(trades.cusip) like 'IFEDPMI%'
            and cusip_catalog.product_code = 'PMI'
        )
        or (
            upper(trades.cusip) like 'IFEDP1X%'
            and cusip_catalog.product_code = 'P1X'
        )
    )
left join product_catalog as explicit_catalog
    on cusip_catalog.product_code is null
    and explicit_catalog.product_code = upper(trades.exch_comm_cd_clean)
)

select *
from FINAL
),  __dbt__cte__cs_50_int_rules as (
-- Resolve product matches into canonical rule fields.
--
-- This stage collapses the explicit/CUSIP candidates into one product
-- contract per row and assigns a rule_status that review queries can filter on.

with product_matches as (
    select * from __dbt__cte__cs_40_int_product_matches
),

FINAL as (
    select
    product_matches.*,

    -- Product identity is selected by the priority established in cs_40.
    coalesce(cusip_product_code, explicit_product_code) as product_code,
    coalesce(cusip_product_family, explicit_product_family) as product_family,
    coalesce(cusip_market_name, explicit_market_name) as market_name,

    -- Underlying product is only relevant for option rows.
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
    ) as rule_exchange_name,

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
)

select *
from FINAL
),  __dbt__cte__nav_00_src_positions as (
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
),  __dbt__cte__nav_10_int_clean as (
with positions as (
    select * from __dbt__cte__nav_00_src_positions
),

accounts as (
    select * from __dbt__cte__utils_v2_positions_and_trades_account_lookup
    where source = 'nav'
),

FINAL as (
    select
    positions.*,
    accounts.account_name,
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
),  __dbt__cte__utils_v2_positions_and_trades_product_aliases as (
with product_aliases(
    source_priority,
    source,
    match_type,
    pattern,
    product_code,
    option_type
) as (
    values
        (1, 'nav', 'regex', '^ICE NGAS HH SWG DLY DAY-[0-9]+$', 'HHD', null),
        (2, 'nav', 'exact', 'ICE NGAS HH SWING DAILY', 'HHD', null),
        (3, 'nav', 'exact', 'NATURAL GAS', 'NG', null),
        (4, 'nav', 'exact', 'GLOBEX NATURAL GAS LD', 'HH', null),
        (5, 'nav', 'exact', 'NYMEX HENRY HUB FINANCIAL LDO', 'HH', null),
        (6, 'nav', 'exact', 'NYMEX HENRY HUB NATURAL GAS', 'HP', null),
        (7, 'nav', 'exact', 'HENRY PENULTIMATE NATURAL GAS', 'HP', null),
        (8, 'nav', 'exact', 'NATURAL GAS LD1 FUTURE', 'H', null),
        (9, 'nav', 'exact', 'HENRY HUB NATURAL GAS', 'H', null),
        (10, 'nav', 'exact', 'ICE PHH', 'PHH', null),
        (11, 'nav', 'exact', 'ICE PHE', 'PHE', 'option'),
        (12, 'nav', 'exact', 'ICE HH EQ', 'PHE', 'option'),
        (13, 'nav', 'exact', 'ICE NGAS PEN HENRY HUB', 'PHE', 'option'),
        (14, 'nav', 'exact', 'NYM EUR NATURAL GAS', 'LN', 'option'),
        (15, 'nav', 'exact', 'NATURAL GAS CLEARPORT', 'LN', 'option'),
        (16, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 1', 'LN1', 'option'),
        (17, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 2', 'LN2', 'option'),
        (18, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 3', 'LN3', 'option'),
        (19, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 4', 'LN4', 'option'),
        (20, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 5', 'LN5', 'option'),
        (21, 'nav', 'exact', 'NATURAL GAS 3M CSO', 'G3', 'option'),
        (22, 'nav', 'exact', 'NATURAL GAS FINANCIAL 1M SO', 'G4', 'option'),
        (23, 'nav', 'exact', 'NATURAL GAS 1M CSO', 'G4', 'option'),
        (24, 'nav', 'exact', 'ICE PJM WH RTD', 'PDP', null),
        (25, 'nav', 'exact', 'ICE PWA', 'PWA', null),
        (26, 'nav', 'exact', 'ICE PJMWHPKDAY', 'PDA', null),
        (27, 'nav', 'exact', 'ICE PJL', 'PJL', null),
        (28, 'nav', 'exact', 'ICE PDA', 'PDA', null),
        (29, 'nav', 'exact', 'ICE PJL DAILY', 'PJL', null),
        (30, 'nav', 'regex', '^ICE (PJM MINI|MINIPJMRT|PJM WHREAL TYM PK MINI)([-_][0-9]+)?$', 'PMI', null),
        (31, 'nav', 'exact', 'ICE PJM WHRT PEAK OPT_4096', 'P1X', 'option'),
        (32, 'nav', 'regex', '^ICE PJM OFF PK[-_][0-9]+$', 'OPJ', null),
        (33, 'nav', 'exact', 'ICE ERA', 'ERA', null),
        (34, 'nav', 'exact', 'ERCOT N 345 KV RT PEAK DLY', 'ERN', null),
        (35, 'nav', 'exact', 'ICE END', 'END', null),
        (36, 'nav', 'regex', '^ICE ERCOT NORTH 345KV 7X8[-_][0-9]+$', 'ECI', null),
        (37, 'nav', 'regex', '^(ISO ENG MASS HUB D-PK-[0-9]+|ICE NEPOOL PK MNTH-[0-9]+)$', 'NEP', null),
        (38, 'nav', 'regex', '^ICE SP 15 PEAK([_-][0-9]+)?$', 'SPM', null),
        (39, 'nav', 'regex', '^ICE NP 15 PEAK([_-][0-9]+)?$', 'NPM', null),
        (40, 'nav', 'regex', '^ICE MID-C PEAK([_-][0-9]+)?$', 'MDC', null),
        (41, 'nav', 'exact', 'AB NIT BASIS FUTURE', 'AEC', null),
        (42, 'nav', 'exact', 'ICE ALQCTYGTSW', 'ALQ', null),
        (43, 'nav', 'exact', 'ICE CIG ROCKIES BASIS', 'CRI', null),
        (44, 'nav', 'exact', 'ICE CHICAGO BASIS FUT', 'DGD', null),
        (45, 'nav', 'exact', 'ICE EASTERN GAS SOUTH BASIS FU', 'DOM', null),
        (46, 'nav', 'exact', 'ICE HSC BASIS', 'HXS', null),
        (47, 'nav', 'exact', 'NGPL TXOK BASIS FUTURE', 'NTO', null),
        (48, 'nav', 'exact', 'ICE NGAS NYM NWP RK', 'NWR', null),
        (49, 'nav', 'exact', 'ICE NGAS NYM PG&E', 'PGE', null),
        (50, 'nav', 'exact', 'ICE TETCO SWP', 'TMT', null),
        (51, 'nav', 'exact', 'ICE TRANSCO STATION 85 ZONE 4', 'TRZ', null),
        (52, 'nav', 'exact', 'ICE TCOZN4BASI', 'TRZ', null),
        (53, 'nav', 'exact', 'ICE SDP', 'SDP', null)
),

FINAL as (
    select * from product_aliases
)

select *
from FINAL
),  __dbt__cte__nav_20_int_product_matches as (
with positions as (
    select * from __dbt__cte__nav_10_int_clean
),

product_aliases as (
    select * from __dbt__cte__utils_v2_positions_and_trades_product_aliases
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
),  __dbt__cte__nav_30_int_rules as (
with positions as (
    select * from __dbt__cte__nav_20_int_product_matches
),

product_catalog as (
    select * from __dbt__cte__utils_v2_positions_and_trades_product_catalog
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
    positions.account_name,
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
    positions.source_1_symbol,
    positions.source_3_symbol,
    positions.one_chicago_symbol,
    positions.fas_level,
    positions.option_style,
    positions.created_at,
    positions.updated_at,
    product_catalog.product_code,
    product_catalog.product_family,
    product_catalog.market_name,
    case when positions.is_option then product_catalog.underlying_product_code end as underlying_product_code,
    product_catalog.bbg_exchange_code,
    product_catalog.default_exchange_name,
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
from positions
left join product_catalog
    on product_catalog.product_code = positions.matched_product_code
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
        account_name,
        null::text as account_group,
        account_number as account,
        rule_product as source_product,
        null::text as source_type,
        null::text as month_year,
        null::text as exchange_name,
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
    from __dbt__cte__cs_50_int_rules
    where rule_status <> 'ok'
),

nav_exceptions as (
    select
        'nav' as source,
        nav_date::text as source_date,
        sftp_upload_timestamp,
        fund_code,
        source_file_name,
        source_file_row_number,
        account_name,
        account_group,
        account,
        product as source_product,
        type as source_type,
        month_year,
        exchange_name,
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
    from __dbt__cte__nav_30_int_rules
    where rule_status <> 'ok'
),

FINAL as (
    select * from clear_street_exceptions
    union all
    select * from nav_exceptions
)

select *
from FINAL
order by source, source_date desc, rule_status, source_product