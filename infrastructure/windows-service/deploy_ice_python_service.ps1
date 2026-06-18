# Deploys the local-only ICE Python Windows service from a clean production clone.
#
# Intended caller: a GitHub Actions self-hosted Windows runner service account
# with permission to control the HeliosCTA-IcePython service.

#Requires -RunAsAdministrator

param(
    [string]$RepoRoot = $(if ($env:HELIOS_ICE_REPO_ROOT) { $env:HELIOS_ICE_REPO_ROOT } else { "C:\HeliosCTA\helioscta-platform" }),
    [string]$PythonExe = $(if ($env:HELIOS_ICE_PYTHON_EXE) { $env:HELIOS_ICE_PYTHON_EXE } else { "python" }),
    [string]$NssmExe = $(if ($env:HELIOS_NSSM_EXE) { $env:HELIOS_NSSM_EXE } else { "nssm.exe" }),
    [string]$ServiceName = "HeliosCTA-IcePython",
    [string]$GitRemote = "origin",
    [string]$GitBranch = "main",
    [string]$GitHubToken = $(if ($env:GITHUB_TOKEN) { $env:GITHUB_TOKEN } else { "" }),
    [int]$JobTimeoutSeconds = 2700,
    [switch]$SkipGitPull,
    [switch]$SkipDependencyInstall,
    [switch]$RunImportSmoke,
    [switch]$AllowDirtyWorktree
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

    if ($Executable -ieq "nssm.exe") {
        $candidate = Get-ChildItem `
            -Path "C:\ProgramData\chocolatey\bin", "C:\Program Files", "C:\Program Files (x86)", "C:\Users" `
            -Recurse `
            -Filter "nssm.exe" `
            -ErrorAction SilentlyContinue |
            Where-Object {
                $_.FullName -like "*\win64\nssm.exe" -or
                $_.FullName -like "*\nssm.exe"
            } |
            Sort-Object FullName |
            Select-Object -First 1
        if ($null -ne $candidate) {
            return $candidate.FullName
        }
    }

    throw "Could not resolve executable: $Executable"
}

function Invoke-External {
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

function Invoke-Nssm {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Invoke-External -FilePath $resolvedNssmExe -Arguments $Arguments
}

function Get-GitAuthArguments {
    if ($GitHubToken) {
        return @(
            "-c",
            "http.https://github.com/.extraheader=AUTHORIZATION: bearer $GitHubToken"
        )
    }
    return @()
}

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $gitArguments = @()
    $gitArguments += Get-GitAuthArguments
    $gitArguments += $Arguments
    Invoke-External -FilePath $resolvedGitExe -Arguments $gitArguments
}

function Wait-ServiceStatus {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Status,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
        if ($null -ne $service -and $service.Status.ToString() -eq $Status) {
            return
        }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)

    $observed = if ($null -ne $service) { $service.Status.ToString() } else { "missing" }
    throw "Service $Name did not reach $Status within $TimeoutSeconds seconds; observed $observed."
}

function Get-GitOutput {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $gitArguments = @()
    $gitArguments += Get-GitAuthArguments
    $gitArguments += $Arguments
    $output = & $resolvedGitExe @gitArguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
    return ($output | Out-String).Trim()
}

$resolvedRepoRoot = (Resolve-Path -Path $RepoRoot).Path
$resolvedPythonExe = Resolve-CommandPath -Executable $PythonExe
$resolvedNssmExe = Resolve-CommandPath -Executable $NssmExe
$resolvedGitExe = Resolve-CommandPath -Executable "git"

if (-not (Test-Path -Path (Join-Path $resolvedRepoRoot ".git"))) {
    throw "RepoRoot is not a git checkout: $resolvedRepoRoot"
}

Write-Host "Deploying ICE Python service"
Write-Host "RepoRoot: $resolvedRepoRoot"
Write-Host "Python: $resolvedPythonExe"
Write-Host "NSSM: $resolvedNssmExe"
Write-Host "Branch: $GitBranch"

Invoke-External -FilePath $resolvedGitExe -Arguments @(
    "config",
    "--global",
    "--add",
    "safe.directory",
    $resolvedRepoRoot
)

