<#
.SYNOPSIS
    Register the WoodMac NatGas DataFeed scheduler tasks from this repo copy.

.DESCRIPTION
    Creates or updates the platform-owned Task Scheduler tasks:

    - HeliosCTA WM NatGas DataFeed Delta: repeating delta wrapper.
    - HeliosCTA WM NatGas DataFeed Hourly: hourly metadata then scheduled hourly sources.
    - HeliosCTA WM NatGas DataFeed Index of Customers Manual: no-trigger manual wrapper.

    Run from an elevated PowerShell session because the import tasks use
    RunLevel Highest.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param (
    [Parameter(Mandatory = $false)]
    [string] $TaskPath = "\HeliosCTA\NatGas\",

    [Parameter(Mandatory = $false)]
    [string] $LegacyTaskPath = "\helioscta-azure-backend\NatGas\",

    [Parameter(Mandatory = $false)]
    [int] $DeltaIntervalMinutes = 5,

    [Parameter(Mandatory = $false)]
    [int] $HourlyStartMinute = 10,

    [Parameter(Mandatory = $false)]
    [string] $TaskUser = "$env:USERDOMAIN\$env:USERNAME",

    [Parameter(Mandatory = $false)]
    [switch] $DisableLegacy
)

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $WhatIfPreference -and -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this installer from an elevated PowerShell session."
}

if ($DeltaIntervalMinutes -lt 1 -or $DeltaIntervalMinutes -gt 60) {
    throw "DeltaIntervalMinutes must be between 1 and 60."
}

if ($HourlyStartMinute -lt 0 -or $HourlyStartMinute -gt 59) {
    throw "HourlyStartMinute must be between 0 and 59."
}

