# ERCOT Reference DDL

This directory contains operator reference SQL for ERCOT source tables written
by backend scrapes. These files are not dbt-managed migrations; apply them
manually with the `helios_admin` role before enabling the matching writer.

## Price Adders

The ERCOT real-time price adder batch writes two source tables:

- `ercot.rt_price_adders_sced` from `NP6-323-CD`, Real-Time Price Adders by
  SCED Interval.
- `ercot.rt_price_adders_15min` from `NP6-324-CD`, Real-Time Price Adders for
  15-Minute Settlement Interval.

Apply the schema reference first if the `ercot` schema is not already present:

```text
dbt/azure_postgres/reference_sql/ddl/setup/schemas.sql
```

Then apply the table DDL with `helios_admin`:

```text
dbt/azure_postgres/reference_sql/ddl/power/ercot/rt_price_adders_sced/table_ercot_rt_price_adders_sced.sql
dbt/azure_postgres/reference_sql/ddl/power/ercot/rt_price_adders_15min/table_ercot_rt_price_adders_15min.sql
```

Apply index files separately with autocommit enabled because they use
`CREATE INDEX CONCURRENTLY`:

```text
dbt/azure_postgres/reference_sql/ddl/power/ercot/rt_price_adders_sced/index_ercot_rt_price_adders_sced.sql
dbt/azure_postgres/reference_sql/ddl/power/ercot/rt_price_adders_15min/index_ercot_rt_price_adders_15min.sql
```

Use these read-only checks after applying:

```sql
SELECT to_regclass('ercot.rt_price_adders_sced') AS rt_price_adders_sced;
SELECT to_regclass('ercot.rt_price_adders_15min') AS rt_price_adders_15min;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'ercot'
  AND tablename IN ('rt_price_adders_sced', 'rt_price_adders_15min')
ORDER BY tablename, indexname;
```

Do not enable `helios-ercot-price-adders-batch.timer` until both tables and
indexes exist.

## Meteologica Hourly Forecasts

The ERCOT Meteologica forecast workflow writes the seven promoted large
forecast surfaces to `meteologica.ercot_forecast_hourly`:

- Aggregate ERCOT load, solar, and wind content IDs `1943`, `1840`, and
  `1877`.
- ERCOT load ForecastZone content IDs `1952`, `1954`, `1953`, and `1955` for
  Houston, North, South, and West.

The source grain is `content_id x update_id x forecast_period_start`; safe
reruns upsert by that key. The scheduled workflow emits Meteologica API fetch
telemetry to `ops.api_fetch_log`, emits freshness events to
`ops.data_availability_events` under
`ercot_meteologica_forecast_hourly`, and retains 21 days by `issue_date`.

Apply the table DDL with `helios_admin`:

```text
dbt/azure_postgres/reference_sql/ddl/power/meteologica/ercot_forecast_hourly/table_meteologica_ercot_forecast_hourly.sql
```

Apply indexes separately with autocommit enabled:

```text
dbt/azure_postgres/reference_sql/ddl/power/meteologica/ercot_forecast_hourly/index_meteologica_ercot_forecast_hourly.sql
```

Use this read-only check after the VM job runs:

```text
dbt/azure_postgres/reference_sql/ddl/power/meteologica/ercot_forecast_hourly/verify_ercot_meteologica_forecast_hourly.sql
```

Do not enable `helios-ercot-meteologica-forecast-hourly.timer` until the
`meteologica.ercot_forecast_hourly` table and indexes exist and
`XTRADERS_API_USERNAME_ISO` and `XTRADERS_API_PASSWORD_ISO` are present in
`/etc/helioscta/backend.env`.
