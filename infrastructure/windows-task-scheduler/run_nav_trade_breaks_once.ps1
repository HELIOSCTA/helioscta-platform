# Runs one NAV trade-break scheduled poll for Windows Task Scheduler.
#
# The Python orchestration owns SFTP polling, workbook parsing, email outbox
# enqueue/drain, and ops.api_fetch_log telemetry. This wrapper sets the local
# Windows runtime environment and captures stdout.

param(
    [string]$RepoRoot = $(if ($env:HELIOS_NAV_TRADE_BREAKS_REPO_ROOT) { $env:HELIOS_NAV_TRADE_BREAKS_REPO_ROOT } else { (Resolve-Path "$PSScriptRoot\..\..").Path }),
    [string]$PythonExe = $(if ($env:HELIOS_NAV_TRADE_BREAKS_PYTHON_EXE) { $env:HELIOS_NAV_TRADE_BREAKS_PYTHON_EXE } else { "python" }),
    [string]$LogDir = "C:\ProgramData\HeliosCTA\logs",
    [int]$LookbackDays = 1,
    [int]$PollWaitSeconds = 300,
    [int]$PollWindowMinutes = 420,
    [int]$PollDeadlineHour = 11,
    [string]$TargetNavDate = ""
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

if ($LookbackDays -lt 1) {
    throw "LookbackDays must be at least 1."
}
if ($PollWaitSeconds -lt 1) {
    throw "PollWaitSeconds must be at least 1."
}
if ($PollWindowMinutes -lt 1) {
    throw "PollWindowMinutes must be at least 1."
}
if ($PollDeadlineHour -lt 0 -or $PollDeadlineHour -gt 23) {
    throw "PollDeadlineHour must be between 0 and 23."
}

$resolvedRepoRoot = (Resolve-Path -Path $RepoRoot).Path
$resolvedPythonExe = Resolve-CommandPath -Executable $PythonExe

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$coordinatorLog = Join-Path $LogDir "nav-trade-breaks-task-scheduler.log"

$env:HELIOS_LOG_DIR = $LogDir
$env:PYTHONUNBUFFERED = "1"

$startedAt = Get-Date
Add-Content -Path $coordinatorLog -Value (
    "[$($startedAt.ToString('s'))] Starting NAV trade-breaks scheduled poll " +
    "repo=$resolvedRepoRoot python=$resolvedPythonExe lookback_days=$LookbackDays " +
    "poll_wait=$PollWaitSeconds poll_window_minutes=$PollWindowMinutes " +
    "poll_deadline_hour=$PollDeadlineHour"
)

Push-Location $resolvedRepoRoot
try {
    $targetArg = "None"
    if ($TargetNavDate) {
        $escapedTarget = $TargetNavDate -replace "'", "\\'"
        $targetArg = "'$escapedTarget'"
    }
    $pythonSnippet = (
        "from backend.orchestration.nav import trade_breaks_email; " +
        "raise SystemExit(trade_breaks_email.scheduled_main(" +
        "lookback_days=$LookbackDays, " +
        "poll_wait_seconds=$PollWaitSeconds, " +
        "poll_window_minutes=$PollWindowMinutes, " +
        "poll_deadline_hour=$PollDeadlineHour, " +
        "target_nav_date=$targetArg))"
    )
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
    "[$($finishedAt.ToString('s'))] Finished NAV trade-breaks scheduled poll exit_code=$exitCode"
)

exit $exitCode
