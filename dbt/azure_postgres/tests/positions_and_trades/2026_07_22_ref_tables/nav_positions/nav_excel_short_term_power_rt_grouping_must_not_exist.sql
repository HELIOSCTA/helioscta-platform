{{ config(
    tags = ['positions_and_trades_ref_tables', 'nav_positions', 'excel_grouping']
) }}

-- The Excel workbook uses one short-term power tab bucket. The old
-- SHORT_TERM_POWER_RT label should not be emitted by the active Excel models.

with nav_rows as (
    select * from {{ ref('nav_ref_excel_10_position_rows') }}
),

invalid_rows as (
    select *
    from nav_rows
    where exchange_code_grouping = 'SHORT_TERM_POWER_RT'
),

FINAL as (
    select * from invalid_rows
)

select *
from FINAL
