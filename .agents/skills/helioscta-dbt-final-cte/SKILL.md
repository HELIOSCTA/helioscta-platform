---
name: helioscta-dbt-final-cte
description: Enforce HeliosCTA dbt SQL model style for dbt/azure_postgres. Use when creating, editing, reviewing, or formatting dbt .sql models, especially positions_and_trades_v2 marts and export/review models, so models use an explicit terminal FINAL CTE and end with SELECT * FROM FINAL.
---

# HeliosCTA dbt FINAL CTE

Use this skill for dbt SQL model style under `dbt/azure_postgres`.

## Standard

Use a terminal `FINAL` CTE for the outward-facing result set. The final
statement should be:

```sql
select *
from FINAL
```

Use this pattern for marts by default, and for source/intermediate models when
the model exposes a shaped contract that other models or generated SQL depend
on.

If a model needs deterministic display order for `dbt show`, generated SQL, or
operator review, put `order by` after `from FINAL`, matching existing
positions/trades models.

## Editing Rules

- Keep `FINAL` as the last CTE.
- Keep column selection, renames, casts, and comments inside `FINAL`; keep the
  final statement boring.
- Do not leave business logic in the final `select * from FINAL` statement
  except an optional `order by`.
- Preserve existing materialization, source refs, filters, and output columns
  unless the user explicitly asks for contract changes.
- For export-facing marts, keep legacy/source columns first and append derived
  review/export fields after them when that is the existing downstream
  contract.
- When deleting a dbt model folder, remove stale `dbt_project.yml` config and
  README references for that folder.
- Remember that `dbt/azure_postgres` is read-only dbt. Do not add models that
  create, update, insert, delete, or persist database objects unless the user
  explicitly changes that contract.

## Workflow

1. Read `dbt/azure_postgres/README.md`,
   `dbt/azure_postgres/dbt_project.yml`, and nearest sibling models before
   editing.
2. Identify the intended grain and downstream consumer for any mart or
   export-facing model.
3. Refactor the model to end with a terminal `FINAL` CTE and
   `select * from FINAL`.
4. Run the checker from the repo root:

```powershell
python .agents\skills\helioscta-dbt-final-cte\scripts\check_final_cte.py dbt\azure_postgres\models\positions_and_trades_v2
```

5. Run dbt verification from `dbt/azure_postgres`:

```powershell
dbt parse --profiles-dir .
dbt compile --profiles-dir .
```

If local `.env` or `profiles.yml` is missing, report that verification was
skipped and say exactly which file or variable was unavailable.
