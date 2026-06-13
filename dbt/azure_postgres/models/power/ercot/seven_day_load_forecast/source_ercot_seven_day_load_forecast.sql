WITH source AS (
    SELECT
        posteddatetime,
        deliverydate,
        hourending,
        coast,
        east,
        farwest,
        north,
        northcentral,
        southcentral,
        southern,
        west,
        systemtotal,
        model,
        created_at,
        updated_at
    FROM ercot.seven_day_load_forecast
)

SELECT *
FROM source
