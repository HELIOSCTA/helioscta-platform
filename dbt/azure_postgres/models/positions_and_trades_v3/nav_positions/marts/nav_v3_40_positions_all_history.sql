with positions as (
    select * from {{ ref('nav_v3_30_int_rules') }}
),

FINAL as (
    select *
    from positions
)

select *
from FINAL
