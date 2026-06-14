{{
  config(
    materialized='ephemeral'
  )
}}

SELECT
    local_date
    ,local_hour_ending
    ,(
        local_date::timestamp
        + ((local_hour_ending - 1) * INTERVAL '1 hour')
    ) AS datetime_beginning_local
    ,(
        local_date::timestamp
        + (local_hour_ending * INTERVAL '1 hour')
    ) AS datetime_ending_local
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
FROM {{ ref('source_isone_external_interface_metered_data') }}
