{{-
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select *
    from {{ source('pjm', 'load_frcstd_7_day') }}
),

FINAL as (
    select *
    from source_rows
)

select *
from FINAL
