# HeliosCTA Platform

Clean production workspace for HeliosCTA backend scripts, Azure deployment
notes, and frontend integration.

This repo is the target for promoted code only. Legacy scripts, tables, and
manual workflows should stay in the old repo until they have an owner, table
contract, validation path, and deployment plan.

## Working Model

Promote one backend script or workflow at a time:

1. Identify the legacy script and current database table.
2. Define the source/table contract and grain.
3. Add validation checks before and after writes.
4. Add runtime telemetry, data availability, and failure visibility.
5. Deploy the script as a scheduled Azure VM job.
6. Document the deployed commit, host, schedule, and logs.

## Repo Layout

- `backend/` - promoted Python scrapes, orchestration, and runtime helpers.
- `frontend/` - dashboard code when promoted into this repo.
- `excel/` - versioned Excel workbook models and workbook-specific reference artifacts.
- `infrastructure/` - Azure VM setup, systemd timers, local Windows Task
  Scheduler config, and deployment notes.
- `docs/` - migration, deployment, and operating playbooks.

## Promotion Rule

Nothing should enter this repo just because it exists in the legacy system.
Code is promoted when it has a clear owner, a documented source/table contract,
a safe rerun story, runtime telemetry or data-availability visibility, and
verification that proves the output is usable.

## Current Production Runtime

The first scheduled VM workflow is `backend.orchestration.power.pjm.da_hrl_lmps`
on `helioscta-prod-vm-01`. See `docs/production-readiness.md` for the backend
production standard and gap tracker, `docs/deployments.md` for the deployment
register, and `infrastructure/azure-vm/README.md` plus
`infrastructure/systemd/README.md` for VM and timer operations.
