{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT Hourly Resource Outage Capacity.
-- Grain: source contract from ercot.hourly_resource_outage_capacity; primary key posteddatetime, operatingdate, hourending.
---------------------------

SELECT
    posteddatetime
    ,operatingdate
    ,hourending
    ,totalresourcemwzonesouth
    ,totalresourcemwzonenorth
    ,totalresourcemwzonewest
    ,totalresourcemwzonehouston
    ,totalirrmwzonesouth
    ,totalirrmwzonenorth
    ,totalirrmwzonewest
    ,totalirrmwzonehouston
    ,totalnewequipresourcemwzonesouth
    ,totalnewequipresourcemwzonenorth
    ,totalnewequipresourcemwzonewest
    ,totalnewequipresourcemwzonehouston
    ,updated_at
FROM "{{ target.database }}"."ercot"."hourly_resource_outage_capacity"
WHERE
    operatingdate >= '2010-01-01'::date
