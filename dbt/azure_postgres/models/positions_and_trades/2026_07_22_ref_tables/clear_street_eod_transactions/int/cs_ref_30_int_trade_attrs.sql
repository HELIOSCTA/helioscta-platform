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

with_clear_street_row_family as (
    select
    with_trade_flags.*,

    -- Clear Street allocation rows carry the child account in give_in_out_firm_num.
    -- Blank-give T/_E and P rows are parent/mirror evidence, not allocations.
    case
        when upper(coalesce(with_trade_flags.record_id_clean, '')) = 'T'
            and upper(coalesce(with_trade_flags.give_in_out_code_clean, '')) = 'GO'
            and with_trade_flags.give_in_out_firm_num_clean is not null
            and upper(coalesce(with_trade_flags.trade_type_clean, '')) = 'G'
        then 'allocation_give_out'
        when upper(coalesce(with_trade_flags.record_id_clean, '')) = 'T'
            and with_trade_flags.give_in_out_code_clean is null
            and with_trade_flags.give_in_out_firm_num_clean is null
            and upper(coalesce(with_trade_flags.open_close_code_clean, '')) = 'O'
            and right(coalesce(with_trade_flags.trace_num_or_unique_identifier_clean, ''), 2) = '_E'
        then 'parent_execution_total'
        when upper(coalesce(with_trade_flags.record_id_clean, '')) = 'P'
            and with_trade_flags.give_in_out_code_clean is null
            and with_trade_flags.give_in_out_firm_num_clean is null
        then 'parent_position_mirror'
        when upper(coalesce(with_trade_flags.record_id_clean, '')) = 'A'
        then 'adjustment'
        else 'other'
    end as clear_street_row_family
    from with_trade_flags
),

allocation_order_totals as (
    select
        trade_date_from_sftp,
        sftp_upload_timestamp,
        account_number_clean,
        futures_code_clean,
        contract_year_month,
        prompt_day,
        put_call_code,
        strike_price,
        trade_price,
        order_number_clean,
        buy_sell_clean,
        count(*) as allocation_total_group_rows,
        sum(quantity) as allocation_total_group_qty
    from with_clear_street_row_family
    where clear_street_row_family = 'allocation_give_out'
    group by
        trade_date_from_sftp,
        sftp_upload_timestamp,
        account_number_clean,
        futures_code_clean,
        contract_year_month,
        prompt_day,
        put_call_code,
        strike_price,
        trade_price,
        order_number_clean,
        buy_sell_clean
),

same_order_position_totals as (
    select
        trade_date_from_sftp,
        sftp_upload_timestamp,
        account_number_clean,
        futures_code_clean,
        contract_year_month,
        prompt_day,
        put_call_code,
        strike_price,
        trade_price,
        order_number_clean,
        buy_sell_clean,
        count(*) as position_total_rows,
        sum(quantity) as position_total_qty
    from with_clear_street_row_family
    where clear_street_row_family = 'parent_position_mirror'
    group by
        trade_date_from_sftp,
        sftp_upload_timestamp,
        account_number_clean,
        futures_code_clean,
        contract_year_month,
        prompt_day,
        put_call_code,
        strike_price,
        trade_price,
        order_number_clean,
        buy_sell_clean
),

opposite_signature_execution_totals as (
    select
        trade_date_from_sftp,
        sftp_upload_timestamp,
        futures_code_clean,
        contract_year_month,
        prompt_day,
        put_call_code,
        strike_price,
        trade_price,
        buy_sell_clean,
        count(*) as execution_total_rows,
        sum(quantity) as execution_total_qty
    from with_clear_street_row_family
    where clear_street_row_family = 'parent_execution_total'
    group by
        trade_date_from_sftp,
        sftp_upload_timestamp,
        futures_code_clean,
        contract_year_month,
        prompt_day,
        put_call_code,
        strike_price,
        trade_price,
        buy_sell_clean
),

