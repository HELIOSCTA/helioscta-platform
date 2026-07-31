-- GENERATED FILE. DO NOT EDIT.
-- Source dbt model: dbt/azure_postgres/models/pjm_da_model/pjm/load_forecast_hourly/pjm_rto_load_forecast_hourly_history.sql
-- Source dbt compiled SQL: dbt\azure_postgres\target\compiled\helioscta_platform\models\pjm_da_model\pjm\load_forecast_hourly\pjm_rto_load_forecast_hourly_history.sql
-- Promotion script: dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py
-- Rebuild from dbt/azure_postgres:
--   dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
--   python scripts/promote_pjm_da_model_backend_sql.py
with params as (
    select
        %(start_date)s::date as start_date,
        %(end_date)s::date as end_date,
        %(load_region)s::text as load_region,
        %(lead_days)s::int as lead_days
),

source_rows as (
    select
        l.evaluated_at_datetime_ept,
        l.evaluated_at_datetime_utc,
        l.evaluated_at_datetime_ept::date as forecast_execution_date,
        l.forecast_datetime_beginning_ept::date as forecast_date,
        extract(hour from l.forecast_datetime_beginning_ept)::int + 1 as hour_ending,
        case
            when l.forecast_area in ('RTO_COMBINED', 'RTO COMBINED') then 'RTO'
            else l.forecast_area::text
        end as region,
        l.forecast_load_mw::float8 as forecast_load_mw,
        l.updated_at
    from "helios_prod"."pjm"."load_frcstd_7_day" l
    cross join params p
    where l.forecast_datetime_beginning_ept >= p.start_date::timestamp
      and l.forecast_datetime_beginning_ept < p.end_date::timestamp + interval '1 day'
      and case
            when l.forecast_area in ('RTO_COMBINED', 'RTO COMBINED') then 'RTO'
            else l.forecast_area::text
          end = p.load_region
      and l.evaluated_at_datetime_ept is not null
),

eligible as (
    select
        s.*,
        (s.forecast_date - p.lead_days)::date as as_of_date,
        (s.forecast_date - p.lead_days + time '10:00') as cutoff_ept
    from source_rows s
    cross join params p
    where s.evaluated_at_datetime_ept <= (s.forecast_date - p.lead_days + time '10:00')
      and s.evaluated_at_datetime_ept > (
          (s.forecast_date - p.lead_days + time '10:00') - interval '48 hours'
      )
),

ranked as (
    select
        e.*,
        row_number() over (
            partition by e.as_of_date, e.forecast_date, e.hour_ending, e.region
            order by e.evaluated_at_datetime_ept desc, e.updated_at desc nulls last
        ) as row_rank
    from eligible e
),

FINAL as (
    select
        r.as_of_date,
        r.forecast_date as date,
        r.hour_ending,
        r.region,
        r.forecast_load_mw,
        r.forecast_load_mw as load_mw_at_hour,
        r.evaluated_at_datetime_ept as forecast_execution_datetime_ept,
        r.evaluated_at_datetime_utc as forecast_execution_datetime_utc,
        r.forecast_execution_date,
        r.updated_at
    from ranked r
    where r.row_rank = 1
)

select *
from FINAL
order by date, hour_ending