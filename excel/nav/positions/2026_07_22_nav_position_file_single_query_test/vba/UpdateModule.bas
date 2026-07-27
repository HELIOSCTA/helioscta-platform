Attribute VB_Name = "UpdateModule"
Option Explicit

Private Const BASE_TABLE_NAME As String = "NAV_EXCEL_BASE_TABLE"
Private Const BASE_CONNECTION_NAME As String = "Query - NAV_EXCEL_BASE"
Private Const CONNECTION_ONLY_PIVOT_QUERY As String = "Query - GAS_FUTURES_PIVOT"
Private Const RUN_REFRESH_ALL_REDUNDANCY As Boolean = True
Private Const RUN_STRICT_OUTPUT_TABLE_PASS As Boolean = False

Public Sub Update()
    Dim oldScreenUpdating As Boolean
    Dim oldEnableEvents As Boolean
    Dim oldDisplayAlerts As Boolean
    Dim oldCalculation As XlCalculation
    Dim oldStatusBar As Variant
    
    On Error GoTo CleanFail
    
    oldScreenUpdating = Application.ScreenUpdating
    oldEnableEvents = Application.EnableEvents
    oldDisplayAlerts = Application.DisplayAlerts
    oldCalculation = Application.Calculation
    oldStatusBar = Application.StatusBar
    
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.DisplayAlerts = False
    Application.Calculation = xlCalculationManual
    
    Debug.Print "NAV workbook update started: " & Format$(Now, "yyyy-mm-dd hh:nn:ss")
    
    Application.StatusBar = "Preparing NAV workbook refresh..."
    PrepareWorkbookRefresh
    
    Application.StatusBar = "Refreshing NAV_EXCEL_BASE..."
    RefreshListObjectByName BASE_TABLE_NAME, True
    WaitForPowerQueries
    
    If RUN_STRICT_OUTPUT_TABLE_PASS Then
        Application.StatusBar = "Refreshing NAV output tables in strict order..."
        RefreshOutputTables
        WaitForPowerQueries
    End If
    
    If RUN_REFRESH_ALL_REDUNDANCY Then
        Application.StatusBar = "Running defensive Refresh All..."
        ThisWorkbook.RefreshAll
        WaitForPowerQueries
    ElseIf Not RUN_STRICT_OUTPUT_TABLE_PASS Then
        Application.StatusBar = "Refreshing NAV output tables..."
        RefreshOutputTables
        WaitForPowerQueries
    End If
    
    Application.StatusBar = "Refreshing pivot source query..."
    RefreshWorkbookConnectionByName CONNECTION_ONLY_PIVOT_QUERY, False
    WaitForPowerQueries
    
    Application.StatusBar = "Refreshing pivot tables..."
    RefreshAllPivotTables
    
    Application.StatusBar = "Calculating workbook..."
    Application.CalculateFull
    
    ThisWorkbook.Save
    
    Debug.Print "NAV workbook update completed: " & Format$(Now, "yyyy-mm-dd hh:nn:ss")
    
CleanExit:
    RestoreApplicationState oldScreenUpdating, oldEnableEvents, oldDisplayAlerts, oldCalculation, oldStatusBar
    Exit Sub
    
CleanFail:
    Dim errNumber As Long
    Dim errDescription As String
    
    errNumber = Err.Number
    errDescription = Err.Description
    RestoreApplicationState oldScreenUpdating, oldEnableEvents, oldDisplayAlerts, oldCalculation, oldStatusBar
    
    If Application.Visible Then
        MsgBox "NAV workbook update failed: " & errDescription, vbExclamation, "NAV Workbook Update"
    End If
    Err.Raise errNumber, "UpdateModule.Update", "NAV workbook update failed: " & errDescription
End Sub

Private Sub RestoreApplicationState( _
    ByVal oldScreenUpdating As Boolean, _
    ByVal oldEnableEvents As Boolean, _
    ByVal oldDisplayAlerts As Boolean, _
    ByVal oldCalculation As XlCalculation, _
    ByVal oldStatusBar As Variant _
)
    On Error Resume Next
    Application.StatusBar = oldStatusBar
    Application.Calculation = oldCalculation
    Application.DisplayAlerts = oldDisplayAlerts
    Application.EnableEvents = oldEnableEvents
    Application.ScreenUpdating = oldScreenUpdating
    On Error GoTo 0
