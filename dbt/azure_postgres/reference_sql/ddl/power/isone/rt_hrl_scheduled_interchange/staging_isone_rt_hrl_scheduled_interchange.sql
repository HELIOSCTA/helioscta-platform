{{
  config(
    materialized='ephemeral'
  )
}}

SELECT
    local_date
    ,local_hour_ending
    ,(
        local_date::timestamp
        + ((local_hour_ending - 1) * INTERVAL '1 hour')
    ) AS datetime_beginning_local
    ,(
        local_date::timestamp
        + (local_hour_ending * INTERVAL '1 hour')
    ) AS datetime_ending_local
    ,interface_name
    ,actual_interchange
    ,purchases
    ,sales
FROM {{ ref('source_isone_rt_hrl_scheduled_interchange') }}
