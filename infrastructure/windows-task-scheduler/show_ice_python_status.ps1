# Shows local ICE Python scheduler status in a visible Task Scheduler window.

param(
    [string]$RepoRoot = $(if ($env:HELIOS_ICE_REPO_ROOT) { $env:HELIOS_ICE_REPO_ROOT } else { (Resolve-Path "$PSScriptRoot\..\..").Path }),
    [string]$PythonExe = $(if ($env:HELIOS_ICE_PYTHON_EXE) { $env:HELIOS_ICE_PYTHON_EXE } else { "python" }),
    [string]$LogDir = "C:\ProgramData\HeliosCTA\logs",
    [string]$StateDir = "C:\ProgramData\HeliosCTA\state",
    [string]$StateFile = "",
    [int]$JobTimeoutSeconds = 2700,
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
    "gas_futures_core",
    "gas_futures_gulf",
    "gas_futures_west",
    "gas_futures_east"
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

function Remove-LogNullCharacters {
    process {
        [string]$_ -replace "`0", ""
    }
}

function Invoke-FailedRerun {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ResolvedRepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$ResolvedPythonExe,
        [Parameter(Mandatory = $true)]
        [string]$ResolvedStateFile
    )

    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

    $lockPath = Join-Path $StateDir "ice_python_jobs.lock"
    $coordinatorLog = Join-Path $LogDir "ice-python-task-scheduler.log"
    $startedAt = Get-Date

    $env:HELIOS_LOG_DIR = $LogDir
    $env:HELIOS_STATE_DIR = $StateDir
    $env:HELIOS_ICE_JOB_TIMEOUT_SECONDS = [string]$JobTimeoutSeconds
    $env:HELIOS_ICE_JOB_LOCK_FILE = $lockPath
    $env:PYTHONUNBUFFERED = "1"

    Write-Host ""
    Write-Host "Rerunning latest failed or stale ICE Python records..."
    Add-Content -Path $coordinatorLog -Value (
        "[$($startedAt.ToString('s'))] Starting ICE Python failed-rerun " +
        "repo=$ResolvedRepoRoot python=$ResolvedPythonExe state=$ResolvedStateFile timeout=$JobTimeoutSeconds"
    )

    Push-Location $ResolvedRepoRoot
    try {
        $pythonSnippet = "from backend.orchestration.ice_python import service; raise SystemExit(service.main(rerun_failed=True, state_file=r'$ResolvedStateFile'))"
        & $ResolvedPythonExe -c $pythonSnippet 2>&1 |
            Remove-LogNullCharacters |
            Tee-Object -FilePath $coordinatorLog -Append
        $exitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    $finishedAt = Get-Date
    Add-Content -Path $coordinatorLog -Value (
        "[$($finishedAt.ToString('s'))] Finished ICE Python failed-rerun exit_code=$exitCode"
    )
    Write-Host ("Failed-rerun finished with exit code {0}" -f $exitCode)
    return $exitCode
}

function Get-FailedRerunCandidateNames {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ResolvedRepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$ResolvedPythonExe,
        [Parameter(Mandatory = $true)]
        [string]$ResolvedStateFile
    )

    $pythonSnippet = @"
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from backend.orchestration.ice_python import service

state = service.load_run_state(Path(r'$ResolvedStateFile'))
now = datetime.now(ZoneInfo(service.DEFAULT_TIMEZONE))
attempts = service.latest_failed_job_attempts(current_time=now, run_state=state)
for job, _run_time in attempts:
    print(job.name)
"@

    Push-Location $ResolvedRepoRoot
    try {
        $output = & $ResolvedPythonExe -c $pythonSnippet 2>$null
        if ($LASTEXITCODE -ne 0) {
            return @()
        }
        return @($output | Where-Object { $_ })
    }
    finally {
        Pop-Location
    }
}

function Read-StatusActionKey {
    try {
        return ([Console]::ReadKey($true)).Key
    }
    catch {
        $choice = Read-Host "Action"
        if ($choice -match "^[Rr]") {
            return "R"
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

function Write-IceStatusReport {
    param([object[]]$Rows)

    $summaryRows = foreach ($job in $jobOrder) {
        $jobRows = @($Rows | Where-Object { $_.Job -eq $job })
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
            $Rows |
                Where-Object { $_.Job -eq $job } |
                Sort-Object `
                    @{ Expression = "WindowSort"; Descending = $true },
                    @{ Expression = "Finished"; Descending = $true } |
                Select-Object -First $HistoryPerFeed |
                Select-Object Window, Status, Rows, Started, Finished, ErrorType, Error
        )
        Write-Table -Rows $history
    }
}

if ($HistoryPerFeed -lt 1) {
    throw "HistoryPerFeed must be at least 1."
}

$resolvedStateFile = Resolve-StateFile
$resolvedRepoRoot = (Resolve-Path -Path $RepoRoot).Path
$resolvedPythonExe = Resolve-CommandPath -Executable $PythonExe
$now = Get-Date

Clear-Host
Write-Host "ICE Python Status"
Write-Host ("Generated: {0}" -f $now.ToString("yyyy-MM-dd HH:mm:ss"))
Write-Host ("State file: {0}" -f $resolvedStateFile)
Write-Host ("Repo root: {0}" -f $resolvedRepoRoot)
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

Write-IceStatusReport -Rows $rows

if (-not $NoPause) {
    Write-Host ""
    Write-Host "ACTIONS"
    Write-Host "======="
    $candidateNames = Get-FailedRerunCandidateNames `
        -ResolvedRepoRoot $resolvedRepoRoot `
        -ResolvedPythonExe $resolvedPythonExe `
        -ResolvedStateFile $resolvedStateFile
    if ($candidateNames.Count -gt 0) {
        Write-Host ("Retry candidates: {0}" -f ($candidateNames -join ", "))
        Write-Host "R = retry failed feeds"
        Write-Host "Q or Enter = close"
    }
    else {
        Write-Host "No unresolved failed feeds."
        Write-Host "Q or Enter = close"
    }

    $choice = Read-StatusActionKey
    if ($candidateNames.Count -gt 0 -and $choice -eq "R") {
        Invoke-FailedRerun `
            -ResolvedRepoRoot $resolvedRepoRoot `
            -ResolvedPythonExe $resolvedPythonExe `
            -ResolvedStateFile $resolvedStateFile | Out-Null
        Write-Host ""
        Write-Host "UPDATED STATUS"
        Write-Host "=============="
        try {
            $updatedRows = @(Get-StateRows -Path $resolvedStateFile)
            Write-IceStatusReport -Rows $updatedRows
        }
        catch {
            Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        }
        Wait-ForCloseKey
    }
}
