{{
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select * from {{ source('meteologica', 'usa_pjm_western_hub_da_power_price_forecast_hourly') }}
),

FINAL as (
    select
        content_id,
        content_name,
        update_id,
        issue_date,
        source_timezone,
        source_unit,
        forecast_period_start,
        forecast_period_end,
        day_ahead_price::float8 as day_ahead_price,
        updated_at
    from source_rows
)

select *
from FINAL
