{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- GAS DAY DATE SPINE
---------------------------

SELECT

    -- YEAR
    YEAR(date) AS year,
    CAST(CONCAT(YEAR(date), '-', MONTH(date), '-01') AS DATE) AS year_month,

    -- SUMMER / WINTER
    CASE
        WHEN MONTH(date) IN (11, 12, 1, 2, 3) THEN 'WINTER'
        WHEN MONTH(date) IN (4, 5, 6, 7, 8, 9, 10) THEN 'SUMMER'
        ELSE NULL
    END AS summer_winter,
    CASE
        WHEN MONTH(date) IN (1, 2, 3) THEN 'XH-' + RIGHT(CAST(YEAR(date) AS VARCHAR), 2)
        WHEN MONTH(date) IN (11, 12) THEN 'XH-' + RIGHT(CAST(YEAR(date) + 1 AS VARCHAR), 2)
        WHEN MONTH(date) IN (4, 5, 6, 7, 8, 9, 10) THEN 'JV-' + RIGHT(CAST(YEAR(date) AS VARCHAR), 2)
        ELSE NULL
    END AS summer_winter_yyyy,

    -- MONTH
    MONTH(date) AS month,
    FORMAT(date, 'MM-dd') AS mm_dd,
    CAST(CAST(YEAR(GETDATE()) AS VARCHAR) + '-' + FORMAT(date, 'MM-dd') AS DATE) AS mm_dd_cy,

    -- EIA WEEKS
    DATEADD(DAY,
        CASE
            WHEN (DATEPART(WEEKDAY, date) - 6) >= 0
            THEN -(DATEPART(WEEKDAY, date) - 6 - 7)
            ELSE -(DATEPART(WEEKDAY, date) - 6)
        END,
        date) AS eia_storage_week,
    DATEPART(WEEK, DATEADD(DAY,
        CASE
            WHEN (DATEPART(WEEKDAY, date) - 6) >= 0
            THEN -(DATEPART(WEEKDAY, date) - 6 - 7)
            ELSE -(DATEPART(WEEKDAY, date) - 6)
        END,
        date)) AS eia_storage_week_number,

    -- DAILY
    date AS gas_day,

    -- WEEKENDS/HOLIDAYS
    TRIM(DATENAME(WEEKDAY, date)) AS day_of_week,
    DATEPART(WEEKDAY, date) AS day_of_week_number,
    CASE
        WHEN DATEPART(WEEKDAY, date) IN (1, 7) THEN 1
        ELSE 0
    END AS is_weekend,
    CASE
        WHEN date IN (SELECT nerc_holiday FROM {{ ref('utils_v1_nerc_holidays') }}) THEN 1
        ELSE 0
    END AS is_nerc_holiday

FROM (
    SELECT DATEADD(DAY,
        (t1.n * 1000) + (t2.n * 100) + (t3.n * 10) + t4.n,
        CAST('2010-01-01' AS DATE)) AS date
    FROM
        (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL
         SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t1
    CROSS JOIN
        (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL
         SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t2
    CROSS JOIN
        (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL
         SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t3
    CROSS JOIN
        (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL
         SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t4
    WHERE DATEADD(DAY,
        (t1.n * 1000) + (t2.n * 100) + (t3.n * 10) + t4.n,
        CAST('2010-01-01' AS DATE)) <= DATEADD(YEAR, 7, DATEADD(YEAR, DATEDIFF(YEAR, 0, GETDATE()), 0))
) AS DAYS
WHERE FORMAT(date, 'MM-dd') != '02-29'
