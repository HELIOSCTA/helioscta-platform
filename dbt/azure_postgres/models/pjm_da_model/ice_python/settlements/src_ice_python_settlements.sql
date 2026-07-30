{{
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select * from {{ source('ice_python', 'settlements') }}
),

FINAL as (
    select
        trade_date,
        symbol,
        settlement,
        open,
        high,
        low,
        close,
        vwap_close,
        volume,
        open_interest,
        created_at,
        updated_at
    from source_rows
)

select *
from FINAL
