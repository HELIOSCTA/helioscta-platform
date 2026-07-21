# Legacy rollback helper: installs or updates the old ICE Python Windows service.
#
# Requires: Administrator, NSSM, backend local Windows requirements, and
# licensed ICE XL / ICE Python installed on the host.

#Requires -RunAsAdministrator

param(
    [string]$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path,
    [string]$PythonExe = "python",
    [string]$NssmExe = "nssm.exe",
    [string]$ServiceName = "HeliosCTA-IcePython",
    [string]$ServiceDisplayName = "HeliosCTA ICE Python Settlements",
    [string]$LogDir = "C:\ProgramData\HeliosCTA\logs",
    [string]$StateDir = "C:\ProgramData\HeliosCTA\state",
    [int]$PollSeconds = 60,
    [int]$JobTimeoutSeconds = 2700
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
$resolvedNssmExe = Resolve-CommandPath -Executable $NssmExe

function Invoke-Nssm {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $resolvedNssmExe @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "nssm $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

$stdoutPath = Join-Path $LogDir "ice-python-service.stdout.log"
$stderrPath = Join-Path $LogDir "ice-python-service.stderr.log"
$lockPath = Join-Path $StateDir "ice_python_jobs.lock"
$moduleName = "backend.orchestration.ice_python.service"

$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -eq $existingService) {
    Invoke-Nssm -Arguments @("install", $ServiceName, $resolvedPythonExe)
}
else {
    Write-Host "Updating existing service: $ServiceName"
}

Invoke-Nssm -Arguments @("set", $ServiceName, "Application", $resolvedPythonExe)
Invoke-Nssm -Arguments @("set", $ServiceName, "AppDirectory", $resolvedRepoRoot)
Invoke-Nssm -Arguments @("set", $ServiceName, "AppParameters", "-m $moduleName")
Invoke-Nssm -Arguments @("set", $ServiceName, "DisplayName", $ServiceDisplayName)
Invoke-Nssm -Arguments @(
    "set",
    $ServiceName,
    "Description",
    "Local-only HeliosCTA ICE Python settlement service."
)
Invoke-Nssm -Arguments @("set", $ServiceName, "Start", "SERVICE_AUTO_START")
Invoke-Nssm -Arguments @("set", $ServiceName, "AppStdout", $stdoutPath)
Invoke-Nssm -Arguments @("set", $ServiceName, "AppStderr", $stderrPath)
Invoke-Nssm -Arguments @("set", $ServiceName, "AppRotateFiles", "1")
Invoke-Nssm -Arguments @("set", $ServiceName, "AppRotateOnline", "1")
Invoke-Nssm -Arguments @("set", $ServiceName, "AppRotateBytes", "10485760")
Invoke-Nssm -Arguments @("set", $ServiceName, "AppRestartDelay", "60000")
Invoke-Nssm -Arguments @("set", $ServiceName, "AppStopMethodConsole", "15000")
Invoke-Nssm -Arguments @("set", $ServiceName, "AppStopMethodWindow", "15000")
Invoke-Nssm -Arguments @("set", $ServiceName, "AppStopMethodThreads", "15000")
Invoke-Nssm -Arguments @(
    "set",
    $ServiceName,
    "AppEnvironmentExtra",
    "HELIOS_LOG_DIR=$LogDir",
    "HELIOS_STATE_DIR=$StateDir",
    "HELIOS_ICE_SERVICE_POLL_SECONDS=$PollSeconds",
    "HELIOS_ICE_JOB_TIMEOUT_SECONDS=$JobTimeoutSeconds",
    "HELIOS_ICE_JOB_LOCK_FILE=$lockPath",
    "PYTHONUNBUFFERED=1"
)

Write-Host "Installed or updated service: $ServiceName"
Write-Host "Command: $resolvedPythonExe -m $moduleName"
Write-Host "Working directory: $resolvedRepoRoot"
Write-Host "Logs: $LogDir"
Write-Host "State: $StateDir"
Write-Host "Start with: nssm start $ServiceName"
