{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT day-ahead daily settlement point price aggregates.
-- Grain: delivery date x settlement point x period.
---------------------------

WITH hourly AS (
    SELECT
        date
        ,hour_ending
        ,settlement_point
        ,da_lmp
    FROM {{ ref('staging_ercot_lmps_da_hourly') }}
),

daily AS (
    SELECT
        date
        ,settlement_point
        ,'flat' AS period
        ,AVG(da_lmp) AS da_lmp
        ,COUNT(*) AS hours_present
    FROM hourly
    GROUP BY date, settlement_point

    UNION ALL

    SELECT
        date
        ,settlement_point
        ,'onpeak' AS period
        ,AVG(da_lmp) AS da_lmp
        ,COUNT(*) AS hours_present
    FROM hourly
    WHERE hour_ending BETWEEN 8 AND 23
    GROUP BY date, settlement_point

    UNION ALL

    SELECT
        date
        ,settlement_point
        ,'offpeak' AS period
        ,AVG(da_lmp) AS da_lmp
        ,COUNT(*) AS hours_present
    FROM hourly
    WHERE hour_ending NOT BETWEEN 8 AND 23
    GROUP BY date, settlement_point
)

SELECT
    date
    ,settlement_point
    ,period
    ,da_lmp
    ,hours_present
FROM daily