allocation_total_audit as (
    select
        allocation_order_totals.*,
        case
            when allocation_order_totals.allocation_total_group_qty = same_order_position_totals.position_total_qty
            then 'matched'
            when allocation_order_totals.allocation_total_group_qty = opposite_signature_execution_totals.execution_total_qty
            then 'matched'
            when same_order_position_totals.position_total_qty is null
                and opposite_signature_execution_totals.execution_total_qty is null
            then 'missing_total'
            else 'quantity_mismatch'
        end as allocation_total_match_status,
        case
            when allocation_order_totals.allocation_total_group_qty = same_order_position_totals.position_total_qty
            then 'same_order_position_total'
            when allocation_order_totals.allocation_total_group_qty = opposite_signature_execution_totals.execution_total_qty
            then 'opposite_signature_execution_total'
        end as allocation_total_match_source,
        case
            when allocation_order_totals.allocation_total_group_qty = same_order_position_totals.position_total_qty
            then same_order_position_totals.position_total_qty
            when allocation_order_totals.allocation_total_group_qty = opposite_signature_execution_totals.execution_total_qty
            then opposite_signature_execution_totals.execution_total_qty
        end as allocation_total_match_qty,
        case
            when allocation_order_totals.allocation_total_group_qty = same_order_position_totals.position_total_qty
            then same_order_position_totals.position_total_rows
            when allocation_order_totals.allocation_total_group_qty = opposite_signature_execution_totals.execution_total_qty
            then opposite_signature_execution_totals.execution_total_rows
        end as allocation_total_match_rows
    from allocation_order_totals
    left join same_order_position_totals
        on same_order_position_totals.trade_date_from_sftp = allocation_order_totals.trade_date_from_sftp
       and same_order_position_totals.sftp_upload_timestamp = allocation_order_totals.sftp_upload_timestamp
       and same_order_position_totals.account_number_clean is not distinct from allocation_order_totals.account_number_clean
       and same_order_position_totals.futures_code_clean is not distinct from allocation_order_totals.futures_code_clean
       and same_order_position_totals.contract_year_month is not distinct from allocation_order_totals.contract_year_month
       and same_order_position_totals.prompt_day is not distinct from allocation_order_totals.prompt_day
       and same_order_position_totals.put_call_code is not distinct from allocation_order_totals.put_call_code
       and same_order_position_totals.strike_price is not distinct from allocation_order_totals.strike_price
       and same_order_position_totals.trade_price is not distinct from allocation_order_totals.trade_price
       and same_order_position_totals.order_number_clean is not distinct from allocation_order_totals.order_number_clean
       and same_order_position_totals.buy_sell_clean is not distinct from allocation_order_totals.buy_sell_clean
    left join opposite_signature_execution_totals
        on opposite_signature_execution_totals.trade_date_from_sftp = allocation_order_totals.trade_date_from_sftp
       and opposite_signature_execution_totals.sftp_upload_timestamp = allocation_order_totals.sftp_upload_timestamp
       and opposite_signature_execution_totals.futures_code_clean is not distinct from allocation_order_totals.futures_code_clean
       and opposite_signature_execution_totals.contract_year_month is not distinct from allocation_order_totals.contract_year_month
       and opposite_signature_execution_totals.prompt_day is not distinct from allocation_order_totals.prompt_day
       and opposite_signature_execution_totals.put_call_code is not distinct from allocation_order_totals.put_call_code
       and opposite_signature_execution_totals.strike_price is not distinct from allocation_order_totals.strike_price
       and opposite_signature_execution_totals.trade_price is not distinct from allocation_order_totals.trade_price
       and opposite_signature_execution_totals.buy_sell_clean = case
            when allocation_order_totals.buy_sell_clean = '1' then '2'
            when allocation_order_totals.buy_sell_clean = '2' then '1'
            else allocation_order_totals.buy_sell_clean
       end
),

with_allocation_total_audit as (
    select
        with_clear_street_row_family.*,
        allocation_total_audit.allocation_total_group_qty,
        allocation_total_audit.allocation_total_group_rows,
        allocation_total_audit.allocation_total_match_status,
        allocation_total_audit.allocation_total_match_source,
        allocation_total_audit.allocation_total_match_qty,
        allocation_total_audit.allocation_total_match_rows
    from with_clear_street_row_family
    left join allocation_total_audit
        on with_clear_street_row_family.clear_street_row_family = 'allocation_give_out'
       and allocation_total_audit.trade_date_from_sftp = with_clear_street_row_family.trade_date_from_sftp
       and allocation_total_audit.sftp_upload_timestamp = with_clear_street_row_family.sftp_upload_timestamp
       and allocation_total_audit.account_number_clean is not distinct from with_clear_street_row_family.account_number_clean
       and allocation_total_audit.futures_code_clean is not distinct from with_clear_street_row_family.futures_code_clean
       and allocation_total_audit.contract_year_month is not distinct from with_clear_street_row_family.contract_year_month
       and allocation_total_audit.prompt_day is not distinct from with_clear_street_row_family.prompt_day
       and allocation_total_audit.put_call_code is not distinct from with_clear_street_row_family.put_call_code
       and allocation_total_audit.strike_price is not distinct from with_clear_street_row_family.strike_price
       and allocation_total_audit.trade_price is not distinct from with_clear_street_row_family.trade_price
       and allocation_total_audit.order_number_clean is not distinct from with_clear_street_row_family.order_number_clean
       and allocation_total_audit.buy_sell_clean is not distinct from with_clear_street_row_family.buy_sell_clean
),

