{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_pjm_rt_dispatch_reserves') }}
