# ISO-NE ISO Express

ISO-NE public CSV report scrapes use ISO Express static report URLs with a
session-cookie warmup request. These feeds do not require ISO-NE-specific
credentials; scheduled writes use the standard `helios_admin` Azure Postgres
credential boundary from `/etc/helioscta/backend.env`.

## Promoted Feeds

| Feed | Source | Runtime module | Destination | Grain |
| --- | --- | --- | --- | --- |
| `da_hrl_lmps` | Hourly Day-Ahead LMPs | `backend.orchestration.power.isone.da_hrl_lmps` | `isone.da_hrl_lmps` | operating date x hour ending x location |
| `rt_hrl_lmps_final` | Final Real-Time Hourly LMPs | `backend.orchestration.power.isone.rt_hrl_lmps_final` | `isone.rt_hrl_lmps_final` | operating date x hour ending x location |
| `rt_hrl_lmps_prelim` | Preliminary Real-Time Hourly LMPs | `backend.orchestration.power.isone.rt_hrl_lmps_prelim` | `isone.rt_hrl_lmps_prelim` | operating date x hour ending x location |
| `hourly_system_demand` | Real-Time Hourly System Load Report | `backend.orchestration.power.isone.hourly_system_demand` | `isone.hourly_system_demand` | operating date x hour ending |
| `da_hrl_cleared_demand` | Day-Ahead Hourly Cleared Demand Report | `backend.orchestration.power.isone.da_hrl_cleared_demand` | `isone.da_hrl_cleared_demand` | operating date x hour ending |
| `three_day_reliability_region_demand_forecast` | Three-Day Reliability Region Demand Forecast | `backend.orchestration.power.isone.forecast_batch` | `isone.three_day_reliability_region_demand_forecast` | published timestamp x forecast date x hour ending x reliability region |
| `seven_day_capacity_forecast` | Seven-Day Capacity Forecast | `backend.orchestration.power.isone.forecast_batch` | `isone.seven_day_capacity_forecast` | forecast execution date x forecast date |
| `seven_day_wind_forecast` | Seven-Day Wind Power Forecast | `backend.orchestration.power.isone.forecast_batch` | `isone.seven_day_wind_forecast` | forecast execution date x forecast date x hour ending |
| `seven_day_solar_forecast` | Seven-Day Solar Power Forecast | `backend.orchestration.power.isone.forecast_batch` | `isone.seven_day_solar_forecast` | forecast execution date x forecast date x hour ending |

## Day-Ahead Hourly LMPs

- Source page:
  `https://www.iso-ne.com/isoexpress/web/reports/pricing/-/tree/lmps-da-hourly`
- Static CSV pattern:
  `https://www.iso-ne.com/static-transform/csv/histRpts/da-lmp/WW_DALMP_ISO_YYYYMMDD.csv`
- Primary key:
  `date, hour_ending, location_id, location_name, location_type`
- Freshness field: `date`
- Safe rerun story: upsert by the primary key.
- Validation: dbt source and staging models under
  `dbt/azure_postgres/models/power/isone/da_hrl_lmps/`, plus duplicate-key
  data test `dbt/azure_postgres/tests/test_isone_da_hrl_lmps_primary_keys.sql`.

## Final Real-Time Hourly LMPs

- Source page:
  `https://www.iso-ne.com/isoexpress/web/reports/pricing/-/tree/lmps-rt-hourly-final`
- Static CSV pattern:
  `https://www.iso-ne.com/static-transform/csv/histRpts/rt-lmp/lmp_rt_final_YYYYMMDD.csv`
- Primary key:
  `date, hour_ending, location_id, location_name, location_type`
- Freshness field: `date`
- Safe rerun story: upsert by the primary key.
- Validation: dbt source and staging models under
  `dbt/azure_postgres/models/power/isone/rt_hrl_lmps_final/`, plus
  duplicate-key data test
  `dbt/azure_postgres/tests/test_isone_rt_hrl_lmps_final_primary_keys.sql`.

## Preliminary Real-Time Hourly LMPs

- Source page:
  `https://www.iso-ne.com/isoexpress/web/reports/pricing/-/tree/lmps-rt-hourly-prelim`
- Static CSV pattern:
  `https://www.iso-ne.com/static-transform/csv/histRpts/rt-lmp/lmp_rt_prelim_YYYYMMDD.csv`
- Primary key: `date, hour_ending, location`
- Freshness field: `date`
- Safe rerun story: upsert by the primary key.
- Validation: dbt source and staging models under
  `dbt/azure_postgres/models/power/isone/rt_hrl_lmps_prelim/`, plus
  duplicate-key data test
  `dbt/azure_postgres/tests/test_isone_rt_hrl_lmps_prelim_primary_keys.sql`.

## Hourly System Demand

- Source page:
  `https://www.iso-ne.com/isoexpress/web/reports/load-and-demand`
- CSV endpoint:
  `https://www.iso-ne.com/transform/csv/hourlysystemdemand?start=YYYYMMDD&end=YYYYMMDD`
- Primary key: `date, hour_ending`
- Freshness field: `date`
- Safe rerun story: upsert by the primary key.
- Validation: dbt source and staging models under
  `dbt/azure_postgres/models/power/isone/hourly_system_demand/`, plus
  duplicate-key data test
  `dbt/azure_postgres/tests/test_isone_hourly_system_demand_primary_keys.sql`.

## Day-Ahead Hourly Cleared Demand

- Source page:
  `https://www.iso-ne.com/isoexpress/web/reports/load-and-demand`
- CSV endpoint:
  `https://www.iso-ne.com/transform/csv/hourlydayaheaddemand?start=YYYYMMDD&end=YYYYMMDD`
- Primary key: `date, hour_ending`
- Freshness field: `date`
- Safe rerun story: upsert by the primary key.
- Validation: dbt source and staging models under
  `dbt/azure_postgres/models/power/isone/da_hrl_cleared_demand/`, plus
  duplicate-key data test
  `dbt/azure_postgres/tests/test_isone_da_hrl_cleared_demand_primary_keys.sql`.

## Forecast Batch

- Runtime module: `backend.orchestration.power.isone.forecast_batch`
- Shared scrape config: `backend.scrapes.power.isone.forecast_feeds`
- Scheduled feed set:
  `three_day_reliability_region_demand_forecast`,
  `seven_day_capacity_forecast`, `seven_day_wind_forecast`, and
  `seven_day_solar_forecast`.
- Excluded by current promotion scope: ISO-NE five-minute demand and zonal
  load forecast feeds.
- Safe rerun story: each table is upserted by its documented primary key.
- Validation: read-only dbt source/query models under
  `dbt/azure_postgres/models/power/isone/forecast_feeds/`, plus per-table
  duplicate-key data tests.
