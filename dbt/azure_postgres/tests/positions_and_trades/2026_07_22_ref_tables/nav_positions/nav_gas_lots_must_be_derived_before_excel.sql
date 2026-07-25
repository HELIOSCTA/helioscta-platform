{{ config(
    severity = 'error',
    tags = ['positions_and_trades_ref_tables', 'nav_positions']
) }}

-- Fails when canonical NAV marts do not expose the same gas quantity/lot
-- normalization used by NAV Excel consumers.

with nav_positions as (
    select
        'all_history' as contract_name,
        positions.*
    from {{ ref('nav_ref_40_positions_all_history') }} as positions

    union all

    select
        'latest' as contract_name,
        positions.*
    from {{ ref('nav_ref_50_positions_latest') }} as positions
),

expected as (
    select
        nav_positions.*,
        case
            when nav_positions.multiplier_and_tick_value = 2500
                and nav_positions.product_code in ('HHD', 'H', 'PHH', 'PHE')
            then nav_positions.quantity_1 / 4
            else nav_positions.quantity_1
        end as expected_gas_qty,
        case
            when nav_positions.multiplier_and_tick_value = 2500
                and nav_positions.product_code in ('HHD', 'H', 'PHH', 'PHE')
            then nav_positions.multiplier_and_tick_value * 4
            else nav_positions.multiplier_and_tick_value
        end as expected_gas_lots
    from nav_positions
),

FINAL as (
    select *
    from expected
    where gas_qty is distinct from expected_gas_qty
       or gas_lots is distinct from expected_gas_lots
)

select *
from FINAL
