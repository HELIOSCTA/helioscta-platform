{{-
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select *
    from {{ source('meteologica', 'pjm_forecast_hourly') }}
),

FINAL as (
    select *
    from source_rows
)

select *
from FINAL
