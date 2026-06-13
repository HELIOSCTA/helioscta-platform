# Manual Backfills

Use this runbook for controlled DA hourly LMP and verified RT five-minute HRL
LMP replays. Backfills write to the same canonical production tables as the
scheduled jobs and rely on the same idempotent upsert keys.

## Scope

Covered workflows:

- `backend.orchestration.power.pjm.da_hrl_lmps_backfill`
- `backend.orchestration.power.pjm.rt_fivemin_hrl_lmps_backfill`

Destination tables:

- `pjm.da_hrl_lmps`
- `pjm.rt_fivemin_hrl_lmps`

Backfill runs add `run_mode=backfill`, `backfill_workflow`,
`backfill_start_date`, and `backfill_end_date` to
`ops.api_fetch_log.metadata` for the PJM API requests they issue. Data
availability events stay idempotent by `event_key`; replaying an already-ready
date does not create a duplicate readiness event.

## Safety Rules

- Run from the production VM as the `helios` service user.
- Prefer small windows first.
- Default maximum windows:
  - DA hourly LMPs: `31` days.
  - RT verified five-minute HRL LMPs: `7` days.
- Future dates are rejected unless `allow_future=True` is passed.
- Do not run a backfill during the matching scheduled timer window unless the
  overlap is intentional.

## VM Command Pattern

From the `azureuser` shell:

```bash
cat > /tmp/helios_da_backfill.py <<'PY'
from backend.orchestration.power.pjm.da_hrl_lmps_backfill import main

print(main(start_date="2026-06-10", end_date="2026-06-10", dry_run=True))
PY

sudo systemd-run --unit=helios-da-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_da_backfill.py
rm -f /tmp/helios_da_backfill.py
```

Use `systemd-run` instead of sourcing `/etc/helioscta/backend.env` in a shell.
The environment file can contain characters such as `$` that shell expansion
would alter if sourced directly.

## DA Hourly LMP Backfill

Dry run:

```bash
cat > /tmp/helios_da_backfill.py <<'PY'
from backend.orchestration.power.pjm.da_hrl_lmps_backfill import main

print(main(start_date="2026-06-10", end_date="2026-06-10", dry_run=True))
PY

sudo systemd-run --unit=helios-da-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_da_backfill.py
rm -f /tmp/helios_da_backfill.py
```

Run one day:

```bash
cat > /tmp/helios_da_backfill.py <<'PY'
from backend.orchestration.power.pjm.da_hrl_lmps_backfill import main

print(main(start_date="2026-06-10", end_date="2026-06-10"))
PY

sudo systemd-run --unit=helios-da-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_da_backfill.py
rm -f /tmp/helios_da_backfill.py
```

Run a small window:

```bash
cat > /tmp/helios_da_backfill.py <<'PY'
from backend.orchestration.power.pjm.da_hrl_lmps_backfill import main

print(main(start_date="2026-06-01", end_date="2026-06-07"))
PY

sudo systemd-run --unit=helios-da-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_da_backfill.py
rm -f /tmp/helios_da_backfill.py
```

## RT Verified Five-Minute HRL LMP Backfill

Dry run:

```bash
cat > /tmp/helios_rt_backfill.py <<'PY'
from backend.orchestration.power.pjm.rt_fivemin_hrl_lmps_backfill import main

print(main(start_date="2026-06-10", end_date="2026-06-10", dry_run=True))
PY

sudo systemd-run --unit=helios-rt-fivemin-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_rt_backfill.py
rm -f /tmp/helios_rt_backfill.py
```

Run one day:

```bash
cat > /tmp/helios_rt_backfill.py <<'PY'
from backend.orchestration.power.pjm.rt_fivemin_hrl_lmps_backfill import main

print(main(start_date="2026-06-10", end_date="2026-06-10"))
PY

sudo systemd-run --unit=helios-rt-fivemin-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_rt_backfill.py
rm -f /tmp/helios_rt_backfill.py
```

Run a small window:

```bash
cat > /tmp/helios_rt_backfill.py <<'PY'
from backend.orchestration.power.pjm.rt_fivemin_hrl_lmps_backfill import main

print(main(start_date="2026-06-01", end_date="2026-06-03"))
PY

sudo systemd-run --unit=helios-rt-fivemin-hrl-lmps-backfill --wait --collect --pipe --property=User=helios --property=WorkingDirectory=/opt/helioscta-platform --property=EnvironmentFile=/etc/helioscta/backend.env /opt/helioscta-platform/.venv/bin/python /tmp/helios_rt_backfill.py
rm -f /tmp/helios_rt_backfill.py
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

Check DA readiness:

```sql
SELECT
    business_date,
    completeness_status,
    row_count,
    entity_count,
    period_count,
    created_at
FROM ops.data_availability_events
WHERE dataset = 'pjm_da_hrl_lmps'
ORDER BY business_date DESC
LIMIT 20;
```

Check RT readiness:

```sql
SELECT
    business_date,
    completeness_status,
    row_count,
    entity_count,
    period_count,
    created_at
FROM ops.data_availability_events
WHERE dataset = 'pjm_rt_fivemin_hrl_lmps'
ORDER BY business_date DESC
LIMIT 20;
```

Check RT duplicate keys:

```sql
SELECT COUNT(*) AS duplicate_key_count
FROM (
    SELECT
        datetime_beginning_utc,
        pnode_id,
        pnode_name
    FROM pjm.rt_fivemin_hrl_lmps
    GROUP BY 1, 2, 3
    HAVING COUNT(*) > 1
) duplicates;
```
