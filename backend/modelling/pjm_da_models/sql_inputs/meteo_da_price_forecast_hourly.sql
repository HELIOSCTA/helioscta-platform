-- GENERATED FILE. DO NOT EDIT.
-- Source dbt model: dbt/azure_postgres/models/pjm_da_model/meteologica/da_price_forecast/meteologica_da_price_forecast_hourly.sql
-- Source dbt compiled SQL: dbt\azure_postgres\target\compiled\helioscta_platform\models\pjm_da_model\meteologica\da_price_forecast\meteologica_da_price_forecast_hourly.sql
-- Promotion script: dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py
-- Rebuild from dbt/azure_postgres:
--   dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
--   python scripts/promote_pjm_da_model_backend_sql.py
with params as (
    select
        %(target_date)s::date as target_date,
        %(cutoff_utc)s::timestamptz as cutoff_utc,
        %(lead_days)s::int as lead_days
),

det_source as (
    select
        d.content_id,
        d.update_id,
        d.issue_date,
        d.source_timezone,
        d.forecast_period_start,
        d.day_ahead_price,
        d.updated_at
    from "helios_prod"."meteologica"."usa_pjm_western_hub_da_power_price_forecast_hourly" d
    cross join params p
    where d.forecast_period_start >= p.target_date::timestamp
      and d.forecast_period_start < p.target_date::timestamp + interval '1 day'
      and d.issue_date is not null
      and (p.cutoff_utc is null or d.issue_date <= p.cutoff_utc)
      and (
          p.cutoff_utc is null
          or d.issue_date > p.cutoff_utc - interval '48 hours'
      )
),

ens_source as (
    select
        e.content_id,
        e.update_id,
        e.issue_date,
        e.source_timezone,
        e.forecast_period_start,
        e.average_price,
        e.bottom_price,
        e.top_price,
        e.ens_00_price,
        e.ens_01_price,
        e.ens_02_price,
        e.ens_03_price,
        e.ens_04_price,
        e.ens_05_price,
        e.ens_06_price,
        e.ens_07_price,
        e.ens_08_price,
        e.ens_09_price,
        e.ens_10_price,
        e.ens_11_price,
        e.ens_12_price,
        e.ens_13_price,
        e.ens_14_price,
        e.ens_15_price,
        e.ens_16_price,
        e.ens_17_price,
        e.ens_18_price,
        e.ens_19_price,
        e.ens_20_price,
        e.ens_21_price,
        e.ens_22_price,
        e.ens_23_price,
        e.ens_24_price,
        e.ens_25_price,
        e.ens_26_price,
        e.ens_27_price,
        e.ens_28_price,
        e.ens_29_price,
        e.ens_30_price,
        e.ens_31_price,
        e.ens_32_price,
        e.ens_33_price,
        e.ens_34_price,
        e.ens_35_price,
        e.ens_36_price,
        e.ens_37_price,
        e.ens_38_price,
        e.ens_39_price,
        e.ens_40_price,
        e.ens_41_price,
        e.ens_42_price,
        e.ens_43_price,
        e.ens_44_price,
        e.ens_45_price,
        e.ens_46_price,
        e.ens_47_price,
        e.ens_48_price,
        e.ens_49_price,
        e.ens_50_price,
        e.updated_at
    from "helios_prod"."meteologica"."usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly" e
    cross join params p
    where e.forecast_period_start >= p.target_date::timestamp
      and e.forecast_period_start < p.target_date::timestamp + interval '1 day'
      and e.issue_date is not null
      and (p.cutoff_utc is null or e.issue_date <= p.cutoff_utc)
      and (
          p.cutoff_utc is null
          or e.issue_date > p.cutoff_utc - interval '48 hours'
      )
),

det_issue as (
    select
        max(d.issue_date) as issue_date
    from det_source d
    cross join params p
    where p.lead_days is null
       or p.target_date
          - (d.issue_date at time zone coalesce(nullif(d.source_timezone, ''), 'UTC'))::date
          = p.lead_days
),

ens_issue as (
    select
        max(e.issue_date) as issue_date
    from ens_source e
    cross join params p
    where p.lead_days is null
       or p.target_date
          - (e.issue_date at time zone coalesce(nullif(e.source_timezone, ''), 'UTC'))::date
          = p.lead_days
),

