# Shows local positions/trades scheduler status in a visible Task Scheduler window.

param(
    [string]$RepoRoot = $(if ($env:HELIOS_POSITIONS_TRADES_REPO_ROOT) { $env:HELIOS_POSITIONS_TRADES_REPO_ROOT } else { (Resolve-Path "$PSScriptRoot\..\..").Path }),
    [string]$LogDir = "C:\ProgramData\HeliosCTA\logs",
    [int]$HistoryLines = 35,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"

$taskPath = "\HeliosCTA\Positions And Trades\"
$tasks = @(
    @{
        Key = "P"
        Label = "NAV Positions"
        TaskName = "HeliosCTA NAV Positions"
        LogName = "nav-positions-task-scheduler.log"
    },
    @{
        Key = "T"
        Label = "NAV Trade Breaks"
        TaskName = "HeliosCTA NAV Trade Breaks"
        LogName = "nav-trade-breaks-task-scheduler.log"
    },
    @{
        Key = "C"
        Label = "Clear Street EOD Transactions"
        TaskName = "HeliosCTA Clear Street EOD Transactions"
        LogName = "clear-street-task-scheduler.log"
    }
)

function Format-LocalTime {
    param([object]$Value)

    if ($null -eq $Value) {
        return ""
    }
    try {
        $dateTime = [datetime]$Value
        if ($dateTime -eq [datetime]::MinValue) {
            return ""
        }
        return $dateTime.ToString("MM-dd HH:mm:ss")
    }
    catch {
        return [string]$Value
    }
}

function Format-TaskResult {
    param([object]$Value)

    if ($null -eq $Value) {
        return ""
    }
    $result = [int]$Value
    if ($result -eq 0) {
        return "0 (success)"
    }
    return [string]$result
}

function Shorten-Text {
    param(
        [object]$Value,
        [int]$MaxLength = 180
    )

    if ($null -eq $Value) {
        return ""
    }
    $text = ([string]$Value) -replace "\s+", " "
    if ($text.Length -le $MaxLength) {
        return $text
    }
    return $text.Substring(0, $MaxLength - 3) + "..."
}

function Remove-LogNullCharacters {
    process {
        [string]$_ -replace "`0", ""
    }
}

function Write-Table {
    param([object[]]$Rows)

    if (-not $Rows -or $Rows.Count -eq 0) {
        Write-Host "(no records)"
        return
    }
    $Rows | Format-Table -AutoSize | Out-String -Width 220 | Write-Host
}

function Get-TaskStatusRows {
    $rows = @()
    foreach ($entry in $tasks) {
        $taskName = [string]$entry.TaskName
        $task = Get-ScheduledTask `
            -TaskPath $taskPath `
            -TaskName $taskName `
            -ErrorAction SilentlyContinue

        if ($null -eq $task) {
            $rows += [pscustomobject]@{
                Key = [string]$entry.Key
                Workflow = [string]$entry.Label
                State = "NotInstalled"
                LastRun = ""
                LastResult = ""
                NextRun = ""
                Missed = ""
            }
            continue
        }

        $info = Get-ScheduledTaskInfo -TaskPath $taskPath -TaskName $taskName
        $rows += [pscustomobject]@{
            Key = [string]$entry.Key
            Workflow = [string]$entry.Label
            State = [string]$task.State
            LastRun = Format-LocalTime -Value $info.LastRunTime
            LastResult = Format-TaskResult -Value $info.LastTaskResult
            NextRun = Format-LocalTime -Value $info.NextRunTime
            Missed = [string]$info.NumberOfMissedRuns
        }
    }
    return $rows
}

function Write-RecentLog {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Entry
    )

    $logPath = Join-Path $LogDir ([string]$Entry.LogName)
    Write-Host ""
    Write-Host ([string]$Entry.Label)
    Write-Host ("-" * ([string]$Entry.Label).Length)
    Write-Host ("Log: {0}" -f $logPath)

    if (-not (Test-Path -Path $logPath)) {
        Write-Host "(log file not found)"
        return
    }

    $lines = @(
        Get-Content -Path $logPath -Tail $HistoryLines -ErrorAction Stop |
            Remove-LogNullCharacters |
            ForEach-Object { Shorten-Text -Value $_ -MaxLength 200 }
    )
    if ($lines.Count -eq 0) {
        Write-Host "(log file is empty)"
        return
    }
    $lines | ForEach-Object { Write-Host $_ }
}

function Read-StatusActionKey {
    try {
        return ([Console]::ReadKey($true)).Key
    }
    catch {
        $choice = Read-Host "Action"
        if ($choice -match "^[Pp]") {
            return "P"
        }
        if ($choice -match "^[Tt]") {
            return "T"
        }
        if ($choice -match "^[Cc]") {
            return "C"
        }
        return "Enter"
    }
}

function Wait-ForCloseKey {
    Write-Host ""
    Write-Host "Press any key to close."
    try {
        [Console]::ReadKey($true) | Out-Null
    }
    catch {
        Read-Host "Press Enter to close" | Out-Null
    }
}

function Start-WorkflowTask {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Entry
    )

    $taskName = [string]$Entry.TaskName
    $task = Get-ScheduledTask `
        -TaskPath $taskPath `
        -TaskName $taskName `
        -ErrorAction SilentlyContinue
    if ($null -eq $task) {
        throw "Task is not installed: $taskPath$taskName"
    }

    Start-ScheduledTask -TaskPath $taskPath -TaskName $taskName
    Write-Host ("Started {0}. Routine task output remains hidden; reopen this status task or inspect logs for progress." -f $taskName)
}

if ($HistoryLines -lt 1) {
    throw "HistoryLines must be at least 1."
}

$resolvedRepoRoot = (Resolve-Path -Path $RepoRoot).Path
$now = Get-Date

Clear-Host
Write-Host "Positions And Trades Status"
Write-Host ("Generated: {0}" -f $now.ToString("yyyy-MM-dd HH:mm:ss"))
Write-Host ("Repo root: {0}" -f $resolvedRepoRoot)
Write-Host ("Log dir: {0}" -f $LogDir)
Write-Host ""

Write-Host "TASK STATUS"
Write-Host "==========="
Write-Table -Rows @(Get-TaskStatusRows)

Write-Host ""
Write-Host ("RECENT LOGS - last {0} lines each" -f $HistoryLines)
Write-Host "=================================="
foreach ($entry in $tasks) {
    Write-RecentLog -Entry $entry
}

if (-not $NoPause) {
    Write-Host ""
    Write-Host "ACTIONS"
    Write-Host "======="
    Write-Host "P = start NAV Positions"
    Write-Host "T = start NAV Trade Breaks"
    Write-Host "C = start Clear Street EOD Transactions"
    Write-Host "Q or Enter = close"

    $choice = Read-StatusActionKey
    $selected = $tasks | Where-Object { [string]$_.Key -eq [string]$choice } | Select-Object -First 1
    if ($selected) {
        try {
            Start-WorkflowTask -Entry $selected
            Write-Host ""
            Write-Host "UPDATED TASK STATUS"
            Write-Host "==================="
            Write-Table -Rows @(Get-TaskStatusRows)
        }
        catch {
            Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        }
        Wait-ForCloseKey
    }
}
