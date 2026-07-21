# Repo Skills

Repo-scoped skills live here so Codex desktop, CLI, and scheduled runs started
inside this repository can discover reusable HeliosCTA workflows.

## Available Skills

- `positions-trades-product-matching`: run, monitor, and triage
  `dbt/azure_postgres` product-matching tests for NAV positions and Clear
  Street all-history rows. Use for scheduled/manual `tag:product_matching`
  runs, NAV freshness prechecks, unresolved `rule_status` failures,
  failure-row sampling, and alias/catalog/rule-fix proposals.
- `helioscta-telemetry-health`: check `ops.api_fetch_log` and
  `ops.data_availability_events` for failed, stale, missing, or incomplete
  scheduled scripts using read-only production telemetry.
- `helioscta-dbt-final-cte`: enforce terminal `FINAL` CTE style for
  `dbt/azure_postgres` SQL models and run the bundled style checker.

## Validation

From the repo root:

```powershell
python C:\Users\AidanKeaveny\.codex\skills\.system\skill-creator\scripts\quick_validate.py .agents\skills\positions-trades-product-matching
python C:\Users\AidanKeaveny\.codex\skills\.system\skill-creator\scripts\quick_validate.py .agents\skills\helioscta-telemetry-health
python C:\Users\AidanKeaveny\.codex\skills\.system\skill-creator\scripts\quick_validate.py .agents\skills\helioscta-dbt-final-cte
```
