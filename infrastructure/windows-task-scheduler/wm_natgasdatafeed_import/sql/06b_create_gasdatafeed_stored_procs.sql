IF OBJECT_ID('natgas.usp_upsert_gasdatafeed_gas_quality') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_gasdatafeed_gas_quality AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_gasdatafeed_gas_quality
@rowcount integer = NULL OUTPUT,
@sourcetype varchar(100)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new gas_quality records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    SET @rowcount = 0;

    -- ****************************************************************************************************
    -- gas_burn deletes
    -- ****************************************************************************************************
    DELETE FROM gas_quality
    FROM gas_quality b
    INNER JOIN CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
    ON b.location_id = t.location_id
    AND b.gas_day = t.gas_day
    AND b.name = t.name

    -- ****************************************************************************************************
    -- gas_burn inserts
    -- ****************************************************************************************************
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
        , t.value
        , CAST(t.update_timestamp AS DATETIME) AS update_timestamp
        , CAST(t.created_timestamp AS DATETIME) AS created_timestamp
    FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
    WHERE t.iud IN ('I','UI');

    SET @rowcount += @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_gasdatafeed_gas_burn') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_gasdatafeed_gas_burn AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_gasdatafeed_gas_burn
@rowcount integer = NULL OUTPUT,
@sourcetype varchar(100)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new gas_burn records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    SET @rowcount = 0;
    -- ****************************************************************************************************
    -- gas_burn deletes
    -- ****************************************************************************************************
    DELETE FROM gas_burn
    FROM gas_burn b
    INNER JOIN CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
    ON b.location_id = t.location_id
    AND b.flow_timestamp_central = t.flow_timestamp_central
    AND b.pipeline_id = t.pipeline_id

    -- ****************************************************************************************************
    -- Insert new records from gas_burn_loader table
    -- 'I' new records 'UI' records that have been updated, this SQL assumes that the cooresponding 'UD' delete has occurred
    -- gas_burn inserts
    -- ****************************************************************************************************
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
    FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
    WHERE t.iud IN ('I','UI');

    SET @rowcount += @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_gasdatafeed_nominations') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_gasdatafeed_nominations AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_gasdatafeed_nominations
