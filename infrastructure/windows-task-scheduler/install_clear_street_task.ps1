# Installs or updates the local Clear Street overnight Task Scheduler job.
#
# Task Scheduler starts one process at 19:00 local time. The Python
# orchestration polls every 5 minutes until the target trade-date file arrives
# or the 05:00 local timeout is reached.

param(
    [string]$RepoRoot = $(if ($env:HELIOS_CLEAR_STREET_REPO_ROOT) { $env:HELIOS_CLEAR_STREET_REPO_ROOT } else { (Resolve-Path "$PSScriptRoot\..\..").Path }),
    [string]$PythonExe = $(if ($env:HELIOS_CLEAR_STREET_PYTHON_EXE) { $env:HELIOS_CLEAR_STREET_PYTHON_EXE } else { "python" }),
    [string]$TaskName = "HeliosCTA Clear Street EOD Transactions",
    [string]$TaskPath = "\HeliosCTA\Positions And Trades\",
    [string]$TaskUser = "$env:USERDOMAIN\$env:USERNAME",
    [int]$RunHour = 19,
    [string]$LogDir = "C:\ProgramData\HeliosCTA\logs",
    [string]$StateDir = "C:\ProgramData\HeliosCTA\state",
    [int]$PollWaitSeconds = 300,
    [int]$ExecutionTimeLimitHours = 11,
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
            Label = "Clear Street SFTP host"
            Names = @("CLEAR_STREET_SFTP_HOST")
        },
        @{
            Label = "Clear Street SFTP user"
            Names = @("CLEAR_STREET_SFTP_USER")
        },
        @{
            Label = "Clear Street SSH key"
            Names = @("CLEAR_STREET_SSH_KEY_CONTENT")
        },
        @{
            Label = "MUFG SFTP host"
            Names = @("MUFG_SFTP_HOST")
        },
        @{
            Label = "MUFG SFTP user"
            Names = @("MUFG_SFTP_USER")
        },
        @{
            Label = "MUFG SFTP password"
            Names = @("MUFG_SFTP_PASSWORD")
        },
        @{
            Label = "Azure Outlook Graph client id"
            Names = @("AZURE_OUTLOOK_CLIENT_ID")
        },
        @{
            Label = "Azure Outlook Graph tenant id"
            Names = @("AZURE_OUTLOOK_TENANT_ID")
        },
        @{
            Label = "Azure Outlook Graph client secret"
            Names = @("AZURE_OUTLOOK_CLIENT_SECRET")
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
            "Production checkout is missing Clear Street/MUFG/NAV email schedule config: " +
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
if ($PollWaitSeconds -lt 1) {
    throw "PollWaitSeconds must be at least 1."
}

$resolvedRepoRoot = (Resolve-Path -Path $RepoRoot).Path
$resolvedPythonExe = Resolve-CommandPath -Executable $PythonExe

if (-not (Test-Path -Path (Join-Path $resolvedRepoRoot ".git"))) {
    throw "RepoRoot is not a git checkout: $resolvedRepoRoot"
}

Write-Host "Installing Clear Street Task Scheduler job"
Write-Host "RepoRoot: $resolvedRepoRoot"
Write-Host "Python: $resolvedPythonExe"
Write-Host "Task: $TaskPath$TaskName"
Write-Host "TaskUser: $TaskUser"
Write-Host "RunHour: $RunHour"
Write-Host "PollWaitSeconds: $PollWaitSeconds"

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
        "from backend.orchestration.clear_street import transactions; print('clear street runtime import ok')"
    ) -WorkingDirectory $resolvedRepoRoot
}

$runScript = Join-Path $resolvedRepoRoot "infrastructure\windows-task-scheduler\run_clear_street_transactions_poll.ps1"
if (-not (Test-Path -Path $runScript)) {
    throw "Run script is missing: $runScript"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
Ensure-TaskFolder -FolderPath $TaskPath

$actionArguments = @(
    "-NoProfile",
    "-WindowStyle",
    "Hidden",
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
    "-StateDir",
    (Quote-TaskArgument $StateDir),
    "-PollWaitSeconds",
    [string]$PollWaitSeconds
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
    -Description "Polls Clear Street EOD transactions nightly from 19:00 to 05:00."

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
Write-Host "Coordinator log: $(Join-Path $LogDir 'clear-street-task-scheduler.log')"
