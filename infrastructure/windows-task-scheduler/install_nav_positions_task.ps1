# Installs or updates the local NAV positions Task Scheduler job.
#
# Task Scheduler starts one process daily. The Python orchestration downloads
# recent NAV position valuation workbooks, upserts nav.positions, and writes
# ops.api_fetch_log telemetry.

param(
    [string]$RepoRoot = $(if ($env:HELIOS_NAV_POSITIONS_REPO_ROOT) { $env:HELIOS_NAV_POSITIONS_REPO_ROOT } else { (Resolve-Path "$PSScriptRoot\..\..").Path }),
    [string]$PythonExe = $(if ($env:HELIOS_NAV_POSITIONS_PYTHON_EXE) { $env:HELIOS_NAV_POSITIONS_PYTHON_EXE } else { "python" }),
    [string]$TaskName = "HeliosCTA NAV Positions",
    [string]$TaskPath = "\HeliosCTA\Positions And Trades\",
    [string]$TaskUser = "$env:USERDOMAIN\$env:USERNAME",
    [int]$RunHour = 6,
    [string]$LogDir = "C:\ProgramData\HeliosCTA\logs",
    [int]$LookbackDays = 5,
    [int]$ExecutionTimeLimitHours = 2,
    [switch]$InstallDependencies,
    [switch]$RunImportSmoke
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

function Test-DotenvDefinesAnyName {
    param(
        [Parameter(Mandatory = $true)]
        [string]$EnvFile,
        [Parameter(Mandatory = $true)]
        [string[]]$Names
    )

    if (-not (Test-Path -Path $EnvFile)) {
        return $false
    }

    foreach ($line in Get-Content -Path $EnvFile) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }
        foreach ($name in $Names) {
            if ($trimmed -match "^\s*$([regex]::Escape($name))\s*=") {
                return $true
            }
        }
    }

    return $false
}

function Test-ConfigDefinesAnyName {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Names,
        [Parameter(Mandatory = $true)]
        [string]$EnvFile
    )

    foreach ($name in $Names) {
        if ([Environment]::GetEnvironmentVariable($name, "Process")) {
            return $true
        }
        if ([Environment]::GetEnvironmentVariable($name, "Machine")) {
            return $true
        }
        if ([Environment]::GetEnvironmentVariable($name, "User")) {
            return $true
        }
    }

    return Test-DotenvDefinesAnyName -EnvFile $EnvFile -Names $Names
}

function Assert-Config {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $envFile = Join-Path $RepoRoot "backend\.env"
    $requirements = @(
        @{
            Label = "Azure Postgres writer host"
            Names = @("AZURE_POSTGRES_WRITER_HOST", "AZURE_POSTGRESQL_DB_HOST")
        },
        @{
            Label = "Azure Postgres writer user"
            Names = @("AZURE_POSTGRES_WRITER_USER", "AZURE_POSTGRESQL_DB_USER")
        },
        @{
            Label = "Azure Postgres writer password"
            Names = @("AZURE_POSTGRES_WRITER_PASSWORD", "AZURE_POSTGRESQL_DB_PASSWORD")
        },
        @{
            Label = "NAV SFTP host"
            Names = @("NAV_SFTP_HOST")
        },
        @{
            Label = "NAV SFTP user"
            Names = @("NAV_SFTP_USER")
        },
        @{
            Label = "NAV SFTP password"
            Names = @("NAV_SFTP_PASSWORD")
        }
    )

    $missing = @()
    foreach ($requirement in $requirements) {
        if (-not (Test-ConfigDefinesAnyName -Names $requirement.Names -EnvFile $envFile)) {
            $missing += $requirement.Label
        }
    }

    if ($missing.Count -gt 0) {
        throw (
            "Production checkout is missing NAV positions schedule config: " +
            ($missing -join ", ") +
            ". Set machine/user environment variables or create an " +
            "untracked backend\.env file in the production clone before scheduling."
        )
    }
}

