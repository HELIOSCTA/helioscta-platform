# Installs or updates the visible local positions/trades status Task Scheduler task.

param(
    [string]$RepoRoot = $(if ($env:HELIOS_POSITIONS_TRADES_REPO_ROOT) { $env:HELIOS_POSITIONS_TRADES_REPO_ROOT } else { (Resolve-Path "$PSScriptRoot\..\..\..").Path }),
    [string]$TaskName = "HeliosCTA Positions And Trades Status",
    [string]$TaskPath = "\HeliosCTA\Positions And Trades\",
    [string]$TaskUser = "$env:USERDOMAIN\$env:USERNAME",
    [string]$LogDir = "C:\ProgramData\HeliosCTA\logs",
    [int]$HistoryLines = 35,
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

function Quote-TaskArgument {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    return '"' + ($Value -replace '"', '\"') + '"'
}

if ($HistoryLines -lt 1) {
    throw "HistoryLines must be at least 1."
}

$resolvedRepoRoot = (Resolve-Path -Path $RepoRoot).Path
if (-not (Test-Path -Path (Join-Path $resolvedRepoRoot ".git"))) {
    throw "RepoRoot is not a git checkout: $resolvedRepoRoot"
}

$statusScript = Join-Path $resolvedRepoRoot "infrastructure\windows-task-scheduler\positions_and_trades\show_positions_trades_status.ps1"
if (-not (Test-Path -Path $statusScript)) {
    throw "Status script is missing: $statusScript"
}

Write-Host "Installing positions/trades status Task Scheduler task"
Write-Host "RepoRoot: $resolvedRepoRoot"
Write-Host "Task: $TaskPath$TaskName"
Write-Host "TaskUser: $TaskUser"
Write-Host "LogDir: $LogDir"
Write-Host "HistoryLines: $HistoryLines"

Ensure-TaskFolder -FolderPath $TaskPath

$actionArguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Quote-TaskArgument $statusScript),
    "-RepoRoot",
    (Quote-TaskArgument $resolvedRepoRoot),
    "-LogDir",
    (Quote-TaskArgument $LogDir),
    "-HistoryLines",
    [string]$HistoryLines
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
    -Description "Shows latest NAV and Clear Street scheduler status in a visible PowerShell window."

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
