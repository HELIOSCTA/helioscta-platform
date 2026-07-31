{{-
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select *
    from {{ source('weather', 'wsi_hourly_forecasts') }}
),

FINAL as (
    select *
    from source_rows
)

select *
from FINAL