FINAL as (
    select
    with_allocation_total_audit.*,
    case
        when nullif(trim(with_allocation_total_audit.give_in_out_firm_num_clean), '') is not null
        then with_allocation_total_audit.give_in_out_firm_num_clean
        when account_number_accounts.account_name is not null
        then with_allocation_total_audit.account_number_clean
    end as source_account_key,
    coalesce(give_in_out_accounts.account_name, account_number_accounts.account_name) as account_code,
    coalesce(give_in_out_accounts.account_name, account_number_accounts.account_name) as account_name,
    case
        when coalesce(give_in_out_accounts.account_name, account_number_accounts.account_name) = 'GHELI'
        then 'HELIOS Parent'
        else coalesce(give_in_out_accounts.account_name, account_number_accounts.account_name)
    end as account_display_name,
    case
        when coalesce(give_in_out_accounts.account_name, account_number_accounts.account_name) = 'GHELI'
        then 'parent'
        when coalesce(give_in_out_accounts.account_name, account_number_accounts.account_name) is not null
        then 'allocated'
    end as account_role,
    case
        when coalesce(give_in_out_accounts.account_name, account_number_accounts.account_name) is not null then 'matched'
        when nullif(trim(with_allocation_total_audit.give_in_out_firm_num_clean), '') is null then 'missing_source_account'
        else 'unmapped'
    end as account_lookup_status,
    with_allocation_total_audit.exchange_name as source_exchange_name,
    not with_allocation_total_audit.is_non_product_cash_adjustment as is_product_record,

    -- Prefer the explicit security description, falling back to instrument/symbol.
    coalesce(
        with_allocation_total_audit.security_description_clean,
        with_allocation_total_audit.instrument_description_clean,
        with_allocation_total_audit.symbol_clean
    ) as rule_product,

    -- Upper/space-normalized product text is kept for diagnostics and review.
    nullif(
        upper(regexp_replace(coalesce(
            with_allocation_total_audit.security_description_clean,
            with_allocation_total_audit.instrument_description_clean,
            with_allocation_total_audit.symbol_clean,
            ''
        ), '[[:space:]]+', ' ', 'g')),
        ''
    ) as rule_product_norm,

    -- Clear Street side codes: 1 = buy, 2 = sell.
    case
        when with_allocation_total_audit.buy_sell_clean ~ '^\d+$' and with_allocation_total_audit.buy_sell_clean::integer = 1 then 'B'
        when with_allocation_total_audit.buy_sell_clean ~ '^\d+$' and with_allocation_total_audit.buy_sell_clean::integer = 2 then 'S'
    end as buy_sell_cleaned,

    -- Signed quantity lets grouped views sum buys and sells directly.
    case
        when with_allocation_total_audit.buy_sell_clean ~ '^\d+$' and with_allocation_total_audit.buy_sell_clean::integer = 1 then with_allocation_total_audit.quantity
        when with_allocation_total_audit.buy_sell_clean ~ '^\d+$' and with_allocation_total_audit.buy_sell_clean::integer = 2 then -1 * with_allocation_total_audit.quantity
    end as quantity_cleaned,
    case
        when with_allocation_total_audit.strike_price is not null and with_allocation_total_audit.strike_price <> 0
        then round(with_allocation_total_audit.strike_price::numeric, 3)::double precision
    end as strike_price_normalized
from with_allocation_total_audit
left join accounts as give_in_out_accounts
    on with_allocation_total_audit.give_in_out_firm_num_clean = give_in_out_accounts.account
left join accounts as account_number_accounts
    on nullif(trim(with_allocation_total_audit.give_in_out_firm_num_clean), '') is null
   and with_allocation_total_audit.account_number_clean = account_number_accounts.account
)

select *
from FINAL
