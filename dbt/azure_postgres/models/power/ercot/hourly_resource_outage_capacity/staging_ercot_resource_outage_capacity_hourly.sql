{{
  config(
    materialized='ephemeral'
  )
}}

WITH source AS (
    SELECT *
    FROM {{ ref('source_ercot_hourly_resource_outage_capacity') }}
),

unpivoted AS (
    SELECT posteddatetime, operatingdate, hourending, 'total_resource' AS outage_capacity_type, 'south' AS load_zone, totalresourcemwzonesouth AS outage_capacity_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, operatingdate, hourending, 'total_resource' AS outage_capacity_type, 'north' AS load_zone, totalresourcemwzonenorth AS outage_capacity_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, operatingdate, hourending, 'total_resource' AS outage_capacity_type, 'west' AS load_zone, totalresourcemwzonewest AS outage_capacity_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, operatingdate, hourending, 'total_resource' AS outage_capacity_type, 'houston' AS load_zone, totalresourcemwzonehouston AS outage_capacity_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, operatingdate, hourending, 'irr' AS outage_capacity_type, 'south' AS load_zone, totalirrmwzonesouth AS outage_capacity_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, operatingdate, hourending, 'irr' AS outage_capacity_type, 'north' AS load_zone, totalirrmwzonenorth AS outage_capacity_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, operatingdate, hourending, 'irr' AS outage_capacity_type, 'west' AS load_zone, totalirrmwzonewest AS outage_capacity_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, operatingdate, hourending, 'irr' AS outage_capacity_type, 'houston' AS load_zone, totalirrmwzonehouston AS outage_capacity_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, operatingdate, hourending, 'new_equipment' AS outage_capacity_type, 'south' AS load_zone, totalnewequipresourcemwzonesouth AS outage_capacity_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, operatingdate, hourending, 'new_equipment' AS outage_capacity_type, 'north' AS load_zone, totalnewequipresourcemwzonenorth AS outage_capacity_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, operatingdate, hourending, 'new_equipment' AS outage_capacity_type, 'west' AS load_zone, totalnewequipresourcemwzonewest AS outage_capacity_mw, updated_at FROM source
    UNION ALL
    SELECT posteddatetime, operatingdate, hourending, 'new_equipment' AS outage_capacity_type, 'houston' AS load_zone, totalnewequipresourcemwzonehouston AS outage_capacity_mw, updated_at FROM source
)

SELECT
    posteddatetime AS posted_datetime,
    operatingdate AS operating_date,
    hourending,
    outage_capacity_type,
    load_zone,
    outage_capacity_mw,
    updated_at
FROM unpivoted
WHERE outage_capacity_mw IS NOT NULL
