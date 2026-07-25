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
), positions as (
    select * from __dbt__cte__nav_ref_00_src_positions
),

latest_nav_date_by_fund as (
    select
        fund_code,
        max(nav_date)::date as sftp_date
    from positions
    group by fund_code
),

metadata as (
    select
        case
            when lower(positions.fund_code) = 'agr' then 'NAV - ACIM'
            when lower(positions.fund_code) = 'pnt' then 'NAV - PNT'
            when lower(positions.fund_code) = 'moross' then 'NAV - DICKSON'
            when lower(positions.fund_code) = 'titan' then 'NAV - TITAN'
            else 'NAV - ' || upper(positions.fund_code)
        end as source,
        latest_nav_date_by_fund.sftp_date,
        max(positions.sftp_upload_timestamp) as sftp_upload_timestamp
    from positions
    inner join latest_nav_date_by_fund
        on latest_nav_date_by_fund.fund_code = positions.fund_code
       and latest_nav_date_by_fund.sftp_date = positions.nav_date::date
    group by positions.fund_code, latest_nav_date_by_fund.sftp_date
),

FINAL as (
    select * from metadata
)

select *
from FINAL
order by source