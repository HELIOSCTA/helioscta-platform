

---------------------------
-- SALTS INVENTORY METRICS
---------------------------

WITH  __dbt__cte__source_v1_genscape_noms as (


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

FROM "GenscapeDataFeed"."natgas"."nominations" AS noms
LEFT JOIN "GenscapeDataFeed"."natgas"."nomination_cycles" AS noms_cycles
    ON noms.cycle_code = noms_cycles.cycle_code
LEFT JOIN "GenscapeDataFeed"."natgas"."no_notice" AS no_notice
    ON noms.location_role_id = no_notice.location_role_id
    AND noms.gas_day = no_notice.gas_day
LEFT JOIN "GenscapeDataFeed"."natgas"."location_role" AS lr
    ON noms.location_role_id = lr.location_role_id
LEFT JOIN "GenscapeDataFeed"."natgas"."location_extended" AS le
    ON lr.location_id = le.location_id
LEFT JOIN "GenscapeDataFeed"."natgas"."pipelines" AS p
    ON le.pipeline_id = p.pipeline_id
LEFT JOIN "GenscapeDataFeed"."natgas"."pipelines" AS interconnect
    ON le.interconnecting_entity = interconnect.name

WHERE noms.gas_day >= '2020-01-01'
),  __dbt__cte__source_v1_salts_inventories_reference_table as (


---------------------------
-- SALTS INVENTORY FACILITY LOOKUP
---------------------------

SELECT
    storage_facility_name,
    pipeline_name,
    location_role_id,
    facility,
    role,
    storage_sign
FROM (
    VALUES
        -- Eminence
        ('eminence', 'Transcontinental Gas Pipe Line Corporation', 97892, 'STORAGE', 'INVENTORY', 1)
        ,('eminence', 'Transcontinental Gas Pipe Line Corporation', 428372, 'STORAGE', 'CHANGE_INVENTORY', -1)
        ,('eminence', 'Transcontinental Gas Pipe Line Corporation', 97355, 'STORAGE', 'INJECTION', 1)
        ,('eminence', 'Transcontinental Gas Pipe Line Corporation', 97354, 'STORAGE', 'WITHDRAWAL', -1)

        -- Golden Triangle
        ,('golden_triangle', 'Golden Triangle Storage', 413635, 'STORAGE', 'INVENTORY', 1)
        ,('golden_triangle', 'Golden Triangle Storage', 428415, 'STORAGE', 'CHANGE_INVENTORY', -1)
        ,('golden_triangle', 'Golden Triangle Storage', 413637, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Perryville
        ,('perryville', 'Perryville Gas Storage', 457823, 'STORAGE', 'INVENTORY', 1)
        ,('perryville', 'Perryville Gas Storage', 435745, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Pine Prairie
        ,('pine_prarie', 'Pine Prairie Energy Center LLC', 106681, 'STORAGE', 'INVENTORY', 1)
        ,('pine_prarie', 'Pine Prairie Energy Center LLC', 428406, 'STORAGE', 'CHANGE_INVENTORY', -1)
        ,('pine_prarie', 'Pine Prairie Energy Center LLC', 147084, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Southern Pines
        ,('southern_pines', 'Southern Pines Energy Center', 428640, 'STORAGE', 'INVENTORY', 1)
        ,('southern_pines', 'Southern Pines Energy Center', 406799, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

) AS lookup_data(storage_facility_name, pipeline_name, location_role_id, facility, role, storage_sign)
),  __dbt__cte__staging_v1_salts_inventories as (


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

FROM __dbt__cte__source_v1_genscape_noms AS noms
JOIN __dbt__cte__source_v1_salts_inventories_reference_table AS lookup
    ON noms.location_role_id = lookup.location_role_id
), SALTS_DAILY_FLOWS AS (

    SELECT

        gas_day,

        -- Eminence
        SUM(CASE WHEN storage_facility_name = 'eminence' AND role IN ('INVENTORY') THEN storage_signed_scheduled_cap END) AS eminence_inv,
        SUM(CASE WHEN storage_facility_name = 'eminence' AND role IN ('CHANGE_INVENTORY') THEN storage_signed_scheduled_cap END) AS eminence_delta,
        SUM(CASE WHEN storage_facility_name = 'eminence' AND role IN ('INJECTION', 'WITHDRAWAL') THEN storage_signed_scheduled_cap END) AS eminence_daily_flows,
        SUM(CASE WHEN storage_facility_name = 'eminence' AND role IN ('INVENTORY') THEN available_cap END) AS eminence_available_cap,
        SUM(CASE WHEN storage_facility_name = 'eminence' AND role IN ('INVENTORY') THEN operational_cap END) AS eminence_operational_cap,
        SUM(CASE WHEN storage_facility_name = 'eminence' AND role IN ('INVENTORY') THEN design_cap END) AS eminence_design_cap,

        -- Golden Triangle
        SUM(CASE WHEN storage_facility_name = 'golden_triangle' AND role IN ('INVENTORY') THEN storage_signed_scheduled_cap END) AS golden_triangle_inv,
        SUM(CASE WHEN storage_facility_name = 'golden_triangle' AND role IN ('CHANGE_INVENTORY') THEN storage_signed_scheduled_cap END) AS golden_triangle_delta,
        SUM(CASE WHEN storage_facility_name = 'golden_triangle' AND role IN ('NET FAC WITHDRAWAL') THEN storage_signed_scheduled_cap END) AS golden_triangle_daily_flows,
        SUM(CASE WHEN storage_facility_name = 'golden_triangle' AND role IN ('INVENTORY') THEN available_cap END) AS golden_triangle_available_cap,
        SUM(CASE WHEN storage_facility_name = 'golden_triangle' AND role IN ('INVENTORY') THEN operational_cap END) AS golden_triangle_operational_cap,
        SUM(CASE WHEN storage_facility_name = 'golden_triangle' AND role IN ('INVENTORY') THEN design_cap END) AS golden_triangle_design_cap,

        -- Perryville
        SUM(CASE WHEN storage_facility_name = 'perryville' AND role IN ('INVENTORY') THEN storage_signed_scheduled_cap END) AS perryville_inv,
        SUM(CASE WHEN storage_facility_name = 'perryville' AND role IN ('NET FAC WITHDRAWAL') THEN storage_signed_scheduled_cap END) AS perryville_daily_flows,
        SUM(CASE WHEN storage_facility_name = 'perryville' AND role IN ('INVENTORY') THEN available_cap END) AS perryville_available_cap,
        SUM(CASE WHEN storage_facility_name = 'perryville' AND role IN ('INVENTORY') THEN operational_cap END) AS perryville_operational_cap,
        SUM(CASE WHEN storage_facility_name = 'perryville' AND role IN ('INVENTORY') THEN design_cap END) AS perryville_design_cap,

        -- Pine Prairie
        SUM(CASE WHEN storage_facility_name = 'pine_prarie' AND role IN ('INVENTORY') THEN storage_signed_scheduled_cap END) AS pine_prarie_inv,
        SUM(CASE WHEN storage_facility_name = 'pine_prarie' AND role IN ('CHANGE_INVENTORY') THEN storage_signed_scheduled_cap END) AS pine_prarie_delta,
        SUM(CASE WHEN storage_facility_name = 'pine_prarie' AND role IN ('NET FAC WITHDRAWAL') THEN storage_signed_scheduled_cap END) AS pine_prarie_daily_flows,
        SUM(CASE WHEN storage_facility_name = 'pine_prarie' AND role IN ('INVENTORY') THEN available_cap END) AS pine_prarie_available_cap,
        SUM(CASE WHEN storage_facility_name = 'pine_prarie' AND role IN ('INVENTORY') THEN operational_cap END) AS pine_prarie_operational_cap,
        SUM(CASE WHEN storage_facility_name = 'pine_prarie' AND role IN ('INVENTORY') THEN design_cap END) AS pine_prarie_design_cap,

        -- Southern Pines
        SUM(CASE WHEN storage_facility_name = 'southern_pines' AND role IN ('INVENTORY') THEN storage_signed_scheduled_cap END) AS southern_pines_inv,
        SUM(CASE WHEN storage_facility_name = 'southern_pines' AND role IN ('NET FAC WITHDRAWAL') THEN storage_signed_scheduled_cap END) AS southern_pines_daily_flows,
        SUM(CASE WHEN storage_facility_name = 'southern_pines' AND role IN ('INVENTORY') THEN available_cap END) AS southern_pines_available_cap,
        SUM(CASE WHEN storage_facility_name = 'southern_pines' AND role IN ('INVENTORY') THEN operational_cap END) AS southern_pines_operational_cap,
        SUM(CASE WHEN storage_facility_name = 'southern_pines' AND role IN ('INVENTORY') THEN design_cap END) AS southern_pines_design_cap

    FROM __dbt__cte__staging_v1_salts_inventories

    GROUP BY gas_day
),

---------------------------
-- FINAL
---------------------------

FINAL AS (
    SELECT * FROM SALTS_DAILY_FLOWS
)

SELECT * FROM FINAL