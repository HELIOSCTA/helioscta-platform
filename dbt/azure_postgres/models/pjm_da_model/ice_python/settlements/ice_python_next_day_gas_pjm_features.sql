{{-
  config(
    materialized='ephemeral'
  )
}}

with gas_daily as (
    select
        gas_day,
        trade_date,
        symbol,
        gas_price,
        latest_trade_date,
        updated_at,
        contract_dates_updated_at
    from {{ ref('ice_python_next_day_gas') }}
    where symbol in (
        'XGF D1-IPG',
        'XZR D1-IPG',
        'XIZ D1-IPG',
        'XWK D1-IPG',
        'XJL D1-IPG'
    )
),

FINAL as (
    select
        gas_day,
        trade_date,
        max(case when symbol = 'XGF D1-IPG' then gas_price end)::float8 as gas_henry_hub,
        max(case when symbol = 'XZR D1-IPG' then gas_price end)::float8 as gas_m3,
        max(case when symbol = 'XIZ D1-IPG' then gas_price end)::float8 as gas_tco,
        max(case when symbol = 'XWK D1-IPG' then gas_price end)::float8 as gas_tz6,
        max(case when symbol = 'XJL D1-IPG' then gas_price end)::float8 as gas_dom_south,
        max(latest_trade_date) as latest_trade_date,
        max(updated_at) as updated_at,
        max(contract_dates_updated_at) as contract_dates_updated_at
    from gas_daily
    group by gas_day, trade_date
)

select *
from FINAL
order by gas_day
