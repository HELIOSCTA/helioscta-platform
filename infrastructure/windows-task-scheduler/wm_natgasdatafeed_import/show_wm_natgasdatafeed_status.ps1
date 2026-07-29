# Shows local WoodMac NatGas datafeed scheduler status in a visible window.

param(
    [string]$RepoRoot = $(Resolve-Path "$PSScriptRoot\..\..\.."),
    [string]$TaskPath = "\HeliosCTA\NatGas\",
    [string]$LegacyTaskPath = "\helioscta-azure-backend\NatGas\",
    [string]$ConfigPath = "",
    [int]$LookbackHours = 6,
    [int]$HistoryPerSource = 5,
    [int]$LogFileCount = 8,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"

function Normalize-TaskPath {
    param([string]$Path)

    if (-not $Path.StartsWith("\")) {
        $Path = "\$Path"
    }
    if (-not $Path.EndsWith("\")) {
        $Path = "$Path\"
    }
    return $Path
}

function Resolve-WmConfigPath {
    if ($ConfigPath) {
        return (Resolve-Path -LiteralPath $ConfigPath).Path
    }
    return (Join-Path $PSScriptRoot "gasdatafeed_import.json")
}

function Assert-WmConfig {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Missing gitignored runtime config: $Path"
    }

    $config = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
    foreach ($key in @("base_url", "api_key", "datafeed_secret", "working_path")) {
        if ([string]::IsNullOrWhiteSpace($config.$key)) {
            throw "Missing required config value '$key' in $Path"
        }
    }
    if ($null -eq $config.db_conf) {
        throw "Missing required config object 'db_conf' in $Path"
    }
    foreach ($key in @("host", "db", "port", "login", "pass")) {
        if ([string]::IsNullOrWhiteSpace($config.db_conf.$key)) {
            throw "Missing required config value 'db_conf.$key' in $Path"
        }
    }

    return $config
}

function New-ConnectionString {
    param([object]$Config)

    return "Server={0},{1};Database={2};User ID={3};Password={4};Encrypt=True;TrustServerCertificate=True;" -f `
        $Config.db_conf.host,
        $Config.db_conf.port,
        $Config.db_conf.db,
        $Config.db_conf.login,
        $Config.db_conf.pass
}

function Convert-DbValue {
    param([object]$Value)

    if ($null -eq $Value -or [DBNull]::Value.Equals($Value)) {
        return $null
    }
    return $Value
}

function Convert-DataTableRows {
    param([System.Data.DataTable]$Table)

    foreach ($row in $Table.Rows) {
        $object = [ordered]@{}
        foreach ($column in $Table.Columns) {
            $object[$column.ColumnName] = Convert-DbValue -Value $row[$column.ColumnName]
        }
        [pscustomobject]$object
    }
}

function Invoke-WmDbQuery {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConnectionString,
        [Parameter(Mandatory = $true)]
        [string]$Sql,
        [hashtable]$Parameters = @{}
    )

    [void][Reflection.Assembly]::LoadWithPartialName("System.Data")
    [void][Reflection.Assembly]::LoadWithPartialName("System.Data.SqlClient")

    $connection = New-Object System.Data.SqlClient.SqlConnection($ConnectionString)
    $command = New-Object System.Data.SqlClient.SqlCommand
    $command.Connection = $connection
    $command.CommandText = $Sql
    $command.CommandTimeout = 90

    foreach ($key in $Parameters.Keys) {
        $parameter = $command.Parameters.Add("@$key", [System.Data.SqlDbType]::Int)
        $parameter.Value = $Parameters[$key]
    }

    $table = New-Object System.Data.DataTable
    try {
        $connection.Open()
        $reader = $command.ExecuteReader()
        $table.Load($reader)
    }
    finally {
        $connection.Close()
    }

    return @(Convert-DataTableRows -Table $table)
}

function Convert-UtcToLocal {
    param([object]$Value)

    $value = Convert-DbValue -Value $Value
    if ($null -eq $value) {
        return $null
    }

    $date = [datetime]$value
    return [datetime]::SpecifyKind($date, [DateTimeKind]::Utc).ToLocalTime()
}

function Format-LocalTime {
    param([object]$Value)

    $date = Convert-UtcToLocal -Value $Value
    if ($null -eq $date) {
        return ""
    }
    return $date.ToString("yyyy-MM-dd HH:mm:ss")
}

function Get-AgeMinutes {
    param([object]$Value)

    $date = Convert-UtcToLocal -Value $Value
    if ($null -eq $date) {
        return $null
    }
    return [int][math]::Round(((Get-Date) - $date).TotalMinutes)
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

function Format-TaskResult {
    param([object]$Result)

    if ($null -eq $Result) {
        return ""
    }
    $code = [int64]$Result
    switch ($code) {
        0 { return "0 OK" }
        267009 { return "267009 RUNNING" }
        267010 { return "267010 DISABLED" }
        267011 { return "267011 NOT_RUN" }
        267014 { return "267014 TERMINATED" }
        2147946720 { return "2147946720 0x80070020 SHARING_VIOLATION" }
        default { return [string]$code }
    }
}

function Format-TaskTime {
    param([object]$Value)

    if ($null -eq $Value) {
        return ""
    }

    try {
        $date = [datetime]$Value
        if ($date -eq [datetime]::MinValue -or $date -lt [datetime]"2000-01-01") {
            return ""
        }
        return $date.ToString("yyyy-MM-dd HH:mm:ss")
    }
    catch {
        return ""
    }
}

function Get-TaskRows {
    param(
        [string]$Path,
        [string]$Group
    )

    $rows = @()
    $tasks = @(Get-ScheduledTask -TaskPath $Path -ErrorAction SilentlyContinue |
        Where-Object {
            $_.TaskName -like "wm_natgasdatafeed_import*" -or
            $_.TaskName -like "HeliosCTA WM NatGas DataFeed*"
        })

    foreach ($task in $tasks) {
        $info = Get-ScheduledTaskInfo -TaskPath $task.TaskPath -TaskName $task.TaskName -ErrorAction SilentlyContinue
        $action = @($task.Actions | Select-Object -First 1)

        $rows += [pscustomobject]@{
            Group = $Group
            TaskName = $task.TaskName
            State = $task.State
            LastRun = if ($info) { Format-TaskTime -Value $info.LastRunTime } else { "" }
            LastResult = if ($info) { Format-TaskResult -Result $info.LastTaskResult } else { "" }
            NextRun = if ($info) { Format-TaskTime -Value $info.NextRunTime } else { "" }
            WorkingDirectory = if ($action) { $action.WorkingDirectory } else { "" }
        }
    }

    return $rows
}

function Get-ModeSort {
    param([string]$Mode)

    switch ($Mode) {
        "metadata" { return 1 }
        "delta" { return 2 }
        "hourly" { return 3 }
        "baseline" { return 4 }
        default { return 99 }
    }
}

function Get-StatusForSource {
    param(
        [string]$Mode,
        [object]$Processed,
        [object]$UpdatedAt
    )

    if ($Mode -eq "baseline") {
        return "manual"
    }
    if ($null -eq (Convert-DbValue -Value $UpdatedAt)) {
        return "never_run"
    }
    if ($null -ne (Convert-DbValue -Value $Processed) -and [int]$Processed -ne 1) {
        return "pending"
    }

    $ageMinutes = Get-AgeMinutes -Value $UpdatedAt
    $staleMinutes = switch ($Mode) {
        "metadata" { 90 }
        "delta" { 90 }
        "hourly" { 180 }
        default { 180 }
    }

    if ($null -ne $ageMinutes -and $ageMinutes -gt $staleMinutes) {
        return "stale"
    }

    return "ok"
}

function Write-Table {
    param([object[]]$Rows)

    if (-not $Rows -or $Rows.Count -eq 0) {
        Write-Host "(no records)"
        return
    }

    $Rows | Format-Table -AutoSize | Out-String -Width 240 | Write-Host
}

function Get-SourceLatestRows {
    param([string]$ConnectionString)

    $sql = @"
WITH source_modes AS (
    SELECT
        source_id,
        source_name,
        source_type,
        load_type,
        CASE
            WHEN source_type = 'metadata' THEN 'metadata'
            WHEN source_type = 'hourly' AND load_type = 'incremental' THEN 'delta'
            WHEN source_type = 'hourly' THEN 'hourly'
            WHEN source_type = 'baseline' THEN 'baseline'
            ELSE 'inactive'
        END AS scheduled_mode
    FROM natgas.source
),
ranked AS (
    SELECT
        sm.scheduled_mode,
        sm.source_name,
        sm.source_type,
        sm.load_type,
        ls.name_full,
        ls.processed,
        ls.file_date,
        ls.insert_date,
        ls.update_date,
        ls.row_count,
        ROW_NUMBER() OVER (
            PARTITION BY sm.source_id
            ORDER BY COALESCE(ls.update_date, ls.insert_date, ls.file_date) DESC, ls.load_id DESC
        ) AS row_number
    FROM source_modes AS sm
    LEFT JOIN natgas.load_status AS ls
        ON ls.source_id = sm.source_id
    WHERE sm.scheduled_mode <> 'inactive'
)
SELECT
    scheduled_mode,
    source_name,
    source_type,
    load_type,
    processed,
    row_count,
    file_date,
    insert_date,
    update_date,
    name_full
FROM ranked
WHERE row_number = 1
ORDER BY
    CASE scheduled_mode
        WHEN 'metadata' THEN 1
        WHEN 'delta' THEN 2
        WHEN 'hourly' THEN 3
        WHEN 'baseline' THEN 4
        ELSE 99
    END,
    source_name;
"@

    return Invoke-WmDbQuery -ConnectionString $ConnectionString -Sql $sql
}

function Get-ModeSummaryRows {
    param(
        [string]$ConnectionString,
        [int]$Hours
    )

    $sql = @"
WITH source_modes AS (
    SELECT
        source_id,
        CASE
            WHEN source_type = 'metadata' THEN 'metadata'
            WHEN source_type = 'hourly' AND load_type = 'incremental' THEN 'delta'
            WHEN source_type = 'hourly' THEN 'hourly'
            WHEN source_type = 'baseline' THEN 'baseline'
            ELSE 'inactive'
        END AS scheduled_mode
    FROM natgas.source
),
loads AS (
    SELECT
        sm.scheduled_mode,
        sm.source_id,
        ls.load_id,
        ls.processed,
        ls.row_count,
        ls.update_date
    FROM source_modes AS sm
    LEFT JOIN natgas.load_status AS ls
        ON ls.source_id = sm.source_id
       AND ls.update_date >= DATEADD(HOUR, -@LookbackHours, GETUTCDATE())
    WHERE sm.scheduled_mode <> 'inactive'
)
SELECT
    scheduled_mode,
    COUNT(DISTINCT source_id) AS registered_sources,
    COUNT(load_id) AS loads_in_lookback,
    SUM(CASE WHEN processed = 1 THEN 1 ELSE 0 END) AS processed_loads,
    SUM(CASE WHEN processed = 0 THEN 1 ELSE 0 END) AS pending_loads,
    SUM(COALESCE(row_count, 0)) AS rows_in_lookback,
    MAX(update_date) AS latest_update
FROM loads
GROUP BY scheduled_mode
ORDER BY
    CASE scheduled_mode
        WHEN 'metadata' THEN 1
        WHEN 'delta' THEN 2
        WHEN 'hourly' THEN 3
        WHEN 'baseline' THEN 4
        ELSE 99
    END;
"@

    return Invoke-WmDbQuery `
        -ConnectionString $ConnectionString `
        -Sql $sql `
        -Parameters @{ LookbackHours = $Hours }
}

function Get-PendingRows {
    param([string]$ConnectionString)

    $sql = @"
SELECT TOP (20)
    s.source_name,
    s.source_type,
    s.load_type,
    ls.name_full,
    ls.file_date,
    ls.insert_date,
    ls.update_date,
    ls.row_count
FROM natgas.load_status AS ls
JOIN natgas.source AS s
    ON s.source_id = ls.source_id
WHERE ls.processed = 0
ORDER BY COALESCE(ls.update_date, ls.insert_date, ls.file_date) DESC;
"@

    return Invoke-WmDbQuery -ConnectionString $ConnectionString -Sql $sql
}

function Get-SourceHistoryRows {
    param(
        [string]$ConnectionString,
        [int]$RowsPerSource
    )

    $sql = @"
WITH source_modes AS (
    SELECT
        source_id,
        source_name,
        source_type,
        load_type,
        CASE
            WHEN source_type = 'metadata' THEN 'metadata'
            WHEN source_type = 'hourly' AND load_type = 'incremental' THEN 'delta'
            WHEN source_type = 'hourly' THEN 'hourly'
            WHEN source_type = 'baseline' THEN 'baseline'
            ELSE 'inactive'
        END AS scheduled_mode
    FROM natgas.source
),
ranked AS (
    SELECT
        sm.scheduled_mode,
        sm.source_name,
        sm.load_type,
        ls.name_full,
        ls.processed,
        ls.file_date,
        ls.insert_date,
        ls.update_date,
        ls.row_count,
        ROW_NUMBER() OVER (
            PARTITION BY sm.source_id
            ORDER BY COALESCE(ls.update_date, ls.insert_date, ls.file_date) DESC, ls.load_id DESC
        ) AS row_number
    FROM source_modes AS sm
    JOIN natgas.load_status AS ls
        ON ls.source_id = sm.source_id
    WHERE sm.scheduled_mode <> 'inactive'
)
SELECT
    scheduled_mode,
    source_name,
    load_type,
    processed,
    row_count,
    file_date,
    insert_date,
    update_date,
    name_full
FROM ranked
WHERE row_number <= @RowsPerSource
ORDER BY
    CASE scheduled_mode
        WHEN 'metadata' THEN 1
        WHEN 'delta' THEN 2
        WHEN 'hourly' THEN 3
        WHEN 'baseline' THEN 4
        ELSE 99
    END,
    source_name,
    row_number;
"@

    return Invoke-WmDbQuery `
        -ConnectionString $ConnectionString `
        -Sql $sql `
        -Parameters @{ RowsPerSource = $RowsPerSource }
}

function Get-RecentErrors {
    param([string]$ConnectionString)

    $existsRows = Invoke-WmDbQuery `
        -ConnectionString $ConnectionString `
        -Sql "SELECT OBJECT_ID('administration.error_log', 'U') AS object_id;"

    if (-not $existsRows -or $null -eq $existsRows[0].object_id) {
        return @()
    }

    $sql = @"
SELECT TOP (10)
    error_date,
    error_procedure,
    error_number,
    error_message
FROM administration.error_log
WHERE error_date >= DATEADD(HOUR, -@LookbackHours, GETUTCDATE())
ORDER BY error_date DESC;
"@

    return Invoke-WmDbQuery `
        -ConnectionString $ConnectionString `
        -Sql $sql `
        -Parameters @{ LookbackHours = $LookbackHours }
}

function Get-RecentLogRows {
    param(
        [string]$WorkingPath,
        [int]$Count
    )

    if ([string]::IsNullOrWhiteSpace($WorkingPath) -or -not (Test-Path -LiteralPath $WorkingPath)) {
        return @()
    }

    $directories = Get-ChildItem -LiteralPath $WorkingPath -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "datafeed_*" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First ([math]::Max($Count * 3, 20))

    $logs = foreach ($directory in $directories) {
        Get-ChildItem -LiteralPath $directory.FullName -Filter "gasdatafeed_import_*.log" -File -ErrorAction SilentlyContinue
    }

    return @(
        $logs |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First $Count |
            ForEach-Object {
                [pscustomobject]@{
                    LastWrite = $_.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
                    SizeKB = [math]::Round($_.Length / 1kb, 1)
                    Path = $_.FullName
                }
            }
    )
}

function Convert-LockUtcDateTime {
    param([object]$Value)

    if ($null -eq $Value) {
        return $null
    }

    try {
        if ($Value -is [datetime]) {
            return ([datetime]$Value).ToUniversalTime()
        }
        return ([datetimeoffset]::Parse([string]$Value)).UtcDateTime
    }
    catch {
        return $null
    }
}

function Get-LockProcessSnapshot {
    param([int]$ProcessId)

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        return [pscustomobject]@{
            Alive = $false
            CreationTimeUtc = $null
        }
    }

    $creationTimeUtc = $null
    try {
        if ($process.CreationDate -is [datetime]) {
            $creationTimeUtc = ([datetime]$process.CreationDate).ToUniversalTime()
        }
        else {
            $creationTimeUtc = ([System.Management.ManagementDateTimeConverter]::ToDateTime([string]$process.CreationDate)).ToUniversalTime()
        }
    }
    catch {
        $creationTimeUtc = $null
    }

    return [pscustomobject]@{
        Alive = $true
        CreationTimeUtc = $creationTimeUtc
    }
}

function Test-LockVendorChildActive {
    param([int]$OwnerProcessId)

    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $OwnerProcessId" -ErrorAction SilentlyContinue)

    foreach ($child in $children) {
        $name = [string]$child.Name
        $commandLine = [string]$child.CommandLine
        if ($name -notin @("powershell.exe", "pwsh.exe")) {
            continue
        }
        if ([string]::IsNullOrWhiteSpace($commandLine) -or $commandLine -like "*gasdatafeed_import.ps1*") {
            return $true
        }
    }

    return $false
}

function Get-LatestVendorLogFile {
    param([string]$WorkingPath)

    if ([string]::IsNullOrWhiteSpace($WorkingPath) -or -not (Test-Path -LiteralPath $WorkingPath)) {
        return $null
    }

    $directories = @(Get-ChildItem -LiteralPath $WorkingPath -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "datafeed_*" } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 20)

    $logs = foreach ($directory in $directories) {
        Get-ChildItem -LiteralPath $directory.FullName -Filter "gasdatafeed_import_*.log" -File -ErrorAction SilentlyContinue
    }

    return @($logs | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1)
}

