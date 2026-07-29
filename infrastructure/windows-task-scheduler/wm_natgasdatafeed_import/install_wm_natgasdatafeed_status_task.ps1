# Installs or updates the visible local WoodMac NatGas DataFeed status task.

param(
    [string]$RepoRoot = $(Resolve-Path "$PSScriptRoot\..\..\.."),
    [string]$TaskName = "HeliosCTA WM NatGas DataFeed Status",
    [string]$TaskPath = "\HeliosCTA\NatGas\",
    [string]$LegacyTaskPath = "\helioscta-azure-backend\NatGas\",
    [string]$TaskUser = "$env:USERDOMAIN\$env:USERNAME",
    [int]$LookbackHours = 6,
    [int]$HistoryPerSource = 5,
    [int]$LogFileCount = 8,
    [int]$ExecutionTimeLimitMinutes = 15
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

if ($LookbackHours -lt 1) {
    throw "LookbackHours must be at least 1."
}
if ($HistoryPerSource -lt 1) {
    throw "HistoryPerSource must be at least 1."
}
if ($LogFileCount -lt 1) {
    throw "LogFileCount must be at least 1."
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $resolvedRepoRoot ".git"))) {
    throw "RepoRoot is not a git checkout: $resolvedRepoRoot"
}

$statusScript = Join-Path $resolvedRepoRoot "infrastructure\windows-task-scheduler\wm_natgasdatafeed_import\show_wm_natgasdatafeed_status.ps1"
if (-not (Test-Path -LiteralPath $statusScript)) {
    throw "Status script is missing: $statusScript"
}

$configPath = Join-Path $resolvedRepoRoot "infrastructure\windows-task-scheduler\wm_natgasdatafeed_import\gasdatafeed_import.json"
if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Missing gitignored runtime config: $configPath"
}

Write-Host "Installing WM NatGas DataFeed status Task Scheduler task"
Write-Host "RepoRoot: $resolvedRepoRoot"
Write-Host "Task: $TaskPath$TaskName"
Write-Host "TaskUser: $TaskUser"
Write-Host "LookbackHours: $LookbackHours"
Write-Host "HistoryPerSource: $HistoryPerSource"

Ensure-TaskFolder -FolderPath $TaskPath

$actionArguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Quote-TaskArgument $statusScript),
    "-RepoRoot",
    (Quote-TaskArgument $resolvedRepoRoot),
    "-TaskPath",
    (Quote-TaskArgument $TaskPath),
    "-LegacyTaskPath",
    (Quote-TaskArgument $LegacyTaskPath),
    "-LookbackHours",
    [string]$LookbackHours,
    "-HistoryPerSource",
    [string]$HistoryPerSource,
    "-LogFileCount",
    [string]$LogFileCount
) -join " "

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument $actionArguments `
    -WorkingDirectory $resolvedRepoRoot

$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes $ExecutionTimeLimitMinutes) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

$principal = New-ScheduledTaskPrincipal `
    -UserId $TaskUser `
    -LogonType Interactive

$task = New-ScheduledTask `
    -Action $action `
    -Settings $settings `
    -Principal $principal `
    -Description "Shows latest WoodMac NatGas DataFeed scheduler, load-status, and log-file health in a visible PowerShell window."

Register-ScheduledTask `
    -TaskName $TaskName `
    -TaskPath $TaskPath `
    -InputObject $task `
    -Force `
    -ErrorAction Stop | Out-Null

Get-ScheduledTask `
    -TaskName $TaskName `
    -TaskPath $TaskPath `
    -ErrorAction Stop | Format-List TaskName, TaskPath, State

Write-Host "Installed or updated Task Scheduler status task: $TaskPath$TaskName"
