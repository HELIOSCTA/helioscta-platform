# Manual Backfills

Use this runbook for controlled PJM hourly LMP replays. Backfills write to the
same canonical production tables as the scheduled jobs and rely on the same
idempotent upsert keys.

## Scope

Covered workflows:

- `backend.backfills.power.pjm.da_hrl_lmps`
- `backend.backfills.power.pjm.rt_hrl_lmps`
- `backend.backfills.power.pjm.rt_unverified_hrl_lmps`

Destination tables:

- `pjm.da_hrl_lmps`
- `pjm.rt_hrl_lmps`
- `pjm.rt_unverified_hrl_lmps`

Backfill runs add `run_mode=backfill`, `backfill_workflow`,
`backfill_start_date`, and `backfill_end_date` to `ops.api_fetch_log.metadata`
for the PJM API requests they issue. Backfill entry points call lower-level
scrape modules; scheduled orchestrators remain responsible for polling and
data-readiness events.

## Safety Rules

- Run from the production VM as the `helios` service user.
- Prefer small windows first.
- Default maximum windows:
  - DA hourly LMPs: `31` days.
  - RT verified hourly LMPs: `31` days.
  - RT unverified hourly LMPs: `30` days.
- Future dates are rejected unless `allow_future=True` is passed.
- Do not run a backfill during the matching scheduled timer window unless the
  overlap is intentional.

## VM Command Pattern

Use `systemd-run` instead of sourcing `/etc/helioscta/backend.env` in a shell.
The environment file can contain characters such as `$` that shell expansion
would alter if sourced directly.

Dry-run example:

```bash
cat > /tmp/helios_da_backfill.py <<'PY'
from backend.backfills.power.pjm.da_hrl_lmps import main

print(main(start_date="2026-06-10", end_date="2026-06-10", dry_run=True))
PY

sudo systemd-run --unit=helios-da-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_da_backfill.py
rm -f /tmp/helios_da_backfill.py
```

## DA Hourly LMP Backfill

```bash
cat > /tmp/helios_da_backfill.py <<'PY'
from backend.backfills.power.pjm.da_hrl_lmps import main

print(main(start_date="2026-06-01", end_date="2026-06-07"))
PY

sudo systemd-run --unit=helios-da-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_da_backfill.py
rm -f /tmp/helios_da_backfill.py
```

## RT Verified Hourly LMP Backfill

```bash
cat > /tmp/helios_rt-hrl-backfill.py <<'PY'
from backend.backfills.power.pjm.rt_hrl_lmps import main

print(main(start_date="2026-06-10", end_date="2026-06-10"))
PY

sudo systemd-run --unit=helios-rt-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_rt-hrl-backfill.py
rm -f /tmp/helios_rt-hrl-backfill.py
```

## RT Unverified Hourly LMP Backfill

```bash
cat > /tmp/helios_rt-unverified-hrl-backfill.py <<'PY'
from backend.backfills.power.pjm.rt_unverified_hrl_lmps import main

print(main(start_date="2026-06-10", end_date="2026-06-10"))
PY

sudo systemd-run --unit=helios-rt-unverified-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_rt-unverified-hrl-backfill.py
rm -f /tmp/helios_rt-unverified-hrl-backfill.py
```

## Verification

Check API telemetry for backfill context:

```sql
SELECT
    pipeline_name,
    status,
    http_status,
    rows_returned,
    metadata,
    created_at
FROM ops.api_fetch_log
WHERE metadata->>'run_mode' = 'backfill'
ORDER BY created_at DESC
LIMIT 20;
```

Check hourly LMP source coverage:

```sql
SELECT
    'da_hourly' AS feed,
    datetime_beginning_ept::date AS market_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT pnode_name) AS nodes,
    MIN(datetime_beginning_ept) AS min_ts,
    MAX(datetime_beginning_ept) AS max_ts
FROM pjm.da_hrl_lmps
GROUP BY datetime_beginning_ept::date
UNION ALL
SELECT
    'rt_verified_hourly' AS feed,
    datetime_beginning_ept::date AS market_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT pnode_name) AS nodes,
    MIN(datetime_beginning_ept) AS min_ts,
    MAX(datetime_beginning_ept) AS max_ts
FROM pjm.rt_hrl_lmps
GROUP BY datetime_beginning_ept::date
UNION ALL
SELECT
    'rt_unverified_hourly' AS feed,
    datetime_beginning_ept::date AS market_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT pnode_name) AS nodes,
    MIN(datetime_beginning_ept) AS min_ts,
    MAX(datetime_beginning_ept) AS max_ts
FROM pjm.rt_unverified_hrl_lmps
GROUP BY datetime_beginning_ept::date
ORDER BY market_date DESC, feed
LIMIT 30;
```
