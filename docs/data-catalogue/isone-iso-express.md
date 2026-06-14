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
