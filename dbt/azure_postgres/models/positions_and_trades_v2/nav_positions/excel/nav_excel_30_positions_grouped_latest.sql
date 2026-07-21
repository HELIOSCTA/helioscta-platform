with grouped_positions as (
    select * from {{ ref('nav_excel_20_positions_grouped') }}
),

latest_dates as (
    select
        max(sftp_date) as latest_date_positions,
        min(sftp_date) as second_latest_date_positions
    from (
        select distinct sftp_date
        from grouped_positions
        order by sftp_date desc
        limit 2
    ) as latest_two_dates
),

latest_two_dates as (
    select grouped_positions.*
    from grouped_positions
    where sftp_date::date >= (select second_latest_date_positions::date from latest_dates)
),

with_previous_measures as (
    select
        lag(sftp_date, 1) over (
            partition by position_group_key
            order by sftp_date
        ) as previous_sftp_date,
        lag(settlement_price_total, 1) over (
            partition by position_group_key
            order by sftp_date
        ) as previous_settlement_price_total,
        lag(qty_total, 1) over (
            partition by position_group_key
            order by sftp_date
        ) as previous_qty_total,
        latest_two_dates.*
    from latest_two_dates
),

with_pnl as (
    select
        sftp_date,
        previous_sftp_date,
        exchange_name,
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
        marex_description,
        ice_xl_symbol,
        cme_excel_symbol,
        bbg_option_description,
        lots,
        settlement_price_total,
        previous_settlement_price_total,
        trade_price_total,
        qty_total,
        qty_acim,
        qty_pnt,
        qty_dickson,
        qty_titan,
        previous_qty_total,
        case
            when previous_qty_total is not null then qty_total - previous_qty_total
        end as dod_qty_total,
        case
            when previous_sftp_date is not null then settlement_price_total - previous_settlement_price_total
            when previous_sftp_date is null and trade_price_total is not null then settlement_price_total - trade_price_total
        end as daily_change_total,
        case
            when previous_sftp_date is not null then (settlement_price_total - previous_settlement_price_total) * qty_total * lots
            when previous_sftp_date is null and trade_price_total is not null then (settlement_price_total - trade_price_total) * qty_total * lots
        end as daily_pnl_total
    from with_previous_measures
    where sftp_date::date = (select latest_date_positions::date from latest_dates)
),

FINAL as (
    select
        sftp_date,
        previous_sftp_date,
        exchange_name,
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
        marex_description,
        ice_xl_symbol,
        cme_excel_symbol,
        bbg_option_description,
        lots,
        round(daily_pnl_total::numeric, 3)::double precision as daily_pnl_total,
        round(settlement_price_total::numeric, 3)::double precision as settlement_price_total,
        round(previous_settlement_price_total::numeric, 3)::double precision as previous_settlement_price_total,
        round(daily_change_total::numeric, 3)::double precision as daily_change_total,
        qty_total,
        previous_qty_total,
        dod_qty_total,
        qty_acim,
        qty_pnt,
        qty_dickson,
        qty_titan
    from with_pnl
)

select *
from FINAL
order by
    sftp_date desc,
    contract_yyyymm,
    contract_yyyymmdd,
    marex_description
