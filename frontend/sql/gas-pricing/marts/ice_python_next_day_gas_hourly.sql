-- Generated from frontend/lib/gasPricing/hourlyGasPricingSql.ts.
-- Calendar rules: frontend/lib/tradingCalendars/calendars/icePhysicalGas.ts.
-- Source table: ice_python.settlements.
-- Grain: one row per gas-day hour, using 09:00-09:00 America/Chicago gas days.
-- Default price basis: vwap_close.
-- Edit the params CTE for manual date or price-basis checks.

with params as (
  select
    '2020-01-01'::date as start_gas_day,
    NULL::date as end_gas_day,
    'vwap_close'::text as price_basis
),
non_trading_days as (
  SELECT *
  FROM (
    VALUES
    (DATE '2020-01-01', 'New Year''s Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2020-01-20', 'Martin Luther King Jr. Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2020-02-17', 'Washington''s Birthday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2020-04-10', 'Good Friday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2020-05-25', 'Memorial Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2020-07-03', 'Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2020-09-07', 'Labor Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2020-10-12', 'Columbus Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2020-11-11', 'Veterans Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2020-11-26', 'Thanksgiving Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2020-11-27', 'Day After Thanksgiving', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2020-12-25', 'Christmas Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2021-01-01', 'New Year''s Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2021-01-18', 'Martin Luther King Jr. Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2021-02-15', 'Washington''s Birthday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2021-04-02', 'Good Friday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2021-05-31', 'Memorial Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2021-06-18', 'Juneteenth National Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2021-07-05', 'Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2021-09-06', 'Labor Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2021-10-11', 'Columbus Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2021-11-11', 'Veterans Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2021-11-25', 'Thanksgiving Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2021-11-26', 'Day After Thanksgiving', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2021-12-24', 'Christmas Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2021-12-31', 'New Year''s Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2022-01-17', 'Martin Luther King Jr. Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2022-02-21', 'Washington''s Birthday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2022-04-15', 'Good Friday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2022-05-30', 'Memorial Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2022-06-20', 'Juneteenth National Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2022-07-04', 'Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2022-09-05', 'Labor Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2022-10-10', 'Columbus Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2022-11-11', 'Veterans Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2022-11-24', 'Thanksgiving Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2022-11-25', 'Day After Thanksgiving', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2022-12-26', 'Christmas Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2023-01-02', 'New Year''s Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2023-01-16', 'Martin Luther King Jr. Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2023-02-20', 'Washington''s Birthday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2023-04-07', 'Good Friday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2023-05-29', 'Memorial Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2023-06-19', 'Juneteenth National Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2023-07-04', 'Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2023-09-04', 'Labor Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2023-10-09', 'Columbus Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2023-11-10', 'Veterans Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2023-11-23', 'Thanksgiving Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2023-11-24', 'Day After Thanksgiving', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2023-12-25', 'Christmas Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2024-01-01', 'New Year''s Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2024-01-15', 'Martin Luther King Jr. Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2024-02-19', 'Washington''s Birthday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2024-03-29', 'Good Friday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2024-05-27', 'Memorial Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2024-06-19', 'Juneteenth National Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2024-07-04', 'Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2024-09-02', 'Labor Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2024-10-14', 'Columbus Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2024-11-11', 'Veterans Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2024-11-28', 'Thanksgiving Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2024-11-29', 'Day After Thanksgiving', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2024-12-25', 'Christmas Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2025-01-01', 'New Year''s Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2025-01-20', 'Martin Luther King Jr. Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2025-02-17', 'Washington''s Birthday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2025-04-18', 'Good Friday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2025-05-26', 'Memorial Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2025-06-19', 'Juneteenth National Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2025-07-04', 'Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2025-09-01', 'Labor Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2025-10-13', 'Columbus Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2025-11-11', 'Veterans Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2025-11-27', 'Thanksgiving Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2025-11-28', 'Day After Thanksgiving', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2025-12-25', 'Christmas Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2026-01-01', 'New Year''s Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2026-01-19', 'Martin Luther King Jr. Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2026-02-16', 'Washington''s Birthday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2026-04-03', 'Good Friday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2026-05-25', 'Memorial Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2026-06-19', 'Juneteenth National Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2026-07-03', 'Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2026-09-07', 'Labor Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2026-10-12', 'Columbus Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2026-11-11', 'Veterans Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2026-11-26', 'Thanksgiving Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2026-11-27', 'Day After Thanksgiving', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2026-12-25', 'Christmas Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2027-01-01', 'New Year''s Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2027-01-18', 'Martin Luther King Jr. Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2027-02-15', 'Washington''s Birthday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2027-03-26', 'Good Friday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2027-05-31', 'Memorial Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2027-06-18', 'Juneteenth National Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2027-07-05', 'Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2027-09-06', 'Labor Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2027-10-11', 'Columbus Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2027-11-11', 'Veterans Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2027-11-25', 'Thanksgiving Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2027-11-26', 'Day After Thanksgiving', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2027-12-24', 'Christmas Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2027-12-31', 'New Year''s Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2028-01-17', 'Martin Luther King Jr. Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2028-02-21', 'Washington''s Birthday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2028-04-14', 'Good Friday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2028-05-29', 'Memorial Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2028-06-19', 'Juneteenth National Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2028-07-04', 'Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2028-09-04', 'Labor Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2028-10-09', 'Columbus Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2028-11-10', 'Veterans Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2028-11-23', 'Thanksgiving Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2028-11-24', 'Day After Thanksgiving', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2028-12-25', 'Christmas Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2029-01-01', 'New Year''s Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2029-01-15', 'Martin Luther King Jr. Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2029-02-19', 'Washington''s Birthday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2029-03-30', 'Good Friday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2029-05-28', 'Memorial Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2029-06-19', 'Juneteenth National Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2029-07-04', 'Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2029-09-03', 'Labor Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2029-10-08', 'Columbus Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2029-11-12', 'Veterans Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2029-11-22', 'Thanksgiving Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2029-11-23', 'Day After Thanksgiving', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2029-12-25', 'Christmas Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2030-01-01', 'New Year''s Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2030-01-21', 'Martin Luther King Jr. Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2030-02-18', 'Washington''s Birthday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2030-04-19', 'Good Friday', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2030-05-27', 'Memorial Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2030-06-19', 'Juneteenth National Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2030-07-04', 'Independence Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2030-09-02', 'Labor Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2030-10-14', 'Columbus Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2030-11-11', 'Veterans Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2030-11-28', 'Thanksgiving Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2030-11-29', 'Day After Thanksgiving', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas'),
    (DATE '2030-12-25', 'Christmas Day', 'ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas')
  ) AS t(non_trading_date, holiday_name, calendar_source)
),
hub_registry as (
  select *
  from (
    values
    ('XZR D1-IPG', 'tetco_m3_cash', 'TETCO M3', TRUE),
    ('XIZ D1-IPG', 'columbia_tco_cash', 'Columbia TCO', TRUE),
    ('XWK D1-IPG', 'transco_z6_ny_cash', 'Transco Z6 NY', TRUE),
    ('XJL D1-IPG', 'dominion_south_cash', 'Dominion South', TRUE),
    ('XTG D1-IPG', 'nng_ventura_cash', 'NNG Ventura', TRUE),
    ('YAG D1-IPG', 'tetco_m2_cash', 'TETCO M2', TRUE),
    ('Z2Y D1-IPG', 'transco_z5_north_cash', 'Transco Z5 North', TRUE),
    ('Z1Q D1-IPG', 'tenn_z4_marcellus_cash', 'Tennessee Z4 Marcellus', TRUE),
    ('YQE D1-IPG', 'transco_leidy_cash', 'Transco Leidy', TRUE),
    ('YHF D1-IPG', 'chicago_cg_cash', 'Chicago Citygate', TRUE),
    ('Z28 D1-IPG', 'tenn_z5_cash', 'Tennessee Z5', FALSE),
    ('YVQ D1-IPG', 'rex_e_midw_cash', 'REX E Midw', FALSE),
    ('XZL D1-IPG', 'anr_sw_cash', 'ANR SW', FALSE),
    ('XIH D1-IPG', 'panhandle_cash', 'Panhandle', FALSE)
  ) as t(
    symbol,
    price_column,
    hub_label,
    promoted_registry_available
  )
),
source_prices as (
  select
    s.trade_date::date as trade_date,
    h.price_column,
    avg(
      case params.price_basis
        when 'settlement' then s.settlement
        when 'open' then s.open
        when 'high' then s.high
        when 'low' then s.low
        when 'close' then s.close
        when 'vwap_close' then s.vwap_close
        else s.vwap_close
      end
    )::double precision as price_value
  from ice_python.settlements s
  inner join hub_registry h
    on h.symbol = s.symbol
  cross join params
  group by s.trade_date::date, h.price_column
),
max_source_trade_date as (
  select max(trade_date) as trade_date
  from source_prices
),
date_bounds as (
  select
    (least(params.start_gas_day, coalesce(min(source_prices.trade_date), params.start_gas_day)) - interval '10 days')::date as start_date,
    (
      greatest(
        coalesce(params.end_gas_day, current_date + interval '2 years'),
        coalesce(max(source_prices.trade_date), params.start_gas_day)
      ) + interval '10 days'
    )::date as end_date
  from params
  left join source_prices
    on true
  group by params.start_gas_day, params.end_gas_day
),
date_spine as (
  select generate_series(start_date, end_date, interval '1 day')::date as calendar_date
  from date_bounds
),
trading_days as (
  select calendar_date as trade_date
  from date_spine
  where extract(dow from calendar_date) between 1 and 5
    and calendar_date not in (select non_trading_date from non_trading_days)
),
sessions as (
  select
    trade_date,
    lead(trade_date) over (order by trade_date) as next_trade_date
  from trading_days
),
aligned_prices as (
  select
    td.trade_date,
    h.price_column,
    p.price_value
  from trading_days td
  cross join hub_registry h
  left join source_prices p
    on p.trade_date = td.trade_date
   and p.price_column = h.price_column
),
grouped_prices as (
  select
    trade_date,
    price_column,
    price_value,
    count(price_value) over (
      partition by price_column
      order by trade_date
      rows between unbounded preceding and current row
    ) as price_group
  from aligned_prices
),
filled_prices as (
  select
    trade_date,
    price_column,
    max(price_value) over (
      partition by price_column, price_group
    )::double precision as price_value
  from grouped_prices
),
gas_day_trade_dates as (
  select
    s.trade_date,
    gas_day::date as gas_day
  from sessions s
  cross join lateral generate_series(
    (s.trade_date + interval '1 day')::date,
    coalesce(
      s.next_trade_date,
      case
        when extract(dow from s.trade_date) = 5
          then (s.trade_date + interval '3 days')::date
        else (s.trade_date + interval '1 day')::date
      end
    )::date,
    interval '1 day'
  ) as gas_day
),
hours as (
  select generate_series(1, 24) as hour_ending
),
hourly_spine as (
  select
    (
      (
        g.gas_day
        + time '09:00:00'
        + ((h.hour_ending - 1) * interval '1 hour')
      ) at time zone 'America/Chicago' at time zone 'UTC'
    ) as datetime_beginning_utc,
    (
      (
        g.gas_day
        + time '09:00:00'
        + (h.hour_ending * interval '1 hour')
      ) at time zone 'America/Chicago' at time zone 'UTC'
    ) as datetime_ending_utc,
    'America/Chicago'::text as timezone,
    (
      g.gas_day
      + time '09:00:00'
      + ((h.hour_ending - 1) * interval '1 hour')
    ) as datetime_beginning_local,
    (
      g.gas_day
      + time '09:00:00'
      + (h.hour_ending * interval '1 hour')
    ) as datetime_ending_local,
    g.gas_day,
    h.hour_ending::integer as hour_ending,
    g.trade_date
  from gas_day_trade_dates g
  cross join hours h
  cross join params
  cross join max_source_trade_date
  where g.gas_day >= params.start_gas_day
    and (params.end_gas_day is null or g.gas_day <= params.end_gas_day)
    and max_source_trade_date.trade_date is not null
    and g.trade_date <= max_source_trade_date.trade_date
),
hourly_prices as (
  select
    s.timezone,
    s.datetime_beginning_local,
    s.datetime_ending_local,
    s.gas_day,
    s.trade_date,
    MAX(f.price_value) FILTER (WHERE f.price_column = 'tetco_m3_cash') AS tetco_m3_cash,
    MAX(f.price_value) FILTER (WHERE f.price_column = 'columbia_tco_cash') AS columbia_tco_cash,
    MAX(f.price_value) FILTER (WHERE f.price_column = 'transco_z6_ny_cash') AS transco_z6_ny_cash,
    MAX(f.price_value) FILTER (WHERE f.price_column = 'dominion_south_cash') AS dominion_south_cash,
    MAX(f.price_value) FILTER (WHERE f.price_column = 'nng_ventura_cash') AS nng_ventura_cash,
    MAX(f.price_value) FILTER (WHERE f.price_column = 'tetco_m2_cash') AS tetco_m2_cash,
    MAX(f.price_value) FILTER (WHERE f.price_column = 'transco_z5_north_cash') AS transco_z5_north_cash,
    MAX(f.price_value) FILTER (WHERE f.price_column = 'tenn_z4_marcellus_cash') AS tenn_z4_marcellus_cash,
    MAX(f.price_value) FILTER (WHERE f.price_column = 'transco_leidy_cash') AS transco_leidy_cash,
    MAX(f.price_value) FILTER (WHERE f.price_column = 'chicago_cg_cash') AS chicago_cg_cash,
    MAX(f.price_value) FILTER (WHERE f.price_column = 'tenn_z5_cash') AS tenn_z5_cash,
    MAX(f.price_value) FILTER (WHERE f.price_column = 'rex_e_midw_cash') AS rex_e_midw_cash,
    MAX(f.price_value) FILTER (WHERE f.price_column = 'anr_sw_cash') AS anr_sw_cash,
    MAX(f.price_value) FILTER (WHERE f.price_column = 'panhandle_cash') AS panhandle_cash
  from hourly_spine s
  left join filled_prices f
    on f.trade_date = s.trade_date
  group by
    s.timezone,
    s.datetime_beginning_local,
    s.datetime_ending_local,
    s.gas_day,
    s.trade_date
),
final as (
  select
    timezone,
    datetime_beginning_local,
    datetime_ending_local,
    gas_day,
    trade_date,
    tetco_m3_cash,
    columbia_tco_cash,
    transco_z6_ny_cash,
    dominion_south_cash,
    nng_ventura_cash,
    tetco_m2_cash,
    transco_z5_north_cash,
    tenn_z4_marcellus_cash,
    transco_leidy_cash,
    chicago_cg_cash,
    tenn_z5_cash,
    rex_e_midw_cash,
    anr_sw_cash,
    panhandle_cash
  from hourly_prices
)
select *
from final
order by datetime_beginning_local desc;
