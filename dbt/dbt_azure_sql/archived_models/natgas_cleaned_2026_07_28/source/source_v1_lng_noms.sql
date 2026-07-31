{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- LNG PLANT NOMINATIONS
---------------------------

SELECT

    gas_day,

    -- LNG_PLANT
    CASE
        WHEN location_role_id IN (455459, 455478, 455460, 455461) THEN 'CALCASIEU'
        WHEN location_role_id IN (459848, 448745, 146408, 450559, 450560) THEN 'CAMERON'
        WHEN location_role_id IN (451132, 451129, 452017, 451131, 451127, 451128, 456768, 451126, 451122, 451121) THEN 'CORPUS_CHRISTI'
        WHEN location_role_id IN (107330, 446775, 431454) THEN 'COVE_POINT'
        WHEN location_role_id IN (451516) THEN 'ELBA'
        WHEN location_role_id IN (450509, 453638) THEN 'FREEPORT'
        WHEN location_role_id IN (425923, 425927, 425929, 425931, 458851, 425921, 425910, 425912, 425915, 425917, 4259194, 458849, 428435) THEN 'GOLDEN_PASS'
        WHEN location_role_id IN (459099, 459985, 460312, 459101) THEN 'PLAQUEMINES'
        WHEN location_role_id IN (442852, 407216, 442892, 407219, 442851, 442775, 451344, 407215, 443783, 443989, 446638, 451831, 454499, 455986) THEN 'SABINE'
        ELSE NULL
    END AS lng_plant,

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

    scheduled_cap,
    signed_scheduled_cap,
    no_notice_capacity,
    operational_cap,
    available_cap,
    design_cap

FROM {{ ref('source_v1_genscape_noms') }}

WHERE location_role_id IN (
    -- CALCASIEU
    455459, 455478, 455460, 455461,
    -- CAMERON
    459848, 448745, 146408, 450559, 450560,
    -- CORPUS_CHRISTI
    451132, 451129, 452017, 451131, 451127, 451128, 456768, 451126, 451122, 451121,
    -- COVE_POINT
    107330, 446775, 431454,
    -- ELBA
    451516,
    -- FREEPORT
    450509, 453638,
    -- GOLDEN_PASS
    425923, 425927, 425929, 425931, 458851, 425921, 425910, 425912, 425915, 425917, 4259194, 458849, 428435,
    -- PLAQUEMINES
    459099, 459985, 460312, 459101,
    -- SABINE
    442852, 407216, 442892, 407219, 442851, 442775, 451344, 407215, 443783, 443989, 446638, 451831, 454499, 455986
)
AND gas_day >= '2020-01-01'
