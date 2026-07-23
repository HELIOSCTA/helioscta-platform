param(
    [string]$LegacyWorkbookPath = "$PSScriptRoot\nav_position_file_2026_july_21.xlsm",
    [string]$RefTablesWorkbookPath = "$PSScriptRoot\nav_position_file_2026_july_21_ref_tables_local.xlsm",
    [string]$OutputRoot = "$PSScriptRoot\..\..\..\..\.local\excel_compare\nav_position_file_2026_july_21",
    [int]$TimeoutSeconds = 600,
    [switch]$SkipQueryUpdate
)

$ErrorActionPreference = "Stop"

function Resolve-RequiredPath([string]$Path, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label not found: $Path"
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Format-CellValue($Value) {
    if ($null -eq $Value) {
        return $null
    }
    if ($Value -is [double] -or $Value -is [float] -or $Value -is [decimal] -or $Value -is [int] -or $Value -is [long]) {
        return ([double]$Value).ToString("G15", [System.Globalization.CultureInfo]::InvariantCulture)
    }
    if ($Value -is [bool]) {
        return $Value.ToString().ToLowerInvariant()
    }
    return [string]$Value
}

function Get-RangeMatrix($Range) {
    if (-not $Range) {
        return @()
    }

    $rowCount = $Range.Rows.Count
    $columnCount = $Range.Columns.Count
    $values = $Range.Value2
    $matrix = @()

    for ($row = 1; $row -le $rowCount; $row++) {
        $rowValues = @()
        for ($column = 1; $column -le $columnCount; $column++) {
            if ($rowCount -eq 1 -and $columnCount -eq 1) {
                $cellValue = $values
            }
            else {
                $cellValue = $values[$row, $column]
            }
            $rowValues += Format-CellValue $cellValue
        }
        $matrix += ,$rowValues
    }

    return $matrix
}

function Get-WorkbookSnapshot($Excel, [string]$WorkbookPath) {
    $workbook = $null
    try {
        $workbook = $Excel.Workbooks.Open($WorkbookPath, 0, $true)

        $tables = @{}
        foreach ($worksheet in $workbook.Worksheets) {
            foreach ($listObject in $worksheet.ListObjects) {
                $key = "$($worksheet.Name)!$($listObject.Name)"
                $matrix = Get-RangeMatrix $listObject.Range
                $tables[$key] = [pscustomobject]@{
                    sheet = $worksheet.Name
                    name = $listObject.Name
                    address = $listObject.Range.Address($false, $false)
                    rows = $listObject.Range.Rows.Count
                    columns = $listObject.Range.Columns.Count
                    values = $matrix
                }
            }
        }

        $pivots = @{}
        foreach ($worksheet in $workbook.Worksheets) {
            foreach ($pivotTable in $worksheet.PivotTables()) {
                $key = "$($worksheet.Name)!$($pivotTable.Name)"
                $range = $null
                try { $range = $pivotTable.TableRange2 } catch { }
                $matrix = Get-RangeMatrix $range
                $pivots[$key] = [pscustomobject]@{
                    sheet = $worksheet.Name
                    name = $pivotTable.Name
                    address = if ($range) { $range.Address($false, $false) } else { $null }
                    rows = if ($range) { $range.Rows.Count } else { 0 }
                    columns = if ($range) { $range.Columns.Count } else { 0 }
                    values = $matrix
                }
            }
        }

        return [pscustomobject]@{
            tables = $tables
            pivots = $pivots
        }
    }
    finally {
        if ($workbook) { $workbook.Close($false) | Out-Null }
        if ($workbook) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null }
    }
}

function Set-BackgroundRefreshOff($Workbook) {
    foreach ($connection in $Workbook.Connections) {
        try {
            if ($connection.OLEDBConnection) {
                $connection.OLEDBConnection.BackgroundQuery = $false
            }
        } catch { }
        try {
            if ($connection.ODBCConnection) {
                $connection.ODBCConnection.BackgroundQuery = $false
            }
        } catch { }
    }

    foreach ($worksheet in $Workbook.Worksheets) {
        foreach ($listObject in $worksheet.ListObjects) {
            try {
                if ($listObject.QueryTable) {
                    $listObject.QueryTable.BackgroundQuery = $false
                }
            } catch { }
        }
    }
}

