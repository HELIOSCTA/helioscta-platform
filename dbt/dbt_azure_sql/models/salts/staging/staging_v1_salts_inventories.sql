{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- SALTS INVENTORY FLOWS
---------------------------

SELECT

    gas_day,
    lookup.storage_facility_name,
    lookup.storage_sign,
    pipeline_id,
    lookup.pipeline_name,
    pipeline_short_name,
    tariff_zone,
    tz_id,
    state,
    county,
    loc_name,
    location_id,
    lookup.location_role_id,
    lookup.facility,
    lookup.role,
    role_code,
    interconnecting_entity,
    interconnecting_pipeline_short_name,
    meter,
    drn,
    latitude,
    longitude,
    sign,
    cycle_code,
    cycle_name,
    units,
    pipeline_balance_flag,
    storage_flag,

    scheduled_cap,
    (scheduled_cap * lookup.storage_sign) AS storage_signed_scheduled_cap,
    no_notice_capacity,
    available_cap,
    operational_cap,
    design_cap

FROM {{ ref('source_v1_genscape_noms') }} AS noms
JOIN {{ ref('source_v1_salts_inventories_reference_table') }} AS lookup
    ON noms.location_role_id = lookup.location_role_id
