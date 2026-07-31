{{-
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select *
    from {{ source('pjm', 'five_min_solar_generation') }}
),

FINAL as (
    select *
    from source_rows
)

select *
from FINAL
