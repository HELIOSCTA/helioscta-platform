WITH source AS (
    SELECT
        operatingday,
        hourending,
        north,
        south,
        west,
        houston,
        total,
        created_at,
        updated_at
    FROM ercot.actual_system_load
)

SELECT *
FROM source