End Sub

Private Sub PrepareWorkbookRefresh()
    Dim conn As WorkbookConnection
    Dim ws As Worksheet
    Dim lo As ListObject
    
    For Each conn In ThisWorkbook.Connections
        ConfigureConnectionRefresh conn
    Next conn
    
    For Each ws In ThisWorkbook.Worksheets
        For Each lo In ws.ListObjects
            ConfigureListObjectRefresh lo
        Next lo
    Next ws
End Sub

Private Sub RefreshOutputTables()
    Dim tableName As Variant
    
    For Each tableName In OutputTableNames()
        RefreshListObjectByName CStr(tableName), True
    Next tableName
End Sub

Private Function OutputTableNames() As Variant
    OutputTableNames = Array( _
        "SFTP_METADATA", _
        "GAS_OPTIONS_PIVOT", _
        "ICE_OPTIONS", _
        "ICE_FUTURES", _
        "ICE_SETTLES", _
        "ICE_BALDAY", _
        "GAS_OPTIONS", _
        "GAS_FUTURES", _
        "GAS_BALMO", _
        "GAS_OPTIONS_OTHER" _
    )
End Function

Private Function RefreshListObjectByName(ByVal tableName As String, Optional ByVal required As Boolean = True) As Boolean
    Dim ws As Worksheet
    Dim lo As ListObject
    
    For Each ws In ThisWorkbook.Worksheets
        For Each lo In ws.ListObjects
            If StrComp(lo.Name, tableName, vbTextCompare) = 0 Then
                ConfigureListObjectRefresh lo
                On Error GoTo RefreshFailed
                lo.QueryTable.Refresh BackgroundQuery:=False
                RefreshListObjectByName = True
                Debug.Print "Refreshed query table: " & tableName
                Exit Function
            End If
        Next lo
    Next ws
    
    If required Then
        Err.Raise vbObjectError + 520, "UpdateModule.RefreshListObjectByName", "Required query table not found: " & tableName
    End If
    Exit Function
    
RefreshFailed:
    Err.Raise Err.Number, "UpdateModule.RefreshListObjectByName", "Failed refreshing query table " & tableName & ": " & Err.Description
End Function

Private Function RefreshWorkbookConnectionByName(ByVal connectionName As String, Optional ByVal required As Boolean = True) As Boolean
    Dim conn As WorkbookConnection
    
    For Each conn In ThisWorkbook.Connections
        If StrComp(conn.Name, connectionName, vbTextCompare) = 0 Then
            ConfigureConnectionRefresh conn
            conn.Refresh
            RefreshWorkbookConnectionByName = True
            Debug.Print "Refreshed workbook connection: " & connectionName
            Exit Function
        End If
    Next conn
    
    If required Then
        Err.Raise vbObjectError + 521, "UpdateModule.RefreshWorkbookConnectionByName", "Required workbook connection not found: " & connectionName
    End If
End Function

Private Function RefreshWorkbookConnectionContaining(ByVal queryName As String, Optional ByVal required As Boolean = True) As Boolean
    Dim conn As WorkbookConnection
    
    For Each conn In ThisWorkbook.Connections
        If InStr(1, conn.Name, queryName, vbTextCompare) > 0 Then
            ConfigureConnectionRefresh conn
            conn.Refresh
            RefreshWorkbookConnectionContaining = True
            Debug.Print "Refreshed workbook connection: " & conn.Name
            Exit Function
        End If
    Next conn
    
    If required Then
        Err.Raise vbObjectError + 522, "UpdateModule.RefreshWorkbookConnectionContaining", "Workbook connection not found for query: " & queryName
    End If
End Function