function Get-SchedulerLockRows {
    param([string]$WorkingPath)

    $stateDir = Join-Path $WorkingPath "_scheduler"
    $lockPath = Join-Path $stateDir "wm_natgasdatafeed_import.lock"
    $staleLockPath = Join-Path $stateDir "wm_natgasdatafeed_import.lock.stale.json"
    $latestVendorLog = Get-LatestVendorLogFile -WorkingPath $WorkingPath
    $latestVendorLogUtc = if ($latestVendorLog) { $latestVendorLog.LastWriteTimeUtc } else { $null }
    $latestVendorLogAgeMinutes = if ($latestVendorLogUtc) { [int][math]::Round(((Get-Date).ToUniversalTime() - $latestVendorLogUtc).TotalMinutes) } else { $null }
    $staleMarker = $null

    if (Test-Path -LiteralPath $staleLockPath) {
        try {
            $staleMarker = Get-Content -Raw -LiteralPath $staleLockPath | ConvertFrom-Json
        }
        catch {
            $staleMarker = $null
        }
    }

    if (-not (Test-Path -LiteralPath $lockPath)) {
        return @([pscustomobject]@{
            Status = if ($staleMarker) { "stale_marker_only" } else { "absent" }
            TaskName = ""
            ProcessId = ""
            OwnerAlive = ""
            VendorChild = ""
            AgeMin = ""
            LatestVendorLogAgeMin = $latestVendorLogAgeMinutes
            Reason = if ($staleMarker) { Shorten-Text -Value $staleMarker.reason -MaxLength 80 } else { "" }
        })
    }

    try {
        $lock = Get-Content -Raw -LiteralPath $lockPath | ConvertFrom-Json
        $startedAtUtc = Convert-LockUtcDateTime -Value $lock.started_at_utc
        $ageMinutes = if ($startedAtUtc) { [int][math]::Round(((Get-Date).ToUniversalTime() - $startedAtUtc).TotalMinutes) } else { $null }
        $ownerProcessId = 0
        $hasOwnerProcessId = [int]::TryParse([string]$lock.process_id, [ref]$ownerProcessId)
        $ownerAlive = $false
        $vendorChildActive = $false

        if ($hasOwnerProcessId) {
            $snapshot = Get-LockProcessSnapshot -ProcessId $ownerProcessId
            $ownerAlive = $snapshot.Alive
            $processStartedAtUtc = Convert-LockUtcDateTime -Value $lock.process_started_at_utc
            if ($ownerAlive -and $processStartedAtUtc -and $snapshot.CreationTimeUtc) {
                $ownerAlive = ([math]::Abs(($snapshot.CreationTimeUtc - $processStartedAtUtc).TotalSeconds) -le 5)
            }
            if ($ownerAlive) {
                $vendorChildActive = Test-LockVendorChildActive -OwnerProcessId $ownerProcessId
            }
        }

        $status = if ($staleMarker) {
            "stale"
        }
        elseif (-not $ownerAlive) {
            "orphaned"
        }
        else {
            "active"
        }

        return @([pscustomobject]@{
            Status = $status
            TaskName = $lock.task_name
            ProcessId = if ($hasOwnerProcessId) { $ownerProcessId } else { "" }
            OwnerAlive = $ownerAlive
            VendorChild = $vendorChildActive
            AgeMin = $ageMinutes
            LatestVendorLogAgeMin = $latestVendorLogAgeMinutes
            Reason = if ($staleMarker) { Shorten-Text -Value $staleMarker.reason -MaxLength 80 } elseif (-not $ownerAlive) { "owner process not alive or PID was reused" } else { "" }
        })
    }
    catch {
        return @([pscustomobject]@{
            Status = "corrupt"
            TaskName = ""
            ProcessId = ""
            OwnerAlive = ""
            VendorChild = ""
            AgeMin = ""
            LatestVendorLogAgeMin = $latestVendorLogAgeMinutes
            Reason = Shorten-Text -Value $_.Exception.Message -MaxLength 80
        })
    }
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
$TaskPath = Normalize-TaskPath -Path $TaskPath
$LegacyTaskPath = Normalize-TaskPath -Path $LegacyTaskPath
$resolvedConfigPath = Resolve-WmConfigPath
$config = Assert-WmConfig -Path $resolvedConfigPath
$connectionString = New-ConnectionString -Config $config

Clear-Host
Write-Host "WM NatGas DataFeed Status"
Write-Host ("Generated: {0}" -f (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))
Write-Host ("Repo root: {0}" -f $resolvedRepoRoot)
Write-Host ("Config: {0}" -f $resolvedConfigPath)
Write-Host ("Working path: {0}" -f $config.working_path)
Write-Host ""

Write-Host "TASK SCHEDULER"
Write-Host "=============="
$taskRows = @()
$taskRows += @(Get-TaskRows -Path $TaskPath -Group "platform")
$taskRows += @(Get-TaskRows -Path $LegacyTaskPath -Group "legacy")
Write-Table -Rows @($taskRows | Sort-Object Group, TaskName | Select-Object Group, TaskName, State, LastRun, LastResult, NextRun, WorkingDirectory)

Write-Host ""
Write-Host "SCHEDULER LOCK"
Write-Host "=============="
Write-Table -Rows @(Get-SchedulerLockRows -WorkingPath $config.working_path)

try {
    $modeRows = @(Get-ModeSummaryRows -ConnectionString $connectionString -Hours $LookbackHours)
    $latestRows = @(Get-SourceLatestRows -ConnectionString $connectionString)
    $historyRows = @(Get-SourceHistoryRows -ConnectionString $connectionString -RowsPerSource $HistoryPerSource)
    $pendingRows = @(Get-PendingRows -ConnectionString $connectionString)
    $errorRows = @(Get-RecentErrors -ConnectionString $connectionString)
}
catch {
    Write-Host ""
    Write-Host "DATABASE STATUS ERROR" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if (-not $NoPause) {
        Write-Host ""
        Read-Host "Press Enter to close" | Out-Null
    }
    exit 1
}

Write-Host ""
Write-Host ("MODE SUMMARY - last {0} hours" -f $LookbackHours)
Write-Host "================================"
$modeDisplayRows = foreach ($row in $modeRows) {
    [pscustomobject]@{
        Mode = $row.scheduled_mode
        Sources = $row.registered_sources
        Loads = $row.loads_in_lookback
        Processed = $row.processed_loads
        Pending = $row.pending_loads
        Rows = $row.rows_in_lookback
        Latest = Format-LocalTime -Value $row.latest_update
        AgeMin = Get-AgeMinutes -Value $row.latest_update
    }
}
Write-Table -Rows $modeDisplayRows

Write-Host ""
Write-Host "LATEST BY SOURCE"
Write-Host "================"
$latestDisplayRows = foreach ($row in $latestRows) {
    [pscustomobject]@{
        Mode = $row.scheduled_mode
        Source = $row.source_name
        LoadType = $row.load_type
        Status = Get-StatusForSource -Mode $row.scheduled_mode -Processed $row.processed -UpdatedAt $row.update_date
        Processed = $row.processed
        Rows = $row.row_count
        Updated = Format-LocalTime -Value $row.update_date
        AgeMin = Get-AgeMinutes -Value $row.update_date
        File = Shorten-Text -Value $row.name_full -MaxLength 58
        Sort = Get-ModeSort -Mode $row.scheduled_mode
    }
}
Write-Table -Rows @(
    $latestDisplayRows |
        Sort-Object Sort, Source, LoadType |
        Select-Object Mode, Source, LoadType, Status, Processed, Rows, Updated, AgeMin, File
)

Write-Host ""
Write-Host ("RECENT LOAD HISTORY - last {0} records per source" -f $HistoryPerSource)
Write-Host "===================================================="
$historyDisplayRows = foreach ($row in $historyRows) {
    [pscustomobject]@{
        Mode = $row.scheduled_mode
        Source = $row.source_name
        LoadType = $row.load_type
        Processed = $row.processed
        Rows = $row.row_count
        Updated = Format-LocalTime -Value $row.update_date
        FileDate = Format-LocalTime -Value $row.file_date
        File = Shorten-Text -Value $row.name_full -MaxLength 58
        Sort = Get-ModeSort -Mode $row.scheduled_mode
    }
}
Write-Table -Rows @($historyDisplayRows | Select-Object Mode, Source, LoadType, Processed, Rows, Updated, FileDate, File)

Write-Host ""
Write-Host "PENDING LOAD STATUS ROWS"
Write-Host "========================"
$pendingDisplayRows = foreach ($row in $pendingRows) {
    [pscustomobject]@{
        Source = $row.source_name
        Type = $row.source_type
        LoadType = $row.load_type
        Inserted = Format-LocalTime -Value $row.insert_date
        Updated = Format-LocalTime -Value $row.update_date
        Rows = $row.row_count
        File = Shorten-Text -Value $row.name_full -MaxLength 70
    }
}
Write-Table -Rows $pendingDisplayRows

Write-Host ""
Write-Host ("RECENT SQL ERRORS - last {0} hours" -f $LookbackHours)
Write-Host "=================================="
if ($errorRows.Count -eq 0) {
    Write-Host "(none visible)"
}
else {
    $errorDisplayRows = foreach ($row in $errorRows) {
        [pscustomobject]@{
            ErrorDate = Format-LocalTime -Value $row.error_date
            Procedure = Shorten-Text -Value $row.error_procedure -MaxLength 44
            Number = $row.error_number
            Message = Shorten-Text -Value $row.error_message -MaxLength 100
        }
    }
    Write-Table -Rows $errorDisplayRows
}

Write-Host ""
Write-Host ("RECENT LOG FILES - latest {0}" -f $LogFileCount)
Write-Host "=============================="
Write-Table -Rows @(Get-RecentLogRows -WorkingPath $config.working_path -Count $LogFileCount)

if (-not $NoPause) {
    Write-Host ""
    Write-Host "This status helper is read-only."
    Write-Host "Press Enter to close."
    Read-Host | Out-Null
}
