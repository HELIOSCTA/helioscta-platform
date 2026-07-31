{{-
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select *
    from {{ source('pjm', 'hourly_wind_power_forecast') }}
),

FINAL as (
    select *
    from source_rows
)

select *
from FINAL
