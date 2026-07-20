-- Trade attributes used by account, option, and product-rule logic.
--
-- This stage adds business-facing helpers that are not raw source fields:
-- account names, normalized buy/sell quantities, option side/type indicators,
-- exchange-name normalization, and source product text for review diagnostics.

with trades as (
    select * from {{ ref('cs_20_int_contracts') }}
),

accounts as (
    select * from {{ ref('utils_v2_positions_and_trades_account_lookup') }}
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
)

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
