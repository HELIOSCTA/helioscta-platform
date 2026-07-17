WITH source AS (
    SELECT *
    FROM {{ ref('source_ercot_seven_day_load_forecast') }}
),

unpivoted AS (
    SELECT posteddatetime, deliverydate, hourending, model, 'coast' AS weather_zone, coast AS forecast_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, deliverydate, hourending, model, 'east' AS weather_zone, east AS forecast_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, deliverydate, hourending, model, 'far_west' AS weather_zone, farwest AS forecast_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, deliverydate, hourending, model, 'north' AS weather_zone, north AS forecast_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, deliverydate, hourending, model, 'north_central' AS weather_zone, northcentral AS forecast_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, deliverydate, hourending, model, 'south_central' AS weather_zone, southcentral AS forecast_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, deliverydate, hourending, model, 'southern' AS weather_zone, southern AS forecast_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, deliverydate, hourending, model, 'west' AS weather_zone, west AS forecast_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, deliverydate, hourending, model, 'system_total' AS weather_zone, systemtotal AS forecast_mw, updated_at FROM source
)

SELECT
    posteddatetime AS posted_datetime,
    deliverydate AS delivery_date,
    hourending,
    model,
    weather_zone,
    forecast_mw,
    updated_at
FROM unpivoted
WHERE forecast_mw IS NOT NULL
