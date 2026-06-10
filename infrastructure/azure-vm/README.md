# Azure VM Operations

Use this directory for Azure VM setup notes, deployment commands, and runtime
service definitions.

## Target Operating Model

```text
local Codex workspace
  -> git commit
  -> git push
  -> SSH into Azure VM
  -> git pull
  -> install/update dependencies
  -> restart or verify scheduled jobs
```

The VM should run committed code only. Avoid editing production files directly
on the server unless it is an emergency, and bring any emergency fix back into
Git immediately.

## VM Baseline

- Ubuntu LTS.
- SSH key authentication.
- SSH restricted to trusted IPs.
- Repo checked out under `/opt/helioscta` or another documented path.
- Python virtual environment located inside or beside the repo.
- Secrets stored outside Git.
- Jobs managed by `systemd` timers after initial testing.

## Common Commands

```bash
cd /opt/helioscta
git pull
git rev-parse HEAD
git status --short
source .venv/bin/activate
pip install -e backend
systemctl list-timers
```

## Service Files

Put `systemd` service and timer files under:

```text
infrastructure/systemd/
```

Each service should run one clear command and write enough logs to debug failed
runs through `journalctl`.
