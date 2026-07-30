{{ config(
    severity = 'error',
    tags = ['pjm_da_model', 'ice_python_next_day_gas']
) }}

with gas_daily as (
    select * from {{ ref('ice_python_next_day_gas') }}
),

failing_rows as (
    select
        gas_day,
        trade_date,
        symbol,
        hub_name,
        region,
        sort_index,
        gas_price,
        price_basis,
        latest_trade_date,
        updated_at
    from gas_daily
    where gas_day is null
       or symbol is null
       or gas_price is null
)

select *
from failing_rows