if (-not $SkipGitPull) {
    $dirty = Get-GitOutput -Arguments @("-C", $resolvedRepoRoot, "status", "--porcelain")
    if ($dirty -and -not $AllowDirtyWorktree) {
        throw "Production checkout has uncommitted changes. Refusing unattended deploy."
    }

    $currentBranch = Get-GitOutput -Arguments @("-C", $resolvedRepoRoot, "rev-parse", "--abbrev-ref", "HEAD")
    if ($currentBranch -ne $GitBranch) {
        throw "Production checkout is on branch $currentBranch, expected $GitBranch."
    }

    Invoke-Git -Arguments @(
        "-C",
        $resolvedRepoRoot,
        "fetch",
        "--prune",
        $GitRemote,
        $GitBranch
    )
    Invoke-Git -Arguments @(
        "-C",
        $resolvedRepoRoot,
        "merge-base",
        "--is-ancestor",
        "HEAD",
        "$GitRemote/$GitBranch"
    )
}

$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -ne $existingService -and $existingService.Status -ne "Stopped") {
    Write-Host "Stopping service: $ServiceName"
    Invoke-Nssm -Arguments @("stop", $ServiceName)
    Wait-ServiceStatus -Name $ServiceName -Status "Stopped" -TimeoutSeconds 90
}

try {
    if (-not $SkipGitPull) {
        Invoke-Git -Arguments @(
            "-C",
            $resolvedRepoRoot,
            "pull",
            "--ff-only",
            $GitRemote,
            $GitBranch
        )
    }

    if (-not $SkipDependencyInstall) {
        Invoke-External -FilePath $resolvedPythonExe -Arguments @(
            "-m",
            "pip",
            "install",
            "-r",
            (Join-Path $resolvedRepoRoot "backend\requirements-local-windows.txt"),
            "-e",
            (Join-Path $resolvedRepoRoot "backend")
        ) -WorkingDirectory $resolvedRepoRoot
    }

    if ($RunImportSmoke) {
        Invoke-External -FilePath $resolvedPythonExe -Arguments @(
            "-c",
            "import icepython; from backend.orchestration.ice_python import service; print('ice runtime import ok')"
        ) -WorkingDirectory $resolvedRepoRoot
    }

    $installScript = Join-Path $resolvedRepoRoot "infrastructure\windows-service\install_ice_python_service.ps1"
    & $installScript `
        -RepoRoot $resolvedRepoRoot `
        -PythonExe $resolvedPythonExe `
        -NssmExe $resolvedNssmExe `
        -ServiceName $ServiceName `
        -JobTimeoutSeconds $JobTimeoutSeconds
    if ($LASTEXITCODE -ne 0) {
        throw "$installScript failed with exit code $LASTEXITCODE"
    }

    Write-Host "Starting service: $ServiceName"
    Invoke-Nssm -Arguments @("start", $ServiceName)
    Wait-ServiceStatus -Name $ServiceName -Status "Running" -TimeoutSeconds 90

    $environmentText = & $resolvedNssmExe get $ServiceName AppEnvironmentExtra
    if ($LASTEXITCODE -ne 0) {
        throw "Could not read NSSM AppEnvironmentExtra."
    }
    $environmentJoined = ($environmentText | Out-String)
    if ($environmentJoined -notmatch "HELIOS_ICE_JOB_TIMEOUT_SECONDS=$JobTimeoutSeconds") {
        throw "Service environment is missing HELIOS_ICE_JOB_TIMEOUT_SECONDS=$JobTimeoutSeconds."
    }
    if ($environmentJoined -notmatch "HELIOS_ICE_JOB_LOCK_FILE=") {
        throw "Service environment is missing HELIOS_ICE_JOB_LOCK_FILE."
    }

    Get-Service -Name $ServiceName | Format-List Status,Name,DisplayName,StartType
    Write-Host "NSSM AppDirectory:"
    & $resolvedNssmExe get $ServiceName AppDirectory
    Write-Host "NSSM AppEnvironmentExtra:"
    & $resolvedNssmExe get $ServiceName AppEnvironmentExtra

    $stdoutLog = "C:\ProgramData\HeliosCTA\logs\ice-python-service.stdout.log"
    if (Test-Path -Path $stdoutLog) {
        Write-Host "Recent service stdout:"
        Get-Content $stdoutLog -Tail 60
    }
}
catch {
    Write-Error $_
    throw
}
