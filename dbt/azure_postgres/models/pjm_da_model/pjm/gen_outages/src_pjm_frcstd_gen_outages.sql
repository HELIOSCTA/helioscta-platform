{{-
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select *
    from {{ source('pjm', 'frcstd_gen_outages') }}
),

FINAL as (
    select *
    from source_rows
)

select *
from FINAL