Private Sub ConfigureConnectionRefresh(ByVal conn As WorkbookConnection)
    On Error Resume Next
    
    Select Case conn.Type
        Case xlConnectionTypeOLEDB
            conn.OLEDBConnection.EnableRefresh = True
            conn.OLEDBConnection.BackgroundQuery = False
            conn.OLEDBConnection.RefreshOnFileOpen = False
            conn.OLEDBConnection.SavePassword = True
        Case xlConnectionTypeODBC
            conn.ODBCConnection.EnableRefresh = True
            conn.ODBCConnection.BackgroundQuery = False
            conn.ODBCConnection.RefreshOnFileOpen = False
            conn.ODBCConnection.SavePassword = True
    End Select
    
    On Error GoTo 0
End Sub

Private Sub ConfigureListObjectRefresh(ByVal lo As ListObject)
    On Error Resume Next
    
    lo.QueryTable.BackgroundQuery = False
    lo.QueryTable.RefreshStyle = xlOverwriteCells
    lo.QueryTable.SaveData = True
    lo.QueryTable.PreserveFormatting = True
    lo.QueryTable.AdjustColumnWidth = False
    
    On Error GoTo 0
End Sub

Private Sub WaitForPowerQueries()
    On Error Resume Next
    Application.CalculateUntilAsyncQueriesDone
    DoEvents
    On Error GoTo 0
End Sub

Public Sub RefreshAllPivotTables()
    Dim ws As Worksheet
    Dim pt As PivotTable
    Dim refreshCount As Long
    
    refreshCount = 0
    
    For Each ws In ThisWorkbook.Worksheets
        For Each pt In ws.PivotTables
            pt.PreserveFormatting = True
            pt.RefreshTable
            refreshCount = refreshCount + 1
        Next pt
    Next ws
    
    Debug.Print refreshCount & " pivot tables refreshed successfully."
End Sub

Public Sub RefreshODBCQueries()
    PrepareWorkbookRefresh
    RefreshListObjectByName BASE_TABLE_NAME, True
    WaitForPowerQueries
End Sub

Public Sub RefreshSingleQuery(ByVal queryName As String)
    PrepareWorkbookRefresh
    
    If Not RefreshListObjectByName(queryName, False) Then
        If StrComp(queryName, "NAV_EXCEL_BASE", vbTextCompare) = 0 Then
            If Not RefreshListObjectByName(BASE_TABLE_NAME, False) Then
                RefreshWorkbookConnectionByName BASE_CONNECTION_NAME, True
            End If
        Else
            RefreshWorkbookConnectionContaining queryName, True
        End If
    End If
    
    WaitForPowerQueries
End Sub

Public Sub ListAllConnections()
    Dim conn As WorkbookConnection
    
    Debug.Print "All Connection Names in Workbook:"
    Debug.Print "-------------------------------"
    
    For Each conn In ThisWorkbook.Connections
        Debug.Print "Connection Name: " & conn.Name
        Debug.Print "Connection Type: " & GetConnectionTypeName(conn.Type)
        PrintConnectionDetail conn
        Debug.Print "-------------------------------"
    Next conn
End Sub

Private Sub PrintConnectionDetail(ByVal conn As WorkbookConnection)
    On Error Resume Next
    
    Select Case conn.Type
        Case xlConnectionTypeOLEDB
            Debug.Print "Connection String: " & conn.OLEDBConnection.Connection
            Debug.Print "Command Text: " & conn.OLEDBConnection.CommandText
        Case xlConnectionTypeODBC
            Debug.Print "Connection String: " & conn.ODBCConnection.Connection
            Debug.Print "Command Text: " & conn.ODBCConnection.CommandText
        Case Else
            Debug.Print "Connection String: <not OLEDB/ODBC>"
    End Select
    
    On Error GoTo 0
End Sub

Public Function GetConnectionTypeName(ByVal connType As XlConnectionType) As String
    Select Case connType
        Case xlConnectionTypeODBC
            GetConnectionTypeName = "ODBC"
        Case xlConnectionTypeOLEDB
            GetConnectionTypeName = "OLEDB"
        Case xlConnectionTypeXMLMAP
            GetConnectionTypeName = "XMLMAP"
        Case xlConnectionTypeTEXT
            GetConnectionTypeName = "TEXT"
        Case xlConnectionTypeWEB
            GetConnectionTypeName = "WEB"
        Case Else
            GetConnectionTypeName = "Other (" & connType & ")"
    End Select
End Function
