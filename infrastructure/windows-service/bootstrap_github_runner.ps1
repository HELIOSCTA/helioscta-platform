# Bootstraps the GitHub Actions self-hosted Windows runner for ICE deploys.
#
# Requires Administrator PowerShell and an authenticated GitHub CLI session
# with permission to register repository self-hosted runners.

#Requires -RunAsAdministrator

param(
    [string]$Owner = "HELIOSCTA",
    [string]$Repo = "helioscta-platform",
    [string]$RunnerRoot = "C:\actions-runner",
    [string]$RunnerName = "helioscta-ice-python-$env:COMPUTERNAME",
    [string]$RunnerLabels = "helioscta-ice-python",
    [string]$RunnerWork = "_work",
    [switch]$ForceDownload,
    [string]$WindowsLogonAccount = "",
    [string]$WindowsLogonPassword = ""
)

$ErrorActionPreference = "Stop"

function Resolve-CommandPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable
    )

    $command = Get-Command $Executable -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }

    throw "Could not resolve executable: $Executable"
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [string]$WorkingDirectory = (Get-Location).Path
    )

    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

$gh = Resolve-CommandPath -Executable "gh"

Invoke-Checked -FilePath $gh -Arguments @("auth", "status")

$runnerRootPath = New-Item -ItemType Directory -Force -Path $RunnerRoot
$runnerRootResolved = $runnerRootPath.FullName
$repoUrl = "https://github.com/$Owner/$Repo"

$downloadsJson = & $gh api "repos/$Owner/$Repo/actions/runners/downloads"
if ($LASTEXITCODE -ne 0) {
    throw "Could not read GitHub runner downloads."
}
$download = ($downloadsJson | ConvertFrom-Json) |
    Where-Object { $_.os -eq "win" -and $_.architecture -eq "x64" } |
    Select-Object -First 1
if ($null -eq $download) {
    throw "Could not find a Windows x64 GitHub runner download."
}

$zipPath = Join-Path $runnerRootResolved $download.filename
if ($ForceDownload -or -not (Test-Path -Path $zipPath)) {
    Write-Host "Downloading GitHub runner: $($download.filename)"
    Invoke-WebRequest -Uri $download.download_url -OutFile $zipPath
}

$actualHash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $download.sha256_checksum.ToLowerInvariant()) {
    throw "Runner package checksum mismatch for $zipPath."
}

if (-not (Test-Path -Path (Join-Path $runnerRootResolved "config.cmd"))) {
    Expand-Archive -Path $zipPath -DestinationPath $runnerRootResolved -Force
}

if (Test-Path -Path (Join-Path $runnerRootResolved ".runner")) {
    Write-Host "Runner already configured at $runnerRootResolved"
}
else {
    $registrationToken = & $gh api `
        -X POST `
        "repos/$Owner/$Repo/actions/runners/registration-token" `
        --jq ".token"
    if ($LASTEXITCODE -ne 0 -or -not $registrationToken) {
        throw "Could not create GitHub runner registration token."
    }

    $configArgs = @(
        "--unattended",
        "--url",
        $repoUrl,
        "--token",
        $registrationToken,
        "--name",
        $RunnerName,
        "--labels",
        $RunnerLabels,
        "--work",
        $RunnerWork,
        "--replace",
        "--runasservice"
    )

    if ($WindowsLogonAccount -and $WindowsLogonPassword) {
        $configArgs += @(
            "--windowslogonaccount",
            $WindowsLogonAccount,
            "--windowslogonpassword",
            $WindowsLogonPassword
        )
    }

    Invoke-Checked `
        -FilePath (Join-Path $runnerRootResolved "config.cmd") `
        -Arguments $configArgs `
        -WorkingDirectory $runnerRootResolved
}

$runnerService = Get-Service "actions.runner.*" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "*$RunnerName*" -or $_.DisplayName -like "*$RunnerName*" } |
    Select-Object -First 1
if ($null -eq $runnerService) {
    throw "Could not find the installed GitHub runner service for $RunnerName."
}

if ($runnerService.Status -ne "Running") {
    Start-Service -Name $runnerService.Name
}

Write-Host "Runner service:"
Get-Service -Name $runnerService.Name | Format-List Name,DisplayName,Status,StartType

Write-Host "Registered runner:"
$runnersJson = & $gh api "repos/$Owner/$Repo/actions/runners"
if ($LASTEXITCODE -ne 0) {
    throw "Could not read registered GitHub runners."
}
($runnersJson | ConvertFrom-Json).runners |
    Where-Object { $_.name -eq $RunnerName } |
    ForEach-Object {
        [PSCustomObject]@{
            name = $_.name
            status = $_.status
            os = $_.os
            labels = ($_.labels | ForEach-Object { $_.name }) -join ","
        }
    } |
    Format-List
