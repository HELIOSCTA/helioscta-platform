{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ISO-NE External Interface Metered Data.
-- Source: https://www.iso-ne.com/isoexpress/web/reports/grid/-/tree/external-interface-metered-data
-- Grain: local date x hour ending x entity type x interface name.
-- Primary key: local_date, local_hour_ending, entity_type, interface_name.
-- Freshness field: local_date; source workbook trace is source_document_path.
---------------------------

SELECT
    local_date
    ,local_hour_ending
    ,entity_type
    ,interface_name
    ,net_interchange_mwh
    ,import_mwh
    ,export_mwh
    ,da_lmp
    ,da_energy_component
    ,da_congestion_component
    ,da_marginal_loss_component
    ,rt_lmp
    ,rt_energy_component
    ,rt_congestion_component
    ,rt_marginal_loss_component
    ,report_year
    ,source_document_path
    ,source_published_at
FROM "{{ target.database }}"."isone"."external_interface_metered_data"
WHERE local_date >= (CURRENT_DATE - INTERVAL '7 years')
