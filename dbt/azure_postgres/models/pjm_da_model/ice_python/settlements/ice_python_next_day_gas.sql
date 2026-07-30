{{-
  config(
    materialized='ephemeral'
  )
}}

{%- set param_mode = var('pjm_da_model_param_mode', 'defaults') -%}
{%- if param_mode == 'runtime' -%}
    {%- set start_date_expr = "%(start_date)s::date" -%}
    {%- set end_date_expr = "%(end_date)s::date" -%}
{%- else -%}
    {%- set start_date_expr = var('pjm_da_model_start_date_expr', "((current_timestamp at time zone 'America/New_York')::date - 730)") -%}
    {%- set end_date_expr = var('pjm_da_model_end_date_expr', "((current_timestamp at time zone 'America/New_York')::date + 14)") -%}
{%- endif -%}

with params as (
    select
        {{ start_date_expr }} as start_date,
        {{ end_date_expr }} as end_date
),

symbol_map as (
    select *
    from (
        {{ ice_python_next_day_gas_symbol_values() }}
    ) as mapped(symbol, hub_name, region, sort_index)
),

source_trade_dates as (
    select distinct s.trade_date::date as trade_date
    from {{ source('ice_python', 'settlements') }} s
    join symbol_map m
      on s.symbol = m.symbol
    cross join params p
    where s.trade_date::date >= (p.start_date - interval '60 days')::date
      and s.trade_date::date <= (p.end_date + interval '14 days')::date
      and extract(isodow from s.trade_date::date)::int between 1 and 5
),

sessions as (
    select
        trade_date,
        (
            trade_date
            + case
                when extract(isodow from trade_date)::int = 5 then interval '3 days'
                else interval '1 day'
            end
        )::date as last_gas_day
    from source_trade_dates
),

gas_day_trade_dates as (
    select
        gas_day::date as gas_day,
        s.trade_date
    from sessions s
    cross join lateral generate_series(
        (s.trade_date + interval '1 day')::timestamp,
        s.last_gas_day::timestamp,
        interval '1 day'
    ) as expanded(gas_day)
),

symbol_trade_dates as (
    select
        t.trade_date,
        m.symbol,
        m.hub_name,
        m.region,
        m.sort_index
    from source_trade_dates t
    cross join symbol_map m
),

settlement_prices_raw as (
    select
        s.trade_date::date as trade_date,
        m.symbol,
        m.hub_name,
        m.region,
        m.sort_index,
        coalesce(s.vwap_close, s.settlement, s.close)::float8 as gas_price,
        case
            when s.vwap_close is not null then 'vwap_close'
            when s.settlement is not null then 'settlement'
            when s.close is not null then 'close'
        end as price_basis,
        s.updated_at,
        row_number() over (
            partition by s.trade_date::date, m.symbol
            order by s.updated_at desc nulls last, s.created_at desc nulls last
        ) as row_priority
    from {{ source('ice_python', 'settlements') }} s
    join symbol_map m
      on s.symbol = m.symbol
    cross join params p
    where coalesce(s.vwap_close, s.settlement, s.close) is not null
      and s.trade_date::date >= (p.start_date - interval '60 days')::date
      and s.trade_date::date <= (p.end_date + interval '14 days')::date
),

settlement_prices as (
    select
        trade_date,
        symbol,
        hub_name,
        region,
        sort_index,
        gas_price,
        price_basis,
        trade_date as price_trade_date,
        updated_at
    from settlement_prices_raw
    where row_priority = 1
),

aligned as (
    select
        t.trade_date,
        t.symbol,
        t.hub_name,
        t.region,
        t.sort_index,
        p.gas_price,
        p.price_basis,
        p.price_trade_date,
        p.updated_at
    from symbol_trade_dates t
    left join settlement_prices p
      on p.trade_date = t.trade_date
     and p.symbol = t.symbol
),

grouped as (
    select
        trade_date,
        symbol,
        hub_name,
        region,
        sort_index,
        gas_price,
        price_basis,
        price_trade_date,
        updated_at,
        sum(case when gas_price is not null then 1 else 0 end) over (
            partition by symbol
            order by trade_date
            rows between unbounded preceding and current row
        ) as grp_gas_price
    from aligned
),

filled as (
    select
        trade_date,
        symbol,
        hub_name,
        region,
        sort_index,
        first_value(gas_price) over (
            partition by symbol, grp_gas_price
            order by trade_date
            rows between unbounded preceding and unbounded following
        ) as gas_price,
        first_value(price_basis) over (
            partition by symbol, grp_gas_price
            order by trade_date
            rows between unbounded preceding and unbounded following
        ) as price_basis,
        first_value(price_trade_date) over (
            partition by symbol, grp_gas_price
            order by trade_date
            rows between unbounded preceding and unbounded following
        ) as latest_trade_date,
        first_value(updated_at) over (
            partition by symbol, grp_gas_price
            order by trade_date
            rows between unbounded preceding and unbounded following
        ) as updated_at
    from grouped
),

gas_daily as (
    select
        g.gas_day,
        g.trade_date,
        f.symbol,
        f.hub_name,
        f.region,
        f.sort_index,
        f.gas_price,
        f.price_basis,
        f.latest_trade_date,
        f.updated_at
    from gas_day_trade_dates g
    join filled f
      on f.trade_date = g.trade_date
),

FINAL as (
    select
        g.gas_day,
        g.trade_date,
        g.symbol,
        g.hub_name,
        g.region,
        g.sort_index,
        g.gas_price,
        g.price_basis,
        g.latest_trade_date,
        g.updated_at,
        null::timestamp as contract_dates_updated_at
    from gas_daily g
    cross join params p
    where g.gas_day >= p.start_date
      and g.gas_day <= p.end_date
)

select *
from FINAL
order by gas_day, sort_index, symbol
