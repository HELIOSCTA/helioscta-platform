# Archived ICE Python Windows Deployment Runner

This GitHub-runner/NSSM deployment path is retained for rollback and
legacy-cleanup reference only. The active local ICE activation path is the Task
Scheduler coordinator under `infrastructure/windows-task-scheduler/`.

This was the unattended deployment path for the local-only ICE Python Windows
service. It used a GitHub Actions self-hosted Windows runner as the production
deployment agent. The runner owned Windows service control; Codex or an
operator triggered the GitHub workflow.

This is not the current scheduler or deployment standard for ICE jobs. The
current model is the Task Scheduler coordinator documented under
`infrastructure/windows-task-scheduler/`. Use this file only when reviewing or
reconstructing the old `HeliosCTA-IcePython` NSSM service after an explicitly
approved rollback.

## Legacy Target Model

```text
GitHub workflow_dispatch
  -> self-hosted Windows runner label: helioscta-ice-python
    -> infrastructure/windows-service/deploy_ice_python_service.ps1
      -> clean production clone: C:\Services\HeliosCTA\helioscta-platform
      -> NSSM stop HeliosCTA-IcePython
      -> git pull --ff-only origin main
      -> pip install local Windows requirements
      -> optional icepython import smoke
      -> install/update NSSM service
      -> NSSM start HeliosCTA-IcePython
      -> verify timeout and lock service environment
```

## Legacy Host Bootstrap

Run these steps from Administrator PowerShell on the licensed Windows ICE host.

Create a production clone that is separate from the development checkout:

```powershell
New-Item -ItemType Directory -Force -Path C:\Services\HeliosCTA | Out-Null
git clone https://github.com/HELIOSCTA/helioscta-platform.git C:\Services\HeliosCTA\helioscta-platform
```

Install local runtime dependencies into the Python environment used by the
legacy service:

```powershell
cd C:\Services\HeliosCTA\helioscta-platform
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe -m pip install -r backend\requirements-local-windows.txt -e backend
```

Install the proprietary ICE Python wheel outside this repo, then verify:

```powershell
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe -c "import icepython; print('icepython ok')"
```

Configure Azure Postgres writer credentials for the production Windows account.
Use machine/user environment variables, or keep an untracked
`backend\.env` in the production clone:

```powershell
Copy-Item C:\path\to\dev\helioscta-platform\backend\.env C:\Services\HeliosCTA\helioscta-platform\backend\.env
```

The deploy script refuses to stop the running legacy service unless it can see
writer host, user, and password config from environment variables or that
production clone `backend\.env` file.

Install or update the legacy ICE service once:

```powershell
$nssm = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "nssm.exe" |
  Where-Object { $_.FullName -like "*\win64\nssm.exe" } |
  Select-Object -First 1 -ExpandProperty FullName

C:\Services\HeliosCTA\helioscta-platform\infrastructure\windows-service\install_ice_python_service.ps1 `
  -RepoRoot C:\Services\HeliosCTA\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -NssmExe $nssm `
  -JobTimeoutSeconds 2700
```

## Legacy Self-Hosted Runner Setup

If `gh` is authenticated as a repo admin on the host, bootstrap the runner with
one command from Administrator PowerShell:

```powershell
C:\Services\HeliosCTA\helioscta-platform\infrastructure\windows-service\bootstrap_github_runner.ps1 `
  -RunnerRoot C:\actions-runner `
  -RunnerName "helioscta-ice-python-$env:COMPUTERNAME" `
  -RunnerLabels "helioscta-ice-python"
```

The script uses the GitHub API to fetch the current Windows x64 runner
download, verify its SHA-256 checksum, create a short-lived registration token,
configure the runner with `--runasservice`, and start the runner service.
If no `-WindowsLogonAccount` and `-WindowsLogonPassword` are supplied, GitHub's
runner installer uses `NT AUTHORITY\NETWORK SERVICE`. That is enough to bring
the runner online, but it is not enough for legacy ICE service deploys because
the deploy script must stop/update/start Windows services. Reconfigure the
runner service to a dedicated deploy account, or reinstall with those
parameters.

If you prefer the GitHub UI-generated commands:

1. Open `HELIOSCTA/helioscta-platform` in GitHub.
2. Go to `Settings -> Actions -> Runners -> New self-hosted runner`.
3. Choose Windows x64 and use `C:\actions-runner` for the runner directory.
4. Run the generated commands in Administrator PowerShell.
5. Add the custom label `helioscta-ice-python`.
6. Configure the runner as a Windows service when prompted.

Use a dedicated Windows account such as `helios-deploy` when possible. That
account needed:

- Read/write access to `C:\Services\HeliosCTA\helioscta-platform`.
- Access to the selected Python environment and ICE Python installation.
- Rights to stop, install/update, and start `HeliosCTA-IcePython`.
- Access to the NSSM executable.
- The same Azure Postgres writer environment variables used by the legacy
  service.

If the ICE license is tied to a user profile, run the runner and the
legacy `HeliosCTA-IcePython` service under the licensed account.

## Legacy GitHub Environment

The old deploy workflow used a GitHub environment named:

```text
ice-python-windows-production
```

The archived deploy workflow targeted that environment. Reviewers provided a
manual approval gate for the legacy service path.

## Legacy Deploy

From any authenticated shell with the GitHub CLI:

```powershell
gh workflow run deploy-ice-python-windows.yml `
  --ref main `
  -f git_branch=main `
  -f repo_root='C:\Services\HeliosCTA\helioscta-platform' `
  -f python_exe='C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe' `
  -f job_timeout_seconds=2700 `
  -f run_import_smoke=true

gh run watch
```

Codex should not run these commands for normal production operation. They are
kept only for rollback/reference.

## Legacy Verify

On the Windows host:

```powershell
Get-Service HeliosCTA-IcePython
nssm get HeliosCTA-IcePython AppDirectory
nssm get HeliosCTA-IcePython AppEnvironmentExtra
Get-Content C:\ProgramData\HeliosCTA\logs\ice-python-service.stdout.log -Tail 100
Get-Content C:\ProgramData\HeliosCTA\logs\ice-python-service.stderr.log -Tail 100
```

In Azure Postgres:

```sql
SELECT
    created_at,
    pipeline_name,
    operation_name,
    status,
    rows_written,
    error_type,
    metadata
FROM ops.api_fetch_log
WHERE provider = 'ice_python'
ORDER BY created_at DESC
LIMIT 20;
```

## Legacy Safety Rules

- The deployment script refused to deploy from a dirty production clone unless
  `-AllowDirtyWorktree` is explicitly passed.
- The deployment script checked that the production clone can fast-forward
  before stopping the legacy service.
- The workflow was manual-only and serialized with a GitHub Actions concurrency
  group.
- Do not add ICE jobs to `infrastructure/systemd`; the Linux VM remains out of
  the ICE runtime.
