with sftp_metadata as (
    select * from {{ ref('nav_ref_excel_sftp_metadata') }}
),

grouped_latest as (
    select * from {{ ref('nav_ref_excel_30_positions_grouped_latest') }}
),

gas_options_pivot_combined as (
    select
        left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2) as yyyy_mm,
        futures_contract_month_y as futures_contract_code,
        exchange_code,
        put_call,
        strike_price,
        bbg_option_description as option_description,
        qty_acim,
        qty_pnt,
        qty_dickson,
        qty_titan,
        qty_total,
        round(settlement_price_total::numeric, 3) as marex_settle,
        round(previous_settlement_price_total::numeric, 3) as previous_marex_settle
    from grouped_latest
    where exchange_code_grouping in ('GAS_OPTIONS')
      and exchange_code in ('LN', 'PHE')
),

gas_options_pivot as (
    select
        yyyy_mm,
        futures_contract_code,
        exchange_code,
        put_call,
        strike_price,
        option_description,
        sum(qty_acim) as acim,
        sum(qty_pnt) as pnt,
        sum(qty_dickson) as dickson,
        sum(qty_titan) as titan,
        sum(qty_total) as qty,
        max(marex_settle) as marex_settle,
        max(previous_marex_settle) as previous_marex_settle
    from gas_options_pivot_combined
    group by
        yyyy_mm,
        futures_contract_code,
        exchange_code,
        put_call,
        strike_price,
        option_description
),

gas_futures_pivot as (
    select * from {{ ref('nav_ref_excel_gas_futures_pivot') }}
),

