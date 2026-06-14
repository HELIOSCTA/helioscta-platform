{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_isone_lmps_rt_final_daily') }}