function Normalize-TaskPath {
    param ([string] $Path)

    if (-not $Path.StartsWith("\")) {
        $Path = "\$Path"
    }
    if (-not $Path.EndsWith("\")) {
        $Path = "$Path\"
    }
    return $Path
}

function Ensure-ScheduledTaskFolder {
    param ([string] $Path)

    $service = New-Object -ComObject Schedule.Service
    $service.Connect()
    $folder = $service.GetFolder("\")

    foreach ($part in $Path.Trim("\").Split("\", [System.StringSplitOptions]::RemoveEmptyEntries)) {
        try {
            $folder = $folder.GetFolder($part)
        }
        catch {
            $folder = $folder.CreateFolder($part)
        }
    }
}

function Assert-WmConfig {
    param ([string] $ConfigPath)

    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        throw "Missing gitignored runtime config: $ConfigPath"
    }

    $config = Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
    foreach ($key in @("base_url", "api_key", "datafeed_secret", "working_path")) {
        if ([string]::IsNullOrWhiteSpace($config.$key)) {
            throw "Missing required config value '$key' in $ConfigPath"
        }
    }

    if ($null -eq $config.db_conf) {
        throw "Missing required config object 'db_conf' in $ConfigPath"
    }

    foreach ($key in @("host", "db", "port", "login", "pass")) {
        if ([string]::IsNullOrWhiteSpace($config.db_conf.$key)) {
            throw "Missing required config value 'db_conf.$key' in $ConfigPath"
        }
    }
}

function Register-WmImportTask {
    param(
        [string] $Name,
        [string] $ScriptPath,
        [string] $Schedule,
        [int] $Modifier,
        [string] $StartTime = ""
    )

    $pwshPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    $taskName = ("{0}{1}" -f $TaskPath, $Name)
    $taskRun = "`"$pwshPath`" -NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
    $actionArguments = @(
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        (Quote-WmTaskArgument -Value $ScriptPath)
    ) -join " "

    if ($PSCmdlet.ShouldProcess("$TaskPath$Name", "Register scheduled task")) {
        $arguments = @(
            "/Create",
            "/TN", $taskName,
            "/TR", $taskRun,
            "/SC", $Schedule,
            "/MO", [string]$Modifier,
            "/RL", "HIGHEST",
            "/F"
        )

        if ($StartTime) {
            $arguments += @("/ST", $StartTime)
        }

        & schtasks.exe @arguments | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw "schtasks.exe failed to register $taskName with exit code $LASTEXITCODE."
        }

        $settings = New-ScheduledTaskSettingsSet `
            -MultipleInstances IgnoreNew `
            -ExecutionTimeLimit (New-TimeSpan -Hours 6) `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries `
            -StartWhenAvailable

        # Routine imports should not steal focus from the interactive operator
        # session. Match the ICE scheduler pattern: conhost --headless prevents
        # the console from being painted before PowerShell can hide itself.
        $action = New-ScheduledTaskAction `
            -Execute "conhost.exe" `
            -Argument "--headless powershell.exe $actionArguments" `
            -WorkingDirectory $scriptDir

        Set-ScheduledTask `
            -TaskPath $TaskPath `
            -TaskName $Name `
            -Action $action `
            -Settings $settings `
            -ErrorAction Stop | Out-Null
    }
}

function Quote-WmTaskArgument {
    param([string] $Value)

    return '"' + ($Value -replace '"', '\"') + '"'
}

function Register-WmManualImportTask {
    param(
        [string] $Name,
        [string] $ScriptPath
    )

    $pwshPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    $actionArguments = @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        (Quote-WmTaskArgument -Value $ScriptPath)
    ) -join " "

    if ($PSCmdlet.ShouldProcess("$TaskPath$Name", "Register manual no-trigger task")) {
        $action = New-ScheduledTaskAction `
            -Execute $pwshPath `
            -Argument $actionArguments `
            -WorkingDirectory $scriptDir

        $settings = New-ScheduledTaskSettingsSet `
            -MultipleInstances IgnoreNew `
            -ExecutionTimeLimit (New-TimeSpan -Hours 6) `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries

        $principal = New-ScheduledTaskPrincipal `
            -UserId $TaskUser `
            -LogonType Interactive `
            -RunLevel Highest

        $task = New-ScheduledTask `
            -Action $action `
            -Settings $settings `
            -Principal $principal `
            -Description "Manual WoodMac NatGas DataFeed Index of Customers load. No schedule trigger is registered."

        Register-ScheduledTask `
            -TaskName $Name `
            -TaskPath $TaskPath `
            -InputObject $task `
            -Force `
            -ErrorAction Stop | Out-Null
    }
}

$TaskPath = Normalize-TaskPath -Path $TaskPath
$LegacyTaskPath = Normalize-TaskPath -Path $LegacyTaskPath
$scriptDir = $PSScriptRoot
$configPath = Join-Path $scriptDir "gasdatafeed_import.json"
$deltaScriptPath = Join-Path $scriptDir "run_wm_natgasdatafeed_delta.ps1"
$hourlyScriptPath = Join-Path $scriptDir "run_wm_natgasdatafeed_hourly.ps1"
$indexOfCustomersScriptPath = Join-Path $scriptDir "run_wm_natgasdatafeed_index_of_customers.ps1"

Assert-WmConfig -ConfigPath $configPath
foreach ($requiredScript in @($deltaScriptPath, $hourlyScriptPath, $indexOfCustomersScriptPath)) {
    if (-not (Test-Path -LiteralPath $requiredScript)) {
        throw "Missing scheduler wrapper script: $requiredScript"
    }
}

if ($PSCmdlet.ShouldProcess($TaskPath, "Ensure scheduled task folder")) {
    Ensure-ScheduledTaskFolder -Path $TaskPath
}

Register-WmImportTask `
    -Name "HeliosCTA WM NatGas DataFeed Delta" `
    -ScriptPath $deltaScriptPath `
    -Schedule "MINUTE" `
    -Modifier $DeltaIntervalMinutes `
    -StartTime "00:00"

Register-WmImportTask `
    -Name "HeliosCTA WM NatGas DataFeed Hourly" `
    -ScriptPath $hourlyScriptPath `
    -Schedule "HOURLY" `
    -Modifier 1 `
    -StartTime ("00:{0:D2}" -f $HourlyStartMinute)

Register-WmManualImportTask `
    -Name "HeliosCTA WM NatGas DataFeed Index of Customers Manual" `
    -ScriptPath $indexOfCustomersScriptPath

$supersededPlatformTasks = Get-ScheduledTask -TaskPath $TaskPath -ErrorAction SilentlyContinue |
    Where-Object { $_.TaskName -like "wm_natgasdatafeed_import*" }

foreach ($task in $supersededPlatformTasks) {
    if ($PSCmdlet.ShouldProcess("$($task.TaskPath)$($task.TaskName)", "Disable superseded platform scheduled task")) {
        Disable-ScheduledTask -TaskPath $task.TaskPath -TaskName $task.TaskName | Out-Null
    }
}

if ($DisableLegacy) {
    $legacyTasks = Get-ScheduledTask -TaskPath $LegacyTaskPath -ErrorAction SilentlyContinue |
        Where-Object { $_.TaskName -like "wm_natgasdatafeed_import*" }

    foreach ($task in $legacyTasks) {
        if ($PSCmdlet.ShouldProcess("$($task.TaskPath)$($task.TaskName)", "Disable legacy scheduled task")) {
            Disable-ScheduledTask -TaskPath $task.TaskPath -TaskName $task.TaskName | Out-Null
        }
    }
}

Write-Host "Platform tasks:"
Get-ScheduledTask -TaskPath $TaskPath -ErrorAction SilentlyContinue |
    Where-Object { $_.TaskName -like "HeliosCTA WM NatGas DataFeed*" -or $_.TaskName -like "wm_natgasdatafeed_import*" } |
    Select-Object TaskPath, TaskName, State |
    Format-Table -AutoSize

if ($DisableLegacy) {
    Write-Host "Legacy tasks:"
    Get-ScheduledTask -TaskPath $LegacyTaskPath -ErrorAction SilentlyContinue |
        Where-Object { $_.TaskName -like "wm_natgasdatafeed_import*" } |
        Select-Object TaskPath, TaskName, State |
        Format-Table -AutoSize
}
