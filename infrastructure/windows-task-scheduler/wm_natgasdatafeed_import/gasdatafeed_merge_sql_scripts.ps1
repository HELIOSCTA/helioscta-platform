function Get-MergeSqlScripts {
    param (
        [string] $SourceName,
        [string] $TempTable,
        [string] $SourceType
    )

    $sql = ""
    $beginTryStmt = "BEGIN TRY"
    $endTryStmt = "END TRY
                        BEGIN CATCH
                            DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
                            SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
                            EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
                            THROW;
                        END CATCH;"
    switch($SourceName) {
        "gas_quality" {
            $delete = "DELETE FROM natgas.gas_quality
                        FROM natgas.gas_quality b
                        INNER JOIN $TempTable t
                        ON b.location_id = t.location_id
                        AND b.gas_day = t.gas_day
                        AND b.name = t.name;"
            if ($sourceType -eq "baseline") {
                $delete = ""
            }
            $sql = "$beginTryStmt 
                        $delete
                        INSERT INTO natgas.gas_quality (
                            location_id
                            , gas_day
                            , name
                            , value
                            , update_timestamp
                            , created_timestamp
                        )
                        SELECT t.location_id
                            , t.gas_day
                            , t.name
                            , CONVERT(numeric(16,6), CAST(t.value as float)) AS value
                            , CAST(t.update_timestamp AS DATETIME) AS update_timestamp
                            , CAST(t.created_timestamp AS DATETIME) AS created_timestamp
                        FROM $TempTable t
                        WHERE t.iud IN ('I','UI');SELECT @@ROWCOUNT 
                    $endTryStmt"
        }

        "gas_burn" {
            $delete = "DELETE FROM natgas.gas_burn
                    FROM natgas.gas_burn b
                    INNER JOIN $TempTable t  
                    ON b.location_id = t.location_id
                    AND b.flow_timestamp_central = t.flow_timestamp_central
                    AND b.pipeline_id = t.pipeline_id;"
            if ($sourceType -eq "baseline") {
                $delete = ""
            }
            $sql = "$beginTryStmt
                    $delete
                    INSERT INTO natgas.gas_burn (
                        location_id
                        , flow_timestamp_central
                        , hourly_flow_mcf
                        , update_timestamp
                        , created_timestamp
                        , pipeline_id
                    )
                    SELECT t.location_id
                        , t.flow_timestamp_central
                        , t.hourly_flow_mcf
                        , CAST(t.update_timestamp AS DATETIME) AS update_timestamp
                        , CAST(t.created_timestamp AS DATETIME) AS created_timestamp
                        , t.pipeline_id
                    FROM $TempTable t  
                    WHERE t.iud IN ('I','UI'); SELECT @@ROWCOUNT
                    $endTryStmt"
        }

        "no_notice" {
            if ($sourceType -eq "baseline") {
                $sql = "$beginTryStmt
                    INSERT INTO natgas.no_notice (
                        location_role_id
                        , gas_day
                        , no_notice_capacity
                        , units
                        , update_timestamp
                        , created_timestamp
                    )
                    SELECT t.location_role_id
                        , t.gas_day
                        , t.no_notice_capacity
                        , t.units
                        , t.update_timestamp
                        , t.created_timestamp
                    FROM $TempTable t; SELECT @@ROWCOUNT
                    $endTryStmt"                
            } else {
                $sql = "$beginTryStmt 
                    DELETE FROM natgas.no_notice
                    FROM natgas.no_notice b
                    INNER JOIN $TempTable t  
                    ON b.location_role_id = t.location_role_id
                    AND b.gas_day = t.gas_day; 
                    MERGE INTO natgas.no_notice AS TARGET
                    USING
                        (SELECT t.location_role_id
                            , t.gas_day
                            , t.no_notice_capacity
                            , t.units
                            , t.update_timestamp
                            , t.created_timestamp
                        FROM $TempTable t -- this is the temp table created during the gasdatafeed_import.ps1 process
                        WHERE iud IN ('I','UI'))
                        AS SOURCE (location_role_id, gas_day, no_notice_capacity, units, update_timestamp, created_timestamp)
                    ON TARGET.location_role_id = SOURCE.location_role_id
                    AND TARGET.gas_day = SOURCE.gas_day
                    WHEN MATCHED THEN
                    UPDATE
                        SET no_notice_capacity = SOURCE.no_notice_capacity,
                        units = SOURCE.units,
                        update_timestamp = SOURCE.update_timestamp,
                        created_timestamp = SOURCE.created_timestamp
                    WHEN NOT MATCHED BY TARGET THEN
                        INSERT (location_role_id, gas_day, no_notice_capacity, units, update_timestamp, created_timestamp)
                        VALUES (location_role_id, gas_day, no_notice_capacity, units, update_timestamp, created_timestamp);SELECT @@ROWCOUNT
                    $endTryStmt"
            }                    
        }

        "nominations" {
            $delete = "DECLARE @batch INT;
                SELECT @batch = 100000;

                WHILE @batch > 0
                BEGIN
                    DELETE TOP (100000) FROM natgas.nominations
                    FROM natgas.nominations n WITH(INDEX(PK_nominations_1))
                    INNER JOIN $TempTable t 
                    ON n.location_role_id = t.location_role_id
                    AND n.gas_day = t.gas_day;

                    SELECT @batch = @@ROWCOUNT;
                END"
            if ($sourceType -eq "baseline") {
                $delete = ""
            }
            $sql = "$beginTryStmt
                    $delete
                    INSERT INTO natgas.nominations (
                        location_role_id
                        , gas_day
                        , cycle_code
                        , role_code
                        , operational_cap
                        , scheduled_cap
                        , design_cap
                        , available_cap
                        , units
                        , update_timestamp
                    )
                    SELECT t.location_role_id
                        , t.gas_day
                        , t.cycle_code
                        , t.role_code
                        , CASE WHEN (RTRIM(LTRIM(t.operational_cap)) = '') THEN NULL ELSE t.operational_cap END
                        , CASE WHEN (RTRIM(LTRIM(t.scheduled_cap)) = '') THEN NULL ELSE t.scheduled_cap END
                        , CASE WHEN (RTRIM(LTRIM(t.design_cap)) = '') THEN NULL ELSE t.design_cap END
                        , CASE WHEN (RTRIM(LTRIM(t.available_cap)) = '') THEN NULL ELSE t.available_cap END
                        , t.units
                        , SUBSTRING(t.update_timestamp, 1, 19) AS update_timestamp
                    FROM $TempTable t 
                    WHERE iud IN ('I','UI');SELECT @@ROWCOUNT 
                    $endTryStmt"
        }

        "all_cycles" {
            if ($sourceType -eq "baseline") {
                $sql = "$beginTryStmt
                    INSERT INTO natgas.all_cycles (
                        location_role_id
                        , gas_day
                        , cycle_id
                        , operational_cap
                        , available_cap
                        , scheduled_cap
                        , design_cap
                    )
                    SELECT t.location_role_id
                        , t.gas_day
                        , t.cycle_id
                        , t.operational_cap
                        , t.available_cap
                        , t.scheduled_cap
                        , t.design_cap
                    FROM $TempTable t; SELECT @@ROWCOUNT
                    $endTryStmt"
            } else {
                $sql = "$beginTryStmt
                        
                        DECLARE @batch INT;
                        SELECT @batch = 100000;

                        WHILE @batch > 0
                        BEGIN
                        
                        DELETE TOP (100000) FROM natgas.all_cycles
                            FROM natgas.all_cycles b
                            INNER JOIN $TempTable t 
                            ON b.location_role_id = t.location_role_id
                            AND b.gas_day = t.gas_day
                            AND b.cycle_id = t.cycle_id
                            WHERE t.iud IN ('D'); 

                         SELECT @batch = @@ROWCOUNT;
                         END    
                            MERGE INTO natgas.all_cycles AS TARGET
                            USING (
                                SELECT t.location_role_id
                                    , t.gas_day
                                    , t.cycle_id
                                    , t.operational_cap
                                    , t.available_cap
                                    , t.scheduled_cap
                                    , t.design_cap
                                FROM $TempTable t 
                                WHERE  iud IN ('I','U')
                            )
                            AS SOURCE (location_role_id, gas_day, cycle_id, operational_cap, available_cap, scheduled_cap, design_cap)
                            ON TARGET.location_role_id = SOURCE.location_role_id
                            AND TARGET.gas_day = SOURCE.gas_day
                            AND TARGET.cycle_id = SOURCE.cycle_id
                            WHEN MATCHED AND (
                                TARGET.operational_cap != SOURCE.operational_cap
                                OR TARGET.available_cap != SOURCE.available_cap
                                OR TARGET.scheduled_cap != SOURCE.scheduled_cap
                                OR TARGET.design_cap != source.design_cap
                            )
                            THEN UPDATE
                                SET TARGET.operational_cap = SOURCE.operational_cap,
                                TARGET.available_cap = SOURCE.available_cap,
                                TARGET.scheduled_cap = SOURCE.scheduled_cap,
                                TARGET.design_cap = SOURCE.design_cap
                            WHEN NOT MATCHED BY TARGET THEN
                                INSERT (
                                    location_role_id
                                    , gas_day
                                    , cycle_id
                                    , operational_cap
                                    , available_cap
                                    , scheduled_cap
                                    , design_cap
                                )
                                VALUES (
                                    location_role_id
                                    , gas_day
                                    , cycle_id
                                    , operational_cap
                                    , available_cap
                                    , scheduled_cap
                                    , design_cap
                                ); SELECT count(*) FROM $TempTable
                                $endTryStmt"
            }
        }
    }

    return $sql
}