function Test-WorkbookRefreshing($Workbook) {
    foreach ($connection in $Workbook.Connections) {
        try {
            if ($connection.OLEDBConnection -and $connection.OLEDBConnection.Refreshing) {
                return $true
            }
        } catch { }
        try {
            if ($connection.ODBCConnection -and $connection.ODBCConnection.Refreshing) {
                return $true
            }
        } catch { }
    }

    foreach ($worksheet in $Workbook.Worksheets) {
        foreach ($listObject in $worksheet.ListObjects) {
            try {
                if ($listObject.QueryTable -and $listObject.QueryTable.Refreshing) {
                    return $true
                }
            } catch { }
        }
    }

    return $false
}

function Refresh-WorkbookCopy($Excel, [string]$SourceWorkbookPath, [string]$DestinationWorkbookPath, [int]$TimeoutSeconds) {
    Copy-Item -LiteralPath $SourceWorkbookPath -Destination $DestinationWorkbookPath -Force

    $workbook = $null
    $startedAt = Get-Date
    $errors = @()
    try {
        $workbook = $Excel.Workbooks.Open($DestinationWorkbookPath, 0, $false)
        Set-BackgroundRefreshOff $workbook

        foreach ($connection in $workbook.Connections) {
            if ($connection.Name -like "Query - *") {
                try {
                    $null = $connection.Refresh()
                    $Excel.CalculateUntilAsyncQueriesDone()
                }
                catch {
                    $errors += "$($connection.Name): $($_.Exception.Message)"
                }
            }
        }

        while (Test-WorkbookRefreshing $workbook) {
            if (((Get-Date) - $startedAt).TotalSeconds -gt $TimeoutSeconds) {
                throw "Timed out waiting for workbook refresh after $TimeoutSeconds seconds."
            }
            Start-Sleep -Seconds 2
            try { $Excel.CalculateUntilAsyncQueriesDone() } catch { }
        }

        foreach ($worksheet in $workbook.Worksheets) {
            foreach ($pivotTable in $worksheet.PivotTables()) {
                try {
                    $null = $pivotTable.RefreshTable()
                }
                catch {
                    $errors += "$($worksheet.Name)!$($pivotTable.Name): $($_.Exception.Message)"
                }
            }
        }

        try {
            $Excel.CalculateFullRebuild()
        }
        catch {
            $errors += $_.Exception.Message
        }

        $workbook.Save()

        return [pscustomobject]@{
            path = $DestinationWorkbookPath
            success = ($errors.Count -eq 0)
            errors = $errors
            elapsedSeconds = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
        }
    }
    catch {
        $errors += $_.Exception.Message
        return [pscustomobject]@{
            path = $DestinationWorkbookPath
            success = $false
            errors = $errors
            elapsedSeconds = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
        }
    }
    finally {
        if ($workbook) { $workbook.Close($false) | Out-Null }
        if ($workbook) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null }
    }
}

function Compare-MatrixObject([string]$Kind, [string]$Name, $Left, $Right) {
    $leftValues = @($Left.values)
    $rightValues = @($Right.values)
    $leftRows = $leftValues.Count
    $rightRows = $rightValues.Count
    $leftColumns = if ($leftRows -gt 0) { @($leftValues[0]).Count } else { 0 }
    $rightColumns = if ($rightRows -gt 0) { @($rightValues[0]).Count } else { 0 }
    $maxRows = [Math]::Min($leftRows, $rightRows)
    $maxColumns = [Math]::Min($leftColumns, $rightColumns)
    $mismatchCount = 0
    $examples = @()

    for ($row = 0; $row -lt $maxRows; $row++) {
        $leftRow = @($leftValues[$row])
        $rightRow = @($rightValues[$row])
        for ($column = 0; $column -lt $maxColumns; $column++) {
            if ($leftRow[$column] -ne $rightRow[$column]) {
                $mismatchCount += 1
                if ($examples.Count -lt 25) {
                    $examples += [pscustomobject]@{
                        row = $row + 1
                        column = $column + 1
                        left = $leftRow[$column]
                        right = $rightRow[$column]
                    }
                }
            }
        }
    }

    return [pscustomobject]@{
        kind = $Kind
        name = $Name
        leftAddress = $Left.address
        rightAddress = $Right.address
        leftRows = $leftRows
        rightRows = $rightRows
        leftColumns = $leftColumns
        rightColumns = $rightColumns
        sameShape = ($leftRows -eq $rightRows -and $leftColumns -eq $rightColumns)
        cellMismatchCount = $mismatchCount
        identical = ($leftRows -eq $rightRows -and $leftColumns -eq $rightColumns -and $mismatchCount -eq 0)
        examples = $examples
    }
}

