-- GENERATED FILE. DO NOT EDIT.
-- Source dbt model: dbt/azure_postgres/models/pjm_da_model/ice_python/settlements/ice_python_next_day_gas_hourly.sql
-- Source dbt compiled SQL: dbt\azure_postgres\target\compiled\helioscta_platform\models\pjm_da_model\ice_python\settlements\ice_python_next_day_gas_hourly.sql
-- Promotion script: dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py
-- Rebuild from dbt/azure_postgres:
--   dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
--   python scripts/promote_pjm_da_model_backend_sql.py
with  __dbt__cte__ice_python_next_day_gas as (
with params as (
    select
        %(start_date)s::date as start_date,
        %(end_date)s::date as end_date
),

symbol_map as (
    select *
    from (
        values
        ('XGF D1-IPG'::text, 'Henry Hub'::text, 'south_central'::text, 0::int),
        ('XVA D1-IPG'::text, 'Transco Station 85'::text, 'south_central'::text, 1::int),
        ('XLM D1-IPG'::text, 'TGP-500L'::text, 'south_central'::text, 2::int),
        ('YHV D1-IPG'::text, 'FGT Zone 3'::text, 'east'::text, 3::int),
        ('XLA D1-IPG'::text, 'Columbia Gulf (Mainline)'::text, 'south_central'::text, 4::int),
        ('XTA D1-IPG'::text, 'ANR SE-T'::text, 'south_central'::text, 5::int),
        ('YV7 D1-IPG'::text, 'Pine Prairie'::text, 'south_central'::text, 6::int),
        ('XVM D1-IPG'::text, 'Tetco WLA'::text, 'south_central'::text, 7::int),
        ('XYZ D1-IPG'::text, 'Houston Ship Channel'::text, 'south_central'::text, 8::int),
        ('XT6 D1-IPG'::text, 'Waha'::text, 'south_central'::text, 9::int),
        ('XIT D1-IPG'::text, 'NGPL TX/OK'::text, 'south_central'::text, 10::int),
        ('X7F D1-IPG'::text, 'Algonquin Citygates (non-G)'::text, 'east'::text, 11::int),
        ('XZR D1-IPG'::text, 'Tetco M3'::text, 'east'::text, 12::int),
        ('YFF D1-IPG'::text, 'Transco Zone 5 South'::text, 'east'::text, 13::int),
        ('Z2Y D1-IPG'::text, 'Transco Zone 5 North'::text, 'east'::text, 14::int),
        ('YP8 D1-IPG'::text, 'Iroquois Zone 2'::text, 'east'::text, 15::int),
        ('XWK D1-IPG'::text, 'Transco Zone 6 NY'::text, 'east'::text, 16::int),
        ('XJL D1-IPG'::text, 'Dominion South (Eastern Gas-South)'::text, 'east'::text, 17::int),
        ('XIZ D1-IPG'::text, 'Columbia TCO Pool'::text, 'east'::text, 18::int),
        ('YAG D1-IPG'::text, 'Tetco M2 (Receipt)'::text, 'east'::text, 19::int),
        ('Z1Q D1-IPG'::text, 'Tennessee Z4 (Marcellus)'::text, 'east'::text, 20::int),
        ('YQE D1-IPG'::text, 'Transco Leidy'::text, 'east'::text, 21::int),
        ('XTG D1-IPG'::text, 'Northern Ventura (NNG)'::text, 'midwest'::text, 22::int),
        ('YHF D1-IPG'::text, 'Chicago CityGate (NGPL-Nicor)'::text, 'midwest'::text, 23::int),
        ('XKF D1-IPG'::text, 'SoCal Citygate'::text, 'pacific'::text, 24::int),
        ('XGV D1-IPG'::text, 'PG&E Citygate'::text, 'pacific'::text, 25::int),
        ('YKL D1-IPG'::text, 'CIG Mainline'::text, 'mountain'::text, 26::int),
        ('XJR D1-IPG'::text, 'NGPL Midcontinent'::text, 'south_central'::text, 27::int),
        ('XJZ D1-IPG'::text, 'MichCon'::text, 'midwest'::text, 28::int)
    ) as mapped(symbol, hub_name, region, sort_index)
),

source_trade_dates as (
    select distinct s.trade_date::date as trade_date
    from "helios_prod"."ice_python"."settlements" s
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
    from "helios_prod"."ice_python"."settlements" s
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
),  __dbt__cte__ice_python_next_day_gas_pjm_features as (


with gas_daily as (
    select
        gas_day,
        trade_date,
        symbol,
        gas_price,
        latest_trade_date,
        updated_at,
        contract_dates_updated_at
    from __dbt__cte__ice_python_next_day_gas
    where symbol in (
        'XGF D1-IPG',
        'XZR D1-IPG',
        'XIZ D1-IPG',
        'XWK D1-IPG',
        'XJL D1-IPG'
    )
),

FINAL as (
    select
        gas_day,
        trade_date,
        max(case when symbol = 'XGF D1-IPG' then gas_price end)::float8 as gas_henry_hub,
        max(case when symbol = 'XZR D1-IPG' then gas_price end)::float8 as gas_m3,
        max(case when symbol = 'XIZ D1-IPG' then gas_price end)::float8 as gas_tco,
        max(case when symbol = 'XWK D1-IPG' then gas_price end)::float8 as gas_tz6,
        max(case when symbol = 'XJL D1-IPG' then gas_price end)::float8 as gas_dom_south,
        max(latest_trade_date) as latest_trade_date,
        max(updated_at) as updated_at,
        max(contract_dates_updated_at) as contract_dates_updated_at
    from gas_daily
    group by gas_day, trade_date
)

select *
from FINAL
order by gas_day
), params as (
    select
        %(start_date)s::date as start_date,
        %(end_date)s::date as end_date
),

gas_daily as (
    select
        gas_day,
        trade_date,
        gas_henry_hub,
        gas_m3,
        gas_tco,
        gas_tz6,
        gas_dom_south,
        latest_trade_date,
        updated_at,
        contract_dates_updated_at
    from __dbt__cte__ice_python_next_day_gas_pjm_features
),

hours as (
    select hour_ending
    from generate_series(1, 24) as h(hour_ending)
),

pjm_hours as (
    select
        (d.date::timestamp + ((h.hour_ending - 1) * interval '1 hour')) as datetime,
        d.date,
        h.hour_ending,
        (
            (d.date::timestamp + ((h.hour_ending - 1) * interval '1 hour'))
            at time zone 'America/New_York'
            at time zone 'America/Chicago'
        ) as pjm_central_local
    from (
        select spine_date::date as date
        from params p
        cross join lateral generate_series(
            p.start_date::timestamp,
            p.end_date::timestamp,
            interval '1 day'
        ) as spine(spine_date)
    ) d
    cross join hours h
),

pjm_hours_with_gas_day as (
    select
        datetime,
        date,
        hour_ending,
        case
            when pjm_central_local::time >= time '09:00:00'
                then pjm_central_local::date
            else (pjm_central_local::date - interval '1 day')::date
        end as gas_day
    from pjm_hours
),

FINAL as (
    select
        p.datetime,
        p.date,
        p.hour_ending,
        p.gas_day,
        g.trade_date,
        g.gas_henry_hub,
        g.gas_m3,
        g.gas_tco,
        g.gas_tz6,
        g.gas_dom_south,
        g.latest_trade_date,
        g.updated_at,
        g.contract_dates_updated_at
    from pjm_hours_with_gas_day p
    left join gas_daily g
      on g.gas_day = p.gas_day
)

select *
from FINAL
order by date, hour_ending