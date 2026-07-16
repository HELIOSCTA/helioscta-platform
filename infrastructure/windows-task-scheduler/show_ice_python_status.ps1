# Shows local ICE Python scheduler status in a visible Task Scheduler window.

param(
    [string]$StateDir = "C:\ProgramData\HeliosCTA\state",
    [string]$StateFile = "",
    [int]$HistoryPerFeed = 5,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"

$jobOrder = @(
    "pjm_short_term",
    "pjm_futures",
    "ercot_short_term",
    "ercot_futures",
    "west_power_futures",
    "east_power_futures",
    "gas_next_day",
    "gas_balmo",
    "gas_futures"
)

function Resolve-StateFile {
    if ($StateFile) {
        return $StateFile
    }
    return (Join-Path $StateDir "ice_python_service_state.json")
}

function Convert-WindowTextToSortTime {
    param([string]$WindowText)

    if ($WindowText -match "^\d{4}-\d{2}-\d{2}T\d{2}$") {
        return [datetime]::ParseExact($WindowText, "yyyy-MM-ddTHH", $null)
    }
    if ($WindowText -match "^\d{4}-\d{2}-\d{2}$") {
        return [datetime]::ParseExact($WindowText, "yyyy-MM-dd", $null)
    }
    return [datetime]::MinValue
}

function Format-WindowText {
    param([string]$WindowText)

    if ($WindowText -match "^\d{4}-\d{2}-\d{2}T\d{2}$") {
        return (($WindowText -replace "T", " ") + ":00")
    }
    return $WindowText
}

function Format-LocalTime {
    param([object]$Value)

    if ($null -eq $Value -or -not [string]$Value) {
        return ""
    }

    try {
        return ([datetimeoffset]::Parse([string]$Value)).LocalDateTime.ToString("MM-dd HH:mm:ss")
    }
    catch {
        return [string]$Value
    }
}

function Shorten-Text {
    param(
        [object]$Value,
        [int]$MaxLength = 90
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

function Get-JobSort {
    param([string]$JobName)

    $index = [array]::IndexOf($jobOrder, $JobName)
    if ($index -ge 0) {
        return $index
    }
    return 999
}

function Get-StateRows {
    param([string]$Path)

    if (-not (Test-Path -Path $Path)) {
        throw "ICE Python state file not found: $Path"
    }

    $state = Get-Content -Raw -Path $Path | ConvertFrom-Json
    $rows = @()

    foreach ($property in $state.PSObject.Properties) {
        $key = [string]$property.Name
        $record = $property.Value
        $delimiter = $key.IndexOf(":")
        if ($delimiter -lt 1) {
            continue
        }

        $jobFromKey = $key.Substring(0, $delimiter)
        $windowText = $key.Substring($delimiter + 1)
        $jobName = if ($record.job_name) { [string]$record.job_name } else { $jobFromKey }
        $rows += [pscustomobject]@{
            Job = $jobName
            Window = Format-WindowText -WindowText $windowText
            WindowSort = Convert-WindowTextToSortTime -WindowText $windowText
            Status = if ($record.status) { [string]$record.status } else { "unknown" }
            Rows = if ($null -ne $record.rows_processed) { [int]$record.rows_processed } else { 0 }
            Started = Format-LocalTime -Value $record.started_at
            Finished = Format-LocalTime -Value $record.finished_at
            ErrorType = Shorten-Text -Value $record.error_type -MaxLength 32
            Error = Shorten-Text -Value $record.error_message -MaxLength 90
            Sort = Get-JobSort -JobName $jobName
        }
    }

    return $rows
}

function Write-Table {
    param([object[]]$Rows)

    if (-not $Rows -or $Rows.Count -eq 0) {
        Write-Host "(no records)"
        return
    }

    $Rows | Format-Table -AutoSize | Out-String -Width 220 | Write-Host
}

if ($HistoryPerFeed -lt 1) {
    throw "HistoryPerFeed must be at least 1."
}

$resolvedStateFile = Resolve-StateFile
$now = Get-Date

Clear-Host
Write-Host "ICE Python Status"
Write-Host ("Generated: {0}" -f $now.ToString("yyyy-MM-dd HH:mm:ss"))
Write-Host ("State file: {0}" -f $resolvedStateFile)
Write-Host ""

try {
    $rows = @(Get-StateRows -Path $resolvedStateFile)
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if (-not $NoPause) {
        Write-Host ""
        Read-Host "Press Enter to close"
    }
    exit 1
}

$summaryRows = foreach ($job in $jobOrder) {
    $jobRows = @($rows | Where-Object { $_.Job -eq $job })
    $latest = $jobRows |
        Where-Object { $_.Job -eq $job } |
        Sort-Object `
            @{ Expression = "WindowSort"; Descending = $true },
            @{ Expression = "Finished"; Descending = $true } |
        Select-Object -First 1
    $lastSuccess = $jobRows |
        Where-Object { $_.Status -eq "succeeded" } |
        Sort-Object `
            @{ Expression = "WindowSort"; Descending = $true },
            @{ Expression = "Finished"; Descending = $true } |
        Select-Object -First 1
    $lastFailure = $jobRows |
        Where-Object { $_.Status -eq "failed" } |
        Sort-Object `
            @{ Expression = "WindowSort"; Descending = $true },
            @{ Expression = "Finished"; Descending = $true } |
        Select-Object -First 1

    if ($latest) {
        [pscustomobject]@{
            Job = $latest.Job
            Window = $latest.Window
            Status = $latest.Status
            Rows = $latest.Rows
            Finished = $latest.Finished
            LastSuccess = if ($lastSuccess) { $lastSuccess.Finished } else { "" }
            LastFailure = if ($lastFailure) { $lastFailure.Finished } else { "" }
            ErrorType = $latest.ErrorType
            Error = $latest.Error
            Sort = Get-JobSort -JobName $job
        }
    }
    else {
        [pscustomobject]@{
            Job = $job
            Window = ""
            Status = "never_run"
            Rows = 0
            Finished = ""
            LastSuccess = ""
            LastFailure = ""
            ErrorType = ""
            Error = ""
            Sort = Get-JobSort -JobName $job
        }
    }
}

Write-Host "LATEST SUMMARY"
Write-Table -Rows @(
    $summaryRows |
        Sort-Object Sort |
        Select-Object Job, Window, Status, Rows, Finished, LastSuccess, LastFailure, ErrorType, Error
)

Write-Host ""
Write-Host ("HISTORY BY FEED - last {0} records each" -f $HistoryPerFeed)

foreach ($job in $jobOrder) {
    Write-Host ""
    Write-Host $job
    Write-Host ("-" * $job.Length)
    $history = @(
        $rows |
            Where-Object { $_.Job -eq $job } |
            Sort-Object `
                @{ Expression = "WindowSort"; Descending = $true },
                @{ Expression = "Finished"; Descending = $true } |
            Select-Object -First $HistoryPerFeed |
            Select-Object Window, Status, Rows, Started, Finished, ErrorType, Error
    )
    Write-Table -Rows $history
}

if (-not $NoPause) {
    Write-Host ""
    Read-Host "Press Enter to close"
}
