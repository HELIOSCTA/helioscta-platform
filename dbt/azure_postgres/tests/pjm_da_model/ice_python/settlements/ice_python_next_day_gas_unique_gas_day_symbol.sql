{{ config(
    severity = 'error',
    tags = ['pjm_da_model', 'ice_python_next_day_gas']
) }}

with gas_daily as (
    select * from {{ ref('ice_python_next_day_gas') }}
),

duplicates as (
    select
        gas_day,
        symbol,
        count(*) as row_count
    from gas_daily
    group by gas_day, symbol
    having count(*) > 1
)

select *
from duplicates
