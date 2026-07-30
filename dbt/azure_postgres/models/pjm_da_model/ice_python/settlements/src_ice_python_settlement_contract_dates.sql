{{
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select * from {{ source('ice_python', 'settlement_contract_dates') }}
),

FINAL as (
    select
        trade_date,
        symbol,
        strip,
        start_date,
        end_date,
        created_at,
        updated_at
    from source_rows
)

select *
from FINAL
