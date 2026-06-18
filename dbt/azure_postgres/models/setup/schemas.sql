-- Application schema DDL.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before applying table_*.sql
-- files that create objects in these schemas.

CREATE SCHEMA IF NOT EXISTS pjm AUTHORIZATION helios_admin;
CREATE SCHEMA IF NOT EXISTS ercot AUTHORIZATION helios_admin;
CREATE SCHEMA IF NOT EXISTS isone AUTHORIZATION helios_admin;
CREATE SCHEMA IF NOT EXISTS meteologica AUTHORIZATION helios_admin;
CREATE SCHEMA IF NOT EXISTS miso AUTHORIZATION helios_admin;
CREATE SCHEMA IF NOT EXISTS weather AUTHORIZATION helios_admin;
CREATE SCHEMA IF NOT EXISTS ops AUTHORIZATION helios_admin;
CREATE SCHEMA IF NOT EXISTS alerts AUTHORIZATION helios_admin;
