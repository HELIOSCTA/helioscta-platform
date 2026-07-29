# PJM Codex Analyst

This runbook stages a read-only scheduled PJM analyst loop on
`helioscta-prod-vm-01`. The loop is intentionally separate from backend scrape
jobs: scrapes write production data; the analyst reads promoted data and writes
memo artifacts only.

## Architecture

```text
systemd timer on VM
  -> codex exec with ChatGPT-managed auth
  -> isolated Codex workspace-write sandbox with network enabled
  -> read-only MCP/database tools and read-only Postgres helper
  -> isolated runtime bundle under /var/lib/helioscta/pjm-analyst/runtime
  -> /var/lib/helioscta/pjm-analyst/output/latest.json
  -> /var/lib/helioscta/pjm-analyst/output/latest.md
```

The Codex process needs a writable scratch workspace so it can run shell
commands, call the read-only SQL helper, and produce the final memo artifacts.
The production data boundary is enforced by the isolated `helios-analyst`
service user, the separate read-only database credentials, and the helper that
rejects non-SELECT SQL.

Do not run the analyst with `OPENAI_API_KEY` or `CODEX_API_KEY` if the goal is
to use ChatGPT/Codex plan usage instead of API billing. The runner fails closed
when either variable is present.

## VM Setup

Create an isolated service user. Do not add this user to the `helios` group,
because that group can read the backend writer environment file.

```bash
sudo adduser --system --group --home /var/lib/helioscta/pjm-analyst helios-analyst
sudo install -d -o helios-analyst -g helios-analyst -m 0750 /var/lib/helioscta/pjm-analyst
sudo install -d -o helios-analyst -g helios-analyst -m 0750 /var/lib/helioscta/pjm-analyst/workspace
sudo install -d -o helios-analyst -g helios-analyst -m 0750 /var/lib/helioscta/pjm-analyst/output
sudo install -d -o helios-analyst -g helios-analyst -m 0750 /var/lib/helioscta/pjm-analyst/codex-home
sudo install -d -o helios-analyst -g helios-analyst -m 0750 /var/lib/helioscta/pjm-analyst/runtime
```

Install Codex CLI for the service user following the current Codex install
method, then authenticate that service user's Codex home with ChatGPT-managed
auth. Treat `/var/lib/helioscta/pjm-analyst/codex-home/auth.json` like a
password.

Create `/etc/helioscta/pjm-analyst.env` as root-owned config:

```text
CODEX_HOME=/var/lib/helioscta/pjm-analyst/codex-home
CODEX_BIN=/usr/local/bin/codex
HELIOS_ANALYST_WORKDIR=/var/lib/helioscta/pjm-analyst/workspace
HELIOS_ANALYST_OUTPUT_DIR=/var/lib/helioscta/pjm-analyst/output

HELIOS_POSTGRES_READONLY_HOST=
HELIOS_POSTGRES_READONLY_USER=helios_readonly
HELIOS_POSTGRES_READONLY_PASSWORD=
HELIOS_POSTGRES_READONLY_PORT=5432
HELIOS_POSTGRES_READONLY_DBNAME=helios_prod
HELIOS_POSTGRES_READONLY_SSLMODE=require
```

Use Codex MCP config under that `CODEX_HOME` to provide read-only tools. Prefer
`helios_readonly` only. Do not include writer/admin database credentials.
Keep the file owned by `root:helios-analyst` with mode `0640`, one
`KEY=value` per line, and Unix line endings.

## Install Timer

Deploy committed code to `/opt/helioscta-platform`, copy the analyst runtime
bundle into the isolated service user's directory, then install the unit files:

```bash
sudo rsync -a --delete \
  /opt/helioscta-platform/infrastructure/analyst/pjm/ \
  /var/lib/helioscta/pjm-analyst/runtime/
sudo install -d -o helios-analyst -g helios-analyst -m 0750 /var/lib/helioscta/pjm-analyst/runtime/skills
sudo rsync -a --delete \
  /opt/helioscta-platform/.agents/skills/pjm-analyst/ \
  /var/lib/helioscta/pjm-analyst/runtime/skills/pjm-analyst/
sudo chown -R helios-analyst:helios-analyst /var/lib/helioscta/pjm-analyst/runtime
sudo chmod 0750 /var/lib/helioscta/pjm-analyst/runtime/run_pjm_analyst_codex.sh
sudo -u helios-analyst -H python3 -m venv /var/lib/helioscta/pjm-analyst/runtime/.venv
sudo -u helios-analyst -H /var/lib/helioscta/pjm-analyst/runtime/.venv/bin/python -m pip install --upgrade pip
sudo -u helios-analyst -H /var/lib/helioscta/pjm-analyst/runtime/.venv/bin/pip install \
  -r /var/lib/helioscta/pjm-analyst/runtime/requirements.txt
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-analyst-codex.service /etc/systemd/system/
sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-analyst-codex.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start helios-pjm-analyst-codex.service
sudo systemctl enable --now helios-pjm-analyst-codex.timer
```

Verify:

```bash
systemctl status helios-pjm-analyst-codex.service
journalctl -u helios-pjm-analyst-codex.service -n 200 --no-pager
sudo -u helios-analyst -H test -s /var/lib/helioscta/pjm-analyst/output/latest.json
sudo -u helios-analyst -H test -s /var/lib/helioscta/pjm-analyst/output/latest.md
```

Smoke the read-only SQL helper before enabling the timer:

```bash
sudo -u helios-analyst -H bash -lc '
  set -a
  . /etc/helioscta/pjm-analyst.env
  set +a
  /var/lib/helioscta/pjm-analyst/runtime/.venv/bin/python \
    /var/lib/helioscta/pjm-analyst/runtime/read_only_pg_query.py \
    --sql "select current_database() as database_name, current_user as user_name" \
    --max-rows 5
'
```

Add the copied skill to `/var/lib/helioscta/pjm-analyst/codex-home/config.toml`
so scheduled runs can discover it even though the workdir is an isolated empty
repo:

```toml
[agents]
enabled = true
max_concurrent_threads_per_session = 3

[[skills.config]]
path = "/var/lib/helioscta/pjm-analyst/runtime/skills/pjm-analyst/SKILL.md"
enabled = true
```

Keep subagent limits conservative. Each subagent consumes additional
ChatGPT/Codex plan usage because it performs its own model and tool work.

## Vercel Interface Path

Vercel should not run Codex, hold Codex auth, or call unrestricted MCP tools.
The production path should be one of:

- promote the analyst run artifacts into a read-only Azure Postgres table such
  as `ops.pjm_analyst_runs`, then add a normal Next.js API route that reads it
  with `helios_readonly`; or
- publish sanitized JSON to a private blob/object store and have Vercel read
  that object with a scoped read token.

The Postgres path best matches the current frontend architecture.
