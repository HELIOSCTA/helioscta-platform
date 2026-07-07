-- Verifies weekday ICE physical gas holidays that interrupt normal trading.
--
-- This intentionally excludes ordinary weekends. Each row shows the holiday,
-- the prior trading day that prices the extended strip, the next trading day,
-- and the gas days covered by the prior trading day.

with params as (
  select
    date '2026-01-01' as start_date,
    date '2026-12-31' as end_date
),
non_trading_days as (
  select *
  from (
    values
      (date '2026-01-01', 'New Year''s Day'),
      (date '2026-01-19', 'Martin Luther King Jr. Day'),
      (date '2026-02-16', 'Washington''s Birthday'),
      (date '2026-04-03', 'Good Friday'),
      (date '2026-05-25', 'Memorial Day'),
      (date '2026-06-19', 'Juneteenth National Independence Day'),
      (date '2026-07-03', 'Independence Day'),
      (date '2026-09-07', 'Labor Day'),
      (date '2026-10-12', 'Columbus Day'),
      (date '2026-11-11', 'Veterans Day'),
      (date '2026-11-26', 'Thanksgiving Day'),
      (date '2026-11-27', 'Day After Thanksgiving'),
      (date '2026-12-25', 'Christmas Day')
  ) as t(holiday_date, holiday_name)
),
date_spine as (
  select generate_series(
    (select start_date - interval '10 days' from params),
    (select end_date + interval '10 days' from params),
    interval '1 day'
  )::date as calendar_date
),
trading_days as (
  select d.calendar_date as trade_date
  from date_spine d
  where extract(dow from d.calendar_date) between 1 and 5
    and d.calendar_date not in (select holiday_date from non_trading_days)
),
weekday_holidays as (
  select
    h.holiday_date,
    to_char(h.holiday_date, 'Dy') as holiday_day_name,
    h.holiday_name
  from non_trading_days h
  cross join params p
  where h.holiday_date between p.start_date and p.end_date
    and extract(dow from h.holiday_date) between 1 and 5
),
holiday_sessions as (
  select
    h.holiday_date,
    h.holiday_day_name,
    h.holiday_name,
    (
      select max(t.trade_date)
      from trading_days t
      where t.trade_date < h.holiday_date
    ) as prior_trade_date,
    (
      select min(t.trade_date)
      from trading_days t
      where t.trade_date > h.holiday_date
    ) as next_trade_date
  from weekday_holidays h
),
impacted_strips as (
  select
    s.holiday_date,
    s.holiday_day_name,
    s.holiday_name,
    s.prior_trade_date,
    s.next_trade_date,
    gas_day::date as gas_day
  from holiday_sessions s
  cross join lateral generate_series(
    (s.prior_trade_date + interval '1 day')::date,
    s.next_trade_date,
    interval '1 day'
  ) as gas_day
)
select
  holiday_date,
  holiday_day_name,
  holiday_name,
  prior_trade_date,
  next_trade_date,
  count(*)::integer as gas_days_priced_by_prior_trade_date,
  string_agg(gas_day::text, ', ' order by gas_day) as gas_day_list
from impacted_strips
group by
  holiday_date,
  holiday_day_name,
  holiday_name,
  prior_trade_date,
  next_trade_date
order by holiday_date;
