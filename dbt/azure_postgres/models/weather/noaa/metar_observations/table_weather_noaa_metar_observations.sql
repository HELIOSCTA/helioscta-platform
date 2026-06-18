-- Source-table DDL for weather.noaa_metar_observations.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.weather.noaa.metar_observations.
--
-- Source system: NOAA/NWS AviationWeather Data API / api/data/metar.
-- Grain: station_id x observation_time_utc.

CREATE TABLE IF NOT EXISTS weather.noaa_metar_observations (
    station_id VARCHAR NOT NULL,
    station_name VARCHAR NOT NULL,
    region VARCHAR NOT NULL,
    observation_time_utc TIMESTAMPTZ NOT NULL,
    report_time_utc TIMESTAMPTZ,
    receipt_time_utc TIMESTAMPTZ,
    temp_f DOUBLE PRECISION,
    dew_point_f DOUBLE PRECISION,
    feels_like_f DOUBLE PRECISION,
    wind_speed_mph DOUBLE PRECISION,
    wind_gust_mph DOUBLE PRECISION,
    wind_dir_degrees DOUBLE PRECISION,
    pressure_mb DOUBLE PRECISION,
    visibility_miles DOUBLE PRECISION,
    relative_humidity_pct DOUBLE PRECISION,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    elevation_m DOUBLE PRECISION,
    flight_category VARCHAR,
    raw_metar TEXT,
    source_product_id VARCHAR NOT NULL DEFAULT 'METAR',
    source_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        station_id,
        observation_time_utc
    )
);
