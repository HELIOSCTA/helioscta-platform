{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ISO-NE final real-time daily LMP aggregates.
-- Grain: operating date x location x period.
---------------------------

WITH hourly AS (
    SELECT * FROM {{ ref('staging_isone_lmps_rt_final_hourly') }}
),

daily AS (
    SELECT
        date
        ,location_id
        ,location_name
        ,location_type
        ,'flat' AS period
        ,AVG(rt_lmp_total) AS rt_lmp_total
        ,AVG(rt_lmp_energy_component) AS rt_lmp_energy_component
        ,AVG(rt_lmp_congestion_component) AS rt_lmp_congestion_component
        ,AVG(rt_lmp_marginal_loss_component) AS rt_lmp_marginal_loss_component
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
        ,AVG(rt_lmp_total) AS rt_lmp_total
        ,AVG(rt_lmp_energy_component) AS rt_lmp_energy_component
        ,AVG(rt_lmp_congestion_component) AS rt_lmp_congestion_component
        ,AVG(rt_lmp_marginal_loss_component) AS rt_lmp_marginal_loss_component
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
        ,AVG(rt_lmp_total) AS rt_lmp_total
        ,AVG(rt_lmp_energy_component) AS rt_lmp_energy_component
        ,AVG(rt_lmp_congestion_component) AS rt_lmp_congestion_component
        ,AVG(rt_lmp_marginal_loss_component) AS rt_lmp_marginal_loss_component
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
    ,rt_lmp_total
    ,rt_lmp_energy_component
    ,rt_lmp_congestion_component
    ,rt_lmp_marginal_loss_component
    ,hours_present
FROM daily
