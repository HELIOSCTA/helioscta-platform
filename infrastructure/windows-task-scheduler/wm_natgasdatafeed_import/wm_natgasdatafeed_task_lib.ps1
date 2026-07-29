# Shared helpers for WoodMac NatGas DataFeed Task Scheduler wrappers.

$ErrorActionPreference = "Stop"

function Assert-WmRuntimeConfig {
    param([string]$ConfigPath)

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

    return $config
}

function New-WmConnectionString {
    param([object]$Config)

    return "Server={0},{1};Database={2};User ID={3};Password={4};Encrypt=True;TrustServerCertificate=True;" -f `
        $Config.db_conf.host,
        $Config.db_conf.port,
        $Config.db_conf.db,
        $Config.db_conf.login,
        $Config.db_conf.pass
}

function Convert-WmDbValue {
    param([object]$Value)

    if ($null -eq $Value -or [DBNull]::Value.Equals($Value)) {
        return $null
    }
    return $Value
}

function Convert-WmDataTableRows {
    param([System.Data.DataTable]$Table)

    foreach ($row in $Table.Rows) {
        $object = [ordered]@{}
        foreach ($column in $Table.Columns) {
            $object[$column.ColumnName] = Convert-WmDbValue -Value $row[$column.ColumnName]
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
        [hashtable]$Parameters = @{},
        [int]$CommandTimeoutSeconds = 90
    )

    [void][Reflection.Assembly]::LoadWithPartialName("System.Data")
    [void][Reflection.Assembly]::LoadWithPartialName("System.Data.SqlClient")

    $connection = New-Object System.Data.SqlClient.SqlConnection($ConnectionString)
    $command = New-Object System.Data.SqlClient.SqlCommand
    $command.Connection = $connection
    $command.CommandText = $Sql
    $command.CommandTimeout = $CommandTimeoutSeconds

    foreach ($key in $Parameters.Keys) {
        [void]$command.Parameters.AddWithValue("@$key", $Parameters[$key])
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

    return @(Convert-WmDataTableRows -Table $table)
}

function New-WmSchedulerContext {
    param(
        [string]$ScriptDirectory,
        [string]$TaskName,
        [string]$ConfigPath = ""
    )

    $resolvedConfigPath = if ($ConfigPath) {
        (Resolve-Path -LiteralPath $ConfigPath).Path
    }
    else {
        Join-Path $ScriptDirectory "gasdatafeed_import.json"
    }

    $config = Assert-WmRuntimeConfig -ConfigPath $resolvedConfigPath
    $workingPath = $config.working_path
    New-Item -ItemType Directory -Force -Path $workingPath | Out-Null

    $stateDir = Join-Path $workingPath "_scheduler"
    New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

    return [pscustomobject]@{
        TaskName = $TaskName
        ScriptDirectory = $ScriptDirectory
        ImportScript = Join-Path $ScriptDirectory "gasdatafeed_import.ps1"
        ConfigPath = $resolvedConfigPath
        Config = $config
        ConnectionString = New-WmConnectionString -Config $config
        WorkingPath = $workingPath
        StateDir = $stateDir
        LogPath = Join-Path $stateDir "wm_natgasdatafeed_task_scheduler.log"
        LockPath = Join-Path $stateDir "wm_natgasdatafeed_import.lock"
        StaleLockPath = Join-Path $stateDir "wm_natgasdatafeed_import.lock.stale.json"
        LockOwnerId = ""
        LockOwnerProcessId = 0
    }
}

function Write-WmSchedulerLog {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Context,
        [Parameter(Mandatory = $true)]
        [string]$Message,
        [string]$Level = "INFO"
    )

    $line = "[{0}] [{1}] [{2}] {3}" -f (Get-Date).ToString("s"), $Level, $Context.TaskName, $Message
    Write-Host $line

    for ($attempt = 1; $attempt -le 5; $attempt++) {
        $stream = $null
        $writer = $null
        try {
            $stream = [System.IO.File]::Open(
                $Context.LogPath,
                [System.IO.FileMode]::Append,
                [System.IO.FileAccess]::Write,
                [System.IO.FileShare]::ReadWrite
            )
            $writer = New-Object System.IO.StreamWriter($stream)
            $writer.WriteLine($line)
            return
        }
        catch [System.IO.IOException] {
            Start-Sleep -Milliseconds (50 * $attempt)
        }
        finally {
            if ($null -ne $writer) {
                $writer.Close()
            }
            elseif ($null -ne $stream) {
                $stream.Close()
            }
        }
    }

    Write-Host ("[{0}] [WARN] [{1}] Could not append scheduler log after retries: {2}" -f (Get-Date).ToString("s"), $Context.TaskName, $Context.LogPath)
}

function Convert-WmUtcDateTime {
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

function Get-WmProcessSnapshot {
    param([int]$ProcessId)

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        return [pscustomobject]@{
            Alive = $false
            ProcessId = $ProcessId
            ProcessName = ""
            CommandLine = ""
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
        ProcessId = $ProcessId
        ProcessName = [string]$process.Name
        CommandLine = [string]$process.CommandLine
        CreationTimeUtc = $creationTimeUtc
    }
}

function Test-WmLockOwnerActive {
    param([object]$Lock)

    if ($null -eq $Lock -or $Lock.machine_name -ne $env:COMPUTERNAME) {
        return $true
    }

    $ownerProcessId = 0
    if (-not [int]::TryParse([string]$Lock.process_id, [ref]$ownerProcessId)) {
        return $false
    }

    $snapshot = Get-WmProcessSnapshot -ProcessId $ownerProcessId
    if (-not $snapshot.Alive) {
        return $false
    }

    $lockProcessStartedAtUtc = Convert-WmUtcDateTime -Value $Lock.process_started_at_utc
    if ($null -ne $lockProcessStartedAtUtc -and $null -ne $snapshot.CreationTimeUtc) {
        $createdDeltaSeconds = [math]::Abs(($snapshot.CreationTimeUtc - $lockProcessStartedAtUtc).TotalSeconds)
        if ($createdDeltaSeconds -gt 5) {
            return $false
        }
    }

    return $true
}

function Test-WmVendorChildActive {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Context,
        [int]$OwnerProcessId
    )

    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $OwnerProcessId" -ErrorAction SilentlyContinue)

    foreach ($child in $children) {
        $name = [string]$child.Name
        $commandLine = [string]$child.CommandLine
        if ($name -notin @("powershell.exe", "pwsh.exe")) {
            continue
        }
        if ([string]::IsNullOrWhiteSpace($commandLine)) {
            return $true
        }
        if ($commandLine -like "*gasdatafeed_import.ps1*" -or $commandLine -like "*$($Context.ImportScript)*") {
            return $true
        }
    }

    return $false
}

function Get-WmLatestVendorLogFile {
    param([object]$Context)

    if (-not (Test-Path -LiteralPath $Context.WorkingPath)) {
        return $null
    }

    $directories = @(Get-ChildItem -LiteralPath $Context.WorkingPath -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "datafeed_*" } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 20)

    $logs = foreach ($directory in $directories) {
        Get-ChildItem -LiteralPath $directory.FullName -Filter "gasdatafeed_import_*.log" -File -ErrorAction SilentlyContinue
    }

    return @($logs | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1)
}

function Get-WmSchedulerLockInspection {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Context,
        [object]$Lock,
        [int]$MaxLockAgeMinutes = 120,
        [int]$InactivityStaleMinutes = 30
    )

    $nowUtc = (Get-Date).ToUniversalTime()
    $startedAtUtc = Convert-WmUtcDateTime -Value $Lock.started_at_utc
    $lockAgeMinutes = if ($null -ne $startedAtUtc) {
        ($nowUtc - $startedAtUtc).TotalMinutes
    }
    else {
        $MaxLockAgeMinutes + 1
    }

    $ownerProcessId = 0
    $hasOwnerProcessId = [int]::TryParse([string]$Lock.process_id, [ref]$ownerProcessId)
    $ownerActive = $false
    $vendorChildActive = $false
    $latestVendorLog = Get-WmLatestVendorLogFile -Context $Context
    $latestVendorLogUtc = if ($latestVendorLog) { $latestVendorLog.LastWriteTimeUtc } else { $null }
    $latestVendorLogAgeMinutes = if ($null -ne $latestVendorLogUtc) { ($nowUtc - $latestVendorLogUtc).TotalMinutes } else { $null }

    if ($Lock.machine_name -ne $env:COMPUTERNAME) {
        $status = if ($lockAgeMinutes -ge $MaxLockAgeMinutes) { "StaleRemote" } else { "ActiveRemote" }
        return [pscustomobject]@{
            Status = $status
            LockAgeMinutes = $lockAgeMinutes
            OwnerProcessId = if ($hasOwnerProcessId) { $ownerProcessId } else { $null }
            OwnerActive = $true
            VendorChildActive = $false
            LatestVendorLogUtc = $latestVendorLogUtc
            LatestVendorLogAgeMinutes = $latestVendorLogAgeMinutes
            Reason = "lock belongs to another machine"
        }
    }

    if (-not $hasOwnerProcessId) {
        return [pscustomobject]@{
            Status = "Orphaned"
            LockAgeMinutes = $lockAgeMinutes
            OwnerProcessId = $null
            OwnerActive = $false
            VendorChildActive = $false
            LatestVendorLogUtc = $latestVendorLogUtc
            LatestVendorLogAgeMinutes = $latestVendorLogAgeMinutes
            Reason = "lock process_id is missing or invalid"
        }
    }

    $ownerActive = Test-WmLockOwnerActive -Lock $Lock
    if (-not $ownerActive) {
        return [pscustomobject]@{
            Status = "Orphaned"
            LockAgeMinutes = $lockAgeMinutes
            OwnerProcessId = $ownerProcessId
            OwnerActive = $false
            VendorChildActive = $false
            LatestVendorLogUtc = $latestVendorLogUtc
            LatestVendorLogAgeMinutes = $latestVendorLogAgeMinutes
            Reason = "owner process is not alive or does not match the original process start time"
        }
    }

    $vendorChildActive = Test-WmVendorChildActive -Context $Context -OwnerProcessId $ownerProcessId
    $recentVendorLogProgress = (
        $null -ne $latestVendorLogUtc -and
        $latestVendorLogUtc -ge $nowUtc.AddMinutes(-1 * $InactivityStaleMinutes)
    )

    if ($lockAgeMinutes -ge $MaxLockAgeMinutes) {
        return [pscustomobject]@{
            Status = "StaleActive"
            LockAgeMinutes = $lockAgeMinutes
            OwnerProcessId = $ownerProcessId
            OwnerActive = $true
            VendorChildActive = $vendorChildActive
            LatestVendorLogUtc = $latestVendorLogUtc
            LatestVendorLogAgeMinutes = $latestVendorLogAgeMinutes
            Reason = "lock exceeded MaxLockAgeMinutes"
        }
    }

    if ($lockAgeMinutes -ge $InactivityStaleMinutes -and -not $vendorChildActive -and -not $recentVendorLogProgress) {
        return [pscustomobject]@{
            Status = "StaleActive"
            LockAgeMinutes = $lockAgeMinutes
            OwnerProcessId = $ownerProcessId
            OwnerActive = $true
            VendorChildActive = $false
            LatestVendorLogUtc = $latestVendorLogUtc
            LatestVendorLogAgeMinutes = $latestVendorLogAgeMinutes
            Reason = "owner process is alive but no vendor child or recent vendor log progress was found"
        }
    }

    return [pscustomobject]@{
        Status = "Active"
        LockAgeMinutes = $lockAgeMinutes
        OwnerProcessId = $ownerProcessId
        OwnerActive = $true
        VendorChildActive = $vendorChildActive
        LatestVendorLogUtc = $latestVendorLogUtc
        LatestVendorLogAgeMinutes = $latestVendorLogAgeMinutes
        Reason = "owner process is active"
    }
}

function Write-WmStaleLockMarker {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Context,
        [Parameter(Mandatory = $true)]
        [object]$Lock,
        [Parameter(Mandatory = $true)]
        [object]$Inspection
    )

    $payload = [pscustomobject]@{
        detected_at_utc = (Get-Date).ToUniversalTime().ToString("o")
        detecting_task_name = $Context.TaskName
        lock_task_name = $Lock.task_name
        lock_machine_name = $Lock.machine_name
        lock_process_id = $Lock.process_id
        lock_owner_id = $Lock.owner_id
        lock_started_at_utc = $Lock.started_at_utc
        status = $Inspection.Status
        reason = $Inspection.Reason
        lock_age_minutes = [math]::Round([double]$Inspection.LockAgeMinutes, 1)
        vendor_child_active = [bool]$Inspection.VendorChildActive
        latest_vendor_log_utc = if ($Inspection.LatestVendorLogUtc) { ([datetime]$Inspection.LatestVendorLogUtc).ToString("o") } else { $null }
        latest_vendor_log_age_minutes = if ($null -ne $Inspection.LatestVendorLogAgeMinutes) { [math]::Round([double]$Inspection.LatestVendorLogAgeMinutes, 1) } else { $null }
    } | ConvertTo-Json -Compress

    Set-Content -LiteralPath $Context.StaleLockPath -Value $payload
}

function Enter-WmSchedulerLock {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Context,
        [int]$MaxLockAgeMinutes = 120,
        [int]$WaitTimeoutSeconds = 0,
        [int]$RetryIntervalSeconds = 15,
        [int]$InactivityStaleMinutes = 30
    )

    if ($RetryIntervalSeconds -lt 1) {
        $RetryIntervalSeconds = 1
    }
    if ($InactivityStaleMinutes -lt 1) {
        $InactivityStaleMinutes = 1
    }

    $startedWaitingUtc = (Get-Date).ToUniversalTime()
    $deadlineUtc = $startedWaitingUtc.AddSeconds([math]::Max(0, $WaitTimeoutSeconds))
    $waitLogged = $false

    while ($true) {
        if (Test-Path -LiteralPath $Context.LockPath) {
            $lock = $null
            $inspection = $null
            try {
                $lock = Get-Content -Raw -LiteralPath $Context.LockPath | ConvertFrom-Json
                $inspection = Get-WmSchedulerLockInspection `
                    -Context $Context `
                    -Lock $lock `
                    -MaxLockAgeMinutes $MaxLockAgeMinutes `
                    -InactivityStaleMinutes $InactivityStaleMinutes
            }
            catch {
                Write-WmSchedulerLog -Context $Context -Level "WARN" -Message (
                    "Removing corrupt WM import lock. lock=$($Context.LockPath) error=$($_.Exception.Message)"
                )
                Remove-Item -LiteralPath $Context.LockPath -Force -ErrorAction SilentlyContinue
                Remove-Item -LiteralPath $Context.StaleLockPath -Force -ErrorAction SilentlyContinue
                continue
            }

            if ($inspection.Status -eq "Orphaned") {
                Write-WmSchedulerLog -Context $Context -Level "WARN" -Message (
                    "Removing orphaned WM import lock. lock=$($Context.LockPath) process_id=$($inspection.OwnerProcessId) age_minutes=$([math]::Round([double]$inspection.LockAgeMinutes, 1)) reason=$($inspection.Reason)"
                )
                Remove-Item -LiteralPath $Context.LockPath -Force -ErrorAction SilentlyContinue
                Remove-Item -LiteralPath $Context.StaleLockPath -Force -ErrorAction SilentlyContinue
                continue
            }

            if ($inspection.Status -in @("StaleActive", "StaleRemote")) {
                Write-WmStaleLockMarker -Context $Context -Lock $lock -Inspection $inspection
                Write-WmSchedulerLog -Context $Context -Level "ERROR" -Message (
                    "Stale WM import lock detected; not removing live owner. lock=$($Context.LockPath) process_id=$($inspection.OwnerProcessId) age_minutes=$([math]::Round([double]$inspection.LockAgeMinutes, 1)) vendor_child_active=$($inspection.VendorChildActive) latest_vendor_log_age_minutes=$($inspection.LatestVendorLogAgeMinutes) reason=$($inspection.Reason)"
                )
                return [pscustomobject]@{
                    Acquired = $false
                    Status = $inspection.Status
                    ExitCode = 1
                    Message = $inspection.Reason
                }
            }

            $nowUtc = (Get-Date).ToUniversalTime()
            if ($WaitTimeoutSeconds -le 0 -or $nowUtc -ge $deadlineUtc) {
                Write-WmSchedulerLog -Context $Context -Level "WARN" -Message (
                    "Another WM import wrapper is active; skipping this launch. lock=$($Context.LockPath) age_minutes=$([math]::Round([double]$inspection.LockAgeMinutes, 1)) wait_timeout_seconds=$WaitTimeoutSeconds"
                )
                return [pscustomobject]@{
                    Acquired = $false
                    Status = "Busy"
                    ExitCode = 0
                    Message = "another wrapper is active"
                }
            }

            if (-not $waitLogged) {
                Write-WmSchedulerLog -Context $Context -Level "WARN" -Message (
                    "Another WM import wrapper is active; waiting for lock. lock=$($Context.LockPath) age_minutes=$([math]::Round([double]$inspection.LockAgeMinutes, 1)) wait_timeout_seconds=$WaitTimeoutSeconds retry_interval_seconds=$RetryIntervalSeconds"
                )
                $waitLogged = $true
            }

            $remainingSeconds = [int][math]::Max(1, [math]::Ceiling(($deadlineUtc - $nowUtc).TotalSeconds))
            Start-Sleep -Seconds ([math]::Min($RetryIntervalSeconds, $remainingSeconds))
            continue
        }

        $processStartedAtUtc = $null
        try {
            $processStartedAtUtc = (Get-Process -Id $PID -ErrorAction Stop).StartTime.ToUniversalTime().ToString("o")
        }
        catch {
            $processStartedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        }

        $ownerId = [guid]::NewGuid().ToString("N")
        $payload = [pscustomobject]@{
            task_name = $Context.TaskName
            machine_name = $env:COMPUTERNAME
            process_id = $PID
            owner_id = $ownerId
            started_at_utc = (Get-Date).ToUniversalTime().ToString("o")
            process_started_at_utc = $processStartedAtUtc
        } | ConvertTo-Json -Compress

        try {
            $stream = [System.IO.File]::Open($Context.LockPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
            try {
                $writer = New-Object System.IO.StreamWriter($stream)
                $writer.Write($payload)
                $writer.Flush()
            }
            finally {
                $stream.Close()
            }
        }
        catch [System.IO.IOException] {
            $nowUtc = (Get-Date).ToUniversalTime()
            if ($WaitTimeoutSeconds -le 0 -or $nowUtc -ge $deadlineUtc) {
                Write-WmSchedulerLog -Context $Context -Level "WARN" -Message "Another WM import wrapper acquired the lock first; skipping this launch."
                return [pscustomobject]@{
                    Acquired = $false
                    Status = "Busy"
                    ExitCode = 0
                    Message = "another wrapper acquired the lock first"
                }
            }

            Start-Sleep -Seconds ([math]::Min($RetryIntervalSeconds, [int][math]::Max(1, [math]::Ceiling(($deadlineUtc - $nowUtc).TotalSeconds))))
            continue
        }

        $Context.LockOwnerId = $ownerId
        $Context.LockOwnerProcessId = $PID
        Remove-Item -LiteralPath $Context.StaleLockPath -Force -ErrorAction SilentlyContinue
        Write-WmSchedulerLog -Context $Context -Message "Acquired WM import lock: $($Context.LockPath) owner_id=$ownerId"
        return [pscustomobject]@{
            Acquired = $true
            Status = "Acquired"
            ExitCode = 0
            Message = "lock acquired"
        }
    }
}

function Exit-WmSchedulerLock {
    param([object]$Context)

    if (-not (Test-Path -LiteralPath $Context.LockPath)) {
        Write-WmSchedulerLog -Context $Context -Level "WARN" -Message "WM import lock was already absent at release time."
        return
    }

    $lock = $null
    try {
        $lock = Get-Content -Raw -LiteralPath $Context.LockPath | ConvertFrom-Json
    }
    catch {
        Write-WmSchedulerLog -Context $Context -Level "WARN" -Message "Not releasing unreadable WM import lock because ownership cannot be verified. lock=$($Context.LockPath)"
        return
    }

    $lockProcessId = 0
    $hasLockProcessId = [int]::TryParse([string]$lock.process_id, [ref]$lockProcessId)
    $ownerMatches = (
        [string]$lock.machine_name -eq [string]$env:COMPUTERNAME -and
        $hasLockProcessId -and
        $lockProcessId -eq [int]$PID -and
        -not [string]::IsNullOrWhiteSpace($Context.LockOwnerId) -and
        [string]$lock.owner_id -eq [string]$Context.LockOwnerId
    )

    if (-not $ownerMatches) {
        Write-WmSchedulerLog -Context $Context -Level "WARN" -Message (
            "Not releasing WM import lock owned by another process. lock=$($Context.LockPath) lock_process_id=$($lock.process_id) current_process_id=$PID lock_owner_id=$($lock.owner_id) current_owner_id=$($Context.LockOwnerId)"
        )
        return
    }

    Remove-Item -LiteralPath $Context.LockPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $Context.StaleLockPath -Force -ErrorAction SilentlyContinue
    Write-WmSchedulerLog -Context $Context -Message "Released WM import lock owner_id=$($Context.LockOwnerId)."
}

function Test-WmPreflight {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Context,
        [Parameter(Mandatory = $true)]
        [string]$SourceType,
        [string]$SourceName = ""
    )

    if ($PSVersionTable.PSVersion.Major -lt 5) {
        throw "PowerShell v5+ is required by the WoodMac vendor scripts."
    }

    if (-not (Test-Path -LiteralPath $Context.ImportScript)) {
        throw "Missing vendor import script: $($Context.ImportScript)"
    }

    $probePath = Join-Path $Context.StateDir ("write_probe_{0}.tmp" -f ([guid]::NewGuid().ToString("N")))
    Set-Content -LiteralPath $probePath -Value "ok"
    Remove-Item -LiteralPath $probePath -Force

    $modeSql = switch ($SourceType) {
        "metadata" { "SELECT COUNT(*) AS source_count FROM natgas.source WHERE source_type = 'metadata';" }
        "delta" { "SELECT COUNT(*) AS source_count FROM natgas.source WHERE source_type = 'hourly' AND load_type = 'incremental';" }
        "hourly" { "SELECT COUNT(*) AS source_count FROM natgas.source WHERE source_type = 'hourly' AND load_type != 'incremental';" }
        default { throw "Unsupported sourceType for scheduled wrapper: $SourceType" }
    }

    $checks = Invoke-WmDbQuery -ConnectionString $Context.ConnectionString -Sql @"
SELECT
    OBJECT_ID('natgas.source', 'U') AS source_object_id,
    OBJECT_ID('natgas.load_status', 'U') AS load_status_object_id,
    OBJECT_ID('administration.error_log', 'U') AS error_log_object_id;
"@
    if (-not $checks -or $null -eq $checks[0].source_object_id -or $null -eq $checks[0].load_status_object_id) {
        throw "Required natgas.source or natgas.load_status table is not visible."
    }

    if ($null -eq $checks[0].error_log_object_id) {
        Write-WmSchedulerLog -Context $Context -Level "WARN" -Message "administration.error_log is not visible; post-run SQL error checks will be limited."
    }

    $modeParams = @{}
    if (-not [string]::IsNullOrWhiteSpace($SourceName)) {
        $modeSql = $modeSql.TrimEnd(";") + " AND source_name = @SourceName;"
        $modeParams["SourceName"] = $SourceName
    }

    $sources = Invoke-WmDbQuery -ConnectionString $Context.ConnectionString -Sql $modeSql -Parameters $modeParams
    if (-not $sources -or [int]$sources[0].source_count -lt 1) {
        $sourceLabel = if ($SourceName) { "$SourceType/$SourceName" } else { $SourceType }
        throw "No natgas.source rows are enabled for sourceType $sourceLabel."
    }

    $sourceLabel = if ($SourceName) { "$SourceType sourceName=$SourceName" } else { $SourceType }
    Write-WmSchedulerLog -Context $Context -Message "Preflight passed for sourceType=$sourceLabel source_count=$($sources[0].source_count)"
}

function Get-WmErrorLogWatermark {
    param([object]$Context)

    $rows = Invoke-WmDbQuery -ConnectionString $Context.ConnectionString -Sql @"
IF OBJECT_ID('administration.error_log', 'U') IS NULL
    SELECT CAST(NULL AS INT) AS max_error_log_id;
ELSE
    SELECT COALESCE(MAX(error_log_id), 0) AS max_error_log_id FROM administration.error_log;
"@

    if (-not $rows) {
        return $null
    }
    return $rows[0].max_error_log_id
}

function Invoke-WmVendorImport {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Context,
        [Parameter(Mandatory = $true)]
        [string]$SourceType,
        [string]$SourceName = ""
    )

    $pwshPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $Context.ImportScript,
        "-sourceType", $SourceType,
        "-writeLog", "true",
        "-Verbose"
    )

    if (-not [string]::IsNullOrWhiteSpace($SourceName)) {
        $arguments += @("-sourceName", $SourceName)
    }

    $sourceLabel = if ($SourceName) { "$SourceType sourceName=$SourceName" } else { $SourceType }
    Write-WmSchedulerLog -Context $Context -Message "Starting vendor import sourceType=$sourceLabel"
    Push-Location $Context.ScriptDirectory
    try {
        & $pwshPath @arguments 2>&1 |
            ForEach-Object {
                $line = ([string]$_) -replace "`0", ""
                if ($line) {
                    Write-WmSchedulerLog -Context $Context -Message $line
                }
            }
        $exitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($null -eq $exitCode) {
        $exitCode = 0
    }
    Write-WmSchedulerLog -Context $Context -Message "Finished vendor import sourceType=$sourceLabel exit_code=$exitCode"
    return [int]$exitCode
}

