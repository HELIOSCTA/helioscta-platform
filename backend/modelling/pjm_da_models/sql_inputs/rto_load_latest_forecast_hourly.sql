-- GENERATED FILE. DO NOT EDIT.
-- Source dbt model: dbt/azure_postgres/models/pjm_da_model/pjm/load_forecast_hourly/pjm_rto_load_latest_forecast_hourly.sql
-- Source dbt compiled SQL: dbt\azure_postgres\target\compiled\helioscta_platform\models\pjm_da_model\pjm\load_forecast_hourly\pjm_rto_load_latest_forecast_hourly.sql
-- Promotion script: dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py
-- Rebuild from dbt/azure_postgres:
--   dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
--   python scripts/promote_pjm_da_model_backend_sql.py
with params as (
    select
        %(start_date)s::date as start_date,
        %(end_date)s::date as end_date,
        %(cutoff_utc)s::timestamptz as cutoff_utc,
        %(load_region)s::text as load_region
),

source_rows as (
    select
        l.evaluated_at_datetime_ept,
        l.evaluated_at_datetime_utc,
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
      and (
          p.cutoff_utc is null
          or l.evaluated_at_datetime_ept <= (p.cutoff_utc at time zone 'America/New_York')
      )
      and (
          p.cutoff_utc is null
          or l.evaluated_at_datetime_ept > (
              (p.cutoff_utc at time zone 'America/New_York') - interval '48 hours'
          )
      )
),

ranked as (
    select
        s.*,
        row_number() over (
            partition by s.forecast_date, s.hour_ending, s.region
            order by s.evaluated_at_datetime_ept desc, s.updated_at desc nulls last
        ) as row_rank
    from source_rows s
),

FINAL as (
    select
        r.forecast_date as date,
        r.hour_ending,
        r.region,
        r.forecast_load_mw,
        r.forecast_load_mw as load_mw_at_hour,
        r.evaluated_at_datetime_ept as forecast_execution_datetime_ept,
        r.evaluated_at_datetime_utc as forecast_execution_datetime_utc,
        r.updated_at
    from ranked r
    where r.row_rank = 1
)

select *
from FINAL
order by date, hour_ending