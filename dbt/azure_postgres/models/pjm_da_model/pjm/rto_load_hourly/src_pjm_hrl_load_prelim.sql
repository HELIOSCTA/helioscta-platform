{{-
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select *
    from {{ source('pjm', 'hrl_load_prelim') }}
),

FINAL as (
    select *
    from source_rows
)

select *
from FINAL
