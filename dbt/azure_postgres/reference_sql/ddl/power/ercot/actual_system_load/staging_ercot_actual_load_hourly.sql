WITH source AS (
    SELECT *
    FROM {{ ref('source_ercot_actual_system_load') }}
),

unpivoted AS (
    SELECT operatingday, hourending, 'north' AS forecast_zone, north AS load_mw, updated_at FROM source
    UNION ALL
    SELECT operatingday, hourending, 'south' AS forecast_zone, south AS load_mw, updated_at FROM source
    UNION ALL
    SELECT operatingday, hourending, 'west' AS forecast_zone, west AS load_mw, updated_at FROM source
    UNION ALL
    SELECT operatingday, hourending, 'houston' AS forecast_zone, houston AS load_mw, updated_at FROM source
    UNION ALL
    SELECT operatingday, hourending, 'total' AS forecast_zone, total AS load_mw, updated_at FROM source
)

SELECT
    operatingday AS operating_date,
    hourending,
    forecast_zone,
    load_mw,
    updated_at
FROM unpivoted
WHERE load_mw IS NOT NULL
