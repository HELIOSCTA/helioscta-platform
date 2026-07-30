{{ config(
    severity = 'error',
    tags = ['pjm_da_model', 'ice_python_next_day_gas']
) }}

with expected_symbols as (
    select *
    from (
        {{ ice_python_next_day_gas_symbol_values() }}
    ) as mapped(symbol, hub_name, region, sort_index)
),

gas_daily as (
    select * from {{ ref('ice_python_next_day_gas') }}
),

observed_symbols as (
    select distinct symbol
    from gas_daily
),

missing_expected_symbols as (
    select
        'missing_expected_symbol'::text as failure_type,
        e.symbol,
        e.hub_name,
        e.region,
        e.sort_index,
        null::int as observed_symbol_count
    from expected_symbols e
    left join observed_symbols o
      on o.symbol = e.symbol
    where o.symbol is null
),

unexpected_observed_symbols as (
    select
        'unexpected_observed_symbol'::text as failure_type,
        o.symbol,
        null::text as hub_name,
        null::text as region,
        null::int as sort_index,
        null::int as observed_symbol_count
    from observed_symbols o
    left join expected_symbols e
      on e.symbol = o.symbol
    where e.symbol is null
),

bad_symbol_count as (
    select
        'wrong_observed_symbol_count'::text as failure_type,
        null::text as symbol,
        null::text as hub_name,
        null::text as region,
        null::int as sort_index,
        count(*)::int as observed_symbol_count
    from observed_symbols
    having count(*) <> 29
),

FINAL as (
    select * from missing_expected_symbols
    union all
    select * from unexpected_observed_symbols
    union all
    select * from bad_symbol_count
)

select *
from FINAL
