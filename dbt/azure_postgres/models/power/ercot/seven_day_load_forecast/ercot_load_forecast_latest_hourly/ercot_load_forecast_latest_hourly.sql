WITH ranked AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY delivery_date, hourending, model, weather_zone
            ORDER BY posted_datetime DESC
        ) AS latest_rank
    FROM {{ ref('staging_ercot_load_forecast_hourly') }}
)

SELECT
    posted_datetime,
    delivery_date,
    hourending,
    model,
    weather_zone,
    forecast_mw,
    updated_at
FROM ranked
WHERE latest_rank = 1
