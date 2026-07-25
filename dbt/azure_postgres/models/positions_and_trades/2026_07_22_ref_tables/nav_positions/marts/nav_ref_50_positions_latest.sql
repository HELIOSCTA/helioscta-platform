with positions as (
    select * from {{ ref('nav_ref_35_int_rules_latest') }}
),

FINAL as (
    select *
    from positions
)

select *
from FINAL