@rowcount integer = NULL OUTPUT,
@sourcetype varchar(100)
AS 
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new nomination records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    SET @rowcount = 0;
    -- ****************************************************************************************************
    -- nominations deletes
    -- Remove Nomination records that have been deleted or updated in natgas's data set 'D' - deleted 
    -- 'UD' - record subsequently replaced by 'UI' record with same location_qti_id and effective_date
    -- ****************************************************************************************************
    -- force index and delete in batches
    DECLARE @batch INT;
    SELECT @batch = 100000;

    WHILE @batch > 0
    BEGIN
        DELETE TOP (100000) FROM natgas.nominations
        FROM natgas.nominations n WITH(INDEX(PK_nominations_1))
        INNER JOIN CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ON n.location_role_id = t.location_role_id
        AND n.gas_day = t.gas_day;

        SELECT @batch = @@ROWCOUNT;
    END

    -- ****************************************************************************************************
    -- nominations inserts
    -- Insert new records from nominations_loader table
    -- 'I' new records 'UI' records that have been updated, this SQL assumes that the cooresponding 'UD' delete has occurred
    -- ****************************************************************************************************
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
    FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
    WHERE iud IN ('I','UI');

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_gasdatafeed_no_notice') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_gasdatafeed_no_notice AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_gasdatafeed_no_notice
@rowcount integer = NULL OUTPUT,
@sourcetype varchar(100)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new no_notice records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    SET @rowcount = 0;

    -- ****************************************************************************************************
    -- if sourcetype is baseline, just insert and skip the delete/merge
    -- ****************************************************************************************************
    IF @sourcetype = 'baseline'
    BEGIN
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
        FROM CsvToSqlTemp t ; -- this is the temp table created during the gasdatafeed_import.ps1 process
        SET @rowcount = @@ROWCOUNT;
    END
    ELSE

    -- ****************************************************************************************************
    -- no_notice deletes
    -- Remove No_notice records that have been deleted or updated in Genscape's data set 'D' - deleted
    -- 'UD' - record subsequently replaced by 'UI' record with same location_qti_id and effective_date
    -- ****************************************************************************************************
    DELETE FROM no_notice
    FROM no_notice b
    INNER JOIN CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
    ON b.location_role_id = t.location_role_id
    AND b.gas_day = t.gas_day;

    -- ****************************************************************************************************
    -- no_notice inserts
    -- Insert new records from no_notice_loader table
    -- 'I' new records 'UI' records that have been updated, this SQL assumes that the cooresponding 'UD' delete has occurred
    -- ****************************************************************************************************
    MERGE INTO natgas.no_notice AS TARGET
    USING
        (SELECT t.location_role_id
            , t.gas_day
            , t.no_notice_capacity
            , t.units
            , t.update_timestamp
            , t.created_timestamp
        FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
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
        VALUES (location_role_id, gas_day, no_notice_capacity, units, update_timestamp, created_timestamp);

    SET @rowcount += @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO

IF OBJECT_ID('natgas.usp_upsert_gasdatafeed_all_cycles') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_gasdatafeed_all_cycles AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_gasdatafeed_all_cycles
@rowcount integer = NULL OUTPUT,
@sourcetype varchar(100)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new all_cycles records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    SET @rowcount = 0;

    -- ****************************************************************************************************
    -- if sourcetype is baseline, just insert and skip the delete/merge
    -- ****************************************************************************************************
    IF @sourcetype = 'baseline'
    BEGIN
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
        FROM CsvToSqlTemp t ; -- this is the temp table created during the gasdatafeed_import.ps1 process
        SET @rowcount = @@ROWCOUNT;
    END
    ELSE
    BEGIN
        -- ****************************************************************************************************
        -- all_cycles deletes
        -- Remove all_cycles records that have been deleted or updated in the data set 'D' - deleted 'UD' - record subsequently replaced 
        -- by 'UI' record with the same location_qti_id and effective_date
        -- ****************************************************************************************************
        IF EXISTS (SELECT 1 FROM CsvToSqlTemp WHERE iud IN ('D','UD'))
        BEGIN
            WHILE (@@ROWCOUNT > 0)
            BEGIN
                DELETE TOP (10000) FROM natgas.all_cycles
                FROM natgas.all_cycles b
                INNER JOIN CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
                ON b.location_role_id = t.location_role_id
                AND b.gas_day = t.gas_day
                AND b.cycle_id = t.cycle_id
                WHERE t.iud IN ('D','UD')
            END
        END;

        -- ****************************************************************************************************
        -- all_cycles inserts
        -- Insert new records from all_cycles_loader table
        -- 'I' new records 'UI' records that have been updated, this SQL assumes that the cooresponding 'UD' delete has occurred
        -- needed to batch out the MERGE statement by gas_day
        -- ****************************************************************************************************
        DECLARE @gasday_table TABLE (row_num int, gas_day date);
        DECLARE @current_gasday date, @current_int int;
        DECLARE @current_rowcount INTEGER, @cumulative_rowcount INTEGER = 0;

        INSERT INTO @gasday_table
        SELECT ROW_NUMBER() OVER(ORDER BY gas_day) AS row_num, acl.gas_day
        FROM (SELECT DISTINCT gas_day FROM CsvToSqlTemp) acl;

        SET @current_int = 1;

        WHILE (@current_int <= (SELECT max(row_num) FROM @gasday_table))
        BEGIN
            SET @current_gasday = (SELECT gas_day FROM @gasday_table WHERE row_num = @current_int)

            MERGE INTO natgas.all_cycles AS TARGET
            USING (
                SELECT t.location_role_id
                    , t.gas_day
                    , t.cycle_id
                    , t.operational_cap
                    , t.available_cap
                    , t.scheduled_cap
                    , t.design_cap
                FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
                WHERE gas_day = @current_gasday
                AND iud IN ('I','UI'))
                AS SOURCE (location_role_id, gas_day, cycle_id, operational_cap, available_cap, scheduled_cap, design_cap)
            ON TARGET.location_role_id = SOURCE.location_role_id
            AND TARGET.gas_day = SOURCE.gas_day
            AND TARGET.cycle_id = SOURCE.cycle_id
            WHEN MATCHED AND (
                TARGET.operational_cap != SOURCE.operational_cap
                OR TARGET.available_cap != SOURCE.available_cap
                OR TARGET.scheduled_cap != SOURCE.scheduled_cap
                OR TARGET.design_cap != source.design_cap)
            THEN UPDATE
                SET operational_cap = SOURCE.operational_cap,
                available_cap = SOURCE.available_cap,
                scheduled_cap = SOURCE.scheduled_cap,
                design_cap = source.design_cap
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
                );
            SET @current_rowcount = @@ROWCOUNT;
            SET @current_int += 1;
            SET @cumulative_rowcount += @current_rowcount;
        END

        SET @rowcount += @cumulative_rowcount;
    END