function Test-WmPostRunHealth {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Context,
        [Parameter(Mandatory = $true)]
        [string]$SourceType,
        [string]$SourceName = "",
        [Parameter(Mandatory = $true)]
        [datetime]$RunStartedUtc,
        [object]$ErrorLogWatermark
    )

    $rows = Invoke-WmDbQuery -ConnectionString $Context.ConnectionString -Sql @"
DECLARE @source_type VARCHAR(30) = @SourceType;
DECLARE @source_name VARCHAR(50) = @SourceName;
DECLARE @run_started DATETIME = @RunStartedUtc;

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
            ELSE source_type
        END AS scheduled_mode
    FROM natgas.source
)
SELECT
    COUNT(*) AS loads_seen,
    SUM(CASE WHEN ls.processed = 1 THEN 1 ELSE 0 END) AS processed_loads,
    SUM(CASE WHEN ls.processed = 0 THEN 1 ELSE 0 END) AS pending_loads,
    SUM(COALESCE(ls.row_count, 0)) AS rows_loaded,
    MAX(ls.update_date) AS latest_update
FROM source_modes AS sm
JOIN natgas.load_status AS ls
    ON ls.source_id = sm.source_id
WHERE sm.scheduled_mode = @source_type
  AND (@source_name = '' OR sm.source_name = @source_name)
  AND COALESCE(ls.update_date, ls.insert_date, ls.file_date) >= @run_started;
