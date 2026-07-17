-- Source-table DDL for weather.wsi_hourly_observed_temperatures.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.weather.wsi.hourly_observed.
--
-- Source system: WSI Trader Historical Observations,
-- GetHistoricalObservations / HISTORICAL_HOURLY_OBSERVED.
-- Grain: station_id x observation_time_local x region.

CREATE TABLE IF NOT EXISTS weather.wsi_hourly_observed_temperatures (
    station_id VARCHAR NOT NULL,
    station_name VARCHAR NOT NULL,
    region VARCHAR NOT NULL,
    observation_date DATE NOT NULL,
    hour_beginning INTEGER NOT NULL,
    observation_time_local TIMESTAMP NOT NULL,
    temp_f DOUBLE PRECISION,
    dew_point_f DOUBLE PRECISION,
    feels_like_f DOUBLE PRECISION,
    wind_chill_f DOUBLE PRECISION,
    heat_index_f DOUBLE PRECISION,
    wind_speed_mph DOUBLE PRECISION,
    wind_dir_degrees DOUBLE PRECISION,
    relative_humidity_pct DOUBLE PRECISION,
    cloud_cover_pct DOUBLE PRECISION,
    precip_in DOUBLE PRECISION,
    source_product_id VARCHAR NOT NULL DEFAULT 'HISTORICAL_HOURLY_OBSERVED',
    source_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        station_id,
        observation_time_local,
        region
    )
);
