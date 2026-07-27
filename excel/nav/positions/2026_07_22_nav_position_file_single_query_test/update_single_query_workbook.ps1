param(
    [string]$WorkbookPath = "$PSScriptRoot\marex_and_nav_position_file_2026_may_11_single_query_test.xlsm",
    [string]$MacroSourceWorkbookPath = "$PSScriptRoot\..\2026_07_22_nav_position_file\marex_and_nav_position_file_2026_may_11_ref_tables.xlsm",
    [string]$CompiledBaseSqlPath = "$PSScriptRoot\sql\nav_ref_excel_base_all_tabs.sql",
    [string]$DatabaseName = $(if ($env:DBT_POSTGRES_DBNAME) { $env:DBT_POSTGRES_DBNAME } else { "helios_prod" }),
    [string]$OdbcConnectionString = $(if ($env:EXCEL_NAV_ODBC_CONNECTION_STRING) { $env:EXCEL_NAV_ODBC_CONNECTION_STRING } else { "dsn=Azure PostgreSQL;Database=$DatabaseName;SSLmode=require" }),
    [switch]$RefreshDerivedPowerQueries,
    [switch]$UpdateBaseQueryFormula,
    [switch]$RestorePromotedMacroProject
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$baseQueryName = "NAV_EXCEL_BASE"
$baseTableName = "NAV_EXCEL_BASE_TABLE"
$baseSheetName = "_NAV_EXCEL_BASE"
$baseConnectionName = "Query - NAV_EXCEL_BASE"

function Resolve-RequiredPath([string]$Path, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label not found: $Path"
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Convert-SqlToPowerQueryFormula([string]$Sql, [string]$ConnectionString) {
    $normalized = $Sql -replace "`r`n", "`n" -replace "`r", "`n"
    $escaped = $normalized -replace '"', '""' -replace "`n", "#(lf)"
    $escapedConnectionString = $ConnectionString -replace '"', '""'
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

function ConvertTo-MStringLiteral([string]$Value) {
    return '"' + ($Value -replace '"', '""') + '"'
}

function ConvertTo-MType([string]$TypeName) {
    switch ($TypeName) {
        "date" { return "type date" }
        "datetime" { return "type datetime" }
        "logical" { return "type logical" }
        "whole" { return "Int64.Type" }
        "number" { return "type number" }
        default { return "type text" }
    }
}

function New-ColumnSpec([string]$Source, [string]$Output, [string]$TypeName) {
    return [pscustomobject]@{
        Source = $Source
        Output = $Output
        TypeName = $TypeName
    }
}

function New-LocalPowerQueryFormula([string]$OutputTable, [object[]]$Columns, [string]$SourceExpression = $baseQueryName) {
    $sourceColumns = $Columns | ForEach-Object { ConvertTo-MStringLiteral $_.Source }
    $renamePairs = $Columns | Where-Object { $_.Source -cne $_.Output } | ForEach-Object {
        "{" + (ConvertTo-MStringLiteral $_.Source) + ", " + (ConvertTo-MStringLiteral $_.Output) + "}"
    }
    $typePairs = $Columns | ForEach-Object {
        "{" + (ConvertTo-MStringLiteral $_.Output) + ", " + (ConvertTo-MType $_.TypeName) + "}"
    }

    $selectedColumns = "{" + ($sourceColumns -join ", ") + "}"
    $renames = "{" + ($renamePairs -join ", ") + "}"
    $types = "{" + ($typePairs -join ", ") + "}"
    $escapedOutputTable = $OutputTable -replace '"', '""'

    return @"
let
    Source = $SourceExpression,
    FilteredRows = Table.SelectRows(Source, each [excel_output_table] = "$escapedOutputTable"),
    SortedRows = Table.Sort(FilteredRows, {{"excel_output_sort_ordinal", Order.Ascending}}),
    SelectedColumns = Table.SelectColumns(SortedRows, $selectedColumns, MissingField.UseNull),
    RenamedColumns = Table.RenameColumns(SelectedColumns, $renames, MissingField.Ignore),
    TypedColumns = Table.TransformColumnTypes(RenamedColumns, $types)
in
    TypedColumns
"@
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
    $macroBytes = Read-ZipEntryBytes $SourceWorkbookPath "xl/vbaProject.bin"
    if ($macroBytes) {
        Replace-ZipEntryBytes $TargetWorkbookPath "xl/vbaProject.bin" $macroBytes
    }
}

function Get-WorksheetByName($Workbook, [string]$Name) {
    foreach ($worksheet in $Workbook.Worksheets) {
        if ($worksheet.Name -eq $Name) {
            return $worksheet
        }
    }
    return $null
}

function Get-WorkbookQueryByName($Workbook, [string]$Name) {
    foreach ($query in $Workbook.Queries) {
        if ($query.Name -eq $Name) {
            return $query
        }
    }
    return $null
}

function Set-WorkbookQueryFormula($Workbook, [string]$Name, [string]$Formula) {
    $query = Get-WorkbookQueryByName $Workbook $Name
    if ($query) {
        $query.Formula = $Formula
    }
    else {
        $Workbook.Queries.Add($Name, $Formula) | Out-Null
    }
}

function Get-WorkbookConnectionByName($Workbook, [string]$Name) {
    foreach ($connection in $Workbook.Connections) {
        if ($connection.Name -eq $Name) {
            return $connection
        }
    }
    return $null
}

function Get-ListObjectByName($Workbook, [string]$Name) {
    foreach ($worksheet in $Workbook.Worksheets) {
        foreach ($listObject in $worksheet.ListObjects) {
            if ($listObject.Name -eq $Name) {
                return $listObject
            }
        }
    }
    return $null
}

function New-ExcelColor([int]$Red, [int]$Green, [int]$Blue) {
    return $Red + ($Green * 256) + ($Blue * 65536)
}

function Format-ListObject($ListObject, [bool]$IsBaseTable) {
    if (-not $ListObject) {
        return
    }

    $headerBlue = New-ExcelColor 31 78 120
    $bodyBlue = New-ExcelColor 239 246 255
    $borderBlue = New-ExcelColor 189 215 238
    $white = New-ExcelColor 255 255 255
    $black = New-ExcelColor 0 0 0

    try { $ListObject.ShowAutoFilter = $true } catch {}
    try { $ListObject.ShowTableStyleRowStripes = $false } catch {}
    try { $ListObject.ShowTableStyleColumnStripes = $false } catch {}
    try { $ListObject.TableStyle = $(if ($IsBaseTable) { "TableStyleMedium2" } else { "TableStyleMedium9" }) } catch {}

    if ($ListObject.HeaderRowRange) {
        $ListObject.HeaderRowRange.Font.Bold = $true
        $ListObject.HeaderRowRange.Font.Color = $white
        $ListObject.HeaderRowRange.Interior.Color = $headerBlue
        $ListObject.HeaderRowRange.HorizontalAlignment = -4108
        $ListObject.HeaderRowRange.WrapText = $true
        $ListObject.HeaderRowRange.VerticalAlignment = -4108
        $ListObject.HeaderRowRange.RowHeight = 27
        Set-RangeBorder $ListObject.HeaderRowRange $headerBlue 2
    }

    if ($ListObject.DataBodyRange) {
        $ListObject.DataBodyRange.Interior.Color = $bodyBlue
        $ListObject.DataBodyRange.Font.Color = $black
        $ListObject.DataBodyRange.Font.Bold = $false
        $ListObject.DataBodyRange.VerticalAlignment = -4108
        Set-RangeBorder $ListObject.DataBodyRange $borderBlue 2
    }

    if ($ListObject.InsertRowRange) {
        $ListObject.InsertRowRange.Interior.Color = $bodyBlue
        Set-RangeBorder $ListObject.InsertRowRange $borderBlue 2
    }

    try { $ListObject.Range.Font.Name = "Aptos" } catch {}
    try { $ListObject.Range.Font.Size = 10 } catch {}

    foreach ($column in $ListObject.ListColumns) {
        $columnName = [string]$column.Name
        try {
            switch -Regex ($columnName) {
                "date|Date|Expiration|YYYYMMDD|trade_date|last_trade_date" {
                    $column.Range.NumberFormat = "m/d/yyyy"
                    break
                }
                "timestamp|Timestamp" {
                    $column.Range.NumberFormat = "m/d/yyyy h:mm"
                    break
                }
                "PnL|pnl|market_value|Change|Settle|settlement|price|qty|QTY|Delta|Gamma|Theta|Vega|Lots|lots|Strike|strike|DTE|days" {
                    if ($columnName -match "PnL|pnl|market_value") {
                        $column.Range.NumberFormat = '$#,##0;[Red]($#,##0);-'
                    }
                    elseif ($columnName -match "Settle|settlement|price|Strike|strike|Delta|delta|DTE|days") {
                        $column.Range.NumberFormat = "0.0000;[Red]-0.0000;-"
                    }
                    else {
                        $column.Range.NumberFormat = "#,##0;[Red]-#,##0;-"
                    }
                    break
                }
            }
        }
        catch {}

        try {
            if ($columnName -match "description|Description|source|account|exchange|symbol|code|product|month|YYYYMM|P/C|put_call|buy_sell") {
                $column.Range.HorizontalAlignment = -4131
            }
            elseif ($columnName -match "date|Date|timestamp|Timestamp") {
                $column.Range.HorizontalAlignment = -4108
            }
            else {
                $column.Range.HorizontalAlignment = -4152
            }
        }
        catch {}
    }

    try { $ListObject.Range.Columns.AutoFit() | Out-Null } catch {}
    foreach ($column in $ListObject.Range.Columns) {
        try {
            if ($column.ColumnWidth -gt 32) {
                $column.ColumnWidth = 32
            }
            elseif ($column.ColumnWidth -lt 7.5) {
                $column.ColumnWidth = 7.5
            }
        }
        catch {}
    }

    try { $ListObject.Range.Rows.AutoFit() | Out-Null } catch {}
    foreach ($row in $ListObject.Range.Rows) {
        try {
            if ($row.RowHeight -lt 15) {
                $row.RowHeight = 15
            }
            elseif ($row.RowHeight -gt 33) {
                $row.RowHeight = 33
            }
        }
        catch {}
    }
}

function Set-WorksheetView($Excel, $Worksheet, [int]$FreezeRows, [int]$FreezeColumns) {
    try {
        $Worksheet.Activate() | Out-Null
        $Excel.ActiveWindow.DisplayGridlines = $true
        $Excel.ActiveWindow.FreezePanes = $false
        $Excel.ActiveWindow.SplitRow = $FreezeRows
        $Excel.ActiveWindow.SplitColumn = $FreezeColumns
        if ($FreezeRows -gt 0 -or $FreezeColumns -gt 0) {
            $Excel.ActiveWindow.FreezePanes = $true
        }
        $Excel.ActiveWindow.Zoom = 90
    }
    catch {}
}

function Clear-ExplicitWhiteBackgrounds($Worksheet) {
    # Keep workspace/background cells as normal Excel grid cells. Object styling
    # is applied to tables and pivots below instead of painting broad sheets.
    return
}

function Set-WorksheetTabColors($Workbook) {
    $colorsBySheet = @{
        "Workbook_Index" = New-ExcelColor 38 38 38
        "_NAV_EXCEL_BASE" = New-ExcelColor 31 78 121
        "Publish" = New-ExcelColor 55 86 35
        "ICE_OPTIONS" = New-ExcelColor 47 84 150
        "ICE_SETTLES" = New-ExcelColor 47 84 150
        "GAS_SETTLES" = New-ExcelColor 112 48 160
        "Lookback" = New-ExcelColor 191 144 0
        "Positions" = New-ExcelColor 166 166 166
        "Lookback_NEW" = New-ExcelColor 166 166 166
        "ICE_SETTLES_NEW" = New-ExcelColor 166 166 166
        "OPEX Mar 26th" = New-ExcelColor 166 166 166
        "Sheet1" = New-ExcelColor 166 166 166
        "ICE XL -->" = New-ExcelColor 166 166 166
    }

    foreach ($worksheet in $Workbook.Worksheets) {
        if ($colorsBySheet.ContainsKey($worksheet.Name)) {
            try { $worksheet.Tab.Color = $colorsBySheet[$worksheet.Name] } catch {}
        }
    }
}

function Set-RangeBorder($Range, [int]$Color, [int]$Weight) {
    foreach ($borderIndex in @(7, 8, 9, 10, 11, 12)) {
        try {
            $border = $Range.Borders.Item($borderIndex)
            $border.LineStyle = 1
            $border.Color = $Color
            $border.Weight = $Weight
        }
        catch {}
    }
}

function Format-PivotTable($PivotTable) {
    if (-not $PivotTable) {
        return
    }

    $headerBlue = New-ExcelColor 31 78 120
    $bodyBlue = New-ExcelColor 239 246 255
    $borderBlue = New-ExcelColor 189 215 238
    $white = New-ExcelColor 255 255 255
    $black = New-ExcelColor 0 0 0

    try { $PivotTable.TableStyle2 = "PivotStyleMedium2" } catch {}
    try { $PivotTable.ShowTableStyleRowStripes = $false } catch {}
    try { $PivotTable.ShowTableStyleColumnStripes = $false } catch {}
    try { $PivotTable.DisplayFieldCaptions = $true } catch {}
    try { $PivotTable.PreserveFormatting = $true } catch {}

    try {
        $PivotTable.TableRange2.Font.Name = "Aptos"
        $PivotTable.TableRange2.Font.Size = 10
        $PivotTable.TableRange2.Interior.Color = $bodyBlue
        $PivotTable.TableRange2.Font.Color = $black
        $PivotTable.TableRange2.VerticalAlignment = -4108
        Set-RangeBorder $PivotTable.TableRange2 $borderBlue 2
    }
    catch {}

    try {
        if ($PivotTable.ColumnRange) {
            $PivotTable.ColumnRange.Interior.Color = $headerBlue
            $PivotTable.ColumnRange.Font.Color = $white
            $PivotTable.ColumnRange.Font.Bold = $true
            $PivotTable.ColumnRange.HorizontalAlignment = -4108
            Set-RangeBorder $PivotTable.ColumnRange $headerBlue 2
        }
    }
    catch {}

    try {
        if ($PivotTable.RowRange) {
            $PivotTable.RowRange.Interior.Color = $bodyBlue
            $PivotTable.RowRange.Font.Color = $black
            $PivotTable.RowRange.Font.Bold = $false
            Set-RangeBorder $PivotTable.RowRange $borderBlue 2
        }
    }
    catch {}

    try {
        if ($PivotTable.DataBodyRange) {
            $PivotTable.DataBodyRange.Interior.Color = $bodyBlue
            $PivotTable.DataBodyRange.NumberFormat = "#,##0;[Red]-#,##0;-"
            $PivotTable.DataBodyRange.HorizontalAlignment = -4152
            Set-RangeBorder $PivotTable.DataBodyRange $borderBlue 2
        }
    }
    catch {}

    try { $PivotTable.TableRange2.Columns.AutoFit() | Out-Null } catch {}
    foreach ($column in $PivotTable.TableRange2.Columns) {
        try {
            if ($column.ColumnWidth -gt 18) {
                $column.ColumnWidth = 18
            }
            elseif ($column.ColumnWidth -lt 6) {
                $column.ColumnWidth = 6
            }
        }
        catch {}
    }
}

function Update-WorkbookIndexSheet($Workbook) {
    $sheetName = "Workbook_Index"
    $worksheet = Get-WorksheetByName $Workbook $sheetName
    if (-not $worksheet) {
        $worksheet = $Workbook.Worksheets.Add($Workbook.Worksheets.Item(1))
        $worksheet.Name = $sheetName
    }
    $worksheet.Visible = -1
    $worksheet.Cells.Clear()

    $rows = @(
        @("Sheet", "Status", "Evidence", "Recommended action"),
        @("_NAV_EXCEL_BASE", "Active base", "Visible single ODBC load; table NAV_EXCEL_BASE_TABLE feeds local workbook outputs", "Keep"),
        @("Publish", "Active output", "Contains SFTP_METADATA, GAS_OPTIONS_PIVOT, and publish formulas", "Keep"),
        @("ICE_OPTIONS", "Active output", "Contains ICE_OPTIONS and ICE_FUTURES query tables", "Keep"),
        @("ICE_SETTLES", "Active output", "Contains ICE_SETTLES, ICE_BALDAY, pivot, and formulas that reference Lookback", "Keep"),
        @("GAS_SETTLES", "Active output", "Contains GAS_OPTIONS, GAS_FUTURES, GAS_BALMO, and GAS_OPTIONS_OTHER tables", "Keep"),
        @("Lookback", "Active support", "Referenced by formulas on ICE_SETTLES", "Keep until ICE_SETTLES formulas are retired or rebuilt"),
        @("ICE XL -->", "Stale candidate", "Blank sheet; no formulas, constants, tables, pivots, or inbound references found", "Safe first delete candidate after manual review"),
        @("OPEX Mar 26th", "Stale candidate", "Static one-off sheet; no formulas, tables, pivots, or inbound references found", "Likely delete/archive candidate"),
        @("Sheet1", "Stale candidate", "Small scratch sheet; no inbound references and formula errors found", "Likely delete/archive candidate"),
        @("ICE_SETTLES_NEW", "Stale candidate", "Formula prototype with no inbound references; depends on Positions and Lookback_NEW", "Review, then delete with Positions and Lookback_NEW if unused"),
        @("Positions", "Dependent stale candidate", "Static non-query table; only referenced by ICE_SETTLES_NEW", "Delete only if ICE_SETTLES_NEW is removed"),
        @("Lookback_NEW", "Dependent stale candidate", "Only referenced by ICE_SETTLES_NEW", "Delete only if ICE_SETTLES_NEW is removed")
    )

    $rowCount = $rows.Count
    $columnCount = $rows[0].Count
    $data = New-Object 'object[,]' $rowCount, $columnCount
    for ($rowIndex = 0; $rowIndex -lt $rowCount; $rowIndex++) {
        for ($columnIndex = 0; $columnIndex -lt $columnCount; $columnIndex++) {
            $data[$rowIndex, $columnIndex] = $rows[$rowIndex][$columnIndex]
        }
    }

    $targetRange = $worksheet.Range("A1").Resize($rowCount, $columnCount)
    $targetRange.Value2 = $data

    $worksheet.Range("A1:D1").Font.Bold = $true
    $worksheet.Range("A1:D1").Font.Color = New-ExcelColor 255 255 255
    $worksheet.Range("A1:D1").Interior.Color = New-ExcelColor 38 38 38
    $worksheet.Range("A1:D1").HorizontalAlignment = -4108
    $worksheet.Range("A1:D1").VerticalAlignment = -4108
    $worksheet.Range("A1:D1").WrapText = $true

    $bodyRange = $worksheet.Range("A2:D$rowCount")
    $bodyRange.Font.Name = "Aptos"
    $bodyRange.Font.Size = 10
    $bodyRange.WrapText = $true
    $bodyRange.VerticalAlignment = -4160

    for ($rowIndex = 2; $rowIndex -le $rowCount; $rowIndex++) {
        $status = [string]$worksheet.Cells.Item($rowIndex, 2).Value2
        $fill = New-ExcelColor 255 255 255
        switch -Wildcard ($status) {
            "Active*" { $fill = New-ExcelColor 226 239 218 }
            "Stale*" { $fill = New-ExcelColor 242 242 242 }
            "Dependent*" { $fill = New-ExcelColor 255 242 204 }
        }
        $worksheet.Range("A$rowIndex:D$rowIndex").Interior.Color = $fill
    }

    Set-RangeBorder $targetRange (New-ExcelColor 217 217 217) 2
    $worksheet.Columns.Item(1).ColumnWidth = 22
    $worksheet.Columns.Item(2).ColumnWidth = 24
    $worksheet.Columns.Item(3).ColumnWidth = 76
    $worksheet.Columns.Item(4).ColumnWidth = 52
    $worksheet.Rows.Item(1).RowHeight = 24
    $bodyRange.Rows.AutoFit() | Out-Null
    foreach ($row in $bodyRange.Rows) {
        if ($row.RowHeight -gt 54) {
            $row.RowHeight = 54
        }
    }
    $worksheet.Tab.Color = New-ExcelColor 38 38 38
}

function Apply-WorkbookFormatting($Excel, $Workbook) {
    Update-WorkbookIndexSheet $Workbook
    Set-WorksheetTabColors $Workbook

    foreach ($worksheet in $Workbook.Worksheets) {
        try { $worksheet.Cells.Font.Name = "Aptos" } catch {}
        Clear-ExplicitWhiteBackgrounds $worksheet
    }

    $indexSheet = Get-WorksheetByName $Workbook "Workbook_Index"
    if ($indexSheet) {
        Set-WorksheetView $Excel $indexSheet 1 0
    }

    $baseSheet = Get-WorksheetByName $Workbook "_NAV_EXCEL_BASE"
    if ($baseSheet) {
        Set-WorksheetView $Excel $baseSheet 1 3
    }

    foreach ($sheetName in @("Publish", "ICE_OPTIONS", "ICE_SETTLES", "GAS_SETTLES")) {
        $worksheet = Get-WorksheetByName $Workbook $sheetName
        if ($worksheet) {
            Set-WorksheetView $Excel $worksheet 0 0
        }
    }

    foreach ($sheetName in @("Positions", "Lookback_NEW", "ICE_SETTLES_NEW", "OPEX Mar 26th", "Sheet1", "ICE XL -->", "Lookback")) {
        $worksheet = Get-WorksheetByName $Workbook $sheetName
        if ($worksheet) {
            Set-WorksheetView $Excel $worksheet 0 0
        }
    }

    foreach ($worksheet in $Workbook.Worksheets) {
        foreach ($pivotTable in $worksheet.PivotTables()) {
            Format-PivotTable $pivotTable
        }
    }
}

function Get-BaseRowsByOutputTable($BaseTable) {
    $headers = @{}
    for ($columnIndex = 1; $columnIndex -le $BaseTable.ListColumns.Count; $columnIndex++) {
        $headers[[string]$BaseTable.ListColumns.Item($columnIndex).Name] = $columnIndex
    }

    if (-not $headers.ContainsKey("excel_output_table")) {
        throw "$baseTableName is missing required column: excel_output_table"
    }

    $rowsByOutputTable = @{}
    if (-not $BaseTable.DataBodyRange) {
        return $rowsByOutputTable
    }

    $values = $BaseTable.DataBodyRange.Value2
    $rowCount = $BaseTable.DataBodyRange.Rows.Count

    for ($rowIndex = 1; $rowIndex -le $rowCount; $rowIndex++) {
        $outputTable = [string]$values[$rowIndex, $headers["excel_output_table"]]
        if (-not $rowsByOutputTable.ContainsKey($outputTable)) {
            $rowsByOutputTable[$outputTable] = New-Object 'System.Collections.Generic.List[object]'
        }

        $row = @{}
        foreach ($header in $headers.Keys) {
            $row[$header] = $values[$rowIndex, $headers[$header]]
        }
        $rowsByOutputTable[$outputTable].Add($row)
    }

    return $rowsByOutputTable
}

function Set-ListObjectSourceData($ListObject, [object[]]$Rows, [object[]]$Columns) {
    if (-not $ListObject) {
        return
    }

    $rowCount = if ($Rows) { $Rows.Count } else { 0 }
    $sourceColumnCount = $Columns.Count
    $totalColumnCount = $ListObject.ListColumns.Count
    $worksheet = $ListObject.Parent
    $topLeft = $ListObject.Range.Cells.Item(1, 1)
    $requiredRangeRows = [Math]::Max($rowCount + 1, 2)

    if ($ListObject.Range.Rows.Count -ne $requiredRangeRows) {
        $newBottomRight = $topLeft.Offset($requiredRangeRows - 1, $totalColumnCount - 1)
        $newRange = $worksheet.Range($topLeft, $newBottomRight)
        $ListObject.Resize($newRange)
    }

    if ($ListObject.DataBodyRange -and $sourceColumnCount -gt 0) {
        $clearRange = $worksheet.Range(
            $ListObject.DataBodyRange.Cells.Item(1, 1),
            $ListObject.DataBodyRange.Cells.Item($ListObject.DataBodyRange.Rows.Count, $sourceColumnCount)
        )
        $clearRange.ClearContents()
    }

    if ($rowCount -eq 0) {
        return
    }

    $data = New-Object 'object[,]' $rowCount, $sourceColumnCount
    for ($rowIndex = 0; $rowIndex -lt $rowCount; $rowIndex++) {
        for ($columnIndex = 0; $columnIndex -lt $sourceColumnCount; $columnIndex++) {
            $sourceName = $Columns[$columnIndex].Source
            $data[$rowIndex, $columnIndex] = $Rows[$rowIndex][$sourceName]
        }
    }

    $targetRange = $worksheet.Range(
        $ListObject.DataBodyRange.Cells.Item(1, 1),
        $ListObject.DataBodyRange.Cells.Item($rowCount, $sourceColumnCount)
    )
    $targetRange.Value2 = $data
}

$queryColumns = [ordered]@{
    "SFTP_METADATA" = @(
        New-ColumnSpec "source" "source" "text"
        New-ColumnSpec "sftp_date" "sftp_date" "date"
        New-ColumnSpec "sftp_upload_timestamp" "sftp_upload_timestamp" "datetime"
    )
    "GAS_OPTIONS_PIVOT" = @(
        New-ColumnSpec "yyyy_mm" "YYYYMM" "text"
        New-ColumnSpec "futures_contract_code" "Futures Contract Code" "text"
        New-ColumnSpec "exchange_code" "Exchange Code" "text"
        New-ColumnSpec "put_call" "P/C" "text"
        New-ColumnSpec "strike_price" "Strike" "number"
        New-ColumnSpec "option_description" "Option Description" "text"
        New-ColumnSpec "acim" "ACIM" "number"
        New-ColumnSpec "pnt" "PNT" "number"
        New-ColumnSpec "dickson" "DICKSON" "number"
        New-ColumnSpec "titan" "TITAN" "number"
        New-ColumnSpec "qty" "QTY" "number"
        New-ColumnSpec "marex_settle" "MAREX Settle" "number"
        New-ColumnSpec "previous_marex_settle" "Previous MAREX Settle" "number"
    )
    "ICE_OPTIONS" = @(
        New-ColumnSpec "sftp_date" "SFTP Date" "date"
        New-ColumnSpec "previous_sftp_date" "Previous SFTP Date" "date"
        New-ColumnSpec "expiration_date" "Expiration" "date"
        New-ColumnSpec "dte" "DTE" "number"
        New-ColumnSpec "exchange_code" "Exchange Code" "text"
        New-ColumnSpec "exchange_code_grouping" "Grouping" "text"
        New-ColumnSpec "exchange_code_region" "Region" "text"
        New-ColumnSpec "put_call" "P/C" "text"
        New-ColumnSpec "strike_price" "Strike" "number"
        New-ColumnSpec "marex_delta" "Marex Delta" "number"
        New-ColumnSpec "previous_marex_delta" "Previous Marex Delta" "number"
        New-ColumnSpec "yyyy_mm" "YYYYMM" "text"
        New-ColumnSpec "futures_contract_code" "Futures Contract Code" "text"
        New-ColumnSpec "marex_description" "MAREX Description" "text"
        New-ColumnSpec "ice_xl_symbol" "ICE XL" "text"
        New-ColumnSpec "ice_lots" "ICE Lots" "number"
        New-ColumnSpec "qty" "QTY" "number"
        New-ColumnSpec "dod_qty" "DoD QTY" "number"
        New-ColumnSpec "acim" "ACIM" "number"
        New-ColumnSpec "pnt" "PNT" "number"
        New-ColumnSpec "dickson" "DICKSON" "number"
        New-ColumnSpec "titan" "TITAN" "number"
        New-ColumnSpec "marex_settle" "MAREX Settle" "number"
        New-ColumnSpec "previous_marex_settle" "Previous MAREX Settle" "number"
        New-ColumnSpec "change_between_settles" "Change between Settles" "number"
        New-ColumnSpec "pnl_from_settles" "PnL from Settles" "number"
    )
    "ICE_FUTURES" = @(
        New-ColumnSpec "sftp_date" "SFTP Date" "date"
        New-ColumnSpec "previous_sftp_date" "Previous SFTP Date" "date"
        New-ColumnSpec "expiration_date" "Expiration" "date"
        New-ColumnSpec "dte" "DTE" "number"
        New-ColumnSpec "exchange_code" "Exchange Code" "text"
        New-ColumnSpec "exchange_code_grouping" "Grouping" "text"
        New-ColumnSpec "exchange_code_region" "Region" "text"
        New-ColumnSpec "put_call" "P/C" "text"
        New-ColumnSpec "strike_price" "Strike" "number"
        New-ColumnSpec "marex_delta" "Marex Delta" "number"
        New-ColumnSpec "previous_marex_delta" "Previous Marex Delta" "number"
        New-ColumnSpec "yyyy_mm" "YYYYMM" "text"
        New-ColumnSpec "futures_contract_code" "Futures Contract Code" "text"
        New-ColumnSpec "marex_description" "MAREX Description" "text"
        New-ColumnSpec "ice_xl_symbol" "ICE XL" "text"
        New-ColumnSpec "ice_lots" "ICE Lots" "number"
        New-ColumnSpec "qty" "QTY" "number"
        New-ColumnSpec "dod_qty" "DoD QTY" "number"
        New-ColumnSpec "acim" "ACIM" "number"
        New-ColumnSpec "pnt" "PNT" "number"
        New-ColumnSpec "dickson" "DICKSON" "number"
        New-ColumnSpec "titan" "TITAN" "number"
        New-ColumnSpec "marex_settle" "MAREX Settle" "number"
        New-ColumnSpec "previous_marex_settle" "Previous MAREX Settle" "number"
        New-ColumnSpec "change_between_settles" "Change between Settles" "number"
        New-ColumnSpec "pnl_from_settles" "PnL from Settles" "number"
    )
    "ICE_SETTLES" = @(
        New-ColumnSpec "sftp_date" "SFTP Date" "date"
        New-ColumnSpec "previous_sftp_date" "Previous SFTP Date" "date"
        New-ColumnSpec "expiration_date" "Expiration" "date"
        New-ColumnSpec "dte" "DTE" "number"
        New-ColumnSpec "exchange_code" "Exchange Code" "text"
        New-ColumnSpec "exchange_code_grouping" "Grouping" "text"
        New-ColumnSpec "exchange_code_region" "Region" "text"
        New-ColumnSpec "yyyy_mm" "YYYYMM" "text"
        New-ColumnSpec "marex_description" "MAREX Description" "text"
        New-ColumnSpec "ice_xl_symbol" "ICE XL" "text"
        New-ColumnSpec "ice_lots" "ICE Lots" "number"
        New-ColumnSpec "qty" "QTY" "number"
        New-ColumnSpec "dod_qty" "DoD QTY" "number"
        New-ColumnSpec "acim" "ACIM" "number"
        New-ColumnSpec "pnt" "PNT" "number"
        New-ColumnSpec "dickson" "DICKSON" "number"
        New-ColumnSpec "titan" "TITAN" "number"
        New-ColumnSpec "marex_settle" "MAREX Settle" "number"
        New-ColumnSpec "previous_marex_settle" "Previous MAREX Settle" "number"
        New-ColumnSpec "change_between_settles" "Change between Settles" "number"
        New-ColumnSpec "pnl_from_settles" "PnL from Settles" "number"
    )
    "ICE_BALDAY" = @(
        New-ColumnSpec "sftp_date" "SFTP Date" "date"
        New-ColumnSpec "previous_sftp_date" "Previous SFTP Date" "date"
        New-ColumnSpec "expiration_date" "Expiration" "date"
        New-ColumnSpec "dte" "DTE" "number"
        New-ColumnSpec "exchange_code" "Exchange Code" "text"
        New-ColumnSpec "exchange_code_grouping" "Grouping" "text"
        New-ColumnSpec "exchange_code_region" "Region" "text"
        New-ColumnSpec "yyyy_mm" "YYYYMM" "text"
        New-ColumnSpec "contract_yyyymmdd" "YYYYMMDD" "date"
        New-ColumnSpec "marex_description" "MAREX Description" "text"
        New-ColumnSpec "ice_xl_symbol" "ICE XL" "text"
        New-ColumnSpec "ice_lots" "ICE Lots" "number"
        New-ColumnSpec "qty" "QTY" "number"
        New-ColumnSpec "dod_qty" "DoD QTY" "number"
        New-ColumnSpec "acim" "ACIM" "number"
        New-ColumnSpec "pnt" "PNT" "number"
        New-ColumnSpec "dickson" "DICKSON" "number"
        New-ColumnSpec "titan" "TITAN" "number"
        New-ColumnSpec "marex_settle" "MAREX Settle" "number"
        New-ColumnSpec "previous_marex_settle" "Previous MAREX Settle" "number"
        New-ColumnSpec "change_between_settles" "Change between Settles" "number"
        New-ColumnSpec "pnl_from_settles" "PnL from Settles" "number"
    )
    "GAS_OPTIONS" = @(
        New-ColumnSpec "sftp_date" "SFTP Date" "date"
        New-ColumnSpec "previous_sftp_date" "Previous SFTP Date" "date"
        New-ColumnSpec "expiration_date" "Expiration" "date"
        New-ColumnSpec "dte" "DTE" "number"
        New-ColumnSpec "exchange_code" "Exchange Code" "text"
        New-ColumnSpec "put_call" "P/C" "text"
        New-ColumnSpec "strike_price" "Strike" "number"
        New-ColumnSpec "marex_delta" "MAREX Delta" "number"
        New-ColumnSpec "previous_marex_delta" "Previous Marex Delta" "number"
        New-ColumnSpec "yyyy_mm" "YYYYMM" "text"
        New-ColumnSpec "futures_contract_code" "Futures Contract Code" "text"
        New-ColumnSpec "marex_description" "Marex Description" "text"
        New-ColumnSpec "cme_excel_symbol" "CME Symbol" "text"
        New-ColumnSpec "cme_gas_lots" "CME Gas Lots" "number"
        New-ColumnSpec "qty" "QTY" "number"
        New-ColumnSpec "dod_qty" "DoD QTY" "number"
        New-ColumnSpec "acim" "ACIM" "number"
        New-ColumnSpec "pnt" "PNT" "number"
        New-ColumnSpec "dickson" "DICKSON" "number"
        New-ColumnSpec "titan" "TITAN" "number"
        New-ColumnSpec "marex_settle" "MAREX Settle" "number"
        New-ColumnSpec "previous_marex_settle" "Previous MAREX Settle" "number"
        New-ColumnSpec "change_between_settles" "Change between Settles" "number"
        New-ColumnSpec "pnl_from_settles" "PnL from Settles" "number"
    )
    "GAS_FUTURES" = @(
        New-ColumnSpec "sftp_date" "SFTP Date" "date"
        New-ColumnSpec "previous_sftp_date" "Previous SFTP Date" "date"
        New-ColumnSpec "expiration_date" "Expiration" "date"
        New-ColumnSpec "dte" "DTE" "number"
        New-ColumnSpec "exchange_code" "Exchange Code" "text"
        New-ColumnSpec "yyyy_mm" "YYYYMM" "text"
        New-ColumnSpec "futures_contract_code" "Futures Contract Code" "text"
        New-ColumnSpec "marex_description" "Marex Description" "text"
        New-ColumnSpec "cme_excel_symbol" "CME Symbol" "text"
        New-ColumnSpec "cme_gas_lots" "CME Gas Lots" "number"
        New-ColumnSpec "qty" "QTY" "number"
        New-ColumnSpec "dod_qty" "DoD QTY" "number"
        New-ColumnSpec "acim" "ACIM" "number"
        New-ColumnSpec "pnt" "PNT" "number"
        New-ColumnSpec "dickson" "DICKSON" "number"
        New-ColumnSpec "titan" "TITAN" "number"
        New-ColumnSpec "marex_settle" "MAREX Settle" "number"
        New-ColumnSpec "previous_marex_settle" "Previous MAREX Settle" "number"
        New-ColumnSpec "change_between_settles" "Change between Settles" "number"
        New-ColumnSpec "pnl_from_settles" "PnL from Settles" "number"
    )
    "GAS_BALMO" = @(
        New-ColumnSpec "sftp_date" "SFTP Date" "date"
        New-ColumnSpec "previous_sftp_date" "Previous SFTP Date" "date"
        New-ColumnSpec "expiration_date" "Expiration" "date"
        New-ColumnSpec "dte" "DTE" "number"
        New-ColumnSpec "exchange_code" "Exchange Code" "text"
        New-ColumnSpec "yyyy_mm" "YYYYMM" "text"
        New-ColumnSpec "marex_description" "Marex Description" "text"
        New-ColumnSpec "ice_xl_symbol" "ICE XL" "text"
        New-ColumnSpec "cme_gas_lots" "CME Gas Lots" "number"
        New-ColumnSpec "qty" "QTY" "number"
        New-ColumnSpec "dod_qty" "DoD QTY" "number"
        New-ColumnSpec "acim" "ACIM" "number"
        New-ColumnSpec "pnt" "PNT" "number"
        New-ColumnSpec "dickson" "DICKSON" "number"
        New-ColumnSpec "titan" "TITAN" "number"
        New-ColumnSpec "marex_settle" "MAREX Settle" "number"
        New-ColumnSpec "previous_marex_settle" "Previous MAREX Settle" "number"
        New-ColumnSpec "change_between_settles" "Change between Settles" "number"
        New-ColumnSpec "pnl_from_settles" "PnL from Settles" "number"
    )
    "GAS_OPTIONS_OTHER" = @(
        New-ColumnSpec "sftp_date" "SFTP Date" "date"
        New-ColumnSpec "previous_sftp_date" "Previous SFTP Date" "date"
        New-ColumnSpec "expiration_date" "Expiration" "date"
        New-ColumnSpec "dte" "DTE" "number"
        New-ColumnSpec "exchange_code" "Exchange Code" "text"
        New-ColumnSpec "put_call" "P/C" "text"
        New-ColumnSpec "strike_price" "Strike" "number"
        New-ColumnSpec "marex_delta" "MAREX Delta" "number"
        New-ColumnSpec "previous_marex_delta" "Previous Marex Delta" "number"
        New-ColumnSpec "yyyy_mm" "YYYYMM" "text"
        New-ColumnSpec "marex_description" "Marex Description" "text"
        New-ColumnSpec "cme_excel_symbol" "CME Symbol" "text"
        New-ColumnSpec "cme_gas_lots" "CME Gas Lots" "number"
        New-ColumnSpec "qty" "QTY" "number"
        New-ColumnSpec "dod_qty" "DoD QTY" "number"
        New-ColumnSpec "acim" "ACIM" "number"
        New-ColumnSpec "pnt" "PNT" "number"
        New-ColumnSpec "dickson" "DICKSON" "number"
        New-ColumnSpec "titan" "TITAN" "number"
        New-ColumnSpec "marex_settle" "MAREX Settle" "number"
        New-ColumnSpec "previous_marex_settle" "Previous MAREX Settle" "number"
        New-ColumnSpec "change_between_settles" "Change between Settles" "number"
        New-ColumnSpec "pnl_from_settles" "PnL from Settles" "number"
    )
    "GAS_FUTURES_PIVOT" = @(
        New-ColumnSpec "sftp_date" "sftp_date" "date"
        New-ColumnSpec "sftp_upload_timestamp" "sftp_upload_timestamp" "datetime"
        New-ColumnSpec "source_table" "source_table" "text"
        New-ColumnSpec "reference_number" "reference_number" "text"
        New-ColumnSpec "account" "account" "text"
        New-ColumnSpec "source_account_key" "source_account_key" "text"
        New-ColumnSpec "account_code" "account_code" "text"
        New-ColumnSpec "account_lookup_status" "account_lookup_status" "text"
        New-ColumnSpec "source_exchange_name" "source_exchange_name" "text"
        New-ColumnSpec "exchange_name" "exchange_name" "text"
        New-ColumnSpec "exchange_route_code" "exchange_route_code" "text"
        New-ColumnSpec "route_family" "route_family" "text"
        New-ColumnSpec "is_product_record" "is_product_record" "logical"
        New-ColumnSpec "exchange_code" "exchange_code" "text"
        New-ColumnSpec "is_option" "is_option" "logical"
        New-ColumnSpec "put_call" "put_call" "text"
        New-ColumnSpec "strike_price" "strike_price" "number"
        New-ColumnSpec "marex_delta" "marex_delta" "number"
        New-ColumnSpec "contract_yyyymm" "contract_yyyymm" "text"
        New-ColumnSpec "contract_yyyymmdd" "contract_yyyymmdd" "date"
        New-ColumnSpec "contract_year" "contract_year" "whole"
        New-ColumnSpec "contract_month" "contract_month" "whole"
        New-ColumnSpec "contract_day" "contract_day" "whole"
        New-ColumnSpec "trade_date" "trade_date" "date"
        New-ColumnSpec "last_trade_date" "last_trade_date" "date"
        New-ColumnSpec "nav_product" "nav_product" "text"
        New-ColumnSpec "marex_description" "marex_description" "text"
        New-ColumnSpec "buy_sell" "buy_sell" "text"
        New-ColumnSpec "qty" "qty" "number"
        New-ColumnSpec "lots" "lots" "number"
        New-ColumnSpec "settlement_price" "settlement_price" "number"
        New-ColumnSpec "trade_price" "trade_price" "number"
        New-ColumnSpec "market_value" "market_value" "number"
        New-ColumnSpec "last_trade_date_filled" "last_trade_date_filled" "date"
        New-ColumnSpec "marex_delta_filled" "marex_delta_filled" "number"
        New-ColumnSpec "account_name" "account_name" "text"
        New-ColumnSpec "days_to_expiry" "days_to_expiry" "number"
        New-ColumnSpec "gas_qty" "gas_qty" "number"
        New-ColumnSpec "gas_lots" "gas_lots" "number"
        New-ColumnSpec "futures_contract_month" "futures_contract_month" "text"
        New-ColumnSpec "futures_contract_month_y" "futures_contract_month_y" "text"
        New-ColumnSpec "futures_contract_month_yy" "futures_contract_month_yy" "text"
        New-ColumnSpec "exchange_code_grouping" "exchange_code_grouping" "text"
        New-ColumnSpec "exchange_code_region" "exchange_code_region" "text"
        New-ColumnSpec "exchange_code_underlying" "exchange_code_underlying" "text"
        New-ColumnSpec "bbg_exchange_code" "bbg_exchange_code" "text"
        New-ColumnSpec "ice_xl_symbol" "ice_xl_symbol" "text"
        New-ColumnSpec "ice_xl_symbol_underlying" "ice_xl_symbol_underlying" "text"
        New-ColumnSpec "cme_excel_symbol" "cme_excel_symbol" "text"
        New-ColumnSpec "bbg_symbol" "bbg_symbol" "text"
        New-ColumnSpec "bbg_option_description" "bbg_option_description" "text"
    )
}

$loadedOutputTables = @(
    "SFTP_METADATA",
    "GAS_OPTIONS_PIVOT",
    "ICE_OPTIONS",
    "ICE_FUTURES",
    "ICE_SETTLES",
    "ICE_BALDAY",
    "GAS_OPTIONS",
    "GAS_FUTURES",
    "GAS_BALMO",
    "GAS_OPTIONS_OTHER"
)

$WorkbookPath = Resolve-RequiredPath $WorkbookPath "single-query test workbook"
if ($RestorePromotedMacroProject) {
    $MacroSourceWorkbookPath = Resolve-RequiredPath $MacroSourceWorkbookPath "macro source workbook"
}

$baseFormula = $null
if ($UpdateBaseQueryFormula) {
    $CompiledBaseSqlPath = Resolve-RequiredPath $CompiledBaseSqlPath "compiled base SQL"
    $baseSql = Get-Content -LiteralPath $CompiledBaseSqlPath -Raw
    $baseSql = Convert-DbtSqlToExcelOdbcSql $baseSql $DatabaseName
    $baseFormula = Convert-SqlToPowerQueryFormula $baseSql $OdbcConnectionString
}

$excel = $null
$workbook = $null
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.EnableEvents = $false
    $excel.AutomationSecurity = 3

    $workbook = $excel.Workbooks.Open($WorkbookPath, 0, $false)

    $baseSheet = Get-WorksheetByName $workbook $baseSheetName
    if (-not $baseSheet) {
        $baseSheet = $workbook.Worksheets.Add($workbook.Worksheets.Item(1))
        $baseSheet.Name = $baseSheetName
    }
    $baseSheet.Visible = -1
    $baseSheet.Tab.Color = New-ExcelColor 31 78 121

    $baseConnection = Get-WorkbookConnectionByName $workbook $baseConnectionName
    if (-not $baseConnection) {
        $connectionString = 'OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=NAV_EXCEL_BASE;Extended Properties=""'
        $commandText = "SELECT * FROM [NAV_EXCEL_BASE]"
        try {
            $baseConnection = $workbook.Connections.Add2(
                $baseConnectionName,
                "Connection to the NAV_EXCEL_BASE Power Query.",
                $connectionString,
                $commandText,
                2
            )
        }
        catch {
            $baseConnection = $workbook.Connections.Add(
                $baseConnectionName,
                "Connection to the NAV_EXCEL_BASE Power Query.",
                $connectionString,
                $commandText,
                2
            )
        }
    }

    $baseTable = Get-ListObjectByName $workbook $baseTableName
    if (-not $baseTable) {
        $legacyBaseTable = Get-ListObjectByName $workbook $baseQueryName
        if ($legacyBaseTable) {
            $legacyBaseTable.Name = $baseTableName
            $baseTable = $legacyBaseTable
        }
    }
    if (-not $baseTable) {
        $baseSheet.Cells.Clear()
        $baseTable = $baseSheet.ListObjects.Add(0, $baseConnection, $true, 1, $baseSheet.Range("A1"))
        $baseTable.Name = $baseTableName
    }

    $stagingSourceExpression = 'Excel.CurrentWorkbook(){[Name="' + $baseTableName + '"]}[Content]'
    foreach ($queryName in $queryColumns.Keys) {
        $localFormula = New-LocalPowerQueryFormula $queryName $queryColumns[$queryName] $stagingSourceExpression
        Set-WorkbookQueryFormula $workbook $queryName $localFormula
    }

    if ($UpdateBaseQueryFormula) {
        Set-WorkbookQueryFormula $workbook $baseQueryName $baseFormula
    }

    foreach ($worksheet in $workbook.Worksheets) {
        foreach ($listObject in $worksheet.ListObjects) {
            try {
                if ($listObject.QueryTable) {
                    $listObject.QueryTable.BackgroundQuery = $false
                    $listObject.QueryTable.PreserveFormatting = $true
                    $listObject.QueryTable.AdjustColumnWidth = $false
                    $listObject.QueryTable.RefreshStyle = 0
                }
            }
            catch {}
        }
    }

    $refreshWatch = [System.Diagnostics.Stopwatch]::StartNew()
    $baseTable.QueryTable.Refresh($false) | Out-Null
    $refreshWatch.Stop()
    $baseRowCount = if ($baseTable.DataBodyRange) { $baseTable.DataBodyRange.Rows.Count } else { 0 }
    Write-Output ("Refreshed {0}: rows={1}; seconds={2:n1}" -f $baseQueryName, $baseRowCount, $refreshWatch.Elapsed.TotalSeconds)

    $baseRowsByOutputTable = Get-BaseRowsByOutputTable $baseTable
    foreach ($queryName in $loadedOutputTables) {
        $listObject = Get-ListObjectByName $workbook $queryName
        if (-not $listObject) {
            throw "Workbook table not found: $queryName"
        }

        if ($RefreshDerivedPowerQueries -and $listObject.QueryTable) {
            try {
                $refreshWatch = [System.Diagnostics.Stopwatch]::StartNew()
                $listObject.QueryTable.Refresh($false) | Out-Null
                $refreshWatch.Stop()
                $rowCount = if ($listObject.DataBodyRange) { $listObject.DataBodyRange.Rows.Count } else { 0 }
                Write-Output ("Refreshed {0}: rows={1}; seconds={2:n1}" -f $queryName, $rowCount, $refreshWatch.Elapsed.TotalSeconds)
                continue
            }
            catch {
                Write-Output ("Derived Power Query refresh failed for {0}; populating from {1}. Detail: {2}" -f $queryName, $baseQueryName, $_.Exception.Message)
            }
        }

        $rows = @()
        if ($baseRowsByOutputTable.ContainsKey($queryName)) {
            $rows = @($baseRowsByOutputTable[$queryName].ToArray())
        }
        Set-ListObjectSourceData $listObject $rows $queryColumns[$queryName]
        try {
            if ($listObject.Sort.SortFields.Count -gt 0) {
                $listObject.Sort.Apply()
            }
        }
        catch {}
        $rowCount = if ($listObject.DataBodyRange) { $listObject.DataBodyRange.Rows.Count } else { 0 }
        Write-Output ("Populated {0} from {1}: rows={2}" -f $queryName, $baseQueryName, $rowCount)
    }

    foreach ($queryName in $queryColumns.Keys) {
        $localFormula = New-LocalPowerQueryFormula $queryName $queryColumns[$queryName]
        Set-WorkbookQueryFormula $workbook $queryName $localFormula
    }

    foreach ($worksheet in $workbook.Worksheets) {
        foreach ($listObject in $worksheet.ListObjects) {
            Format-ListObject $listObject ($listObject.Name -eq $baseTableName)
        }
    }

    Apply-WorkbookFormatting $excel $workbook

    $baseSheet.Activate() | Out-Null
    $baseSheet.Range("A2").Select() | Out-Null

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

if ($RestorePromotedMacroProject) {
    Restore-MacroProject $MacroSourceWorkbookPath $WorkbookPath
    Write-Output ("Restored macro project from: {0}" -f $MacroSourceWorkbookPath)
}
else {
    Write-Output "Workbook macro project preserved."
}

$stopwatch.Stop()
Write-Output ("Single-query workbook updated: {0}" -f $WorkbookPath)
Write-Output ("Total seconds: {0:n1}" -f $stopwatch.Elapsed.TotalSeconds)
