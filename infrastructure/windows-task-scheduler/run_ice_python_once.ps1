# Runs one ICE Python scheduler tick for Windows Task Scheduler.
#
# The Python module keeps the due-job policy, per-window state, local lock, child
# process hard timeouts, and ops.api_fetch_log telemetry. This wrapper only sets
# the local Windows runtime environment and captures coordinator stdout/stderr.

param(
    [string]$RepoRoot = $(if ($env:HELIOS_ICE_REPO_ROOT) { $env:HELIOS_ICE_REPO_ROOT } else { (Resolve-Path "$PSScriptRoot\..\..").Path }),
    [string]$PythonExe = $(if ($env:HELIOS_ICE_PYTHON_EXE) { $env:HELIOS_ICE_PYTHON_EXE } else { "python" }),
    [string]$LogDir = "C:\ProgramData\HeliosCTA\logs",
    [string]$StateDir = "C:\ProgramData\HeliosCTA\state",
    [int]$JobTimeoutSeconds = 2700,
    [ValidateSet("all", "short_term", "futures")]
    [string]$JobGroup = "all"
)

$ErrorActionPreference = "Stop"

function Resolve-CommandPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable
    )

    if (Test-Path -Path $Executable) {
        return (Resolve-Path -Path $Executable).Path
    }

    $command = Get-Command $Executable -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }

    throw "Could not resolve executable: $Executable"
}

function Remove-LogNullCharacters {
    process {
        [string]$_ -replace "`0", ""
    }
}

$resolvedRepoRoot = (Resolve-Path -Path $RepoRoot).Path
$resolvedPythonExe = Resolve-CommandPath -Executable $PythonExe

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

$lockPath = Join-Path $StateDir "ice_python_jobs.lock"
$coordinatorLog = Join-Path $LogDir "ice-python-task-scheduler.log"

$env:HELIOS_LOG_DIR = $LogDir
$env:HELIOS_STATE_DIR = $StateDir
$env:HELIOS_ICE_JOB_TIMEOUT_SECONDS = [string]$JobTimeoutSeconds
$env:HELIOS_ICE_JOB_LOCK_FILE = $lockPath
$env:PYTHONUNBUFFERED = "1"

$startedAt = Get-Date
Add-Content -Path $coordinatorLog -Value (
    "[$($startedAt.ToString('s'))] Starting ICE Python scheduler tick " +
    "repo=$resolvedRepoRoot python=$resolvedPythonExe timeout=$JobTimeoutSeconds " +
    "job_group=$JobGroup"
)

Push-Location $resolvedRepoRoot
try {
    $pythonSnippet = "from backend.orchestration.ice_python import service; raise SystemExit(service.main(run_once=True, job_group='$JobGroup'))"
    & $resolvedPythonExe -c $pythonSnippet 2>&1 |
        Remove-LogNullCharacters |
        Tee-Object -FilePath $coordinatorLog -Append
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

$finishedAt = Get-Date
Add-Content -Path $coordinatorLog -Value (
    "[$($finishedAt.ToString('s'))] Finished ICE Python scheduler tick exit_code=$exitCode"
)

exit $exitCode
