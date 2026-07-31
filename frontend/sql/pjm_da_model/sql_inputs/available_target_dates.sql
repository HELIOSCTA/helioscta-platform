-- GENERATED FILE. DO NOT EDIT.
-- Source dbt model: dbt/azure_postgres/models/pjm_da_model/meteologica/da_price_forecast/meteologica_da_price_forecast_available_dates.sql
-- Source dbt compiled SQL: dbt\azure_postgres\target\compiled\helioscta_platform\models\pjm_da_model\meteologica\da_price_forecast\meteologica_da_price_forecast_available_dates.sql
-- Promotion script: dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py
-- Rebuild from dbt/azure_postgres:
--   dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
--   python scripts/promote_pjm_da_model_backend_sql.py
with params as (
    select
        %(start_date)s::date as start_date,
        %(cutoff_utc)s::timestamptz as cutoff_utc,
        %(limit)s::int as row_limit
),

det_source as (
    select
        d.forecast_period_start
    from "helios_prod"."meteologica"."usa_pjm_western_hub_da_power_price_forecast_hourly" d
    cross join params p
    where d.forecast_period_start >= p.start_date::timestamp
      and (p.cutoff_utc is null or d.issue_date <= p.cutoff_utc)
),

ens_source as (
    select
        e.forecast_period_start
    from "helios_prod"."meteologica"."usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly" e
    cross join params p
    where e.forecast_period_start >= p.start_date::timestamp
      and (p.cutoff_utc is null or e.issue_date <= p.cutoff_utc)
),

det_dates as (
    select
        d.forecast_period_start::date as forecast_date
    from det_source d
    group by d.forecast_period_start::date
    having count(distinct extract(hour from d.forecast_period_start)) >= 24
),

ens_dates as (
    select
        e.forecast_period_start::date as forecast_date
    from ens_source e
    group by e.forecast_period_start::date
    having count(distinct extract(hour from e.forecast_period_start)) >= 24
),

FINAL as (
    select
        det_dates.forecast_date::text as forecast_date
    from det_dates
    inner join ens_dates using (forecast_date)
)

select *
from FINAL
order by forecast_date
limit (select row_limit from params)