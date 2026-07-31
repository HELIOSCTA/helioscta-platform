

---------------------------
-- SALTS DAILY FLOWS (BCF)
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
),  __dbt__cte__source_v1_salts_reference_table as (


---------------------------
-- SALTS STORAGE FACILITY LOOKUP
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
        -- Arcadia Gas Storage
        ('arcadia', 'Arcadia Gas Storage LLC', 406856, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Bay Gas Storage
        ,('bay_gas', 'Bay Gas Storage Company, LTD', 451209, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Boardwalk Storage Company, FKA Petrologistics
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434201, 'INTRASTATE INTERCONNECT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434202, 'INTRASTATE INTERCONNECT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434203, 'INTRASTATE INTERCONNECT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434204, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434205, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434206, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434207, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434208, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434209, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434210, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434211, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434212, 'GAS PROCESSING PLANT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434213, 'GAS PROCESSING PLANT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434218, 'INTRASTATE INTERCONNECT', 'RECEIPT', 1)
        -- NOTE: below are older locations pre-2023-09-30
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434215, 'STORAGE', 'INJECTION', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434223, 'STORAGE', 'WITHDRAWAL', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434216, 'GATHERING SYSTEM INTERCONNECT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 452155, 'POOL POINT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 455375, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434217, 'GATHERING SYSTEM INTERCONNECT', 'RECEIPT', 1)

        -- Bobcat Gas Storage
        ,('bobcat', 'Bobcat Gas Storage', 147334, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Egan
        ,('egan', 'Egan', 427681, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Eminence Storage
        ,('eminence', 'Transcontinental Gas Pipe Line Corporation', 97355, 'STORAGE', 'INJECTION', 1)
        ,('eminence', 'Transcontinental Gas Pipe Line Corporation', 97354, 'STORAGE', 'WITHDRAWAL', -1)

        -- Golden Triangle
        ,('golden_triangle', 'Golden Triangle Storage', 413637, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Jefferson Island Storage
        ,('jefferson_island', 'Columbia Gulf Transmission', 110858, 'INTERSTATE INTERCONNECT', 'RECEIPT', -1)
        ,('jefferson_island', 'Columbia Gulf Transmission', 126358, 'INTERSTATE INTERCONNECT', 'DELIVERY', 1)
        ,('jefferson_island', 'Gulf South Pipeline Company LP', 90704, 'INTERSTATE INTERCONNECT', 'RECEIPT', -1)
        ,('jefferson_island', 'Gulf South Pipeline Company LP', 91299, 'INTERSTATE INTERCONNECT', 'DELIVERY', 1)
        ,('jefferson_island', 'Natural Gas Pipeline Company of America, LLC', 120575, 'STORAGE', 'INJECTION', 1)
        ,('jefferson_island', 'Natural Gas Pipeline Company of America, LLC', 120140, 'STORAGE', 'WITHDRAWAL', -1)
        ,('jefferson_island', 'Sabine Pl', 109292, 'INTERSTATE INTERCONNECT', 'RECEIPT', -1)
        ,('jefferson_island', 'Sabine Pl', 146236, 'INTERSTATE INTERCONNECT', 'DELIVERY', 1)
        ,('jefferson_island', 'Sea Robin', 124974, 'INTERSTATE INTERCONNECT', 'DELIVERY', 1)
        ,('jefferson_island', 'Tennessee Gas Pipeline', 115353, 'INTERSTATE INTERCONNECT', 'RECEIPT', -1)
        ,('jefferson_island', 'Tennessee Gas Pipeline', 116572, 'INTERSTATE INTERCONNECT', 'DELIVERY', 1)
        ,('jefferson_island', 'Texas Gas Transmission Corp', 404305, 'INTERSTATE INTERCONNECT', 'RECEIPT', -1)
        ,('jefferson_island', 'Texas Gas Transmission Corp', 404306, 'INTERSTATE INTERCONNECT', 'DELIVERY', 1)
        ,('jefferson_island', 'Trunkline Gas Company', 87020, 'INTERSTATE INTERCONNECT', 'RECEIPT', -1)
        ,('jefferson_island', 'Trunkline Gas Company', 119451, 'INTERSTATE INTERCONNECT', 'DELIVERY', 1)

        -- Keystone Storage
        ,('keystone', 'El Paso Natural Gas', 89250, 'STORAGE', 'INJECTION', 1)
        ,('keystone', 'El Paso Natural Gas', 89317, 'STORAGE', 'WITHDRAWAL', -1)
        ,('keystone', 'Northern Natural Gas Pipeline', 103468, 'STORAGE', 'INJECTION', 1)
        ,('keystone', 'Northern Natural Gas Pipeline', 103439, 'STORAGE', 'WITHDRAWAL', -1)
        ,('keystone', 'Transwestern Pipeline Company', 121175, 'STORAGE', 'INJECTION', 1)
        ,('keystone', 'Transwestern Pipeline Company', 121207, 'STORAGE', 'WITHDRAWAL', -1)

        -- LA Storage
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147123, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147125, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147126, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147127, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147128, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147129, 'INTRASTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147130, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147131, 'INTRASTATE INTERCONNECT', 'DELIVERY', -1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147132, 'INTRASTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147133, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147134, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147135, 'INTRASTATE INTERCONNECT', 'DELIVERY', -1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 428437, 'INTRASTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 428438, 'INTRASTATE INTERCONNECT', 'DELIVERY', -1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 454914, 'INTRASTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 456153, 'INTRASTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 459166, 'INTRASTATE INTERCONNECT', 'WITHDRAWAL', -1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 459765, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)

        -- Leaf River
        ,('leaf_river', 'Leaf River Energy Center', 428334, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Mississippi Hub
        ,('mississippi_hub', 'Mississippi Hub LLC', 419195, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('mississippi_hub', 'Mississippi Hub LLC', 419196, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('mississippi_hub', 'Mississippi Hub LLC', 419197, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('mississippi_hub', 'Mississippi Hub LLC', 419198, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('mississippi_hub', 'Mississippi Hub LLC', 427240, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('mississippi_hub', 'Mississippi Hub LLC', 427241, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('mississippi_hub', 'Mississippi Hub LLC', 450635, 'POOL POINT', 'RECEIPT', 1)

        -- Moss Bluff Storage
        ,('moss_bluff', 'Texas Eastern Transmission Co', 105604, 'STORAGE', 'INJECTION', 1)
        ,('moss_bluff', 'Texas Eastern Transmission Co', 105608, 'STORAGE', 'WITHDRAWAL', -1)
        ,('moss_bluff', 'Natural Gas Pipeline Company of America, LLC', 120612, 'STORAGE', 'INJECTION', 1)
        ,('moss_bluff', 'Natural Gas Pipeline Company of America, LLC', 120176, 'STORAGE', 'WITHDRAWAL', -1)

        -- Perryville
        ,('perryville', 'Perryville Gas Storage', 435745, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Petal Storage
        ,('petal', 'Gulf South Pipeline Company LP', 146835, 'STORAGE', 'INJECTION', 1)
        ,('petal', 'Gulf South Pipeline Company LP', 146837, 'STORAGE', 'WITHDRAWAL', -1)

        -- Pine Prairie
        ,('pine_prarie', 'Pine Prairie Energy Center LLC', 147084, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Southern Pines
        ,('southern_pines', 'Southern Pines Energy Center', 406799, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Tres Palacios
        ,('tres_palacios', 'Tres Palacios Gas Storage LLC', 147016, 'STORAGE', 'NET FAC WITHDRAWAL', -1)
) AS lookup_data(storage_facility_name, pipeline_name, location_role_id, facility, role, storage_sign)
),  __dbt__cte__staging_v1_salts_noms as (


---------------------------
-- SALTS NOMINATION FLOWS
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
JOIN __dbt__cte__source_v1_salts_reference_table AS lookup
    ON noms.location_role_id = lookup.location_role_id
), SALTS_DAILY_FLOWS AS (

    SELECT

        gas_day,

        SUM(storage_signed_scheduled_cap / 1000000) AS salts_total,
        SUM(CASE WHEN storage_facility_name IN ('golden_triangle', 'keystone', 'moss_bluff', 'tres_palacios') THEN storage_signed_scheduled_cap / 1000000 END) AS salts_tx,
        SUM(CASE WHEN storage_facility_name IN ('arcadia', 'boardwalk', 'bobcat', 'egan', 'jefferson_island', 'la_storage', 'perryville', 'pine_prarie') THEN storage_signed_scheduled_cap / 1000000 END) AS salts_la,
        SUM(CASE WHEN storage_facility_name IN ('eminence', 'leaf_river', 'mississippi_hub', 'petal', 'southern_pines') THEN storage_signed_scheduled_cap / 1000000 END) AS salts_ms,
        SUM(CASE WHEN storage_facility_name IN ('bay_gas') THEN storage_signed_scheduled_cap / 1000000 END) AS salts_al,

        -- TX
        SUM(CASE WHEN storage_facility_name = 'golden_triangle' THEN storage_signed_scheduled_cap / 1000000 END) AS golden_triangle,
        SUM(CASE WHEN storage_facility_name = 'keystone' THEN storage_signed_scheduled_cap / 1000000 END) AS keystone,
        SUM(CASE WHEN storage_facility_name = 'moss_bluff' THEN storage_signed_scheduled_cap / 1000000 END) AS moss_bluff,
        SUM(CASE WHEN storage_facility_name = 'tres_palacios' THEN storage_signed_scheduled_cap / 1000000 END) AS tres_palacios,

        -- LA
        SUM(CASE WHEN storage_facility_name = 'arcadia' THEN storage_signed_scheduled_cap / 1000000 END) AS arcadia,
        SUM(CASE WHEN storage_facility_name = 'boardwalk' THEN storage_signed_scheduled_cap / 1000000 END) AS boardwalk,
        SUM(CASE WHEN storage_facility_name = 'bobcat' THEN storage_signed_scheduled_cap / 1000000 END) AS bobcat,
        SUM(CASE WHEN storage_facility_name = 'egan' THEN storage_signed_scheduled_cap / 1000000 END) AS egan,
        SUM(CASE WHEN storage_facility_name = 'jefferson_island' THEN storage_signed_scheduled_cap / 1000000 END) AS jefferson_island,
        SUM(CASE WHEN storage_facility_name = 'la_storage' THEN storage_signed_scheduled_cap / 1000000 END) AS la_storage,
        SUM(CASE WHEN storage_facility_name = 'perryville' THEN storage_signed_scheduled_cap / 1000000 END) AS perryville,
        SUM(CASE WHEN storage_facility_name = 'pine_prarie' THEN storage_signed_scheduled_cap / 1000000 END) AS pine_prarie,

        -- MS
        SUM(CASE WHEN storage_facility_name = 'eminence' THEN storage_signed_scheduled_cap / 1000000 END) AS eminence,
        SUM(CASE WHEN storage_facility_name = 'leaf_river' THEN storage_signed_scheduled_cap / 1000000 END) AS leaf_river,
        SUM(CASE WHEN storage_facility_name = 'mississippi_hub' THEN storage_signed_scheduled_cap / 1000000 END) AS mississippi_hub,
        SUM(CASE WHEN storage_facility_name = 'petal' THEN storage_signed_scheduled_cap / 1000000 END) AS petal,
        SUM(CASE WHEN storage_facility_name = 'southern_pines' THEN storage_signed_scheduled_cap / 1000000 END) AS southern_pines,

        -- AL
        SUM(CASE WHEN storage_facility_name = 'bay_gas' THEN storage_signed_scheduled_cap / 1000000 END) AS bay_gas

    FROM __dbt__cte__staging_v1_salts_noms

    GROUP BY gas_day
),

---------------------------
-- FINAL
---------------------------

FINAL AS (
    SELECT * FROM SALTS_DAILY_FLOWS
)

SELECT * FROM FINAL