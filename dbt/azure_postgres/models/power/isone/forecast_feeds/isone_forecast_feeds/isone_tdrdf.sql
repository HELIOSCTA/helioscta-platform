{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('src_isone_tdrdf') }}