"@ -Parameters @{
        SourceType = $SourceType
        SourceName = $SourceName
        RunStartedUtc = $RunStartedUtc
    }

    $newErrors = @()
    if ($null -ne $ErrorLogWatermark) {
        $newErrors = @(Invoke-WmDbQuery -ConnectionString $Context.ConnectionString -Sql @"
SELECT TOP (20)
    error_log_id,
    error_date,
    error_procedure,
    error_message
FROM administration.error_log
WHERE error_log_id > @ErrorLogWatermark
ORDER BY error_log_id DESC;
"@ -Parameters @{ ErrorLogWatermark = [int]$ErrorLogWatermark })
    }

    $loadsSeen = if ($rows) { [int](Convert-WmDbValue -Value $rows[0].loads_seen) } else { 0 }
    $processedLoads = if ($rows -and $null -ne (Convert-WmDbValue -Value $rows[0].processed_loads)) { [int]$rows[0].processed_loads } else { 0 }
    $pendingLoads = if ($rows -and $null -ne (Convert-WmDbValue -Value $rows[0].pending_loads)) { [int]$rows[0].pending_loads } else { 0 }
    $rowsLoaded = if ($rows -and $null -ne (Convert-WmDbValue -Value $rows[0].rows_loaded)) { [int64]$rows[0].rows_loaded } else { 0 }

    Write-WmSchedulerLog -Context $Context -Message (
        "Post-run health sourceType=$SourceType sourceName=$SourceName loads_seen=$loadsSeen processed_loads=$processedLoads pending_loads=$pendingLoads rows_loaded=$rowsLoaded new_errors=$($newErrors.Count)"
    )

    foreach ($errorRow in $newErrors) {
        Write-WmSchedulerLog -Context $Context -Level "ERROR" -Message (
            "New SQL error sourceType=$SourceType error_log_id=$($errorRow.error_log_id) procedure=$($errorRow.error_procedure) message=$($errorRow.error_message)"
        )
    }

    if ($pendingLoads -gt 0) {
        Write-WmSchedulerLog -Context $Context -Level "ERROR" -Message "Post-run health failed: new pending load_status rows exist for sourceType=$SourceType."
        return $false
    }

    if ($newErrors.Count -gt 0) {
        Write-WmSchedulerLog -Context $Context -Level "ERROR" -Message "Post-run health failed: new administration.error_log rows exist for sourceType=$SourceType."
        return $false
    }

    return $true
}

function Invoke-WmScheduledSourceType {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Context,
        [Parameter(Mandatory = $true)]
        [string]$SourceType,
        [string]$SourceName = ""
    )

    Test-WmPreflight -Context $Context -SourceType $SourceType -SourceName $SourceName
    $runStartedUtc = (Get-Date).ToUniversalTime()
    $errorLogWatermark = Get-WmErrorLogWatermark -Context $Context
    $exitCode = Invoke-WmVendorImport -Context $Context -SourceType $SourceType -SourceName $SourceName
    if ($exitCode -ne 0) {
        throw "Vendor import failed for sourceType=$SourceType sourceName=$SourceName with exit code $exitCode."
    }

    $healthy = Test-WmPostRunHealth `
        -Context $Context `
        -SourceType $SourceType `
        -SourceName $SourceName `
        -RunStartedUtc $runStartedUtc `
        -ErrorLogWatermark $errorLogWatermark

    if (-not $healthy) {
        throw "Post-run health failed for sourceType=$SourceType sourceName=$SourceName."
    }
}