END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_index_of_customers') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_index_of_customers AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_index_of_customers
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new index_of_customers records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    /* Update Insert Delete index_of_customers */
    MERGE natgas.index_of_customers AS target
        USING (
            SELECT genscape_header_id
                , genscape_detail_id
                , genscape_point_id
                , pipeline_id
                , ferc_pipeline_id
                , report_date
                , CASE WHEN (RTRIM(LTRIM(original_revised_indicator)) = '') THEN NULL ELSE original_revised_indicator END
                , CASE WHEN (RTRIM(LTRIM(quarter_calendar_start)) = '') THEN NULL ELSE quarter_calendar_start END
                , CASE WHEN (RTRIM(LTRIM(contact_person)) = '') THEN NULL ELSE contact_person END
                , CASE WHEN (RTRIM(LTRIM(header_footnote_code)) = '') THEN NULL ELSE header_footnote_code END
                , CASE WHEN (RTRIM(LTRIM(shipper_name)) = '') THEN NULL ELSE shipper_name END
                , CASE WHEN (RTRIM(LTRIM(reported_shipper_id)) = '') THEN NULL ELSE reported_shipper_id END
                , CASE WHEN (RTRIM(LTRIM(shipper_affiliation_indicator)) = '') THEN NULL ELSE shipper_affiliation_indicator END
                , CASE WHEN (RTRIM(LTRIM(rate_schedule_id)) = '') THEN NULL ELSE rate_schedule_id END
                , CASE WHEN (RTRIM(LTRIM(rate_schedule)) = '') THEN NULL ELSE rate_schedule END
                , CASE WHEN (RTRIM(LTRIM(rate_description)) = '') THEN NULL ELSE rate_description END
                , CASE WHEN (RTRIM(LTRIM(contract_number)) = '') THEN NULL ELSE contract_number END
                , CASE WHEN (RTRIM(LTRIM(contract_eff_date)) = '') THEN NULL ELSE contract_eff_date END
                , CASE WHEN (RTRIM(LTRIM(contract_primary_expiration)) = '') THEN NULL ELSE contract_primary_expiration END
                , CASE WHEN (RTRIM(LTRIM(days_until_next_poss_expiration)) = '') THEN NULL ELSE days_until_next_poss_expiration END
                , CASE WHEN (RTRIM(LTRIM(negotiated_rates_indicator)) = '') THEN NULL ELSE negotiated_rates_indicator END
                , CASE WHEN (RTRIM(LTRIM(contract_max_daily_transport_mmbtu)) = '') THEN NULL ELSE contract_max_daily_transport_mmbtu END
                , CASE WHEN (RTRIM(LTRIM(contract_max_storage_daily_mmbtu)) = '') THEN NULL ELSE contract_max_storage_daily_mmbtu END
                , CASE WHEN (RTRIM(LTRIM(detail_footnote_code)) = '') THEN NULL ELSE detail_footnote_code END
                , CASE WHEN (RTRIM(LTRIM(agent_names)) = '') THEN NULL ELSE agent_names END
                , CASE WHEN (RTRIM(LTRIM(agent_affiliation_identifiers)) = '') THEN NULL ELSE agent_affiliation_identifiers END
                , CASE WHEN (RTRIM(LTRIM(agent_footnote_codes)) = '') THEN NULL ELSE agent_footnote_codes END
                , CASE WHEN (RTRIM(LTRIM(location_role_id)) = '') THEN NULL ELSE location_role_id END
                , CASE WHEN (RTRIM(LTRIM(point_identification_code_qualifier)) = '') THEN NULL ELSE point_identification_code_qualifier END
                , CASE WHEN (RTRIM(LTRIM(point_identification_code)) = '') THEN NULL ELSE point_identification_code END
                , CASE WHEN (RTRIM(LTRIM(zone_name)) = '') THEN NULL ELSE zone_name END
                , CASE WHEN (RTRIM(LTRIM(location_max_daily_transport_mmbtu)) = '') THEN NULL ELSE location_max_daily_transport_mmbtu END
                , CASE WHEN (RTRIM(LTRIM(location_max_storage_daily_mmbtu)) = '') THEN NULL ELSE location_max_storage_daily_mmbtu END
                , CASE WHEN (RTRIM(LTRIM(point_footnote_code)) = '') THEN NULL ELSE point_footnote_code END
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (
              genscape_header_id
            , genscape_detail_id
            , genscape_point_id
            , pipeline_id
            , ferc_pipeline_id
            , report_date
            , original_revised_indicator
            , quarter_calendar_start
            , contact_person
            , header_footnote_code
            , shipper_name
            , reported_shipper_id
            , shipper_affiliation_indicator
            , rate_schedule_id
            , rate_schedule
            , rate_description
            , contract_number
            , contract_eff_date
            , contract_primary_expiration
            , days_until_next_poss_expiration
            , negotiated_rates_indicator
            , contract_max_daily_transport_mmbtu
            , contract_max_storage_daily_mmbtu
            , detail_footnote_code
            , agent_names
            , agent_affiliation_identifiers
            , agent_footnote_codes
            , location_role_id
            , point_identification_code_qualifier
            , point_identification_code
            , zone_name
            , location_max_daily_transport_mmbtu
            , location_max_storage_daily_mmbtu
            , point_footnote_code
        )
        ON (target.genscape_header_id = source.genscape_header_id)
        AND (target.genscape_detail_id = source.genscape_detail_id)
        AND (target.genscape_point_id = source.genscape_point_id)
    WHEN MATCHED THEN
        UPDATE
        SET pipeline_id = source.pipeline_id,
            ferc_pipeline_id = source.ferc_pipeline_id,
            report_date = source.report_date,
            original_revised_indicator = source.original_revised_indicator,
            quarter_calendar_start = source.quarter_calendar_start,
            contact_person = source.contact_person,
            header_footnote_code = source.header_footnote_code,
            shipper_name = source.shipper_name,
            reported_shipper_id = source.reported_shipper_id,
            shipper_affiliation_indicator = source.shipper_affiliation_indicator,
            rate_schedule_id = source.rate_schedule_id,
            rate_schedule = source.rate_schedule,
            rate_description = source.rate_description,
            contract_number = source.contract_number,
            contract_eff_date = source.contract_eff_date,
            contract_primary_expiration = source.contract_primary_expiration,
            days_until_next_poss_expiration = source.days_until_next_poss_expiration,
            negotiated_rates_indicator = source.negotiated_rates_indicator,
            contract_max_daily_transport_mmbtu = source.contract_max_daily_transport_mmbtu,
            contract_max_storage_daily_mmbtu = source.contract_max_storage_daily_mmbtu,
            detail_footnote_code = source.detail_footnote_code,
            agent_names = source.agent_names,
            agent_affiliation_identifiers = source.agent_affiliation_identifiers,
            agent_footnote_codes = source.agent_footnote_codes,
            location_role_id = source.location_role_id,
            point_identification_code_qualifier = source.point_identification_code_qualifier,
            point_identification_code = source.point_identification_code,
            zone_name = source.zone_name,
            location_max_daily_transport_mmbtu = source.location_max_daily_transport_mmbtu,
            location_max_storage_daily_mmbtu = source.location_max_storage_daily_mmbtu,
            point_footnote_code = source.point_footnote_code
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              genscape_header_id
            , genscape_detail_id
            , genscape_point_id
            , pipeline_id
            , ferc_pipeline_id
            , report_date
            , original_revised_indicator
            , quarter_calendar_start
            , contact_person
            , header_footnote_code
            , shipper_name
            , reported_shipper_id
            , shipper_affiliation_indicator
            , rate_schedule_id
            , rate_schedule
            , rate_description
            , contract_number
            , contract_eff_date
            , contract_primary_expiration
            , days_until_next_poss_expiration
            , negotiated_rates_indicator
            , contract_max_daily_transport_mmbtu
            , contract_max_storage_daily_mmbtu
            , detail_footnote_code
            , agent_names
            , agent_affiliation_identifiers
            , agent_footnote_codes
            , location_role_id
            , point_identification_code_qualifier
            , point_identification_code
            , zone_name
            , location_max_daily_transport_mmbtu
            , location_max_storage_daily_mmbtu
            , point_footnote_code
        )
        VALUES (
              source.genscape_header_id
            , source.genscape_detail_id
            , source.genscape_point_id
            , source.pipeline_id
            , source.ferc_pipeline_id
            , source.report_date
            , source.original_revised_indicator
            , source.quarter_calendar_start
            , source.contact_person
            , source.header_footnote_code
            , source.shipper_name
            , source.reported_shipper_id
            , source.shipper_affiliation_indicator
            , source.rate_schedule_id
            , source.rate_schedule
            , source.rate_description
            , source.contract_number
            , source.contract_eff_date
            , source.contract_primary_expiration
            , source.days_until_next_poss_expiration
            , source.negotiated_rates_indicator
            , source.contract_max_daily_transport_mmbtu
            , source.contract_max_storage_daily_mmbtu
            , source.detail_footnote_code
            , source.agent_names
            , source.agent_affiliation_identifiers
            , source.agent_footnote_codes
            , source.location_role_id
            , source.point_identification_code_qualifier
            , source.point_identification_code
            , source.zone_name
            , source.location_max_daily_transport_mmbtu
            , source.location_max_storage_daily_mmbtu
            , source.point_footnote_code
        )
    WHEN NOT MATCHED BY SOURCE THEN
        DELETE;

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO