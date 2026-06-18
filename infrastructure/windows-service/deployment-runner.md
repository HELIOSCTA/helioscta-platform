# ICE Python Windows Deployment Runner

This is the unattended deployment path for the local-only ICE Python Windows
service. It uses a GitHub Actions self-hosted Windows runner as the production
deployment agent. The runner owns Windows service control; Codex or an operator
triggers the GitHub workflow.

This is not the scheduler for ICE jobs. `HeliosCTA-IcePython` remains the
long-running NSSM-managed service that runs the settlement schedule.

## Target Model

```text
GitHub workflow_dispatch
  -> self-hosted Windows runner label: helioscta-ice-python
    -> infrastructure/windows-service/deploy_ice_python_service.ps1
      -> clean production clone: C:\HeliosCTA\helioscta-platform
      -> NSSM stop HeliosCTA-IcePython
      -> git pull --ff-only origin main
      -> pip install local Windows requirements
      -> optional icepython import smoke
      -> install/update NSSM service
      -> NSSM start HeliosCTA-IcePython
      -> verify timeout and lock service environment
```

## One-Time Host Bootstrap

Run these steps from Administrator PowerShell on the licensed Windows ICE host.

Create a production clone that is separate from the development checkout:

```powershell
New-Item -ItemType Directory -Force -Path C:\HeliosCTA | Out-Null
git clone https://github.com/HELIOSCTA/helioscta-platform.git C:\HeliosCTA\helioscta-platform
```

Install local runtime dependencies into the Python environment used by the
service:

```powershell
cd C:\HeliosCTA\helioscta-platform
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe -m pip install -r backend\requirements-local-windows.txt -e backend
```

Install the proprietary ICE Python wheel outside this repo, then verify:

```powershell
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe -c "import icepython; print('icepython ok')"
```

Install or update the ICE service once:

```powershell
$nssm = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "nssm.exe" |
  Where-Object { $_.FullName -like "*\win64\nssm.exe" } |
  Select-Object -First 1 -ExpandProperty FullName

C:\HeliosCTA\helioscta-platform\infrastructure\windows-service\install_ice_python_service.ps1 `
  -RepoRoot C:\HeliosCTA\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -NssmExe $nssm `
  -JobTimeoutSeconds 2700
```

## Self-Hosted Runner Setup

If `gh` is authenticated as a repo admin on the host, bootstrap the runner with
one command from Administrator PowerShell:

```powershell
C:\HeliosCTA\helioscta-platform\infrastructure\windows-service\bootstrap_github_runner.ps1 `
  -RunnerRoot C:\actions-runner `
  -RunnerName "helioscta-ice-python-$env:COMPUTERNAME" `
  -RunnerLabels "helioscta-ice-python"
```

The script uses the GitHub API to fetch the current Windows x64 runner
download, verify its SHA-256 checksum, create a short-lived registration token,
configure the runner with `--runasservice`, and start the runner service.
If no `-WindowsLogonAccount` and `-WindowsLogonPassword` are supplied, GitHub's
runner installer uses `NT AUTHORITY\NETWORK SERVICE`. That is enough to bring
the runner online, but it is not enough for ICE production deploys because the
deploy script must stop/update/start Windows services. Reconfigure the runner
service to a dedicated deploy account, or reinstall with those parameters.

If you prefer the GitHub UI-generated commands:

1. Open `HELIOSCTA/helioscta-platform` in GitHub.
2. Go to `Settings -> Actions -> Runners -> New self-hosted runner`.
3. Choose Windows x64 and use `C:\actions-runner` for the runner directory.
4. Run the generated commands in Administrator PowerShell.
5. Add the custom label `helioscta-ice-python`.
6. Configure the runner as a Windows service when prompted.

Use a dedicated Windows account such as `helios-deploy` when possible. That
account needs:

- Read/write access to `C:\HeliosCTA\helioscta-platform`.
- Access to the selected Python environment and ICE Python installation.
- Rights to stop, install/update, and start `HeliosCTA-IcePython`.
- Access to the NSSM executable.
- The same Azure Postgres writer environment variables used by the service.

If the ICE license is tied to a user profile, run the runner and the
`HeliosCTA-IcePython` service under the licensed account.

## GitHub Environment

Create a GitHub environment named:

```text
ice-python-windows-production
```

The deploy workflow targets that environment. Add reviewers if you want a
manual approval gate. Leave reviewers empty if Codex should be able to trigger
unattended deployments after changes are pushed to `main`.

## Deploy

From any authenticated shell with the GitHub CLI:

```powershell
gh workflow run deploy-ice-python-windows.yml `
  --ref main `
  -f git_branch=main `
  -f repo_root='C:\HeliosCTA\helioscta-platform' `
  -f python_exe='C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe' `
  -f job_timeout_seconds=2700 `
  -f run_import_smoke=true

gh run watch
```

Codex can run the same commands once `gh` is authenticated in this workspace.

## Verify

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

## Safety Rules

- The deployment script refuses to deploy from a dirty production clone unless
  `-AllowDirtyWorktree` is explicitly passed.
- The deployment script checks that the production clone can fast-forward
  before stopping the service.
- The workflow is manual-only and serialized with a GitHub Actions concurrency
  group.
- Do not add ICE jobs to `infrastructure/systemd`; the Linux VM remains out of
  the ICE runtime.
