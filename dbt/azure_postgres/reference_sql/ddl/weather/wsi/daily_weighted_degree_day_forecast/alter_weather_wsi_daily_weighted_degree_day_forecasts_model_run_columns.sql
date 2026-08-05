-- Operator-applied ALTER for existing
-- weather.wsi_daily_weighted_degree_day_forecasts tables.
--
-- Apply with helios_admin before deploying code that writes WSI WDD model-run
-- metadata. These columns are nullable so existing hot rows remain valid.

ALTER TABLE weather.wsi_daily_weighted_degree_day_forecasts
    ADD COLUMN IF NOT EXISTS source_model VARCHAR,
    ADD COLUMN IF NOT EXISTS source_init_at_utc TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS source_init_cycle VARCHAR,
    ADD COLUMN IF NOT EXISTS model_run_cycle VARCHAR,
    ADD COLUMN IF NOT EXISTS forecast_day INTEGER;