base_records as (
    select
        1 as excel_output_rank,
        'SFTP_METADATA'::text as excel_output_table,
        row_number() over (order by source) as excel_output_sort_ordinal,
        jsonb_build_object(
            'source', source,
            'sftp_date', sftp_date,
            'sftp_upload_timestamp', sftp_upload_timestamp
        ) as row_payload
    from sftp_metadata

    union all

    select
        2 as excel_output_rank,
        'GAS_OPTIONS_PIVOT'::text as excel_output_table,
        row_number() over (
            order by
                yyyy_mm,
                strike_price,
                put_call
        ) as excel_output_sort_ordinal,
        jsonb_build_object(
            'yyyy_mm', yyyy_mm,
            'futures_contract_code', futures_contract_code,
            'exchange_code', exchange_code,
            'put_call', put_call,
            'strike_price', strike_price,
            'option_description', option_description,
            'acim', acim,
            'pnt', pnt,
            'dickson', dickson,
            'titan', titan,
            'qty', qty,
            'marex_settle', marex_settle,
            'previous_marex_settle', previous_marex_settle
        ) as row_payload
    from gas_options_pivot

    union all

    select
        3 as excel_output_rank,
        'ICE_OPTIONS'::text as excel_output_table,
        row_number() over (
            order by
                sftp_date desc,
                case exchange_code_region when 'PJM' then 1 else 999 end,
                contract_yyyymm,
                null::numeric,
                put_call,
                strike_price
        ) as excel_output_sort_ordinal,
        jsonb_build_object(
            'sftp_date', sftp_date,
            'previous_sftp_date', previous_sftp_date,
            'exchange_code', exchange_code,
            'exchange_code_grouping', exchange_code_grouping,
            'exchange_code_region', exchange_code_region,
            'put_call', put_call,
            'strike_price', strike_price,
            'marex_delta', null::numeric,
            'previous_marex_delta', null::numeric,
            'yyyy_mm', left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2),
            'futures_contract_code', futures_contract_month_yy,
            'marex_description', marex_description,
            'ice_xl_symbol', ice_xl_symbol,
            'ice_lots', lots,
            'qty', qty_total,
            'dod_qty', dod_qty_total,
            'acim', qty_acim,
            'pnt', qty_pnt,
            'dickson', qty_dickson,
            'titan', qty_titan,
            'marex_settle', round(settlement_price_total::numeric, 3),
            'previous_marex_settle', round(previous_settlement_price_total::numeric, 3),
            'change_between_settles', round(daily_change_total::numeric, 3),
            'pnl_from_settles', round(daily_pnl_total::numeric, 0)
        ) as row_payload
    from grouped_latest
    where exchange_code_grouping in ('POWER_OPTIONS')
      and exchange_code in ('PMI')

    union all

    select
        4 as excel_output_rank,
        'ICE_FUTURES'::text as excel_output_table,
        row_number() over (
            order by
                sftp_date desc,
                case exchange_code_region when 'PJM' then 1 else 999 end,
                contract_yyyymm,
                null::numeric,
                put_call,
                strike_price
        ) as excel_output_sort_ordinal,
        jsonb_build_object(
            'sftp_date', sftp_date,
            'previous_sftp_date', previous_sftp_date,
            'expiration_date', null::date,
            'dte', null::numeric,
            'exchange_code', exchange_code,
            'exchange_code_grouping', exchange_code_grouping,
            'exchange_code_region', exchange_code_region,
            'put_call', put_call,
            'strike_price', strike_price,
            'marex_delta', null::numeric,
            'previous_marex_delta', null::numeric,
            'yyyy_mm', left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2),
            'futures_contract_code', futures_contract_month_yy,
            'marex_description', marex_description,
            'ice_xl_symbol', ice_xl_symbol,
            'ice_lots', lots,
            'qty', qty_total,
            'dod_qty', dod_qty_total,
            'acim', qty_acim,
            'pnt', qty_pnt,
            'dickson', qty_dickson,
            'titan', qty_titan,
            'marex_settle', round(settlement_price_total::numeric, 3),
            'previous_marex_settle', round(previous_settlement_price_total::numeric, 3),
            'change_between_settles', round(daily_change_total::numeric, 3),
            'pnl_from_settles', round(daily_pnl_total::numeric, 0)
        ) as row_payload
    from grouped_latest
    where exchange_code_grouping in ('POWER_FUTURES')
      and exchange_code in ('PMI')

    union all

    select
        5 as excel_output_rank,
        'ICE_SETTLES'::text as excel_output_table,
        row_number() over (
            order by
                sftp_date desc,
                case exchange_code_grouping
                    when 'POWER_OPTIONS' then 1
                    when 'POWER_FUTURES' then 2
                    when 'BASIS' then 3
                    else 999
                end,
                case exchange_code_region
                    when 'PJM' then 1
                    when 'ERCOT' then 2
                    when 'BASIS' then 3
                    else 999
                end,
                case exchange_code
                    when 'PMI' then 1
                    when 'OPJ' then 2
                    when 'ERN' then 3
                    when 'ECI' then 4
                    else 999
                end,
                contract_yyyymm,
                null::numeric
        ) as excel_output_sort_ordinal,
        jsonb_build_object(
            'sftp_date', sftp_date,
            'previous_sftp_date', previous_sftp_date,
            'expiration_date', null::date,
            'dte', null::numeric,
            'exchange_code', exchange_code,
            'exchange_code_grouping', exchange_code_grouping,
            'exchange_code_region', exchange_code_region,
            'yyyy_mm', left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2),
            'marex_description', marex_description,
            'ice_xl_symbol', ice_xl_symbol,
            'ice_lots', lots,
            'qty', qty_total,
            'dod_qty', dod_qty_total,
            'acim', qty_acim,
            'pnt', qty_pnt,
            'dickson', qty_dickson,
            'titan', qty_titan,
            'marex_settle', round(settlement_price_total::numeric, 3),
            'previous_marex_settle', round(previous_settlement_price_total::numeric, 3),
            'change_between_settles', round(daily_change_total::numeric, 3),
            'pnl_from_settles', round(daily_pnl_total::numeric, 0)
        ) as row_payload
    from grouped_latest
    where exchange_code_grouping in ('POWER_FUTURES', 'POWER_OPTIONS', 'BASIS')
      and exchange_code not in ('PDA')

    union all

    select
        6 as excel_output_rank,
        'ICE_BALDAY'::text as excel_output_table,
        row_number() over (
            order by
                sftp_date desc,
                contract_yyyymmdd,
                exchange_code,
                case exchange_code_region when 'PJM' then 1 else 999 end,
                daily_contract_business_offset_days
        ) as excel_output_sort_ordinal,
        jsonb_build_object(
            'sftp_date', sftp_date,
            'previous_sftp_date', previous_sftp_date,
            'expiration_date', contract_yyyymmdd,
            'dte', daily_contract_business_offset_days::numeric,
            'exchange_code', exchange_code,
            'exchange_code_grouping', exchange_code_grouping,
            'exchange_code_region', exchange_code_region,
            'yyyy_mm', left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2),
            'contract_yyyymmdd', contract_yyyymmdd,
            'marex_description', marex_description,
            'ice_xl_symbol', ice_xl_symbol,
            'ice_lots', lots,
            'qty', qty_total,
            'dod_qty', dod_qty_total,
            'acim', qty_acim,
            'pnt', qty_pnt,
            'dickson', qty_dickson,
            'titan', qty_titan,
            'marex_settle', round(settlement_price_total::numeric, 3),
            'previous_marex_settle', round(previous_settlement_price_total::numeric, 3),
            'change_between_settles', round(daily_change_total::numeric, 3),
            'pnl_from_settles', round(daily_pnl_total::numeric, 0)
        ) as row_payload
    from grouped_latest
    where route_family = 'ice'
      and not is_option
      and exchange_code_grouping = 'SHORT_TERM_POWER'
      and contract_yyyymmdd is not null
      and (
        daily_contract_business_offset_days >= -1
        or daily_contract_business_offset_days is null
      )

    union all

    select
        7 as excel_output_rank,
        'GAS_OPTIONS'::text as excel_output_table,
        row_number() over (
            order by
                sftp_date desc,
                left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2),
                exchange_code,
                999,
                put_call,
                strike_price
        ) as excel_output_sort_ordinal,
        jsonb_build_object(
            'sftp_date', sftp_date,
            'previous_sftp_date', previous_sftp_date,
            'expiration_date', null::date,
            'dte', 999,
            'exchange_code', exchange_code,
            'put_call', put_call,
            'strike_price', strike_price,
            'marex_delta', null::numeric,
            'previous_marex_delta', null::numeric,
            'yyyy_mm', left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2),
            'futures_contract_code', futures_contract_month_y,
            'marex_description', marex_description,
            'cme_excel_symbol', cme_excel_symbol,
            'cme_gas_lots', lots,
            'qty', qty_total,
            'dod_qty', dod_qty_total,
            'acim', qty_acim,
            'pnt', qty_pnt,
            'dickson', qty_dickson,
            'titan', qty_titan,
            'marex_settle', round(settlement_price_total::numeric, 3),
            'previous_marex_settle', round(previous_settlement_price_total::numeric, 3),
            'change_between_settles', round(daily_change_total::numeric, 3),
            'pnl_from_settles', round(daily_pnl_total::numeric, 0)
        ) as row_payload
    from grouped_latest
    where exchange_code_grouping in ('GAS_OPTIONS')
      and exchange_code in ('LN', 'PHE')
      and left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2) > '202602'

    union all

    select
        8 as excel_output_rank,
        'GAS_FUTURES'::text as excel_output_table,
        row_number() over (
            order by
                sftp_date desc,
                left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2),
                exchange_code,
                null::numeric
        ) as excel_output_sort_ordinal,
        jsonb_build_object(
            'sftp_date', sftp_date,
            'previous_sftp_date', previous_sftp_date,
            'expiration_date', null::date,
            'dte', null::numeric,
            'exchange_code', exchange_code,
            'yyyy_mm', left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2),
            'futures_contract_code', futures_contract_month_y,
            'marex_description', marex_description,
            'cme_excel_symbol', cme_excel_symbol,
            'cme_gas_lots', lots,
            'qty', qty_total,
            'dod_qty', dod_qty_total,
            'acim', qty_acim,
            'pnt', qty_pnt,
            'dickson', qty_dickson,
            'titan', qty_titan,
            'marex_settle', round(settlement_price_total::numeric, 3),
            'previous_marex_settle', round(previous_settlement_price_total::numeric, 3),
            'change_between_settles', round(daily_change_total::numeric, 3),
            'pnl_from_settles', round(daily_pnl_total::numeric, 0)
        ) as row_payload
    from grouped_latest
    where exchange_code_grouping in ('GAS_FUTURES')

    union all

    select
        9 as excel_output_rank,
        'GAS_BALMO'::text as excel_output_table,
        row_number() over (
            order by
                sftp_date desc,
                left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2) || '-' || contract_day,
                exchange_code,
                null::numeric
        ) as excel_output_sort_ordinal,
        jsonb_build_object(
            'sftp_date', sftp_date,
            'previous_sftp_date', previous_sftp_date,
            'expiration_date', null::date,
            'dte', null::numeric,
            'exchange_code', exchange_code,
            'yyyy_mm', left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2) || '-' || contract_day,
            'marex_description', marex_description,
            'ice_xl_symbol', ice_xl_symbol,
            'cme_gas_lots', lots,
            'qty', qty_total,
            'dod_qty', dod_qty_total,
            'acim', qty_acim,
            'pnt', qty_pnt,
            'dickson', qty_dickson,
            'titan', qty_titan,
            'marex_settle', round(settlement_price_total::numeric, 3),
            'previous_marex_settle', round(previous_settlement_price_total::numeric, 3),
            'change_between_settles', round(daily_change_total::numeric, 3),
            'pnl_from_settles', round(daily_pnl_total::numeric, 0)
        ) as row_payload
    from grouped_latest
    where exchange_code_grouping in ('BALMO')
      and exchange_code in ('HHD')
      and contract_yyyymmdd >= current_date

    union all

    select
        10 as excel_output_rank,
        'GAS_OPTIONS_OTHER'::text as excel_output_table,
        row_number() over (
            order by
                sftp_date desc,
                left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2),
                exchange_code,
                null::numeric,
                put_call,
                strike_price
        ) as excel_output_sort_ordinal,
        jsonb_build_object(
            'sftp_date', sftp_date,
            'previous_sftp_date', previous_sftp_date,
            'expiration_date', null::date,
            'dte', null::numeric,
            'exchange_code', exchange_code,
            'put_call', put_call,
            'strike_price', strike_price,
            'marex_delta', null::numeric,
            'previous_marex_delta', null::numeric,
            'yyyy_mm', left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2),
            'marex_description', marex_description,
            'cme_excel_symbol', cme_excel_symbol,
            'cme_gas_lots', lots,
            'qty', qty_total,
            'dod_qty', dod_qty_total,
            'acim', qty_acim,
            'pnt', qty_pnt,
            'dickson', qty_dickson,
            'titan', qty_titan,
            'marex_settle', round(settlement_price_total::numeric, 3),
            'previous_marex_settle', round(previous_settlement_price_total::numeric, 3),
            'change_between_settles', round(daily_change_total::numeric, 3),
            'pnl_from_settles', round(daily_pnl_total::numeric, 0)
        ) as row_payload
    from grouped_latest
    where exchange_code_grouping in ('GAS_OPTIONS')
      and exchange_code not in ('LN', 'PHE')

    union all

    select
        11 as excel_output_rank,
        'GAS_FUTURES_PIVOT'::text as excel_output_table,
        row_number() over (
            order by
                sftp_date desc,
                contract_yyyymm,
                exchange_code,
                account
        ) as excel_output_sort_ordinal,
        to_jsonb(gas_futures_pivot.*) as row_payload
    from gas_futures_pivot
),

