{{
  config(
    materialized='view',
    schema='natgas_cleaned'
  )
}}

---------------------------
-- LNG TERMINALS (SINGLE-PIPELINE FACILITIES)
---------------------------

WITH LNG_TERMINALS AS (
    SELECT

        gas_day,
        lng_plant,
        pipeline_short_name,
        tariff_zone,
        state,
        county,
        loc_name,
        location_id,
        location_role_id,
        facility,
        role,
        sign,
        cycle_code,
        cycle_name,

        AVG(scheduled_cap) AS scheduled_cap,
        AVG(signed_scheduled_cap) AS signed_scheduled_cap,
        AVG(no_notice_capacity) AS no_notice_capacity,
        AVG(operational_cap) AS operational_cap,
        AVG(available_cap) AS available_cap,
        AVG(design_cap) AS design_cap

    FROM {{ ref('source_v1_lng_noms') }}

    WHERE
        facility = 'LNG TERMINAL'
        AND lng_plant NOT IN ('CAMERON', 'FREEPORT', 'SABINE')

    GROUP BY
        gas_day, lng_plant, pipeline_short_name, tariff_zone, state, county,
        loc_name, location_id, location_role_id, facility, role, sign, cycle_code, cycle_name
),

---------------------------
-- MULTI-PIPELINE FACILITIES (CAMERON, FREEPORT, SABINE)
---------------------------

CAMERON AS (
    SELECT

        gas_day,
        lng_plant,
        NULL AS pipeline_short_name,
        NULL AS tariff_zone,
        NULL AS state,
        NULL AS county,
        NULL AS loc_name,
        NULL AS location_id,
        NULL AS location_role_id,
        'LNG TERMINAL' AS facility,
        'DELIVERY' AS role,
        -1 AS sign,
        NULL AS cycle_code,
        NULL AS cycle_name,

        SUM(scheduled_cap) AS scheduled_cap,
        SUM(signed_scheduled_cap) AS signed_scheduled_cap,
        SUM(no_notice_capacity) AS no_notice_capacity,
        SUM(operational_cap) AS operational_cap,
        SUM(available_cap) AS available_cap,
        SUM(design_cap) AS design_cap

    FROM {{ ref('source_v1_lng_noms') }}

    WHERE location_role_id IN (
        459848, 448745, 146408, 450559, 450560
    )

    GROUP BY gas_day, lng_plant
),

FREEPORT AS (
    SELECT

        gas_day,
        lng_plant,
        NULL AS pipeline_short_name,
        NULL AS tariff_zone,
        NULL AS state,
        NULL AS county,
        NULL AS loc_name,
        NULL AS location_id,
        NULL AS location_role_id,
        'LNG TERMINAL' AS facility,
        'DELIVERY' AS role,
        -1 AS sign,
        NULL AS cycle_code,
        NULL AS cycle_name,

        SUM(scheduled_cap) AS scheduled_cap,
        SUM(signed_scheduled_cap) AS signed_scheduled_cap,
        SUM(no_notice_capacity) AS no_notice_capacity,
        SUM(operational_cap) AS operational_cap,
        SUM(available_cap) AS available_cap,
        SUM(design_cap) AS design_cap

    FROM {{ ref('source_v1_lng_noms') }}

    WHERE location_role_id IN (
        450509, 453638
    )

    GROUP BY gas_day, lng_plant
),

SABINE AS (
    SELECT

        gas_day,
        lng_plant,
        NULL AS pipeline_short_name,
        NULL AS tariff_zone,
        NULL AS state,
        NULL AS county,
        NULL AS loc_name,
        NULL AS location_id,
        NULL AS location_role_id,
        'LNG TERMINAL' AS facility,
        'DELIVERY' AS role,
        -1 AS sign,
        NULL AS cycle_code,
        NULL AS cycle_name,

        SUM(scheduled_cap) AS scheduled_cap,
        SUM(signed_scheduled_cap) AS signed_scheduled_cap,
        SUM(no_notice_capacity) AS no_notice_capacity,
        SUM(operational_cap) AS operational_cap,
        SUM(available_cap) AS available_cap,
        SUM(design_cap) AS design_cap

    FROM {{ ref('source_v1_lng_noms') }}

    WHERE location_role_id IN (
        442852, 443783, 407215, 451831, 443989, 446638
    )

    GROUP BY gas_day, lng_plant
),

---------------------------
-- COMBINED
---------------------------

COMBINED AS (
    SELECT * FROM LNG_TERMINALS
    UNION ALL
    SELECT * FROM CAMERON
    UNION ALL
    SELECT * FROM FREEPORT
    UNION ALL
    SELECT * FROM SABINE
),

---------------------------
-- GENSCAPE TOTAL
---------------------------

GENSCAPE_LNG AS (
    SELECT

        gas_day,
        'GENSCAPE_LNG' AS lng_plant,
        NULL AS pipeline_short_name,
        NULL AS tariff_zone,
        NULL AS state,
        NULL AS county,
        NULL AS loc_name,
        NULL AS location_id,
        NULL AS location_role_id,
        facility,
        role,
        sign,
        NULL AS cycle_code,
        NULL AS cycle_name,

        SUM(scheduled_cap) AS scheduled_cap,
        SUM(signed_scheduled_cap) AS signed_scheduled_cap,
        SUM(no_notice_capacity) AS no_notice_capacity,
        SUM(operational_cap) AS operational_cap,
        SUM(available_cap) AS available_cap,
        SUM(design_cap) AS design_cap

    FROM COMBINED
    GROUP BY gas_day, facility, role, sign
),

---------------------------
-- FINAL
---------------------------

FINAL AS (
    SELECT * FROM COMBINED
    UNION ALL
    SELECT * FROM GENSCAPE_LNG
)

SELECT * FROM FINAL
