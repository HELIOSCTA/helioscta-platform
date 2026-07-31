{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ENRICHED NOMINATIONS
---------------------------

SELECT
    noms.gas_day,

    -- location details
    le.pipeline_id,
    p.name AS pipeline_name,
    p.short_name AS pipeline_short_name,
    le.tariff_zone,
    le.tz_id,
    le.state,
    le.county,
    le.loc_name,
    lr.location_id,
    noms.location_role_id,
    le.facility,
    lr.role,
    lr.role_code,
    le.interconnecting_entity,
    interconnect.short_name AS interconnecting_pipeline_short_name,

    -- meter details
    lr.meter,
    lr.drn,
    le.latitude,
    le.longitude,

    -- nomination details
    lr.sign,
    noms.cycle_code,
    noms_cycles.name AS cycle_name,
    noms.units,

    -- flags
    le.location_best_flow AS pipeline_balance_flag,
    lr.best_storage AS storage_flag,

    -- nominations
    noms.scheduled_cap,
    noms.scheduled_cap * lr.sign AS signed_scheduled_cap,
    no_notice.no_notice_capacity,
    noms.operational_cap,
    noms.available_cap,
    noms.design_cap

FROM {{ source('natgas_v1', 'nominations') }} AS noms
LEFT JOIN {{ source('natgas_v1', 'nomination_cycles') }} AS noms_cycles
    ON noms.cycle_code = noms_cycles.cycle_code
LEFT JOIN {{ source('natgas_v1', 'no_notice') }} AS no_notice
    ON noms.location_role_id = no_notice.location_role_id
    AND noms.gas_day = no_notice.gas_day
LEFT JOIN {{ source('natgas_v1', 'location_role') }} AS lr
    ON noms.location_role_id = lr.location_role_id
LEFT JOIN {{ source('natgas_v1', 'location_extended') }} AS le
    ON lr.location_id = le.location_id
LEFT JOIN {{ source('natgas_v1', 'pipelines') }} AS p
    ON le.pipeline_id = p.pipeline_id
LEFT JOIN {{ source('natgas_v1', 'pipelines') }} AS interconnect
    ON le.interconnecting_entity = interconnect.name

WHERE noms.gas_day >= '2020-01-01'
