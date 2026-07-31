-- GENERATED FILE. DO NOT EDIT.
-- Source dbt model: dbt/azure_postgres/models/pjm_da_model/pjm/gen_outages/pjm_gen_outages_daily_history.sql
-- Source dbt compiled SQL: dbt\azure_postgres\target\compiled\helioscta_platform\models\pjm_da_model\pjm\gen_outages\pjm_gen_outages_daily_history.sql
-- Promotion script: dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py
-- Rebuild from dbt/azure_postgres:
--   dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
--   python scripts/promote_pjm_da_model_backend_sql.py
with params as (
    select
        %(start_date)s::date as start_date,
        %(end_date)s::date as end_date,
        %(region)s::text as region,
        %(lead_days)s::int as lead_days
),

source_rows as (
    select
        o.forecast_date,
        o.forecast_execution_date_ept,
        case
            when o.region = 'PJM RTO' then 'RTO'
            when o.region = 'Western' then 'WEST'
            when o.region = 'Mid Atlantic - Dominion' then 'MIDATL_DOM'
            else o.region::text
        end as region,
        o.total_outages_mw,
        o.updated_at
    from "helios_prod"."pjm"."gen_outages_by_type" o
    cross join params p
    where o.forecast_date >= p.start_date
      and o.forecast_date <= p.end_date
      and o.forecast_execution_date_ept = o.forecast_date - p.lead_days
      and case
            when o.region = 'PJM RTO' then 'RTO'
            when o.region = 'Western' then 'WEST'
            when o.region = 'Mid Atlantic - Dominion' then 'MIDATL_DOM'
            else o.region::text
          end = p.region
),

ranked as (
    select
        s.*,
        row_number() over (
            partition by s.forecast_date, s.region
            order by s.forecast_execution_date_ept desc nulls last, s.updated_at desc nulls last
        ) as row_rank
    from source_rows s
),

FINAL as (
    select
        r.forecast_date as date,
        r.region::text as region,
        r.total_outages_mw::float8 as outage_total_mw,
        r.forecast_execution_date_ept,
        r.updated_at
    from ranked r
    where r.row_rank = 1
)

select *
from FINAL
order by date