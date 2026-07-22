# Installs or updates a local-only ICE Python Windows Task Scheduler coordinator.
#
# Each task runs one selected job group through
# backend.orchestration.ice_python.service in run_once mode so due-job
# selection, lock handling, state persistence, child timeouts, and
# ops.api_fetch_log telemetry stay in Python.

param(
    [string]$RepoRoot = $(if ($env:HELIOS_ICE_REPO_ROOT) { $env:HELIOS_ICE_REPO_ROOT } else { (Resolve-Path "$PSScriptRoot\..\..\..").Path }),
    [string]$PythonExe = $(if ($env:HELIOS_ICE_PYTHON_EXE) { $env:HELIOS_ICE_PYTHON_EXE } else { "python" }),
    [string]$TaskName = "HeliosCTA ICE Python Coordinator",
    [string]$TaskPath = "\HeliosCTA\ICE Python\",
    [string]$TaskUser = "$env:USERDOMAIN\$env:USERNAME",
    [ValidateSet("all", "short_term", "futures")]
    [string]$JobGroup = "all",
    [int[]]$RunHours = @(5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22),
    [int]$RunStartHour = 5,
    [int]$RunEndHour = 22,
    [int]$StartMinute = 0,
    [int]$IntervalMinutes = 0,
    [string[]]$RunDays = @("Monday", "Tuesday", "Wednesday", "Thursday", "Friday"),
    [string]$LogDir = "C:\ProgramData\HeliosCTA\logs",
    [string]$StateDir = "C:\ProgramData\HeliosCTA\state",
    [int]$JobTimeoutSeconds = 2700,
    [int]$ExecutionTimeLimitHours = 6,
    [string]$GitRemote = "origin",
    [string]$GitBranch = "main",
    [string]$GitHubToken = $(if ($env:GITHUB_TOKEN) { $env:GITHUB_TOKEN } else { "" }),
    [switch]$PullLatest,
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
            $safeArguments = $Arguments | ForEach-Object {
                if ($_ -match "AUTHORIZATION:\s*(basic|bearer)\s+") {
                    $_ -replace "AUTHORIZATION:\s*(basic|bearer)\s+.+$", 'AUTHORIZATION: $1 ***'
                }
                else {
                    $_
                }
            }
            throw "$FilePath $($safeArguments -join ' ') failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

function Get-GitAuthArguments {
    $baseArguments = @(
        "-c",
        "credential.helper=",
        "-c",
        "core.askPass=",
        "-c",
        "credential.interactive=never"
    )

    if ($GitHubToken) {
        $tokenBytes = [System.Text.Encoding]::ASCII.GetBytes("x-access-token:$GitHubToken")
        $basicToken = [Convert]::ToBase64String($tokenBytes)
        return $baseArguments + @(
            "-c",
            "http.https://github.com/.extraheader=AUTHORIZATION: basic $basicToken"
        )
    }
    return $baseArguments
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

function Assert-BackendWriterConfig {
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
            "Production checkout is missing backend writer config: " +
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

function Convert-MinutesToIsoDuration {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Minutes
    )

    if ($Minutes -lt 1) {
        throw "Duration minutes must be at least 1."
    }

    $hours = [Math]::Floor($Minutes / 60)
    $remainingMinutes = $Minutes % 60
    if ($remainingMinutes -eq 0) {
        return "PT${hours}H"
    }
    if ($hours -eq 0) {
        return "PT${remainingMinutes}M"
    }
    return "PT${hours}H${remainingMinutes}M"
}

function New-RepetitionPattern {
    param(
        [Parameter(Mandatory = $true)]
        [int]$IntervalMinutes,
        [Parameter(Mandatory = $true)]
        [int]$DurationMinutes
    )

    return New-CimInstance `
        -Namespace Root/Microsoft/Windows/TaskScheduler `
        -ClassName MSFT_TaskRepetitionPattern `
        -ClientOnly `
        -Property @{
            Interval = (Convert-MinutesToIsoDuration -Minutes $IntervalMinutes)
            Duration = (Convert-MinutesToIsoDuration -Minutes $DurationMinutes)
            StopAtDurationEnd = $false
        }
}

$resolvedRepoRoot = (Resolve-Path -Path $RepoRoot).Path
$resolvedPythonExe = Resolve-CommandPath -Executable $PythonExe
$resolvedGitExe = Resolve-CommandPath -Executable "git"

$env:GIT_TERMINAL_PROMPT = "0"
$env:GCM_INTERACTIVE = "never"
$env:GIT_ASKPASS = ""

if (-not (Test-Path -Path (Join-Path $resolvedRepoRoot ".git"))) {
    throw "RepoRoot is not a git checkout: $resolvedRepoRoot"
}

Write-Host "Installing ICE Python Task Scheduler coordinator"
Write-Host "RepoRoot: $resolvedRepoRoot"
Write-Host "Python: $resolvedPythonExe"
Write-Host "Task: $TaskPath$TaskName"
Write-Host "TaskUser: $TaskUser"
Write-Host "JobGroup: $JobGroup"
Write-Host "RunDays: $($RunDays -join ', ')"
if ($IntervalMinutes -gt 0) {
    Write-Host "Repeated window: $($RunStartHour.ToString('00')):$($StartMinute.ToString('00')) through $($RunEndHour.ToString('00')) local, every $IntervalMinutes minute(s)"
}
else {
    Write-Host "RunHours: $($RunHours -join ', ')"
}

if ($PullLatest) {
    $dirty = Get-GitOutput -Arguments @("-C", $resolvedRepoRoot, "status", "--porcelain")
    if ($dirty) {
        throw "Production checkout has uncommitted changes. Refusing unattended pull."
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
    Invoke-Git -Arguments @(
        "-C",
        $resolvedRepoRoot,
        "pull",
        "--ff-only",
        $GitRemote,
        $GitBranch
    )
}

Assert-BackendWriterConfig -RepoRoot $resolvedRepoRoot

if ($InstallDependencies) {
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

$runScript = Join-Path $resolvedRepoRoot "infrastructure\windows-task-scheduler\ice_python\run_ice_python_once.ps1"
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
    "-JobTimeoutSeconds",
    [string]$JobTimeoutSeconds,
    "-JobGroup",
    $JobGroup
) -join " "

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument $actionArguments `
    -WorkingDirectory $resolvedRepoRoot

$triggers = @()
if ($IntervalMinutes -gt 0) {
    if ($RunStartHour -lt 0 -or $RunStartHour -gt 23) {
        throw "RunStartHour must be between 0 and 23."
    }
    if ($RunEndHour -lt 0 -or $RunEndHour -gt 23) {
        throw "RunEndHour must be between 0 and 23."
    }
    if ($RunEndHour -lt $RunStartHour) {
        throw "RunEndHour must be greater than or equal to RunStartHour."
    }
    if ($StartMinute -lt 0 -or $StartMinute -gt 59) {
        throw "StartMinute must be between 0 and 59."
    }
    if ($IntervalMinutes -gt 60) {
        throw "IntervalMinutes must be 60 or less."
    }

    $lastMinute = $StartMinute
    while (($lastMinute + $IntervalMinutes) -lt 60) {
        $lastMinute += $IntervalMinutes
    }
    $startTotalMinutes = ($RunStartHour * 60) + $StartMinute
    $endTotalMinutes = ($RunEndHour * 60) + $lastMinute
    $repetitionDurationMinutes = $endTotalMinutes - $startTotalMinutes
    if ($repetitionDurationMinutes -lt $IntervalMinutes) {
        throw "The configured repeated run window must allow at least one interval."
    }

    foreach ($day in $RunDays) {
        $trigger = New-ScheduledTaskTrigger `
            -Weekly `
            -DaysOfWeek $day `
            -At ([datetime]::Today.AddHours($RunStartHour).AddMinutes($StartMinute))
        $trigger.Repetition = New-RepetitionPattern `
            -IntervalMinutes $IntervalMinutes `
            -DurationMinutes $repetitionDurationMinutes
        $triggers += $trigger
    }
}
else {
    foreach ($hour in ($RunHours | Sort-Object -Unique)) {
        if ($hour -lt 0 -or $hour -gt 23) {
            throw "RunHours entries must be between 0 and 23."
        }
        $triggers += New-ScheduledTaskTrigger `
            -Weekly `
            -DaysOfWeek $RunDays `
            -At ([datetime]::Today.AddHours($hour))
    }
}

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
    -Trigger $triggers `
    -Settings $settings `
    -Principal $principal `
    -Description "Runs one HeliosCTA ICE Python $JobGroup scheduler tick."

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
Write-Host "Installed or updated Task Scheduler coordinator: $TaskPath$TaskName"
Write-Host "Coordinator log: $(Join-Path $LogDir 'ice-python-task-scheduler.log')"
