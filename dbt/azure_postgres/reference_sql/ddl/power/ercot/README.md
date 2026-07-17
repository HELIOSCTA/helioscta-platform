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
