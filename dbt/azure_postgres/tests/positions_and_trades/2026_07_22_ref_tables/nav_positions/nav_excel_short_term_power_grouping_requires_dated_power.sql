{{ config(
    tags = ['positions_and_trades_ref_tables', 'nav_positions', 'excel_grouping']
) }}

-- Short-term Excel power buckets should contain only dated, non-option rows.
-- Undated power contracts belong to POWER_FUTURES so the monthly ICE tabs do
-- not lose rows to BalDay-style outputs.

with nav_rows as (
    select * from {{ ref('nav_ref_excel_10_position_rows') }}
),

invalid_rows as (
    select *
    from nav_rows
    where exchange_code_grouping = 'SHORT_TERM_POWER'
      and (
        coalesce(is_option, false)
        or contract_yyyymmdd is null
      )
),

FINAL as (
    select * from invalid_rows
)

select *
from FINAL
