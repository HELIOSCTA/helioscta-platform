{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_isone_rt_hrl_scheduled_interchange') }}