function Ensure-TaskFolder {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FolderPath
    )

    $normalized = $FolderPath.Trim()
    if (-not $normalized -or $normalized -eq "\") {
        return
    }

    $service = New-Object -ComObject Schedule.Service
    $service.Connect()
    $current = $service.GetFolder("\")
    foreach ($part in $normalized.Trim("\").Split("\")) {
        if (-not $part) {
            continue
        }
        try {
            $current = $current.GetFolder($part)
        }
        catch {
            $current = $current.CreateFolder($part)
        }
    }
}

function Quote-TaskArgument {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    return '"' + ($Value -replace '"', '\"') + '"'
}

if ($RunHour -lt 0 -or $RunHour -gt 23) {
    throw "RunHour must be between 0 and 23."
}
if ($LookbackDays -lt 1) {
    throw "LookbackDays must be at least 1."
}

$resolvedRepoRoot = (Resolve-Path -Path $RepoRoot).Path
$resolvedPythonExe = Resolve-CommandPath -Executable $PythonExe

if (-not (Test-Path -Path (Join-Path $resolvedRepoRoot ".git"))) {
    throw "RepoRoot is not a git checkout: $resolvedRepoRoot"
}

Write-Host "Installing NAV Positions Task Scheduler job"
Write-Host "RepoRoot: $resolvedRepoRoot"
Write-Host "Python: $resolvedPythonExe"
Write-Host "Task: $TaskPath$TaskName"
Write-Host "TaskUser: $TaskUser"
Write-Host "RunHour: $RunHour"
Write-Host "LookbackDays: $LookbackDays"

Assert-Config -RepoRoot $resolvedRepoRoot

if ($InstallDependencies) {
    Invoke-External -FilePath $resolvedPythonExe -Arguments @(
        "-m",
        "pip",
        "install",
        "-r",
        (Join-Path $resolvedRepoRoot "backend\requirements-local-sftp.txt"),
        "-e",
        (Join-Path $resolvedRepoRoot "backend")
    ) -WorkingDirectory $resolvedRepoRoot
}

if ($RunImportSmoke) {
    Invoke-External -FilePath $resolvedPythonExe -Arguments @(
        "-c",
        "from backend.orchestration.nav import positions; print('nav positions runtime import ok')"
    ) -WorkingDirectory $resolvedRepoRoot
}

$runScript = Join-Path $resolvedRepoRoot "infrastructure\windows-task-scheduler\run_nav_positions_once.ps1"
if (-not (Test-Path -Path $runScript)) {
    throw "Run script is missing: $runScript"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Ensure-TaskFolder -FolderPath $TaskPath

$actionArguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Quote-TaskArgument $runScript),
    "-RepoRoot",
    (Quote-TaskArgument $resolvedRepoRoot),
    "-PythonExe",
    (Quote-TaskArgument $resolvedPythonExe),
    "-LogDir",
    (Quote-TaskArgument $LogDir),
    "-LookbackDays",
    [string]$LookbackDays
) -join " "

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument $actionArguments `
    -WorkingDirectory $resolvedRepoRoot

$trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours($RunHour))

$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours $ExecutionTimeLimitHours) `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

$principal = New-ScheduledTaskPrincipal `
    -UserId $TaskUser `
    -LogonType Interactive

$task = New-ScheduledTask `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Loads recent NAV position valuation workbooks daily."

Register-ScheduledTask `
    -TaskName $TaskName `
    -TaskPath $TaskPath `
    -InputObject $task `
    -Force `
    -ErrorAction Stop | Out-Null

Get-ScheduledTask `
    -TaskName $TaskName `
    -TaskPath $TaskPath `
    -ErrorAction Stop | Format-List TaskName,TaskPath,State
Write-Host "Installed or updated Task Scheduler job: $TaskPath$TaskName"
Write-Host "Coordinator log: $(Join-Path $LogDir 'nav-positions-task-scheduler.log')"
