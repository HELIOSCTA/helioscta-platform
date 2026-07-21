# Removes the legacy NSSM ICE Python Windows service.

#Requires -RunAsAdministrator

param(
    [string]$NssmExe = "nssm.exe",
    [string]$ServiceName = "HeliosCTA-IcePython"
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

$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($null -eq $existingService) {
    Write-Host "Service does not exist: $ServiceName"
    exit 0
}

Invoke-Nssm -Arguments @("stop", $ServiceName)
Invoke-Nssm -Arguments @("remove", $ServiceName, "confirm")

Write-Host "Removed service: $ServiceName"
