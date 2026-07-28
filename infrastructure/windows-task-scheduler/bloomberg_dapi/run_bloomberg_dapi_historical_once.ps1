# Runs one Bloomberg DAPI ticker + historical refresh for Windows Task Scheduler.
#
# The Python orchestration owns Bloomberg DAPI access, database upserts, and
# ops.api_fetch_log telemetry. This wrapper sets the local Windows runtime
# environment and captures stdout.

param(
    [string]$RepoRoot = $(if ($env:HELIOS_BBG_DAPI_REPO_ROOT) { $env:HELIOS_BBG_DAPI_REPO_ROOT } else { (Resolve-Path "$PSScriptRoot\..\..\..").Path }),
    [string]$PythonExe = $(if ($env:HELIOS_BBG_DAPI_PYTHON_EXE) { $env:HELIOS_BBG_DAPI_PYTHON_EXE } else { "python" }),
    [string]$LogDir = "C:\ProgramData\HeliosCTA\logs",
    [int]$LookbackDays = 60,
    [string]$HostName = $(if ($env:BBG_HOST) { $env:BBG_HOST } else { "localhost" }),
    [int]$Port = $(if ($env:BBG_PORT) { [int]$env:BBG_PORT } else { 8194 }),
    [int]$RequestTimeoutSeconds = 300
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
if ($Port -lt 1 -or $Port -gt 65535) {
    throw "Port must be between 1 and 65535."
}
if ($RequestTimeoutSeconds -lt 1) {
    throw "RequestTimeoutSeconds must be at least 1."
}

$resolvedRepoRoot = (Resolve-Path -Path $RepoRoot).Path
$resolvedPythonExe = Resolve-CommandPath -Executable $PythonExe

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$coordinatorLog = Join-Path $LogDir "bloomberg-dapi-task-scheduler.log"

$env:HELIOS_LOG_DIR = $LogDir
$env:PYTHONUNBUFFERED = "1"
$env:BBG_HOST = $HostName
$env:BBG_PORT = [string]$Port

$startedAt = Get-Date
Add-Content -Path $coordinatorLog -Value (
    "[$($startedAt.ToString('s'))] Starting Bloomberg DAPI historical refresh " +
    "repo=$resolvedRepoRoot python=$resolvedPythonExe lookback_days=$LookbackDays " +
    "host=$HostName port=$Port request_timeout_seconds=$RequestTimeoutSeconds"
)

Push-Location $resolvedRepoRoot
try {
    $pythonSnippet = (
        "from backend.orchestration.bloomberg_dapi import historical; " +
        "raise SystemExit(historical.scheduled_main(" +
        "lookback_days=$LookbackDays, " +
        "host='$HostName', " +
        "port=$Port, " +
        "request_timeout_seconds=$RequestTimeoutSeconds))"
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
    "[$($finishedAt.ToString('s'))] Finished Bloomberg DAPI historical refresh exit_code=$exitCode"
)

exit $exitCode
