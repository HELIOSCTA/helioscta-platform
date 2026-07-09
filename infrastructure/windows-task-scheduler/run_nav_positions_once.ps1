# Runs one NAV positions scheduled pull for Windows Task Scheduler.
#
# The Python orchestration owns SFTP download, workbook parsing, database
# upsert, and ops.api_fetch_log telemetry. This wrapper sets the local Windows
# runtime environment and captures stdout.

param(
    [string]$RepoRoot = $(if ($env:HELIOS_NAV_POSITIONS_REPO_ROOT) { $env:HELIOS_NAV_POSITIONS_REPO_ROOT } else { (Resolve-Path "$PSScriptRoot\..\..").Path }),
    [string]$PythonExe = $(if ($env:HELIOS_NAV_POSITIONS_PYTHON_EXE) { $env:HELIOS_NAV_POSITIONS_PYTHON_EXE } else { "python" }),
    [string]$LogDir = "C:\ProgramData\HeliosCTA\logs",
    [int]$LookbackDays = 5
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

if ($LookbackDays -lt 1) {
    throw "LookbackDays must be at least 1."
}

$resolvedRepoRoot = (Resolve-Path -Path $RepoRoot).Path
$resolvedPythonExe = Resolve-CommandPath -Executable $PythonExe

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$coordinatorLog = Join-Path $LogDir "nav-positions-task-scheduler.log"

$env:HELIOS_LOG_DIR = $LogDir
$env:PYTHONUNBUFFERED = "1"

$startedAt = Get-Date
Add-Content -Path $coordinatorLog -Value (
    "[$($startedAt.ToString('s'))] Starting NAV positions scheduled pull " +
    "repo=$resolvedRepoRoot python=$resolvedPythonExe lookback_days=$LookbackDays"
)

Push-Location $resolvedRepoRoot
try {
    $pythonSnippet = "from backend.orchestration.nav import positions; raise SystemExit(positions.scheduled_main(lookback_days=$LookbackDays))"
    & $resolvedPythonExe -c $pythonSnippet 2>&1 | Tee-Object -FilePath $coordinatorLog -Append
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

$finishedAt = Get-Date
Add-Content -Path $coordinatorLog -Value (
    "[$($finishedAt.ToString('s'))] Finished NAV positions scheduled pull exit_code=$exitCode"
)

exit $exitCode
