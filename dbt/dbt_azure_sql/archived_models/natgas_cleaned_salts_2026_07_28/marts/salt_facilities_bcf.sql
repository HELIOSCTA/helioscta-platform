{{
  config(
    materialized='view',
    schema='natgas_cleaned'
  )
}}

---------------------------
-- SALTS DAILY FLOWS (BCF)
---------------------------

WITH SALTS_DAILY_FLOWS AS (

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

    FROM {{ ref('staging_v1_salts_noms') }}

    GROUP BY gas_day
),

---------------------------
-- FINAL
---------------------------

FINAL AS (
    SELECT * FROM SALTS_DAILY_FLOWS
)

SELECT * FROM FINAL
