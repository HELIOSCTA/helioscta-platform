-- Source-table DDL for isone.external_interface_metered_data.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.isone.external_interface_metered_data or
-- backend.orchestration.power.isone.external_interface_metered_data.

CREATE TABLE IF NOT EXISTS isone.external_interface_metered_data (
    local_date DATE NOT NULL,
    local_hour_ending INTEGER NOT NULL,
    entity_type VARCHAR NOT NULL,
    interface_name VARCHAR NOT NULL,
    net_interchange_mwh DOUBLE PRECISION,
    import_mwh DOUBLE PRECISION,
    export_mwh DOUBLE PRECISION,
    da_lmp DOUBLE PRECISION,
    da_energy_component DOUBLE PRECISION,
    da_congestion_component DOUBLE PRECISION,
    da_marginal_loss_component DOUBLE PRECISION,
    rt_lmp DOUBLE PRECISION,
    rt_energy_component DOUBLE PRECISION,
    rt_congestion_component DOUBLE PRECISION,
    rt_marginal_loss_component DOUBLE PRECISION,
    report_year INTEGER NOT NULL,
    source_document_path VARCHAR NOT NULL,
    source_published_at VARCHAR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        local_date,
        local_hour_ending,
        entity_type,
        interface_name
    )
);
