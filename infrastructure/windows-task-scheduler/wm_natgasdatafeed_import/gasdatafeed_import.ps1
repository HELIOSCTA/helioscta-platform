<#
.SYNOPSIS
    Script to import gas data feed.

.DESCRIPTION
    This script imports gas data feed from various woodmac sources into a database.
    It supports different source types and can handle optional parameters for source names and logging.
    Please find the main list of commands:
    
    - gasdatafeed_import.ps1 -sourceType metadata -writeLog true -Verbose
    - gasdatafeed_import.ps1 -sourceType hourly -writeLog true -Verbose

    - gasdatafeed_import.ps1 -sourceType delta -sourceName all_cycles -writeLog true -Verbose
    - gasdatafeed_import.ps1 -sourceType delta -sourceName nominations -writeLog true -Verbose
    - gasdatafeed_import.ps1 -sourceType delta -sourceName no_notice -writeLog true -Verbose
    - gasdatafeed_import.ps1 -sourceType delta -sourceName gas_burn -writeLog true -Verbose
    - gasdatafeed_import.ps1 -sourceType delta -sourceName gas_quality -writeLog true -Verbose
    - gasdatafeed_import.ps1 -sourceType delta -writeLog true -Verbose

    - gasdatafeed_import.ps1 -sourceType baseline -sourceName gas_quality -writeLog true -Verbose
    - gasdatafeed_import.ps1 -sourceType baseline -sourceName all_cycles -writeLog true -Verbose
    - gasdatafeed_import.ps1 -sourceType baseline -sourceName nominations -writeLog true -Verbose
    - gasdatafeed_import.ps1 -sourceType baseline -sourceName no_notice -writeLog true -Verbose
    - gasdatafeed_import.ps1 -sourceType baseline -sourceName gas_burn -writeLog true -Verbose
    - gasdatafeed_import.ps1 -sourceType baseline -writeLog true -Verbose

.VERSION
    4.0.1

.AUTHOR
    Woodmac Dev Team

.DATE
    2025-03-04

#>
param (
    # Mandatory Param
    [Parameter(Mandatory=$true)]
    [ValidateNotNullOrEmpty()]
    [ValidateSet('delta','hourly','metadata','baseline')]
    [string] $sourceType,

    # Optional Param
    [Parameter(Mandatory=$false)]
    [ValidateSet('alabama_intrastate_storage','all_cycles','gas_burn','gas_production_forecast','gas_quality','gasdatafeed_metadata','illinois_intrastate_storage','index_of_customers',
                 'intrastate_storage','lng','lng_shipping','mexico_exports','michigan_intrastate_storage','ngpl_storage_breakout','no_notice',
                 'nominations','pipeline_inventory','proprietary_metadata')]
    [string] $sourceName,

    # Optional Param to write logs to file to debug
    [Parameter(Mandatory=$false)]
    [string] $writeLog,

    # Optional Param to keep temp files to debug
    [Parameter(Mandatory=$false)]
    [string] $keepTempFiles,

    # Optional Param to disable old log removal
    [Parameter(Mandatory=$false)]
    [string] $keepAllLogs

)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

###### Start logging and folder creation #########
. "$PSScriptRoot\gasdatafeed_merge_sql_scripts.ps1"

$configFile = (Join-Path $PSScriptRoot 'gasdatafeed_import.json')
$config = (Get-Content -Raw -Path $configFile)| ConvertFrom-Json -Verbose

$runId = "datafeed_" + [System.Guid]::NewGuid().ToString()
$currentDate = Get-Date -Format "yyyyMMddHHmmss"
$logFile = "$($config.working_path)\$runId\gasdatafeed_import_$currentDate.log" 
$workingPath = "$($config.working_path)\$runId\"

if(-not (Test-Path $workingPath)){
    New-Item -ItemType Directory -Path $workingPath
}

# Suppress progress bars could improve performance
$ProgressPreference = 'SilentlyContinue'

###########################################################
# Function: Write-Log
# Description: Writes a message to the log file.
# Parameters:
# - [string]$message: The message to write to the log file.
# Returns: None
###########################################################
function Write-Log {
    param (
        [string]$message
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
    $logMessage = "$timestamp - $message"
    if($writeLog -eq "true") {
        Write-Output $logMessage | Out-File -FilePath $logFile -Append
    }    
    Write-Verbose $logMessage
}

############################################################################################################
# Function: Get-TimeSeriesPairs
# Description: Generates a list of time series pairs based on the last insert date.
# Parameters:
# - [datetime] $lastInsertDate: The date of the last insert.
# - [int] $hours: The number of hours to generate time series pairs for.
# Returns: An array of time series pairs.
############################################################################################################
function Get-TimeSeriesPairs([datetime] $lastInsertDate, [int] $hours = 1)
{    
    Write-Log -Message "SourceType: $sourceType"
    Write-Log -Message "lastInsertDate: $lastInsertDate"

	# Define the start date
	$startDate = $lastInsertDate
    # Define the target date
	$targetDate = (Get-Date).ToUniversalTime()
    $targetDate = $targetDate.AddSeconds(-$targetDate.Second)
    Write-Log -Message "Target Date: $targetDate"

	# Initialize an array to hold the time series pairs
	$timeSeriesPairs = @()

	# Loop to generate the time series pairs
	while ($startDate -lt $targetDate) {
        $minutesDiff = ($targetDate - $startDate).TotalMinutes
        if ($hours -eq 1 -and $minutesDiff -gt 59 -and $minutesDiff -lt 180) {
            $endTime = $startDate.AddMinutes(180)
        } else {
            $endTime = $startDate.AddHours($hours)
        }
		$timeSeriesPairs += @{
			StartTime = $startDate
			EndTime   = $endTime
		}
		$startDate = $endTime
	}
    Write-Log -Message "TimeSeriesPairs Length: $($timeSeriesPairs.Count)"
	return $timeSeriesPairs
}

#####################################################################
# Function: Invoke-ApiRequestWithTimeout
# Description: Invokes an API request with a timeout.
# Parameters:
# - [string]$Uri: The URL of the API endpoint.
# - [System.Collections.IDictionary] $headers: The headers to include in the request.
# - [int]$TimeoutSeconds: The timeout in seconds for the request.
# Returns: The response from the API request.
###################################################################
function Invoke-ApiRequestWithTimeout {
    param (
        [string]$uri,
        [System.Collections.IDictionary] $headers
    )

    $apiTimeout = 300
    if ($url -like '*files-datasets*' -or $sourceType -eq "baseline") {
        $apiTimeout = 3600
    }

    Write-Log -Message "API request: $uri"
    $job = Start-Job -ScriptBlock {
        param ($uri, $headers, $apiTimeout)
        # Invoke the API request
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $ProgressPreference = 'SilentlyContinue'
            if (-not [string]::IsNullOrEmpty($uri)) {
                $response = Invoke-WebRequest -UseBasicParsing -Uri $uri -Headers $headers -Method Get -TimeoutSec $apiTimeout
            }
            return $response
        } catch {
            $errorResponse = New-Object PSObject -Property @{
                StatusCode = $_.Exception.Response.StatusCode.Value__
                StatusDescription = $_.Exception.Response.StatusDescription
            }
            return $errorResponse
        }
    } -ArgumentList $uri, $headers, $apiTimeout

    if (Wait-Job -Job $job -Timeout $apiTimeout) {
        try {
            $result = Receive-Job -Job $job
            Remove-Job -Job $job
            return $result
        } catch {
            Write-Log -Message "Error receiving job result: $($_.Exception.Message)"
            throw $_.Exception
        }
    } else {
        Stop-Job -Job $job
        Remove-Job -Job $job
        Write-Log -Message "API request timed out after $apiTimeout seconds"
    }
}

