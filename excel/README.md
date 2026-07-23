# Excel Models

Versioned Excel workbook models and workbook-specific reference artifacts live
here. Keep database DDL under `dbt/azure_postgres/reference_sql/ddl/`; this
folder is for extracted workbook SQL, migration notes, and validation material
that belong to an Excel-facing model contract.

Use this shape for promoted workbook artifacts:

```text
excel/<source>/<domain>/<yyyy_mm_dd_model_slug>/
```

For each versioned model, keep the workbook-specific SQL and notes together.
Local `.xlsm` workbook binaries can live beside those files for inspection, but
they are ignored by git. Active dbt models that compile SQL for Excel consumers
stay under `dbt/azure_postgres/models/`.
