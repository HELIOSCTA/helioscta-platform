# Runs the Clear Street overnight transaction poll for Windows Task Scheduler.
#
# The Python orchestration owns the target-date policy, 5-minute polling loop,
# timeout handling, Slack notification outbox, and ops.api_fetch_log telemetry.
# This wrapper sets the local Windows runtime environment and captures stdout.

param(
    [string]$RepoRoot = $(if ($env:HELIOS_CLEAR_STREET_REPO_ROOT) { $env:HELIOS_CLEAR_STREET_REPO_ROOT } else { (Resolve-Path "$PSScriptRoot\..\..").Path }),
    [string]$PythonExe = $(if ($env:HELIOS_CLEAR_STREET_PYTHON_EXE) { $env:HELIOS_CLEAR_STREET_PYTHON_EXE } else { "python" }),
    [string]$LogDir = "C:\ProgramData\HeliosCTA\logs",
    [string]$StateDir = "C:\ProgramData\HeliosCTA\state",
    [int]$PollWaitSeconds = 300
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

$resolvedRepoRoot = (Resolve-Path -Path $RepoRoot).Path
$resolvedPythonExe = Resolve-CommandPath -Executable $PythonExe

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

$coordinatorLog = Join-Path $LogDir "clear-street-task-scheduler.log"

$env:HELIOS_LOG_DIR = $LogDir
$env:HELIOS_STATE_DIR = $StateDir
$env:PYTHONUNBUFFERED = "1"

$startedAt = Get-Date
Add-Content -Path $coordinatorLog -Value (
    "[$($startedAt.ToString('s'))] Starting Clear Street scheduled poll " +
    "repo=$resolvedRepoRoot python=$resolvedPythonExe poll_wait=$PollWaitSeconds"
)

Push-Location $resolvedRepoRoot
try {
    $pythonSnippet = "from backend.orchestration.clear_street import transactions; raise SystemExit(transactions.scheduled_main(poll_wait_seconds=$PollWaitSeconds))"
    & $resolvedPythonExe -c $pythonSnippet 2>&1 | Tee-Object -FilePath $coordinatorLog -Append
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

$finishedAt = Get-Date
Add-Content -Path $coordinatorLog -Value (
    "[$($finishedAt.ToString('s'))] Finished Clear Street scheduled poll exit_code=$exitCode"
)

exit $exitCode