det_ranked as (
    select
        d.forecast_period_start,
        extract(hour from d.forecast_period_start)::int + 1 as hour_ending,
        (d.issue_date at time zone coalesce(nullif(d.source_timezone, ''), 'UTC'))::date as as_of_date,
        d.issue_date at time zone coalesce(nullif(d.source_timezone, ''), 'UTC')
            as det_forecast_execution_datetime_local,
        d.day_ahead_price::float8 as da_price_deterministic,
        row_number() over (
            partition by d.forecast_period_start
            order by d.issue_date desc, d.updated_at desc nulls last, d.update_id desc, d.content_id desc
        ) as row_rank
    from det_source d
    inner join det_issue i on d.issue_date = i.issue_date
),

det as (
    select
        forecast_period_start,
        hour_ending,
        as_of_date,
        det_forecast_execution_datetime_local,
        da_price_deterministic
    from det_ranked
    where row_rank = 1
),

ens_ranked as (
    select
        e.forecast_period_start,
        extract(hour from e.forecast_period_start)::int + 1 as hour_ending,
        (e.issue_date at time zone coalesce(nullif(e.source_timezone, ''), 'UTC'))::date as as_of_date,
        e.issue_date at time zone coalesce(nullif(e.source_timezone, ''), 'UTC')
            as ens_forecast_execution_datetime_local,
        e.average_price::float8 as da_price_ens_average,
        e.bottom_price::float8 as da_price_ens_bottom,
        e.top_price::float8 as da_price_ens_top,
        array[
            e.ens_00_price::float8,
            e.ens_01_price::float8,
            e.ens_02_price::float8,
            e.ens_03_price::float8,
            e.ens_04_price::float8,
            e.ens_05_price::float8,
            e.ens_06_price::float8,
            e.ens_07_price::float8,
            e.ens_08_price::float8,
            e.ens_09_price::float8,
            e.ens_10_price::float8,
            e.ens_11_price::float8,
            e.ens_12_price::float8,
            e.ens_13_price::float8,
            e.ens_14_price::float8,
            e.ens_15_price::float8,
            e.ens_16_price::float8,
            e.ens_17_price::float8,
            e.ens_18_price::float8,
            e.ens_19_price::float8,
            e.ens_20_price::float8,
            e.ens_21_price::float8,
            e.ens_22_price::float8,
            e.ens_23_price::float8,
            e.ens_24_price::float8,
            e.ens_25_price::float8,
            e.ens_26_price::float8,
            e.ens_27_price::float8,
            e.ens_28_price::float8,
            e.ens_29_price::float8,
            e.ens_30_price::float8,
            e.ens_31_price::float8,
            e.ens_32_price::float8,
            e.ens_33_price::float8,
            e.ens_34_price::float8,
            e.ens_35_price::float8,
            e.ens_36_price::float8,
            e.ens_37_price::float8,
            e.ens_38_price::float8,
            e.ens_39_price::float8,
            e.ens_40_price::float8,
            e.ens_41_price::float8,
            e.ens_42_price::float8,
            e.ens_43_price::float8,
            e.ens_44_price::float8,
            e.ens_45_price::float8,
            e.ens_46_price::float8,
            e.ens_47_price::float8,
            e.ens_48_price::float8,
            e.ens_49_price::float8,
            e.ens_50_price::float8
        ] as ens_member_values,
        row_number() over (
            partition by e.forecast_period_start
            order by e.issue_date desc, e.updated_at desc nulls last, e.update_id desc, e.content_id desc
        ) as row_rank
    from ens_source e
    inner join ens_issue i on e.issue_date = i.issue_date
),

ens as (
    select
        forecast_period_start,
        hour_ending,
        as_of_date,
        ens_forecast_execution_datetime_local,
        da_price_ens_average,
        da_price_ens_bottom,
        da_price_ens_top,
        ens_member_values
    from ens_ranked
    where row_rank = 1
),

FINAL as (
    select
        coalesce(d.as_of_date, e.as_of_date) as as_of_date,
        (select target_date from params) as date,
        coalesce(d.hour_ending, e.hour_ending) as hour_ending,
        coalesce(d.forecast_period_start, e.forecast_period_start) as forecast_period_start,
        d.da_price_deterministic,
        e.da_price_ens_average,
        e.da_price_ens_bottom,
        e.da_price_ens_top,
        d.det_forecast_execution_datetime_local,
        e.ens_forecast_execution_datetime_local,
        e.ens_member_values
    from det d
    full outer join ens e using (hour_ending)
)

select *
from FINAL
order by hour_ending