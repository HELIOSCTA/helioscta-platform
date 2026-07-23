param(
    [string]$WorkbookPath = "$PSScriptRoot\nav_position_file_2026_july_21.xlsm",
    [string]$OutputPath = "$PSScriptRoot\nav_position_file_2026_july_21_ref_tables_local.xlsm",
    [string]$DbtProjectRoot = "$PSScriptRoot\..\..\..\..\dbt\azure_postgres",
    [string]$DatabaseName = $(if ($env:DBT_POSTGRES_DBNAME) { $env:DBT_POSTGRES_DBNAME } else { "helios_prod" }),
    [string]$OdbcConnectionString = $(if ($env:EXCEL_NAV_ODBC_CONNECTION_STRING) { $env:EXCEL_NAV_ODBC_CONNECTION_STRING } else { "dsn=Azure PostgreSQL;Database=$DatabaseName;SSLmode=require" })
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$queryToModel = [ordered]@{
    "SFTP_METADATA" = "nav_ref_excel_sftp_metadata.sql"
    "ICE_SETTLES" = "nav_ref_excel_ice_settles.sql"
    "ICE_BALDAY" = "nav_ref_excel_ice_balday.sql"
    "ICE_OPTIONS" = "nav_ref_excel_ice_options.sql"
    "ICE_FUTURES" = "nav_ref_excel_ice_futures.sql"
    "GAS_OPTIONS" = "nav_ref_excel_gas_options.sql"
    "GAS_FUTURES" = "nav_ref_excel_gas_futures.sql"
    "GAS_BALMO" = "nav_ref_excel_gas_balmo.sql"
    "GAS_OPTIONS_OTHER" = "nav_ref_excel_gas_options_other.sql"
    "GAS_FUTURES_PIVOT" = "nav_ref_excel_gas_futures_pivot.sql"
    "GAS_OPTIONS_PIVOT" = "nav_ref_excel_gas_options_pivot.sql"
}

function Resolve-RequiredPath([string]$Path, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label not found: $Path"
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Convert-SqlToPowerQueryFormula([string]$Sql, [string]$OdbcConnectionString) {
    $normalized = $Sql -replace "`r`n", "`n" -replace "`r", "`n"
    $escaped = $normalized -replace '"', '""' -replace "`n", "#(lf)"
    $escapedConnectionString = $OdbcConnectionString -replace '"', '""'
    return "let`r`n    Source = Odbc.Query(""$escapedConnectionString"", ""$escaped"")`r`nin`r`n    Source"
}

function Convert-DbtSqlToExcelOdbcSql([string]$Sql, [string]$DatabaseName) {
    if (-not $DatabaseName) {
        return $Sql
    }

    $escapedDatabaseName = [regex]::Escape($DatabaseName)
    $withoutQuotedDatabase = $Sql -replace ('"' + $escapedDatabaseName + '"\.'), ''
    return $withoutQuotedDatabase -replace ('\b' + $escapedDatabaseName + '\.'), ''
}

function Read-ZipEntryBytes([string]$ZipPath, [string]$EntryName) {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        $entry = $zip.GetEntry($EntryName)
        if (-not $entry) {
            return $null
        }
        $entryStream = $entry.Open()
        try {
            $memoryStream = New-Object System.IO.MemoryStream
            try {
                $entryStream.CopyTo($memoryStream)
                return $memoryStream.ToArray()
            }
            finally {
                $memoryStream.Dispose()
            }
        }
        finally {
            $entryStream.Dispose()
        }
    }
    finally {
        $zip.Dispose()
    }
}

function Replace-ZipEntryBytes([string]$ZipPath, [string]$EntryName, [byte[]]$Bytes) {
    $zip = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Update)
    try {
        $existingEntry = $zip.GetEntry($EntryName)
        if ($existingEntry) {
            $existingEntry.Delete()
        }
        $newEntry = $zip.CreateEntry($EntryName)
        $entryStream = $newEntry.Open()
        try {
            $entryStream.Write($Bytes, 0, $Bytes.Length)
        }
        finally {
            $entryStream.Dispose()
        }
    }
    finally {
        $zip.Dispose()
    }
}

function Restore-MacroProject([string]$SourceWorkbookPath, [string]$TargetWorkbookPath) {
    $entryNames = @("xl/vbaProject.bin")
    foreach ($entryName in $entryNames) {
        $bytes = Read-ZipEntryBytes $SourceWorkbookPath $entryName
        if ($bytes) {
            Replace-ZipEntryBytes $TargetWorkbookPath $entryName $bytes
        }
    }
}

$WorkbookPath = Resolve-RequiredPath $WorkbookPath "Workbook"
$DbtProjectRoot = Resolve-RequiredPath $DbtProjectRoot "dbt project root"
$compiledRoot = Join-Path $DbtProjectRoot "target\compiled\helioscta_platform\models\positions_and_trades\2026_07_22_ref_tables\nav_positions\excel"
$compiledRoot = Resolve-RequiredPath $compiledRoot "compiled NAV Excel SQL directory"

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
if ($WorkbookPath -eq $resolvedOutputPath) {
    throw "In-place updates are intentionally not supported. Provide a separate OutputPath so the original macro workbook remains untouched."
}

Copy-Item -LiteralPath $WorkbookPath -Destination $resolvedOutputPath -Force

$sqlByQuery = @{}
foreach ($queryName in $queryToModel.Keys) {
    $sqlPath = Join-Path $compiledRoot $queryToModel[$queryName]
    $sqlPath = Resolve-RequiredPath $sqlPath "compiled SQL for $queryName"
    $sql = Get-Content -LiteralPath $sqlPath -Raw
    $sql = Convert-DbtSqlToExcelOdbcSql $sql $DatabaseName
    $sqlByQuery[$queryName] = Convert-SqlToPowerQueryFormula $sql $OdbcConnectionString
}

$excel = $null
$workbook = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.AutomationSecurity = 3

    $workbook = $excel.Workbooks.Open($resolvedOutputPath, 0, $false)

    foreach ($queryName in $queryToModel.Keys) {
        $query = $workbook.Queries.Item($queryName)
        if (-not $query) {
            throw "Workbook query not found: $queryName"
        }
        $query.Formula = $sqlByQuery[$queryName]
    }

    $workbook.Save()
}
finally {
    if ($workbook) { $workbook.Close($false) | Out-Null }
    if ($excel) { $excel.Quit() | Out-Null }
    if ($workbook) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null }
    if ($excel) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Restore-MacroProject $WorkbookPath $resolvedOutputPath

Write-Output "Updated workbook queries: $resolvedOutputPath"
