-- Optional index SQL for isone.external_interface_metered_data.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role after the table exists.

CREATE INDEX IF NOT EXISTS idx_isone_external_interface_metered_data_date_entity
    ON isone.external_interface_metered_data (
        local_date,
        entity_type,
        interface_name
    );

CREATE INDEX IF NOT EXISTS idx_isone_external_interface_metered_data_year
    ON isone.external_interface_metered_data (
        report_year
    );
