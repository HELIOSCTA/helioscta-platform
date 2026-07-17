{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ISO-NE day-ahead daily LMP aggregates.
-- Grain: operating date x location x period.
---------------------------

WITH hourly AS (
    SELECT * FROM {{ ref('staging_isone_lmps_da_hourly') }}
),

daily AS (
    SELECT
        date
        ,location_id
        ,location_name
        ,location_type
        ,'flat' AS period
        ,AVG(da_lmp_total) AS da_lmp_total
        ,AVG(da_lmp_energy_component) AS da_lmp_energy_component
        ,AVG(da_lmp_congestion_component) AS da_lmp_congestion_component
        ,AVG(da_lmp_marginal_loss_component) AS da_lmp_marginal_loss_component
        ,COUNT(*) AS hours_present
    FROM hourly
    GROUP BY date, location_id, location_name, location_type

    UNION ALL

    SELECT
        date
        ,location_id
        ,location_name
        ,location_type
        ,'onpeak' AS period
        ,AVG(da_lmp_total) AS da_lmp_total
        ,AVG(da_lmp_energy_component) AS da_lmp_energy_component
        ,AVG(da_lmp_congestion_component) AS da_lmp_congestion_component
        ,AVG(da_lmp_marginal_loss_component) AS da_lmp_marginal_loss_component
        ,COUNT(*) AS hours_present
    FROM hourly
    WHERE hour_ending BETWEEN 8 AND 23
    GROUP BY date, location_id, location_name, location_type

    UNION ALL

    SELECT
        date
        ,location_id
        ,location_name
        ,location_type
        ,'offpeak' AS period
        ,AVG(da_lmp_total) AS da_lmp_total
        ,AVG(da_lmp_energy_component) AS da_lmp_energy_component
        ,AVG(da_lmp_congestion_component) AS da_lmp_congestion_component
        ,AVG(da_lmp_marginal_loss_component) AS da_lmp_marginal_loss_component
        ,COUNT(*) AS hours_present
    FROM hourly
    WHERE hour_ending NOT BETWEEN 8 AND 23
    GROUP BY date, location_id, location_name, location_type
)

SELECT
    date
    ,location_id
    ,location_name
    ,location_type
    ,period
    ,da_lmp_total
    ,da_lmp_energy_component
    ,da_lmp_congestion_component
    ,da_lmp_marginal_loss_component
    ,hours_present
FROM daily
