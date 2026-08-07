-- GENERATED FILE. DO NOT EDIT.
-- Source dbt model: dbt/azure_postgres/models/pjm_da_model/ice_python/settlements/ice_python_next_day_gas.sql
-- Source dbt compiled SQL: dbt\azure_postgres\target\compiled\helioscta_platform\models\pjm_da_model\ice_python\settlements\ice_python_next_day_gas.sql
-- Promotion script: dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py
-- Rebuild from dbt/azure_postgres:
--   dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
--   python scripts/promote_pjm_da_model_backend_sql.py
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

ice_physical_gas_non_trading_days as (
    select
        non_trading_date,
        holiday_name
    from (
    select *
    from (
        values
        (DATE '2020-01-01', 'New Year''s Day'),
        (DATE '2020-01-20', 'Martin Luther King Jr. Day'),
        (DATE '2020-02-17', 'Washington''s Birthday'),
        (DATE '2020-04-10', 'Good Friday'),
        (DATE '2020-05-25', 'Memorial Day'),
        (DATE '2020-07-03', 'Independence Day'),
        (DATE '2020-09-07', 'Labor Day'),
        (DATE '2020-10-12', 'Columbus Day'),
        (DATE '2020-11-11', 'Veterans Day'),
        (DATE '2020-11-26', 'Thanksgiving Day'),
        (DATE '2020-11-27', 'Day After Thanksgiving'),
        (DATE '2020-12-25', 'Christmas Day'),
        (DATE '2021-01-01', 'New Year''s Day'),
        (DATE '2021-01-18', 'Martin Luther King Jr. Day'),
        (DATE '2021-02-15', 'Washington''s Birthday'),
        (DATE '2021-04-02', 'Good Friday'),
        (DATE '2021-05-31', 'Memorial Day'),
        (DATE '2021-06-18', 'Juneteenth National Independence Day'),
        (DATE '2021-07-05', 'Independence Day'),
        (DATE '2021-09-06', 'Labor Day'),
        (DATE '2021-10-11', 'Columbus Day'),
        (DATE '2021-11-11', 'Veterans Day'),
        (DATE '2021-11-25', 'Thanksgiving Day'),
        (DATE '2021-11-26', 'Day After Thanksgiving'),
        (DATE '2021-12-24', 'Christmas Day'),
        (DATE '2021-12-31', 'New Year''s Day'),
        (DATE '2022-01-17', 'Martin Luther King Jr. Day'),
        (DATE '2022-02-21', 'Washington''s Birthday'),
        (DATE '2022-04-15', 'Good Friday'),
        (DATE '2022-05-30', 'Memorial Day'),
        (DATE '2022-06-20', 'Juneteenth National Independence Day'),
        (DATE '2022-07-04', 'Independence Day'),
        (DATE '2022-09-05', 'Labor Day'),
        (DATE '2022-10-10', 'Columbus Day'),
        (DATE '2022-11-11', 'Veterans Day'),
        (DATE '2022-11-24', 'Thanksgiving Day'),
        (DATE '2022-11-25', 'Day After Thanksgiving'),
        (DATE '2022-12-26', 'Christmas Day'),
        (DATE '2023-01-02', 'New Year''s Day'),
        (DATE '2023-01-16', 'Martin Luther King Jr. Day'),
        (DATE '2023-02-20', 'Washington''s Birthday'),
        (DATE '2023-04-07', 'Good Friday'),
        (DATE '2023-05-29', 'Memorial Day'),
        (DATE '2023-06-19', 'Juneteenth National Independence Day'),
        (DATE '2023-07-04', 'Independence Day'),
        (DATE '2023-09-04', 'Labor Day'),
        (DATE '2023-10-09', 'Columbus Day'),
        (DATE '2023-11-10', 'Veterans Day'),
        (DATE '2023-11-23', 'Thanksgiving Day'),
        (DATE '2023-11-24', 'Day After Thanksgiving'),
        (DATE '2023-12-25', 'Christmas Day'),
        (DATE '2024-01-01', 'New Year''s Day'),
        (DATE '2024-01-15', 'Martin Luther King Jr. Day'),
        (DATE '2024-02-19', 'Washington''s Birthday'),
        (DATE '2024-03-29', 'Good Friday'),
        (DATE '2024-05-27', 'Memorial Day'),
        (DATE '2024-06-19', 'Juneteenth National Independence Day'),
        (DATE '2024-07-04', 'Independence Day'),
        (DATE '2024-09-02', 'Labor Day'),
        (DATE '2024-10-14', 'Columbus Day'),
        (DATE '2024-11-11', 'Veterans Day'),
        (DATE '2024-11-28', 'Thanksgiving Day'),
        (DATE '2024-11-29', 'Day After Thanksgiving'),
        (DATE '2024-12-25', 'Christmas Day'),
        (DATE '2025-01-01', 'New Year''s Day'),
        (DATE '2025-01-20', 'Martin Luther King Jr. Day'),
        (DATE '2025-02-17', 'Washington''s Birthday'),
        (DATE '2025-04-18', 'Good Friday'),
        (DATE '2025-05-26', 'Memorial Day'),
        (DATE '2025-06-19', 'Juneteenth National Independence Day'),
        (DATE '2025-07-04', 'Independence Day'),
        (DATE '2025-09-01', 'Labor Day'),
        (DATE '2025-10-13', 'Columbus Day'),
        (DATE '2025-11-11', 'Veterans Day'),
        (DATE '2025-11-27', 'Thanksgiving Day'),
        (DATE '2025-11-28', 'Day After Thanksgiving'),
        (DATE '2025-12-25', 'Christmas Day'),
        (DATE '2026-01-01', 'New Year''s Day'),
        (DATE '2026-01-19', 'Martin Luther King Jr. Day'),
        (DATE '2026-02-16', 'Washington''s Birthday'),
        (DATE '2026-04-03', 'Good Friday'),
        (DATE '2026-05-25', 'Memorial Day'),
        (DATE '2026-06-19', 'Juneteenth National Independence Day'),
        (DATE '2026-07-03', 'Independence Day'),
        (DATE '2026-09-07', 'Labor Day'),
        (DATE '2026-10-12', 'Columbus Day'),
        (DATE '2026-11-11', 'Veterans Day'),
        (DATE '2026-11-26', 'Thanksgiving Day'),
        (DATE '2026-11-27', 'Day After Thanksgiving'),
        (DATE '2026-12-25', 'Christmas Day'),
        (DATE '2027-01-01', 'New Year''s Day'),
        (DATE '2027-01-18', 'Martin Luther King Jr. Day'),
        (DATE '2027-02-15', 'Washington''s Birthday'),
        (DATE '2027-03-26', 'Good Friday'),
        (DATE '2027-05-31', 'Memorial Day'),
        (DATE '2027-06-18', 'Juneteenth National Independence Day'),
        (DATE '2027-07-05', 'Independence Day'),
        (DATE '2027-09-06', 'Labor Day'),
        (DATE '2027-10-11', 'Columbus Day'),
        (DATE '2027-11-11', 'Veterans Day'),
        (DATE '2027-11-25', 'Thanksgiving Day'),
        (DATE '2027-11-26', 'Day After Thanksgiving'),
        (DATE '2027-12-24', 'Christmas Day'),
        (DATE '2027-12-31', 'New Year''s Day'),
        (DATE '2028-01-17', 'Martin Luther King Jr. Day'),
        (DATE '2028-02-21', 'Washington''s Birthday'),
        (DATE '2028-04-14', 'Good Friday'),
        (DATE '2028-05-29', 'Memorial Day'),
        (DATE '2028-06-19', 'Juneteenth National Independence Day'),
        (DATE '2028-07-04', 'Independence Day'),
        (DATE '2028-09-04', 'Labor Day'),
        (DATE '2028-10-09', 'Columbus Day'),
        (DATE '2028-11-10', 'Veterans Day'),
        (DATE '2028-11-23', 'Thanksgiving Day'),
        (DATE '2028-11-24', 'Day After Thanksgiving'),
        (DATE '2028-12-25', 'Christmas Day'),
        (DATE '2029-01-01', 'New Year''s Day'),
        (DATE '2029-01-15', 'Martin Luther King Jr. Day'),
        (DATE '2029-02-19', 'Washington''s Birthday'),
        (DATE '2029-03-30', 'Good Friday'),
        (DATE '2029-05-28', 'Memorial Day'),
        (DATE '2029-06-19', 'Juneteenth National Independence Day'),
        (DATE '2029-07-04', 'Independence Day'),
        (DATE '2029-09-03', 'Labor Day'),
        (DATE '2029-10-08', 'Columbus Day'),
        (DATE '2029-11-12', 'Veterans Day'),
        (DATE '2029-11-22', 'Thanksgiving Day'),
        (DATE '2029-11-23', 'Day After Thanksgiving'),
        (DATE '2029-12-25', 'Christmas Day'),
        (DATE '2030-01-01', 'New Year''s Day'),
        (DATE '2030-01-21', 'Martin Luther King Jr. Day'),
        (DATE '2030-02-18', 'Washington''s Birthday'),
        (DATE '2030-04-19', 'Good Friday'),
        (DATE '2030-05-27', 'Memorial Day'),
        (DATE '2030-06-19', 'Juneteenth National Independence Day'),
        (DATE '2030-07-04', 'Independence Day'),
        (DATE '2030-09-02', 'Labor Day'),
        (DATE '2030-10-14', 'Columbus Day'),
        (DATE '2030-11-11', 'Veterans Day'),
        (DATE '2030-11-28', 'Thanksgiving Day'),
        (DATE '2030-11-29', 'Day After Thanksgiving'),
        (DATE '2030-12-25', 'Christmas Day'),
        (DATE '2031-01-01', 'New Year''s Day'),
        (DATE '2031-01-20', 'Martin Luther King Jr. Day'),
        (DATE '2031-02-17', 'Washington''s Birthday'),
        (DATE '2031-04-11', 'Good Friday'),
        (DATE '2031-05-26', 'Memorial Day'),
        (DATE '2031-06-19', 'Juneteenth National Independence Day'),
        (DATE '2031-07-04', 'Independence Day'),
        (DATE '2031-09-01', 'Labor Day'),
        (DATE '2031-10-13', 'Columbus Day'),
        (DATE '2031-11-11', 'Veterans Day'),
        (DATE '2031-11-27', 'Thanksgiving Day'),
        (DATE '2031-11-28', 'Day After Thanksgiving'),
        (DATE '2031-12-25', 'Christmas Day')
    ) as t(non_trading_date, holiday_name)

    ) as non_trading_days
),

calendar_trade_dates as (
    select trade_date::date as trade_date
    from params p
    cross join lateral generate_series(
        (p.start_date - interval '60 days')::timestamp,
        (p.end_date + interval '14 days')::timestamp,
        interval '1 day'
    ) as spine(trade_date)
    where extract(isodow from trade_date::date)::int between 1 and 5
      and not exists (
          select 1
          from ice_physical_gas_non_trading_days n
          where n.non_trading_date = trade_date::date
      )
),

calendar_trade_windows as (
    select
        trade_date,
        lead(trade_date) over (order by trade_date) as next_trade_date
    from calendar_trade_dates
),

sessions as (
    select
        trade_date,
        coalesce(
            next_trade_date,
            (
                trade_date
                + case
                    when extract(isodow from trade_date)::int = 5 then interval '3 days'
                    else interval '1 day'
                end
            )::date
        ) as last_gas_day
    from calendar_trade_windows
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
    from calendar_trade_dates t
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
