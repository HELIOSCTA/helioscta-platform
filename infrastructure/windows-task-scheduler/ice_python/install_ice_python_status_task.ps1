# Installs or updates the visible local ICE Python status Task Scheduler task.

param(
    [string]$RepoRoot = $(if ($env:HELIOS_ICE_REPO_ROOT) { $env:HELIOS_ICE_REPO_ROOT } else { (Resolve-Path "$PSScriptRoot\..\..\..").Path }),
    [string]$PythonExe = $(if ($env:HELIOS_ICE_PYTHON_EXE) { $env:HELIOS_ICE_PYTHON_EXE } else { "python" }),
    [string]$TaskName = "HeliosCTA ICE Python Status",
    [string]$TaskPath = "\HeliosCTA\ICE Python\",
    [string]$TaskUser = "$env:USERDOMAIN\$env:USERNAME",
    [string]$LogDir = "C:\ProgramData\HeliosCTA\logs",
    [string]$StateDir = "C:\ProgramData\HeliosCTA\state",
    [int]$JobTimeoutSeconds = 2700,
    [int]$HistoryPerFeed = 5,
    [int]$ExecutionTimeLimitMinutes = 30
)

$ErrorActionPreference = "Stop"

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

function Quote-TaskArgument {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    return '"' + ($Value -replace '"', '\"') + '"'
}

if ($HistoryPerFeed -lt 1) {
    throw "HistoryPerFeed must be at least 1."
}

$resolvedRepoRoot = (Resolve-Path -Path $RepoRoot).Path
$resolvedPythonExe = Resolve-CommandPath -Executable $PythonExe
if (-not (Test-Path -Path (Join-Path $resolvedRepoRoot ".git"))) {
    throw "RepoRoot is not a git checkout: $resolvedRepoRoot"
}

$statusScript = Join-Path $resolvedRepoRoot "infrastructure\windows-task-scheduler\ice_python\show_ice_python_status.ps1"
if (-not (Test-Path -Path $statusScript)) {
    throw "Status script is missing: $statusScript"
}

Write-Host "Installing ICE Python status Task Scheduler task"
Write-Host "RepoRoot: $resolvedRepoRoot"
Write-Host "Python: $resolvedPythonExe"
Write-Host "Task: $TaskPath$TaskName"
Write-Host "TaskUser: $TaskUser"
Write-Host "LogDir: $LogDir"
Write-Host "StateDir: $StateDir"
Write-Host "JobTimeoutSeconds: $JobTimeoutSeconds"
Write-Host "HistoryPerFeed: $HistoryPerFeed"

Ensure-TaskFolder -FolderPath $TaskPath

$actionArguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Quote-TaskArgument $statusScript),
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
    "-HistoryPerFeed",
    [string]$HistoryPerFeed
) -join " "

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument $actionArguments `
    -WorkingDirectory $resolvedRepoRoot

$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes $ExecutionTimeLimitMinutes) `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

$principal = New-ScheduledTaskPrincipal `
    -UserId $TaskUser `
    -LogonType Interactive

$task = New-ScheduledTask `
    -Action $action `
    -Settings $settings `
    -Principal $principal `
    -Description "Shows latest ICE Python scheduler summary and feed history in a visible PowerShell window."

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
Write-Host "Installed or updated Task Scheduler status task: $TaskPath$TaskName"
