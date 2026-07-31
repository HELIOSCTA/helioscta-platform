-- GENERATED FILE. DO NOT EDIT.
-- Source dbt model: dbt/azure_postgres/models/pjm_da_model/pjm/da_lmps_hourly/pjm_da_lmps_hourly.sql
-- Source dbt compiled SQL: dbt\azure_postgres\target\compiled\helioscta_platform\models\pjm_da_model\pjm\da_lmps_hourly\pjm_da_lmps_hourly.sql
-- Promotion script: dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py
-- Rebuild from dbt/azure_postgres:
--   dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
--   python scripts/promote_pjm_da_model_backend_sql.py
with params as (
    select
        %(target_date)s::date as target_date,
        %(hub)s::text as hub
),

source_rows as (
    select
        a.datetime_beginning_ept,
        a.pnode_name,
        a.total_lmp_da,
        a.system_energy_price_da,
        a.updated_at
    from "helios_prod"."pjm"."da_hrl_lmps" a
    cross join params p
    where a.datetime_beginning_ept >= p.target_date::timestamp
      and a.datetime_beginning_ept < p.target_date::timestamp + interval '1 day'
      and a.pnode_name = p.hub
      and a.row_is_current = true
),

FINAL as (
    select
        a.datetime_beginning_ept::date as date,
        extract(hour from a.datetime_beginning_ept)::int + 1 as hour_ending,
        a.pnode_name::text as region,
        a.total_lmp_da::float8 as lmp,
        a.system_energy_price_da::float8 as lmp_system_energy_price,
        a.updated_at as updated_at
    from source_rows a
)

select *
from FINAL
order by hour_ending