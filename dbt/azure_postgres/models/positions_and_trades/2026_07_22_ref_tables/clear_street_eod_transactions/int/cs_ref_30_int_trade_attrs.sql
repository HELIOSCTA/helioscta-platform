-- Trade attributes used by account, option, and product-rule logic.
--
-- This stage adds business-facing helpers that are not raw source fields:
-- account names, normalized buy/sell quantities, option side/type indicators,
-- exchange-name normalization, and source product text for review diagnostics.

with trades as (
    select * from {{ ref('cs_ref_20_int_contracts') }}
),

accounts as (
    select * from {{ ref('utils_ref_positions_and_trades_account_lookup') }}
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