FINAL as (
    select
        base_records.excel_output_rank,
        base_records.excel_output_table,
        base_records.excel_output_sort_ordinal,
        fields.*
    from base_records
    cross join lateral jsonb_to_record(base_records.row_payload) as fields(
        source text,
        sftp_date date,
        sftp_upload_timestamp timestamp,
        previous_sftp_date date,
        expiration_date date,
        dte numeric,
        exchange_code text,
        exchange_code_grouping text,
        exchange_code_region text,
        put_call text,
        strike_price double precision,
        marex_delta numeric,
        previous_marex_delta numeric,
        yyyy_mm text,
        contract_yyyymmdd date,
        futures_contract_code text,
        marex_description text,
        ice_xl_symbol text,
        ice_lots double precision,
        cme_excel_symbol text,
        cme_gas_lots double precision,
        option_description text,
        qty double precision,
        dod_qty double precision,
        acim double precision,
        pnt double precision,
        dickson double precision,
        titan double precision,
        marex_settle numeric,
        previous_marex_settle numeric,
        change_between_settles numeric,
        pnl_from_settles numeric,
        source_table text,
        reference_number text,
        account text,
        source_account_key text,
        account_code text,
        account_lookup_status text,
        source_exchange_name text,
        exchange_name text,
        exchange_route_code text,
        route_family text,
        is_product_record boolean,
        is_option boolean,
        contract_yyyymm text,
        contract_year integer,
        contract_month integer,
        contract_day integer,
        trade_date date,
        last_trade_date date,
        nav_product text,
        buy_sell text,
        lots double precision,
        settlement_price double precision,
        trade_price double precision,
        market_value double precision,
        last_trade_date_filled date,
        marex_delta_filled numeric,
        account_name text,
        days_to_expiry numeric,
        gas_qty double precision,
        gas_lots double precision,
        futures_contract_month text,
        futures_contract_month_y text,
        futures_contract_month_yy text,
        exchange_code_underlying text,
        bbg_exchange_code text,
        ice_xl_symbol_underlying text,
        bbg_symbol text,
        bbg_option_description text
    )
)

select *
from FINAL
order by excel_output_rank, excel_output_sort_ordinal