#############################################################################################################
# Function: Get-FileUrl
# Description: Get the file URL from the API
# Parameters:
# - [string] $BaseUrl: The base URL of the API.
# - [System.Collections.IDictionary] $Headers: The headers to include in the request.
# - [System.Collections.IDictionary] $Params: The parameters to include in the request.
# - [string] $ApiPath: The path to the API endpoint.
# - [string] $OutputFile: The path to the output file.
# - [string] $SourceType: The type of the data source.
# - [int] $Counter: The counter to use for pagination.
# Returns: None
#############################################################################################################
function Get-BlobCSVFile([string] $fileUrl, [string] $outputDir, [string] $apiUrl, [System.Collections.IDictionary] $headers,[string] $sourceType)
{
    $fileName = ""
    # Get File Name from the URL
    if($sourceType -eq "baseline" -or $fileUrl -like '*.zip*') {
        # Get the file name from the URL
        $uri = $fileUrl.split('?')[0]
        $uriParts = $uri.split('/')
        $fileName = $uriParts[-1]
        $outputFile = $outputDir + $uriParts[-1]

        # Check if the fileUrl is expired
        $queryString = [System.Web.HttpUtility]::ParseQueryString($fileUrl.Split('?')[1])
        $expirationTime = $queryString["se"]
        if($expirationTime){
            $expirationTime = [DateTime]::ParseExact($expirationTime, "yyyy-MM-ddTHH:mm:ssZ",[Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal).ToUniversalTime()
            $currentDateTime = [DateTime]::UtcNow
            $timeDiff = $expirationTime - $currentDateTime
            Write-Log -Message "BlobUrl is valid for next $($timeDiff.TotalMinutes) minutes"
            if($timeDiff.TotalMinutes -lt 1) {
                Write-Log -Message "Blob URL for file $FileName is expired. Requesting: $($apiUrl)"            
                $response = Invoke-ApiRequestWithTimeout -Uri $apiUrl -Headers $headers
                # if response code is not 200, log the error and throw an exception
                if($response.StatusCode -ne 200) {
                    Write-Log -Message "Error downloading CSV file from $apiUrl. Status Code: $($response.StatusCode)"
                    throw "Error downloading CSV file from $apiUrl. Status Code: $($response.StatusCode)"
                }
                $blobs = $response | ConvertFrom-Csv               
                $filteredBlobs = $blobs | Where-Object { $_.BlobUrl -like "*$fileName*" }
                # Get fileUrl from the filtered Blobs
                foreach ($blob in $filteredBlobs) {
                    $blobUrl = $blob.BlobUrl
                    $uri = $blobUrl.split('?')[0]
                    $uriParts = $uri.split('/')
                    if($fileName -eq $($uriParts[-1])){
                        $fileUrl = $blobUrl # Replace with Updated URL
                        Write-Log -Message "Updated Url $fileUrl"
                    }
                }
            }
        }
    }
         
    # Download the file
    Write-Log -Message "Blob URL: $fileUrl"
    Write-Log -Message "Output File: $outputFile"
    $webClient = New-Object System.Net.WebClient
    try {
        $webClient.DownloadFile($fileUrl, $outputFile)
    }
    catch {
        Write-Log -Message "Error downloading CSV file from $fileUrl $($_.Exception.Message)"
        Write-Log -Message "$($_.InvocationInfo | Format-List -Force | Out-String)"
        return $false
    }
    finally {
        $webClient.Dispose()
    }    
    if ($fileUrl -like '*.zip*') {
        Expand-ZIPFile $outputFile $workingPath        
    }
    return $true    
} 

############################################################################################################
# Function: Get-FileUrl
# Description: Get the file URL from the API
# Parameters:
# - [string] $BaseUrl: The base URL of the API.
# - [System.Collections.IDictionary] $Headers: The headers to include in the request.
# - [System.Collections.IDictionary] $Params: The parameters to include in the request.
# - [string] $ApiPath: The path to the API endpoint.
# - [string] $OutputFile: The path to the output file.
# - [string] $SourceType: The type of the data source.
# - [int] $Counter: The counter to use for pagination.
# Returns: None
############################################################################################################
function Get-CsvFile([string] $baseUrl, [System.Collections.IDictionary] $Headers, [System.Collections.IDictionary] $params, [string] $apiPath, [string] $OutputFile, [string] $sourceType, [int] $counter = 1)
{   
    $flag = $false 
    $offset=0    
    $i=$counter
    $params["offset"] = $offset
    $retryCount = 0
    $MAX_RETRY_COUNT = 5
    $RETRY_DELAY = 5
    $LIMIT=$params["limit"]
    

    while ($retryCount -lt $MAX_RETRY_COUNT)
    {   
        $blobUrl = ""
        try
        { 
            # Convert the dictionary to a query string
            $queryString = [System.Web.HttpUtility]::ParseQueryString('')
            foreach ($key in $params.Keys) {
                $queryString.Add($key, $params[$key])
            } 
            $decodedQueryString = [System.Web.HttpUtility]::UrlDecode($queryString.ToString())
            if($apiPath -like '*files-datasets*'){
                $apiUrl = $baseUrl+ "/" + $apiPath+"&"+$decodedQueryString.ToString()
            } else {
                $apiUrl = $baseUrl+ "/" + $apiPath+"?"+$decodedQueryString.ToString()
            }
            
            $response = Invoke-ApiRequestWithTimeout -Uri $apiUrl -Headers $headers
           
            # if response code is not 200, log the error and throw an exception
            if($response.StatusCode -ne 200) {
                Write-Log -Message "Error downloading CSV file from $apiUrl. Status Code: $($response.StatusCode)"
                # if response code is a 403, return so that the script can continue with the next source
                if($response.StatusCode -eq 403) {
                    return $flag
                }
                throw "Error downloading CSV file from $apiUrl. Status Code: $($response.StatusCode)"
            }


            $responseContent = $response.Content
            $responseContent = $responseContent -replace "`r`n", "`n"

            ## Loop through the response content and download the files-datasets
            if($apiUrl -like '*files-datasets*') {
                $blobs = $responseContent | ConvertFrom-Csv
                $flag = $true
                foreach ($blob in $blobs) {
                    $blobUrl = $blob.BlobUrl
                    $blobFlag = Get-BlobCSVFile -FileUrl $blobUrl -OutputDir $workingPath -ApiUrl $apiUrl -Headers $headers -sourceType $sourceType 
                    if($blobFlag -eq $false) {
                        $flag = $false
                        break
                    }
                }
                return $flag
            }
            
            if($responseContent.Length -gt 0) {                
                # Split the string into an array of lines
                $lines = $responseContent.Split("`n")
                # remove empty lines
                $lines = $lines | Where-Object { $_.trim() -ne "" }
                # Remove the first line
                if($i -ne 1) {
                    $responseContent = $lines[1..($lines.Count - 1)] 
                }
                else {
                    $responseContent = $lines 
                }
            }
            Add-Content -Path $OutputFile -Value $responseContent -Encoding UTF8
            $offset = $offset + $LIMIT
            $params["offset"] = $offset
            $i = $i + 1
            $flag = $true
            if ($responseContent.Length -lt $LIMIT) {
                break
            }
        }
        catch
        {
            Write-Log -Message "Error downloading CSV file from $blobUrl $($_.Exception.Message)"
            Write-Log -Message "$($_.InvocationInfo | Format-List -Force | Out-String)"
            $retryCount++            
            if ($retryCount -lt $MAX_RETRY_COUNT) {
                Write-Log -Message "Retrying in $RETRY_DELAY seconds..."
                Start-Sleep -Seconds $RETRY_DELAY                                
            } else {
                Write-Log -Message "Failed to download CSV file from $blobUrl after $MAX_RETRY_COUNT attempts. $($_.Exception.Message)"
            }
        }
    }
    Write-Log -Message "Output file location: $($OutputFile)"
    return $flag
}

########################################################################
# Function: Execute-SqlQuery
# Description: Executes a SQL query.
# Parameters:
# - [string]$sqlQuery: The SQL query to execute.
# Returns: None
########################################################################
function Execute-SqlQuery {
    param (
        [string]$sqlQuery
    )
    Write-Log -message "Executing $sqlQuery"
    $retryCount = 0
    $MAX_RETRY_COUNT = 3
    $RETRY_DELAY = 5
    while ($retryCount -lt $MAX_RETRY_COUNT) {
        $conn = New-Object System.Data.SqlClient.SqlConnection($connString)
        $conn.Open()
        try {
                
            $cmd = $conn.CreateCommand()
            $cmd.CommandText = $sqlQuery
            $cmd.CommandTimeout = 3000
            $cmd.ExecuteNonQuery()
            $conn.Close()
            break
        }            
        catch 
        {
            Write-Log -message "Error executing SQL query: $($_.Exception.Message)"
            $retryCount++
            if ($retryCount -lt $MAX_RETRY_COUNT) {
                Write-Log -message "Retrying in $RETRY_DELAY seconds..."
                Start-Sleep -Seconds $RETRY_DELAY                
            } else {
                Write-Log -Message "SQL query failure in Execute-SqlQuery: $($_.Exception.Message)"
                throw $_.Exception
            }
        }  
    }
}

############################################################################################################
# Function: Import-CsvToSqlTable
# Description: Imports a CSV file into a SQL table.
# Parameters:
# - [string]$InstanceName: The name of the SQL Server instance.
# - [string]$Database: The name of the database.
# - [string]$SourceFile: The path to the CSV file to import.
# - [string]$SqlDataType: The data type to use for the SQL table columns.
# - [pscredential]$SqlCred: The credentials to use to connect to the SQL Server.
# - [string]$StagingTableName: The name of the staging table to create.
# - [string]$BatchSize: The number of rows to insert in each batch.
# - [string]$Delimiter: The delimiter used in the CSV file.
# - [string]$CreatedTimestampFormat: The format of the created timestamp column.
# - [bool]$ColumnNameChange: A flag indicating whether to change the column names to snake case.
# Returns: None
############################################################################################################
function Import-CsvToSqlTable {
    [CmdletBinding()]
    param([string] $instanceName
        , [string] $database
        , [string] $sourceFile
        , [string] $sqlDataType = 'VARCHAR(255)'
        , [pscredential] $sqlCred
        , [string] $sourceType
        , [string] $batchSize
        , [string] $delimiter
        , [string] $createdTimestampFormat
        , [string] $sourceName 
        , [bool] $columnNameChange = $true
    )

    $StagingTableName = $sourceName + "_Temp"
    if($loadType -ne "incremental"){
        $StagingTableName = "CsvToSqlTemp" ## For hourly and metadata sourceTypes
    } else {
        $StagingTableName = $StagingTableName.Replace("-", "_") ## For baseline and delta sourceTypes
    }    

    $elapsed = [System.Diagnostics.Stopwatch]::StartNew()
    [void][Reflection.Assembly]::LoadWithPartialName("System.Data")
    [void][Reflection.Assembly]::LoadWithPartialName("System.Data.SqlClient")
    $firstRowColumnNames = $true

    $headerRow =  Get-Content -Path $sourceFile -First 1
    if($headerRow -eq $null){
        Write-Log -Message "No data found, Skipping import"
        break
    }

    if($columnNameChange -eq $true){
        ## Only API Logic         
        Write-Log -Message "PascalCase Headers: $($headerRow)"
        $newHeadersArr = $headerRow.Split(",") | ForEach-Object {  ConvertTo-SnakeCase $_  }
        $newHeaders = $newHeadersArr -join ','
        $newHeaders = $newHeaders.TrimEnd(',')
        Write-Log -Message "SnakeCase Headers: $($newHeaders)"         
    } else {
        $newHeadersArr = $headerRow.Split("|")
    }
    Write-Log -Message "Headers replaced with snake case"
    #Check file existence. Should be a csv
    if (-not (Test-Path $sourceFile) -and $sourceFile -notlike '*.csv') {
        Write-Log -Message "Invalid file: $sourceFile"
    }

    try {
        if ($sqlCred) {
            $userName = $sqlCred.UserName
            $userPass = $sqlCred.GetNetworkCredential().Password
            $connectionstring = "Data Source=$instanceName;Initial Catalog=$database;User Id=$userName;Password=$userPass;TrustServerCertificate=True;Encrypt=True"
        } else {
            $connectionstring = "Data Source=$instanceName;Integrated Security=true;Initial Catalog=$database;TrustServerCertificate=True;Encrypt=True"
        }

        # Create the datatable, and autogenerate the columns
        $dataTable = New-Object System.Data.DataTable

        if ($newHeadersArr.Length -eq 0) {
            Write-Log -Message "No data found, Skipping import"
            break
        }

        # get header and cleanup names to be used column names
        $reader = New-Object System.IO.StreamReader($sourceFile)
        $columns = $newHeadersArr
        Write-Log -Message "SnakeCase Headers: $($columns)"
        if ($firstRowColumnNames -eq $true) {
            $null = $reader.readLine()
        }
        
        #Build create table statement if target table does not exist
        $sql = @("IF EXISTS (SELECT 1 FROM sys.tables WHERE name  = '$StagingTableName') DROP TABLE [$StagingTableName];")
        $sql += ("CREATE TABLE [$StagingTableName]($($columns[0]) $sqlDataType `n")
        $columns[1..$columns.Length] | ForEach-Object {
            if($_ -eq "std_scheduling_cycle_id" -or $_ -eq "scheduling_cycle_id" -or $_ -eq "pipeline_id" -or $_ -eq "type"  -or $_ -eq "name" -or $_ -eq "cycle_code" -or $_ -eq "week_ending_date"){
                $sql += ",$_ $sqlDataType default '' `n"
            } else {
                $sql += ",$_ $sqlDataType `n"
            }
        }
        
        if ($sourceType -eq "baseline" -and $columns -notcontains "insert_date") {
            $sql += ",insert_date datetime `n"
        }

        # Add created_timestamp column in temp table if not exists in source file
        if ($columns -notcontains "created_timestamp") {
            if($createdTimestampFormat -like '*zzz'){
                $sql += ",created_timestamp varchar(30) default format(GETUTCDATE(), 'yyyy-MM-ddTHH:mm:sszzz') `n"
            } else {
                $sql += ",created_timestamp datetime default format(GETUTCDATE(), 'yyyy-MM-ddTHH:mm:ss') `n"
            }
        }

        # Add update_timestamp column in temp table if not exists in source file
        if ($columns -notcontains "update_timestamp") {
            $sql += ",update_timestamp varchar(30) default format(GETUTCDATE(), 'yyyy-MM-ddTHH:mm:ss') `n"
        }

        $sql += ");"
        $sql = $sql -join "`n"
        # Create Temp table
        Execute-SqlQuery -SqlQuery $sql
        
        foreach ($column in $columns) {
            $null = $dataTable.Columns.Add()
        }

        if ($sourceType -eq "baseline" -and $columns -notcontains "insert_date") {
            $null = $dataTable.Columns.Add()
        }

        ## Bulk Copy Begin
        $bulkCopy = New-Object Data.SqlClient.SqlBulkCopy($connectionstring, [System.Data.SqlClient.SqlBulkCopyOptions]::TableLock)
        $bulkCopy.DestinationTableName = $StagingTableName
        $bulkCopy.bulkcopyTimeout = 0
        $bulkCopy.batchSize = $batchSize
        $bulkCopy.EnableStreaming = 1

        $i = 0
        # Read in the data, line by line
        while ($null -ne ($line = $reader.ReadLine() )) {
            $rowData = $line.Split($delimiter)
            if ($sourceType -eq "baseline" -and $columns -notcontains "insert_date") {
                $index = $columns.IndexOf("update_timestamp")
                $insertDate = $rowData[$index]
                $rowData += $insertDate
            }
            $null = $dataTable.Rows.Add($rowData)
            $i++ 
            if (($i % $batchSize) -eq 0) { 
                $bulkCopy.WriteToServer($dataTable)
                Write-Log -Message "$i rows have been inserted in $($elapsed.Elapsed.ToString())."
                $dataTable.Clear()
            }
        }

        # Add in all the remaining rows since the last clear
        if($dataTable.Rows.Count -gt 0) {
            $bulkCopy.WriteToServer($dataTable)
            Write-Log -Message "$i rows have been inserted in $($elapsed.Elapsed.ToString())."
            $dataTable.Clear()
        }

        # Call load proc to merge data
        Write-Log -Message "-------Merge-Load Call-------"
        Write-Log -Message "Merge-Load Call: sourceName: $sourceName sourceType: $sourceType"
        Write-Log -Message "Merge-Load call: outputFile: $outputFile loadType: $loadType loadId: $loadId"

        # some sources need to load multiple files using their stored procedure parameter
        if ($loadType -eq "multi-file" -or $loadType -eq "single") {
            Merge-LoadFromTemp -LoadProc $loadProc -ProcParam $configInfo.legacy_name -LoadType $loadType -sourceType $sourceType -TempTable $StagingTableName -sourceName $sourceName
            $rowsProcessed = $i
        }
        else {
            $rowsProcessed = Merge-LoadFromTemp -LoadProc $loadProc -ProcParam $null -LoadType $loadType -sourceType $sourceType -TempTable $StagingTableName -sourceName $sourceName
        }

        # update the load status record with the rows processed
        if ($rowsProcessed -gt 0) {
            if ($loadType -eq "incremental") {
                $cursor = "select max(cast(insert_date as datetime)) as max_file_date from [$StagingTableName]"
            } else {
                $cursor = "GETUTCDATE()" 
            }
            $sqlQuery = "UPDATE natgas.load_status SET processed = 1, row_count = $rowsProcessed, update_date=GETUTCDATE(), file_date = ($cursor) WHERE load_id = $loadId;"                           
            Execute-SqlQuery -SqlQuery $sqlQuery
        }

        # drop temp table
        $sqlQuery = $("IF EXISTS (SELECT 1 FROM sys.tables WHERE name  = '$StagingTableName') DROP TABLE [$StagingTableName];")

        Write-Log -Message "Script complete. $i rows have been inserted into the database."
    }
    catch {        
        Write-Log -message "Exception in Import-CsvToSqlTable: $($_.Exception)"
        Write-Log -message "Exception in Import-CsvToSqlTable: $($_.Exception.Message)"
        Write-Log -Message "$($_.InvocationInfo | Format-List -Force | Out-String)"
    }
    finally {
        if($reader) { $reader.Close() }
        if($reader) { $reader.Dispose() }
        if($writer) { $writer.Close() }
        if($writer) { $writer.Dispose() }
        if($bulkCopy) { $bulkCopy.Close() }
        if($bulkCopy) { $bulkCopy.Dispose() }
        if($dataTable) { $dataTable.Dispose() } 
        Write-Log -Message "Total Elapsed Time: $($elapsed.Elapsed.ToString())"
        # Sometimes the Garbage Collector takes too long to clear the huge datatable.
        [System.GC]::Collect()
    }
}

###########################################################
# Function: Merge-LoadFromTemp
# Description: Merges the data from the staging table into the target table.
# Parameters:
# - [string]$LoadProc: The name of the stored procedure to run.
# - [string]$ProcParam: The parameter to pass to the stored procedure.
# - [string]$LoadType: The type of load to perform (incremental/single/multi-file).
# - [string]$SourceType: The type of the data source. (baseline/hourly/daily)
# - [string]$tempTable: The name of the staging table.
# - [string]$sourceName: The name of the data source.
# Returns: The number of rows processed by the stored procedure.
###########################################################
function Merge-LoadFromTemp ([string] $loadProc, [string] $procParam, [string] $loadType, [string] $sourceType, [string] $tempTable, [string] $sourceName)
{
    Write-Log -Message "Merge-LoadFromTemp: loadProc: $loadProc, loadType: $loadType, sourceType: $sourceType, tempTable: $tempTable, sourceName: $sourceName"
    $mergeQuery = Get-MergeSqlScripts -sourceName $sourceName -tempTable $tempTable -sourceType $sourceType
    $retryCount = 0
    $MAX_RETRY_COUNT = 3
    $RETRY_DELAY = 5
    $rowsProcessed = $null

    while ($retryCount -lt $MAX_RETRY_COUNT) {
        Write-Log -Message "Merge-LoadFromTemp: Attempt $retryCount"
        try {
            $conn = New-Object System.Data.SqlClient.SqlConnection($connString)
            $conn.Open()
            $cmd = $conn.CreateCommand()
            $cmd.CommandTimeout = 10000;

            # check for $null procParam, if provided, its a multi-file load
            if ($procParam -and $loadType -eq "multi-file") {
                Write-Log -Message "Running Stored Procedure - $loadProc - $procParam"
                $cmd.CommandText = "$loadProc"
                $cmd.CommandType = [System.Data.CommandType]::StoredProcedure
                $Param = $cmd.Parameters.Add("@FileName", [Data.SqlDbType]::VarChar)
                $Param.Direction = [Data.ParameterDirection]::Input
                $Param.Value = $procParam
                $cmd.ExecuteNonQuery()
            } 
            elseif ($loadType -eq "single") {
                Write-Log -Message "Running Stored Procedure - $loadProc"
                $cmd.CommandText = "$loadProc"
                $cmd.CommandType = [System.Data.CommandType]::StoredProcedure
                $cmd.ExecuteNonQuery()
            }
            else {
                $Param = $cmd.Parameters.Add("@sourceType", [Data.SqlDbType]::VarChar)
                $Param.Direction = [Data.ParameterDirection]::Input
                $Param.Value = $sourceType

                Write-Log -Message "Running Dynamic SQL - $mergeQuery"
                $cmd.CommandText = $mergeQuery
                $rowsProcessed = $cmd.ExecuteScalar()
                Write-Log -Message "$rowsProcessed rows processed."
            }
            break
        }
        catch {
          Write-Log -message "Error executing SQL query: $($_.Exception.Message)"
          Write-Log -Message "$($_.InvocationInfo | Format-List -Force | Out-String)"
          $retryCount++
          if ($retryCount -lt $MAX_RETRY_COUNT) {
                Write-Log -message "Retrying in $RETRY_DELAY seconds..."
                Start-Sleep -Seconds $RETRY_DELAY
          } else {
                Write-Log -message "Exception in Merge-LoadFromTemp: $($_.Exception.Message)"
                throw $_.Exception
          }
        }
    }
    return $rowsProcessed
}

###########################################################
# Function: ConvertTo-SnakeCase
# Description: Converts a string to snake case.
# Parameters:
#  - [string]$Value: The string to convert to snake case.
# Returns: The string in snake case.
###########################################################
function ConvertTo-SnakeCase {
    [OutputType('System.String')]
    param (
        [Parameter(Position=0)]
        [string] $value
    )
    $value = [regex]::replace($value, '(?<=.)(?=[A-Z])', '_').ToLower()
    $value = [regex]::replace($value, '([a-zA-Z])(\d)', '$1_$2') # To convert ferc720 into ferc_720
    return $value
}

###########################################################
# Function: ConvertTo-CsvPipeDelimited
# Description: Converts a CSV file to a pipe-delimited file.
# Parameters:
#  - [string]$QuotedFile: The path to the CSV file to convert.
#  - [string]$OutFile: The path to the output file.
# Returns: None
###########################################################
function ConvertTo-CsvPipeDelimited ([string] $quotedFile, [string] $outFile)
{
    Add-Type -AssemblyName Microsoft.VisualBasic

    if ((-not (Test-Path $quotedFile)) -and ($quotedFile.Length/1KB -le 1)) {
        Write-Log -Message "Invalid File: $quotedFile"
        return
    }    
    try {
        ## Only API Logic
        $headerRow = Get-Content -Path $quotedFile -TotalCount 1 
        Write-Log -Message "PascalCase Headers: $($headerRow)"
        $newHeaders = $headerRow.Split(",") | ForEach-Object {  ConvertTo-SnakeCase $_  }
        $newHeaders = $newHeaders -join ','
        $newHeaders = $newHeaders.TrimEnd(',')
        Write-Log -Message "SnakeCase Headers: $($newHeaders)"
        
        # Read the file content and replace the first line
        (Get-Content $quotedFile) | ForEach-Object {
            if ($_.ReadCount -eq 1) {
                $newHeaders
            } else {
                $_
            }
        } | Set-Content $quotedFile

        $reader = New-Object -TypeName Microsoft.VisualBasic.FileIO.TextFieldParser -ArgumentList $quotedFile
        $writer = new-object System.IO.StreamWriter $outFile

        #Default values, but wanted to show the options
        $reader.Delimiters = @(",")
        $reader.HasFieldsEnclosedInQuotes = $true
        $reader.TrimWhiteSpace = $true

        while ( !$reader.EndOfData ) {
            $fields = $reader.ReadFields()
            $writer.WriteLine([string]::join('|', $fields))
        }
    } 
    finally{
        if ($reader) { $reader.close() }
        if ($reader) { $reader.Dispose() }
        if ($writer) { $writer.close() }        
        if ($writer) { $writer.Dispose() }
    }
}

##########################################################
# Function: Expand-ZIPFile
# Description: Unzips a ZIP file to a specified destination.
# Parameters:
# - [string]$file: The path to the ZIP file to unzip.
# - [string]$destination: The path to the directory where the ZIP file should be unzipped.
# Returns: None
##########################################################
function Expand-ZIPFile($file, $destination)
{
    ## Supports PS 5.0 and above
    Expand-Archive $file -DestinationPath $destination 
}

############################################################
# Description: processes the data and performs necessary operations to ensure the data is correctly imported.
# Parameters: connection string, stored procedure name, stored procedure parameters, load type, source type
# Returns: the number of rows processed by the stored procedure
# ###########################################################
function Use-SqlQuery($connString, $sqlQuery)
{
    $conn = New-Object System.Data.SqlClient.SQLConnection($connString);
    $dataTable = New-Object System.Data.DataTable
    $conn.Open();
    try{
        $cmd = New-Object System.Data.SqlClient.SqlCommand;
        $cmd.Connection = $conn
        $cmd.CommandText = $sqlQuery
        $reader = $cmd.ExecuteReader()
        $dataTable.Load($reader)
    } catch {
        Write-Log -Message "Error executing SQL query: $($_.Exception.Message)"
        throw $_.Exception
    } finally{
        $conn.Close()
    }
    return $dataTable
}

# ###########################################################
# Description: Inserts a load status record into the database and returns the Load ID.
# Parameters:
#   - [string]$SourceName: The name of the data source.
#   - [string]$SourceType: The type of the data source.
#   - [string]$FileName: The name of the file being processed.
#   - [datetime]$FileDate: The date of the file being processed.
# Returns: The Load ID of the inserted load status record.
###########################################################
function Get-LoadStatusId([string]$sourceName, [string]$sourceType, [string]$fileName, [datetime]$fileDate)
{
    Write-Log -Message "fileDate: $fileDate"
    $conn = New-Object System.Data.SqlClient.SQLConnection($connString);
    $cmd = New-Object System.Data.SqlClient.SqlCommand
    $cmd.CommandText = "natgas.usp_insert_load_status"
    $cmd.Connection = $conn
    $cmd.CommandType = [System.Data.CommandType]'StoredProcedure';
    # input parameters
    $cmd.Parameters.Add("@sourceName", [System.Data.SqlDbType]::VarChar)
    $cmd.Parameters["@sourceName"].Value = $sourceName
    $cmd.Parameters.Add("@sourceType", [System.Data.SqlDbType]::VarChar)
    $cmd.Parameters["@sourceType"].Value = $sourceType
    $cmd.Parameters.Add("@fileName", [System.Data.SqlDbType]::VarChar)
    $cmd.Parameters["@fileName"].Value = $fileName
    $cmd.Parameters.Add("@fileDate", [System.Data.SqlDbType]::DateTime)
    $cmd.Parameters["@fileDate"].Value = $fileDate
    # output parameter
    $outParam = new-object System.Data.SqlClient.SqlParameter;
    $outParam.ParameterName = "@LoadId";
    $outParam.Direction = [System.Data.ParameterDirection]::Output
    $outParam.DbType = [System.Data.DbType]::Int32
    $cmd.Parameters.Add($outParam);
    $conn.Open();
    $cmd.ExecuteNonQuery();
    $loadStatusId = $outParam.SqlValue.Value;
    $conn.Close();
    return $loadStatusId
}

###########################################################
# Function: Get-DataSources
# Description: Generates the SQL script for merging data from the staging table to the target table.
# Parameters:
#  - [string]$sourceName: The name of the data source.
# - [string]$tempTable: The name of the staging table.
# Returns: The SQL script for merging data from the staging table to the target table.
###########################################################
function Get-DataSources([string]$connString, [string]$sourceType, [string]$sourceName)
{
    $conn = New-Object System.Data.SqlClient.SqlConnection($connString)
    $cmd = $conn.CreateCommand()
    $cmd.CommandType = [System.Data.CommandType]::Text
    
    # Define the base query with placeholders for parameters
    $baseQuery = "SELECT * FROM [natgas].[source] WHERE source_type = @sourceType"

    # Add additional conditions based on the source type
    switch ($sourceType) {
        "delta" {
            $p_sourceType = "hourly"
            $sqlQuery = "${baseQuery} AND load_type = 'incremental'"
        }
        "hourly" {
            $p_sourceType = "hourly"
            $sqlQuery = "${baseQuery} AND load_type != 'incremental'"
        }
        "metadata" {
            $p_sourceType = "metadata"
            $sqlQuery = "${baseQuery}"
        }
        "baseline" {
            $p_sourceType = "baseline"
            $sqlQuery = "${baseQuery}"
        }
        default {
            throw "Invalid source type: $sourceType"
        }
    } 

    # Log the query to be executed
    if($sourceName){
        $sqlQuery = "${SqlQuery} AND source_name = @sourceName"
        $cmd.Parameters.Add((New-Object Data.SqlClient.SqlParameter("@sourceName", [Data.SqlDbType]::VarChar, 50))).Value = $sourceName
    }

    Write-Log -Message "Query to be executed: $sqlQuery - Params sourceType: $p_sourceType and sourceName $sourceName"
    $cmd.CommandText = $sqlQuery

    # Add parameters to the SqlCommand object
    $cmd.Parameters.Add((New-Object Data.SqlClient.SqlParameter("@sourceType", [Data.SqlDbType]::VarChar, 50))).Value = $p_sourceType
    
    $conn.Open();
    $reader = $cmd.ExecuteReader()
    $dataTable = New-Object System.Data.DataTable
    $dataTable.Load($reader)
    $conn.Close();
    return $dataTable
}

###########################################################
# Function: Remove-Files
# Description: Removes files from a specified path that match the given includes pattern.
# Parameters:
#   - [string]$Path: The path from which to remove files.
#   - [string[]]$Includes: The patterns of files to include for removal.
# Returns: None
###########################################################
function Remove-Files($path, $includes)
{
    try {
        # Wait for the files to be released
        Start-Sleep -Milliseconds 100
        if (Test-path $path) {
            Get-ChildItem $path -Include $includes -recurse | ForEach-Object {
                if ($keepTempFiles -eq "true" -and ($_.FullName -like '*.csv' -or $_.FullName -like '*.zip')) {
                    return
                }
                if ($writeLog -eq "true" -and $_.FullName -like '*.txt') {
                    return
                }
                $removeErrors = @()
                $_ | Remove-Item -ErrorAction SilentlyContinue -ErrorVariable removeErrors
                $removeErrors | where-object { $_.Exception.Message -notlike '*it is being used by another process*' }
            }
            Write-Log -Message "Removed files in path : $path"
            if ($keepTempFiles -ne "true" -and $writeLog -ne "true") {
                Remove-Item -path $path -Recurse -Force -ErrorAction SilentlyContinue
                Write-Log -Message "Removed : $path"
            }
        }        
        else {
            Write-Log -Message "path does not exist: $path"
        }
    }
    catch {
        Write-Log -Message "Error removing files: $($_.Exception.Message)"
    }
}

###########################################################
# Function: Remove-OldLogs
# Description: Removes old logs and files from the working directory.
# Parameters:
#   - [string]$path: The path from which to remove files.
# Returns: None
###########################################################
function Remove-OldLogs([string]$path)
{
    try {
        $folders = Get-ChildItem -Path $path -Directory | Where-Object { $_.Name -like "datafeed_*" -and $_.CreationTime -lt (Get-Date).AddDays(-7) } | ForEach-Object {  $_.FullName }
        foreach ($folder in $folders) {
            Write-Log -Message "Removing folder: $folder"
            Remove-Item -path $folder -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    catch {
        Write-Log -Message "Error removing old logs: $($_.Exception.Message)"
    }
}

###########################################################
# Function: Main Method
# Description: Config from Config JSON and global variable declaration
# Parameters:
#   - [string]$Path: The path from which to remove files.
#   - [string[]]$Includes: The patterns of files to include for removal.
# Returns: None
###########################################################
# Build connection string from config values
$serverName = $config.db_conf.host
$dbName = $config.db_conf.db
$serverPort = $config.db_conf.port
$dbLogin = $config.db_conf.login
$dbPass = $config.db_conf.pass
$dbPassSecure = ConvertTo-SecureString -String $config.db_conf.pass -AsPlainText -Force
$sqlCred = New-Object -TypeName System.Management.Automation.PSCredential -ArgumentList $dbLogin, $dbPassSecure
$serverInstance = "$($serverName),$($serverPort)"
$connString = "Server={0},{4};Database={1};User ID={2}; Password={3};"-f $serverName,$dbName,$dbLogin,$dbPass,$serverPort

# API Params
$baseUrl = $config.base_url
$API_KEY = $config.api_key
$DATAFEED_SECRET = $config.datafeed_secret

if ([string]::IsNullOrWhiteSpace($DATAFEED_SECRET)) {
    throw "Missing datafeed_secret in gitignored gasdatafeed_import.json."
}

# Define the script version
$scriptVersion = "4.0.1"
# Retrieve the PowerShell version
$psVersion = $PSVersionTable.PSVersion.ToString()

$headers = @{
    "Accept" = "text/csv"
    "Gen-Api-Key" = $API_KEY
    "datafeedSecret" = $DATAFEED_SECRET
    "GasDatafeedPowershellVersion" = "PowerShell/$psVersion"
    "GasDatafeedImportVersion" = "$scriptVersion"
}

$params = @{
    "limit" = "50000"
    "offset" = "0"
    "format" = "csv"
}

$batchSize = $config.batch_size
$removeIncludes = @("*.csv","*.zip")
$datePairs = @()

$configMapping = @(
    # Metadata
    [PSCustomObject]@{source_name="gasdatafeed_metadata"; api_name="files-datasets?dataset=location_extended"; legacy_name="location_extended.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="gasdatafeed_metadata"; api_name="files-datasets?dataset=location_role"; legacy_name="location_role.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="gasdatafeed_metadata"; api_name="nominations-cycles"; legacy_name="nomination_cycles.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=50000},
    [PSCustomObject]@{source_name="gasdatafeed_metadata"; api_name="pipeline-scheduling-cycle"; legacy_name="pipeline_scheduling.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=50000},
    [PSCustomObject]@{source_name="gasdatafeed_metadata"; api_name="pipelines"; legacy_name="pipelines.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=50000},
    [PSCustomObject]@{source_name="gasdatafeed_metadata"; api_name="plants"; legacy_name="plants.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=50000},
    [PSCustomObject]@{source_name="gasdatafeed_metadata"; api_name="scheduling-cycle"; legacy_name="scheduling_cycles.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=50000},    
    [PSCustomObject]@{source_name="proprietary_metadata"; api_name="complex"; legacy_name="complex.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=50000},
    [PSCustomObject]@{source_name="proprietary_metadata"; api_name="complex-member-element"; legacy_name="complex_member_element.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=50000},
    # Special case
    [PSCustomObject]@{source_name="pipeline_inventory"; api_name="files-datasets?dataset=pipeline_inventory"; legacy_name="pipeline_inventory.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:sszzz"; limit=5000 },

    # Hourly
    [PSCustomObject]@{source_name="index_of_customers"; api_name="files-datasets?dataset=index_of_customers"; legacy_name="index_of_customers.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="alabama_intrastate_storage"; api_name="files-datasets?dataset=alabama_flow_estimates"; legacy_name="alabama_flow_estimates.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="michigan_intrastate_storage"; api_name="files-datasets?dataset=michigan_flow_indicators"; legacy_name="michigan_flow_indicators.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="michigan_intrastate_storage"; api_name="files-datasets?dataset=michigan_raw_observations"; legacy_name="michigan_raw_observations.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="illinois_intrastate_storage"; api_name="files-datasets?dataset=illinois_flow_indicators"; legacy_name="illinois_flow_indicators.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="illinois_intrastate_storage"; api_name="files-datasets?dataset=illinois_raw_observations"; legacy_name="illinois_raw_observations.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="ngpl_storage_breakout"; api_name="files-datasets?dataset=ngpl_flow_indicators"; legacy_name="ngpl_flow_indicators.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="ngpl_storage_breakout"; api_name="files-datasets?dataset=ngpl_raw_observations"; legacy_name="ngpl_raw_observations.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="intrastate_storage"; api_name="files-datasets?dataset=intrastate_raw_observations"; legacy_name="raw_observations.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="intrastate_storage"; api_name="files-datasets?dataset=intrastate_flow_indicators"; legacy_name="flow_indicators.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="intrastate_storage"; api_name="files-datasets?dataset=intrastate_flow_estimates"; legacy_name="flow_estimates.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="mexico_exports"; api_name="files-datasets?dataset=mexico_exports_by_point_daily"; legacy_name="by_point_daily.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="mexico_exports"; api_name="files-datasets?dataset=mexico_exports_by_point_monthly"; legacy_name="by_point_monthly.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="mexico_exports"; api_name="files-datasets?dataset=mexico_exports_monitored_pipeline_daily"; legacy_name="monitored_pipeline_daily.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="mexico_exports"; api_name="files-datasets?dataset=mexico_exports_total_estimate_daily"; legacy_name="total_estimate_daily.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="lng"; api_name="files-datasets?dataset=lng_berth_observations"; legacy_name="lng_berth_observations.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="lng"; api_name="files-datasets?dataset=lng_complex_detail"; legacy_name="lng_complex_detail.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="lng"; api_name="files-datasets?dataset=lng_derived_storage"; legacy_name="lng_derived_storage.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="lng"; api_name="files-datasets?dataset=lng_power_mag_field"; legacy_name="lng_power_mag_field.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="lng"; api_name="files-datasets?dataset=lng_regulatory_import_export_reports"; legacy_name="lng_regulatory_import_export_reports.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="lng"; api_name="files-datasets?dataset=lng_ship_attribute"; legacy_name="lng_ship_attribute.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="lng_shipping"; api_name="files-datasets?dataset=lng_facility_attribute"; legacy_name="lng_facility_attribute.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="lng_shipping"; api_name="files-datasets?dataset=lng_live_voyages"; legacy_name="lng_live_voyages.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="lng_shipping"; api_name="files-datasets?dataset=lng_shipping_history"; legacy_name="lng_shipping_history.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="gas_production_forecast"; api_name="files-datasets?dataset=gas_production_forecast"; legacy_name="gas_production_forecast.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    [PSCustomObject]@{source_name="gas_production_forecast"; api_name="files-datasets?dataset=daily_pipe_production"; legacy_name="daily_pipe_production.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=5000},
    
    # Delta
    [PSCustomObject]@{source_name="gas_quality"; api_name="gas-quality-deltas"; legacy_name="gas_quality.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=50000},
    [PSCustomObject]@{source_name="gas_burn"; api_name="gas-burn-deltas"; legacy_name="gas_burn.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=50000},
    [PSCustomObject]@{source_name="nominations"; api_name="nominations-deltas"; legacy_name="nominations.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=50000},
    [PSCustomObject]@{source_name="no_notice"; api_name="no-notice-deltas"; legacy_name="no_notice.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=50000},
    [PSCustomObject]@{source_name="all_cycles"; api_name="all-cycles-deltas"; legacy_name="all_cycles.csv"; created_timestamp_format="yyyy-MM-ddTHH:mm:ss"; limit=50000}
)

###########################################################
# Main code
###########################################################

# Get Source records to loop through
$dtSources = Get-DataSources $connString $sourceType $sourceName
$rowCount = $dtSources.Count
Write-Log -message "Number of rows: $rowCount"

if($rowCount -eq 0) {
    Write-Log -Message "Invalid input combination source type: $sourceType  and source name $sourceName"
    return
}

# Shuffle the order of sources randomly
$dtSources = $dtSources | Sort-Object {Get-Random}

# Get quoted_file list
$sqlQuery = "SELECT * FROM [natgas].[quoted_file];"
$dtQuotedFiles = Use-SqlQuery $connString $sqlQuery

###########################################################
# Loop through sources
###########################################################
foreach ($source in $dtSources) 
{
    # Initialize 
    $filesToProcess = @()
    $loadProc = $source.load_proc
    $loadType = $source.load_type
    $sourceName = $source.source_name
    $sourceType = $source.source_type
    
    Write-Log -Message "Starting on Source: $($source[1]) for frequency $($source[2])..."

    $filteredConfigs = $configMapping | Where-Object { $_.source_name -eq $sourceName }                
    $fileName = $configMapping | Where-Object { $_.source_name -eq $sourceName } | Select-Object -ExpandProperty legacy_name
    $apiPath = $configMapping | Where-Object { $_.source_name -eq $sourceName } | Select-Object -ExpandProperty api_name  

    Write-Log -Message "Filtered Config Count - $($filteredConfigs.Count)"
    foreach ($configInfo in $filteredConfigs) 
    { 
        $sourceName = $configInfo.source_name
        Write-Log -Message "Source Name: $($configInfo.source_name) API Name: $($configInfo.api_name) Legacy Name: $($configInfo.legacy_name)"        
        
        # before downloading the files, if incremental, get last successful date otherwise get the default date pairs
        if ($loadType -eq "incremental" -and $sourceType -ne "baseline") {
            $sqlQuery = "EXECUTE natgas.usp_get_last_load_processed '$sourceName';"                    
            $lastLoadProcessed = Use-SqlQuery $connString $sqlQuery
            Write-Log -Message "Executed: $sqlQuery"
            if($lastLoadProcessed) { 
                $lastLoadDate = $lastLoadProcessed[0]
            }
            $timeSeriesHours = 1
            if ($sourceName -eq "no_notice" -or $sourceName -eq "gas_burn") {
                $timeSeriesHours = 24
            }
            [array]$datePairs = Get-TimeSeriesPairs -lastInsertDate $lastLoadDate -hours $timeSeriesHours
        } else {
            if ($sourceType -eq "baseline") {
                # For baseline: delete records from load_status table for the source
                $sqlQuery = "DELETE ls FROM natgas.load_status ls JOIN natgas.source s ON s.source_id = ls.source_id WHERE  s.source_name = '$sourceName'"
                Execute-SqlQuery -SqlQuery $sqlQuery
            }

            # return one iteration of date pairs
            $currentYear = (Get-Date).Year
            # TODO: YEAR
            $startDate = Get-Date -Year 2007 -Month 1 -Day 1 -Hour 0 -Minute 0 -Second 0
            $targetDate = Get-Date -Year $currentYear -Month 1 -Day 1 -Hour 1 -Minute 0 -Second 0
            [array]$datePairs = @(@{StartTime = $startDate; EndTime = $targetDate})
        }
        if ($loadType -eq "incremental" -and $sourceType -eq "hourly") {
            Write-Log -Message "DatePairs Length is: $($datePairs.Count)"
            Write-Log -Message "DatePairs Content: $($datePairs | Out-String)"
        }
        if ($datePairs.Count -gt 1) {
            if (-not $headers.ContainsKey("WM-No-Cache")) {
                Write-Log -Message "Adding WM-No-Cache header"
                $headers.Add("WM-No-Cache", "true")
            }
        }
        else {
            if ($headers.ContainsKey("WM-No-Cache")) {
                Write-Log -Message "Removing WM-No-Cache header"
                $headers.Remove("WM-No-Cache")
            }
        }
        # Loop through the dates
        foreach ($datePair in $datePairs) 
        {
            $createdTimestampFormat = $configInfo.created_timestamp_format
            $counter = 0
            $fileName = $configInfo.legacy_name
            $fileOutput = $workingPath + $fileName

            Write-Log -Message "Load Type: $loadType Source Type: $sourceType Source Name: $sourceName"
            Write-Log -Message "API Path: $apiPath & Load Proc: $loadProc"
            Write-Log -Message "FileName: $($fileName)"

            # prepare api params      
            if ($loadType -eq "incremental" -and $sourceType -eq "hourly") {                
                Write-Log -Message "Processing Date Pair: $($datePair.StartTime) to $($datePair.EndTime)"
                $startDate = $($datePair.StartTime)
                $endDate = $($datePair.EndTime)
                $fileDate = $startDate.ToString("yyyyMMdd.HHmmss")
                # incremental file name by date
                $fileName = $configInfo.source_name + "_" + $fileDate + ".csv"
                $fileOutput = $workingPath + $fileName                
                $counter = $counter + 1
                $filesToProcess = @($fileOutput)
                $params["csvDoubleAdjustment"] = "true"
                $params["minInsertDate"] = $startDate.ToString("yyyy-MM-ddTHH:mm:ssZ")
                $params["maxInsertDate"] = $endDate.ToString("yyyy-MM-ddTHH:mm:ssZ")
                # Download hourly files
                $flag = Get-CsvFile $baseUrl $headers $params $apiPath $fileOutput $sourceType $counter
                if ($flag -eq $false) {
                    Write-Log -Message "Error encountered during $sourceName hourly API/file download. Please refer to the logs for more details."
                    break
                }
                
            } elseif ($sourceType -eq "baseline") {
                # delete any old files from working path before starting on source 
                $params["limit"] ="5000"
                $apiPath = "files-datasets?dataset=$sourceName"
                $fileOutput = $workingPath
                # Download Baseline Zip/CSV files
                $flag = Get-CsvFile $baseUrl $headers $params $apiPath $fileOutput $sourceType 
                if ($flag -eq $false) {
                    Write-Log -Message "Error encountered during $sourceName baseline API/file download. Please refer to the logs for more details."
                    break
                }
                $filesToProcess = Get-ChildItem -Path $workingPath -Filter "*.csv" | Select-Object -ExpandProperty FullName
                
                # Truncate table
                $sqlQuery = "TRUNCATE TABLE natgas.$sourceName"
                Write-Log -Message "Executing $sqlQuery"
                Execute-SqlQuery -SqlQuery $sqlQuery
            }
            else 
            {
                # metadata files
                $params["limit"] = $configInfo.limit
                $params["csvFloatAdjustment"] ="true"
                $apiPath = $configInfo.api_name
                $filesToProcess = @($fileOutput)
                $flag = Get-CsvFile $baseUrl $headers $params $apiPath $fileOutput $sourceType
                if ($flag -eq $false) {
                    Write-Log -Message "Error encountered during $sourceName metadata API/file download. Please refer to the logs for more details."
                    break
                }                
            }

            # if file is a quoted file            
            $checkQuoted = 0
            $columnNameChange = $true
            foreach ($quotedFile in $dtQuotedFiles) {                
                if ($quotedFile.file_name -eq $configInfo.legacy_name) {
                    $checkQuoted = 1
                    # now create a temporary csv file with | delimiter
                    $tempCsvFile = "$($workingPath)quotedtemp.csv"
                    $quotedFileName = $quotedFile.file_name
                    Write-Log -Message "Processing quoted file $quotedFileName"
                    ConvertTo-CsvPipeDelimited -QuotedFile $fileOutput -OutFile $tempCsvFile
                    $columnNameChange = $false # Quoted files are already in snake case
                }
            }
            Write-Log -Message "Number of files to process $($filesToProcess.Count)"
            # Loop through the files and load to database
            foreach ($fileOutput in $filesToProcess) {
                    
                $outputFile = Split-Path $fileOutput -leaf
                
                # Skip if file name doesn't contain 
                if($sourceType -eq "baseline" -and $outputFile -notlike "*$sourceName*"){
                    Write-Log -Message "Invalid File name to load: $outputFile"
                    continue
                }
                Write-Log -Message "Loading Process Begin : $outputFile"

                if ($outputFile -match '(\d{4})' -and $sourceType -eq "baseline") {
                    $year = $matches[1]
                    $startDate = Get-Date -Year $year -Month 1 -Day 1 -Hour 0 -Minute 0 -Second 0
                }

                if ((-not (Test-Path $fileOutput)) -and ($fileOutput.Length/1KB -le 1)) {
                    Write-Log -Message "Invalid File: $QuotedFile"
                    continue
                } 
                
                # write record to loadStatus table
                $LoadStatusId = Get-LoadStatusId $sourceName $sourceType $outputFile $startDate
                $loadId = $LoadStatusId[6]
                Write-Log -Message "LoadStatusId: $loadId"

                # Import the file to Temp Table        
                if ($checkQuoted -eq 1) {
                    Import-CsvToSqlTable -InstanceName $serverInstance -Database $dbName -SourceFile $tempCsvFile -SqlCred $sqlCred -Delimiter '|' -BatchSize $batchSize -SqlDataType 'VARCHAR(5000)' -SourceType $sourceType -CreatedTimestampFormat $createdTimestampFormat -SourceName $sourceName -ColumnNameChange $columnNameChange                        
                }
                else {
                    Import-CsvToSqlTable -InstanceName $serverInstance -Database $dbName -SourceFile $fileOutput -SqlCred $sqlCred -Delimiter ',' -BatchSize $batchSize -SqlDataType 'VARCHAR(5000)' -SourceType $sourceType -CreatedTimestampFormat $createdTimestampFormat -SourceName $sourceName -ColumnNameChange $columnNameChange
                }
            }             
        }
    }
}

# delete files from working path    
Remove-Files -Path $workingPath -Includes $removeIncludes

if ($keepAllLogs -ne "true" -and $sourceType -eq "hourly") {
    #Clean up old logs
    Remove-OldLogs -path $config.working_path
}

Write-Log -Message "Data Load Process Completed!"

 
