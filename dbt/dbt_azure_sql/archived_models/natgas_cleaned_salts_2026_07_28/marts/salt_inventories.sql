{{
  config(
    materialized='view',
    schema='natgas_cleaned'
  )
}}

---------------------------
-- SALTS INVENTORY METRICS
---------------------------

WITH SALTS_DAILY_FLOWS AS (

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

    FROM {{ ref('staging_v1_salts_inventories') }}

    GROUP BY gas_day
),

---------------------------
-- FINAL
---------------------------

FINAL AS (
    SELECT * FROM SALTS_DAILY_FLOWS
)

SELECT * FROM FINAL
