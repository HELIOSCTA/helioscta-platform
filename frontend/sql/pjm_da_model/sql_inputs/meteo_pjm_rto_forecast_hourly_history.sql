-- GENERATED FILE. DO NOT EDIT.
-- Source dbt model: dbt/azure_postgres/models/pjm_da_model/meteologica/pjm_forecast_hourly/meteologica_pjm_rto_forecast_hourly_history.sql
-- Source dbt compiled SQL: dbt\azure_postgres\target\compiled\helioscta_platform\models\pjm_da_model\meteologica\pjm_forecast_hourly\meteologica_pjm_rto_forecast_hourly_history.sql
-- Promotion script: dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py
-- Rebuild from dbt/azure_postgres:
--   dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
--   python scripts/promote_pjm_da_model_backend_sql.py
with params as (
    select
        %(start_date)s::date as start_date,
        %(end_date)s::date as end_date,
        %(region)s::text as region,
        %(forecast_area)s::text as forecast_area,
        %(lead_days)s::int as lead_days
),

source_rows as (
    select
        m.content_id,
        m.update_id,
        m.issue_date,
        m.issue_date at time zone 'America/New_York' as issue_date_ept,
        m.metric,
        m.region,
        m.forecast_area,
        m.forecast_period_start,
        m.forecast_period_start::date as forecast_date,
        extract(hour from m.forecast_period_start)::int + 1 as hour_ending,
        m.forecast_mw,
        m.updated_at
    from "helios_prod"."meteologica"."pjm_forecast_hourly" m
    cross join params p
    where m.forecast_period_start >= p.start_date::timestamp
      and m.forecast_period_start < p.end_date::timestamp + interval '1 day'
      and m.region = p.region
      and m.forecast_area = p.forecast_area
      and m.metric in ('load', 'solar', 'wind')
      and m.issue_date is not null
),

eligible as (
    select
        s.*,
        (s.forecast_date - p.lead_days)::date as as_of_date,
        (s.forecast_date - p.lead_days + time '10:00') as cutoff_ept
    from source_rows s
    cross join params p
    where s.issue_date_ept <= (s.forecast_date - p.lead_days + time '10:00')
      and s.issue_date_ept > (
          (s.forecast_date - p.lead_days + time '10:00') - interval '48 hours'
      )
),

ranked as (
    select
        e.*,
        row_number() over (
            partition by e.as_of_date, e.metric, e.forecast_period_start
            order by e.issue_date desc, e.updated_at desc nulls last, e.update_id desc, e.content_id desc
        ) as row_rank
    from eligible e
),

latest_rows as (
    select
        r.as_of_date,
        r.forecast_period_start,
        r.forecast_date,
        r.hour_ending,
        r.metric,
        r.forecast_mw,
        r.issue_date,
        r.issue_date_ept,
        r.updated_at
    from ranked r
    where r.row_rank = 1
),

hourly as (
    select
        l.as_of_date,
        l.forecast_date as date,
        l.hour_ending,
        avg(case when l.metric = 'load' then l.forecast_mw end)::float8 as load_mw_at_hour,
        avg(case when l.metric = 'solar' then l.forecast_mw end)::float8 as solar_at_hour,
        avg(case when l.metric = 'wind' then l.forecast_mw end)::float8 as wind_at_hour,
        max(l.issue_date) as latest_issue_date,
        max(l.issue_date_ept) as latest_issue_date_ept,
        max(l.updated_at) as updated_at
    from latest_rows l
    group by
        l.as_of_date,
        l.forecast_date,
        l.hour_ending
),

FINAL as (
    select
        h.as_of_date,
        h.date,
        h.hour_ending,
        h.load_mw_at_hour,
        h.solar_at_hour,
        h.wind_at_hour,
        (
            h.load_mw_at_hour
            - coalesce(h.solar_at_hour, 0.0)
            - coalesce(h.wind_at_hour, 0.0)
        )::float8 as net_load_at_hour,
        h.latest_issue_date,
        h.latest_issue_date_ept,
        h.updated_at
    from hourly h
)

select *
from FINAL
order by date, hour_ending