function Compare-SnapshotSection([string]$Kind, $LeftSection, $RightSection) {
    $results = @()
    $allNames = @($LeftSection.Keys + $RightSection.Keys | Sort-Object -Unique)

    foreach ($name in $allNames) {
        if (-not $LeftSection.ContainsKey($name)) {
            $results += [pscustomobject]@{
                kind = $Kind
                name = $name
                missingSide = "legacy"
                identical = $false
            }
            continue
        }
        if (-not $RightSection.ContainsKey($name)) {
            $results += [pscustomobject]@{
                kind = $Kind
                name = $name
                missingSide = "ref_tables"
                identical = $false
            }
            continue
        }
        $results += Compare-MatrixObject $Kind $name $LeftSection[$name] $RightSection[$name]
    }

    return $results
}

if (-not $SkipQueryUpdate) {
    & "$PSScriptRoot\update_workbook_queries.ps1" `
        -WorkbookPath $LegacyWorkbookPath `
        -OutputPath $RefTablesWorkbookPath
}

$LegacyWorkbookPath = Resolve-RequiredPath $LegacyWorkbookPath "legacy workbook"
$RefTablesWorkbookPath = Resolve-RequiredPath $RefTablesWorkbookPath "ref-table workbook"

$runId = Get-Date -Format "yyyyMMdd_HHmmss"
$runDirectory = Join-Path $OutputRoot $runId
New-Item -ItemType Directory -Force -Path $runDirectory | Out-Null
$runDirectory = (Resolve-Path -LiteralPath $runDirectory).Path

$legacyRefreshPath = Join-Path $runDirectory "legacy_refreshed.xlsm"
$refTablesRefreshPath = Join-Path $runDirectory "ref_tables_refreshed.xlsm"

$excel = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.AskToUpdateLinks = $false
    $excel.AutomationSecurity = 3

    $legacyRefresh = Refresh-WorkbookCopy $excel $LegacyWorkbookPath $legacyRefreshPath $TimeoutSeconds
    $refTablesRefresh = Refresh-WorkbookCopy $excel $RefTablesWorkbookPath $refTablesRefreshPath $TimeoutSeconds

    $tableComparisons = @()
    $pivotComparisons = @()
    $allComparisons = @()
    $failedComparisons = @()
    $comparisonSkippedReason = $null

    if ($legacyRefresh.success -and $refTablesRefresh.success) {
        $legacySnapshot = Get-WorkbookSnapshot $excel $legacyRefreshPath
        $refTablesSnapshot = Get-WorkbookSnapshot $excel $refTablesRefreshPath

        $tableComparisons = Compare-SnapshotSection "table" $legacySnapshot.tables $refTablesSnapshot.tables
        $pivotComparisons = Compare-SnapshotSection "pivot" $legacySnapshot.pivots $refTablesSnapshot.pivots

        $allComparisons = @($tableComparisons + $pivotComparisons)
        $failedComparisons = @($allComparisons | Where-Object { -not $_.identical })
    }
    else {
        $comparisonSkippedReason = "One or both workbooks failed refresh; comparing cached table values would be misleading."
    }

    $summary = [pscustomobject]@{
        runDirectory = $runDirectory
        legacyRefresh = $legacyRefresh
        refTablesRefresh = $refTablesRefresh
        comparisonSkippedReason = $comparisonSkippedReason
        comparedObjectCount = $allComparisons.Count
        failedObjectCount = $failedComparisons.Count
        identical = ($legacyRefresh.success -and $refTablesRefresh.success -and $failedComparisons.Count -eq 0)
        tableComparisons = $tableComparisons
        pivotComparisons = $pivotComparisons
    }

    $summaryPath = Join-Path $runDirectory "comparison_summary.json"
    $summary | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $summaryPath -Encoding UTF8

    $flatPath = Join-Path $runDirectory "comparison_objects.csv"
    $allComparisons |
        Select-Object kind, name, identical, missingSide, sameShape, leftRows, rightRows, leftColumns, rightColumns, cellMismatchCount |
        Export-Csv -LiteralPath $flatPath -NoTypeInformation

    $summary | Select-Object runDirectory, comparedObjectCount, failedObjectCount, identical | ConvertTo-Json
    Write-Output "summary_path=$summaryPath"
    Write-Output "objects_csv=$flatPath"
}
finally {
    if ($excel) { $excel.Quit() | Out-Null }
    if ($excel) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
