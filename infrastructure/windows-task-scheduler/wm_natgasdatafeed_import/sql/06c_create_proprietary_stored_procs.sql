IF OBJECT_ID('natgas.usp_upsert_proprietary_complex') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_complex AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_complex
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary metadata complex records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    /* Update Insert Complex */
    MERGE natgas.complex AS target
        USING (SELECT complex_id,
                complex_name,
                facility_id,
                facility_name,
                operator_id,
                operator_name,
                county_id,
                county_name,
                state_id,
                state_name,
                country_id,
                country_name
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (complex_id
            , complex_name
            , facility_id
            , facility_name
            , operator_id
            , operator_name
            , county_id
            , county_name
            , state_id
            , state_name
            , country_id
            , country_name)
        ON (target.complex_id = source.complex_id)
        WHEN MATCHED THEN
            UPDATE
                SET complex_name = source.complex_name,
                facility_id = source.facility_id,
                facility_name = source.facility_name,
                operator_id = source.operator_id,
                operator_name = source.operator_name,
                county_id = source.county_id,
                county_name = source.county_name,
                state_id = source.state_id,
                state_name = source.state_name,
                country_id = source.country_id,
                country_name = source.country_name
    WHEN NOT MATCHED THEN
        INSERT (
              complex_id
            , complex_name
            , facility_id
            , facility_name
            , operator_id
            , operator_name
            , county_id
            , county_name
            , state_id
            , state_name
            , country_id
            , country_name
        )
        VALUES (
              source.complex_id
            , source.complex_name
            , source.facility_id
            , source.facility_name
            , source.operator_id
            , source.operator_name
            , county_id
            , county_name
            , state_id
            , state_name
            , country_id
            , country_name
        );

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_proprietary_complex_member_element') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_complex_member_element AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_complex_member_element
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary metadata complex_member_element records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert Complex Member Element */
    MERGE natgas.complex_member_element AS target
        USING (
            SELECT complex_id
                , element_id
                , element_name
                , element_type_id
                , element_type_name
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (complex_id
            , element_id
            , element_name
            , element_type_id
            , element_type_name)
        ON (target.complex_id = source.complex_id)
        AND (target.element_id = source.element_id)
        AND (target.element_type_id = source.element_type_id)
        WHEN MATCHED THEN
            UPDATE
                SET element_name = source.element_name,
                element_type_name = source.element_type_name
    WHEN NOT MATCHED THEN
        INSERT (
              complex_id
            , element_id
            , element_name
            , element_type_id
            , element_type_name
        )
        VALUES (
              source.complex_id
            , source.element_id
            , source.element_name
            , source.element_type_id
            , source.element_type_name
        );

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_proprietary_intrastate_storage_flow_estimates') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_intrastate_storage_flow_estimates AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_intrastate_storage_flow_estimates
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_intrastate_storage_flow_estimates records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert flow_estimates */
    MERGE natgas.intrastate_storage_flow_estimates AS target
        USING (
            SELECT est_date
                , complex_id
                , net_estimated_flow_mmcf
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (est_date, complex_id, net_estimated_flow_mmcf)
        ON (target.complex_id = source.complex_id)
        AND (target.est_date = source.est_date)
    WHEN MATCHED THEN
            UPDATE
                SET net_estimated_flow_mmcf = source.net_estimated_flow_mmcf
    WHEN NOT MATCHED THEN
        INSERT (
              est_date
            , complex_id
            , net_estimated_flow_mmcf
        )
        VALUES (
              source.est_date
            , source.complex_id
            , source.net_estimated_flow_mmcf
        );

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_proprietary_intrastate_storage_flow_indicators') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_intrastate_storage_flow_indicators AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_intrastate_storage_flow_indicators
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_intrastate_storage_flow_indicators records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert flow_indicators */
    MERGE natgas.intrastate_storage_flow_indicators AS target
        USING (
            SELECT gas_day
                , complex_id
                , CASE WHEN (RTRIM(LTRIM(injection_percent)) = '') THEN NULL ELSE injection_percent END
                , CASE WHEN (RTRIM(LTRIM(withdrawal_percent)) = '') THEN NULL ELSE withdrawal_percent END
                , CASE WHEN (RTRIM(LTRIM(withdrawal_modifier_percent)) = '') THEN NULL ELSE withdrawal_modifier_percent END
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (gas_day, complex_id, injection_percent, withdrawal_percent, withdrawal_modifier_percent)
        ON (target.gas_day = source.gas_day)
        AND (target.complex_id = source.complex_id)
    WHEN MATCHED THEN
            UPDATE
                SET injection_percent = source.injection_percent,
                withdrawal_percent = source.withdrawal_percent,
                withdrawal_modifier_percent = source.withdrawal_modifier_percent
    WHEN NOT MATCHED THEN
        INSERT (
              gas_day
            , complex_id
            , injection_percent
            , withdrawal_percent
            , withdrawal_modifier_percent
        )
        VALUES (
              source.gas_day
            , source.complex_id
            , source.injection_percent
            , source.withdrawal_percent
            , source.withdrawal_modifier_percent
        );

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_proprietary_intrastate_storage_raw_observations') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_intrastate_storage_raw_observations AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_intrastate_storage_raw_observations
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_intrastate_storage_raw_observations records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert raw_observations */
    MERGE natgas.intrastate_storage_raw_observations AS target
        USING (
            SELECT gas_day
                , element_id
                , CASE WHEN (RTRIM(LTRIM(activity_value)) = '') THEN NULL ELSE activity_value END
                , CASE WHEN (RTRIM(LTRIM(reported_units)) = '') THEN NULL ELSE reported_units END
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (gas_day, element_id, activity_value, reported_units)
        ON (target.gas_day = source.gas_day)
        AND (target.element_id = source.element_id)
    WHEN MATCHED THEN
            UPDATE
                SET activity_value = source.activity_value,
                reported_units = source.reported_units
    WHEN NOT MATCHED THEN
        INSERT (
              gas_day
            , element_id
            , activity_value
            , reported_units
        )
        VALUES (
              source.gas_day
            , source.element_id
            , source.activity_value
            , source.reported_units
        );

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_proprietary_mexico_exports_by_point_daily') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_mexico_exports_by_point_daily AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_mexico_exports_by_point_daily
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_mexico_exports_by_point_daily records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert Delete by_point_daily */
    MERGE natgas.mexico_exports_by_point_daily AS target
        USING (
            SELECT cal_day
                , complex_id
                , CASE WHEN (RTRIM(LTRIM(point_name)) = '') THEN NULL ELSE point_name END
                , CASE WHEN (RTRIM(LTRIM(source_name)) = '') THEN NULL ELSE source_name END
                , CASE WHEN (RTRIM(LTRIM(daily_eia_estimate_shaped_mmcf)) = '') THEN NULL ELSE daily_eia_estimate_shaped_mmcf END
                , CASE WHEN (RTRIM(LTRIM(sample_mmcf)) = '') THEN NULL ELSE sample_mmcf END
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (cal_day, complex_id, point_name, source_name, daily_eia_estimate_shaped_mmcf, sample_mmcf)
        ON (target.complex_id = source.complex_id)
        AND (target.cal_day = source.cal_day)
        AND (target.point_name = source.point_name)
    WHEN MATCHED THEN
            UPDATE
                SET source_name = source.source_name,
                    daily_eia_estimate_shaped_mmcf = source.daily_eia_estimate_shaped_mmcf,
                    sample_mmcf = source.sample_mmcf
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              cal_day
            , complex_id
            , point_name
            , source_name
            , daily_eia_estimate_shaped_mmcf
            , sample_mmcf
        )
        VALUES (
              source.cal_day
            , source.complex_id
            , source.point_name
            , source.source_name
            , source.daily_eia_estimate_shaped_mmcf
            , source.sample_mmcf
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


IF OBJECT_ID('natgas.usp_upsert_proprietary_mexico_exports_by_point_monthly') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_mexico_exports_by_point_monthly AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_mexico_exports_by_point_monthly
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_mexico_exports_by_point_monthly records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert mexico_exports_by_point_monthly */
    MERGE natgas.mexico_exports_by_point_monthly AS target
        USING (
            SELECT year_month
                , complex_id
                , CASE WHEN (RTRIM(LTRIM(point_name)) = '') THEN NULL ELSE point_name END
                , CASE WHEN (RTRIM(LTRIM(source_name)) = '') THEN NULL ELSE source_name END
                , CASE WHEN (RTRIM(LTRIM(export_mmcf)) = '') THEN NULL ELSE export_mmcf END
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (year_month, complex_id, point_name, source_name, export_mmcf)
        ON (target.year_month = source.year_month)
        AND (target.complex_id = source.complex_id)
        AND (target.point_name = source.point_name)
    WHEN MATCHED THEN
            UPDATE
                SET source_name = source.source_name,
                export_mmcf = source.export_mmcf
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              year_month
            , complex_id
            , point_name
            , source_name
            , export_mmcf
        )
        VALUES (
              source.year_month
            , source.complex_id
            , source.point_name
            , source.source_name
            , source.export_mmcf
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


IF OBJECT_ID('natgas.usp_upsert_proprietary_mexico_exports_monitored_pipeline_daily') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_mexico_exports_monitored_pipeline_daily AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_mexico_exports_monitored_pipeline_daily
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_mexico_exports_monitored_pipeline_daily records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert mexico_exports_monitored_pipeline_daily */
    MERGE natgas.mexico_exports_monitored_pipeline_daily AS target
        USING (
            SELECT gas_day
                , complex_id
                , genscape_sample
                , genscape_best_estimate
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (gas_day, complex_id, genscape_sample, genscape_best_estimate)
        ON (target.gas_day = source.gas_day)
        AND (target.complex_id = source.complex_id)
    WHEN MATCHED THEN
            UPDATE
                SET genscape_sample = source.genscape_sample,
                genscape_best_estimate = source.genscape_best_estimate
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              gas_day
            , complex_id
            , genscape_sample
            , genscape_best_estimate
        )
        VALUES (
              source.gas_day
            , source.complex_id
            , source.genscape_sample
            , source.genscape_best_estimate
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


IF OBJECT_ID('natgas.usp_upsert_proprietary_mexico_exports_total_estimate_daily') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_mexico_exports_total_estimate_daily AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_mexico_exports_total_estimate_daily
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_mexico_exports_total_estimate_daily records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert mexico_exports_total_estimate_daily */
    MERGE natgas.mexico_exports_total_estimate_daily AS target
        USING (
            SELECT gas_day
                , complex_id
                , genscape_sample
                , genscape_best_estimate
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (gas_day, complex_id, genscape_sample, genscape_best_estimate)
        ON (target.gas_day = source.gas_day)
        AND (target.complex_id = source.complex_id)
    WHEN MATCHED THEN
            UPDATE
                SET genscape_sample = source.genscape_sample,
                genscape_best_estimate = source.genscape_best_estimate
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              gas_day
            , complex_id
            , genscape_sample
            , genscape_best_estimate
        )
        VALUES (
              source.gas_day
            , source.complex_id
            , source.genscape_sample
            , source.genscape_best_estimate
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


IF OBJECT_ID('natgas.usp_upsert_proprietary_lng_complex_detail') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_lng_complex_detail AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_lng_complex_detail
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_lng_complex_detail records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert Delete lng_complex_detail */
    MERGE natgas.lng_complex_detail AS target
        USING (
            SELECT complex_id
                , complex_name
                , facility_type
                , operator_name
                , county_name
                , state_name
                , country_name
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (complex_id, complex_name, facility_type, operator_name, county_name, state_name, country_name)
        ON (target.complex_id = source.complex_id)
    WHEN MATCHED THEN
        UPDATE
        SET complex_name = source.complex_name,
            facility_type = source.facility_type,
            operator_name = source.operator_name,
            county_name = source.county_name,
            state_name = source.state_name,
            country_name = source.country_name
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              complex_id
            , complex_name
            , facility_type
            , operator_name
            , county_name
            , state_name
            , country_name
        )
        VALUES (
              source.complex_id
            , source.complex_name
            , source.facility_type
            , source.operator_name
            , source.county_name
            , source.state_name
            , source.country_name
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


IF OBJECT_ID('natgas.usp_upsert_proprietary_lng_ship_attribute') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_lng_ship_attribute AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_lng_ship_attribute
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_lng_ship_attribute records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert lng_ship_attribute */
    MERGE natgas.lng_ship_attribute AS target
        USING (
            SELECT ship_id
                , ship_name
                , imo
                , CASE WHEN (RTRIM(LTRIM(minimum_draft)) = '') THEN NULL ELSE minimum_draft END
                , CASE WHEN (RTRIM(LTRIM(maximum_draft)) = '') THEN NULL ELSE maximum_draft END
                , CASE WHEN (RTRIM(LTRIM(maximum_speed)) = '') THEN NULL ELSE maximum_speed END
                , CASE WHEN (RTRIM(LTRIM(capacity)) = '') THEN NULL ELSE capacity END
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (ship_id, ship_name, imo, minimum_draft, maximum_draft, maximum_speed, capacity)
        ON (target.imo = source.imo)
    WHEN MATCHED THEN
        UPDATE
        SET ship_id = source.ship_id,
            ship_name = source.ship_name,
            minimum_draft = source.minimum_draft,
            maximum_draft = source.maximum_draft,
            maximum_speed = source.maximum_speed,
            capacity = source.capacity
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              ship_id
            , ship_name
            , imo
            , minimum_draft
            , maximum_draft
            , maximum_speed
            , capacity
        )
        VALUES (
              source.ship_id
            , source.ship_name
            , source.imo
            , source.minimum_draft
            , source.maximum_draft
            , source.maximum_speed
            , source.capacity
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


IF OBJECT_ID('natgas.usp_upsert_proprietary_lng_berth_observations') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_lng_berth_observations AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_lng_berth_observations
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_lng_berth_observations records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert lng_berth_observations */
    MERGE natgas.lng_berth_observations AS target
        USING (
            SELECT complex_id
                , berth_name
                , berth_id
                , vessel_name
                , vessel_id
                , CASE WHEN (RTRIM(LTRIM(start_time)) = '') THEN NULL ELSE LEFT(start_time, LEN(start_time)-3) END
                , CASE WHEN (RTRIM(LTRIM(end_time)) = '') THEN NULL ELSE LEFT(end_time, LEN(end_time)-3) END
                , total_load_minutes
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (complex_id
                , berth_name
                , berth_id
                , vessel_name
                , vessel_id
                , start_time
                , end_time
                , total_load_minutes)
        ON (target.complex_id = source.complex_id)
        AND (target.berth_id = source.berth_id)
        AND (target.vessel_id = source.vessel_id)
        AND (target.start_time = source.start_time)
    WHEN MATCHED THEN
        UPDATE
        SET berth_name = source.berth_name,
            vessel_name = source.vessel_name,
            vessel_id = source.vessel_id,
            start_time = source.start_time,
            end_time = source.end_time,
            total_load_minutes = source.total_load_minutes
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              complex_id
            , berth_name
            , berth_id
            , vessel_name
            , vessel_id
            , start_time
            , end_time
            , total_load_minutes
        )
        VALUES (
              source.complex_id
            , source.berth_name
            , source.berth_id
            , source.vessel_name
            , source.vessel_id
            , source.start_time
            , source.end_time
            , source.total_load_minutes
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


IF OBJECT_ID('natgas.usp_upsert_proprietary_lng_derived_storage') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_lng_derived_storage AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_lng_derived_storage
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_lng_derived_storage records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert lng_derived_storage */
    MERGE natgas.lng_derived_storage AS target
        USING (
            SELECT gas_day
                , complex_id
                , inventory_change
                , inventory
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (gas_day, complex_id, inventory_change, inventory)
        ON (target.gas_day = source.gas_day)
        AND (target.complex_id = source.complex_id)
    WHEN MATCHED THEN
        UPDATE
        SET gas_day = source.gas_day,
            complex_id = source.complex_id,
            inventory_change = source.inventory_change,
            inventory = source.inventory
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              gas_day
            , complex_id
            , inventory_change
            , inventory
        )
        VALUES (
              source.gas_day
            , source.complex_id
            , source.inventory_change
            , source.inventory
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


IF OBJECT_ID('natgas.usp_upsert_proprietary_lng_regulatory_import_export_reports') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_lng_regulatory_import_export_reports AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_lng_regulatory_import_export_reports
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_lng_regulatory_import_export_reports records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert lng_regulatory_import_export_reports */
    MERGE natgas.lng_regulatory_import_export_reports AS target
        USING (
            SELECT transaction_type
                , transaction_date
                , CASE WHEN (RTRIM(LTRIM(ix_company_name)) = '') THEN NULL ELSE ix_company_name END
                , CASE WHEN (RTRIM(LTRIM(supplier_seller_name)) = '') THEN NULL ELSE supplier_seller_name END
                , CASE WHEN (RTRIM(LTRIM(purchaser)) = '') THEN NULL ELSE purchaser END
                , CASE WHEN (RTRIM(LTRIM(docket_license)) = '') THEN NULL ELSE docket_license END
                , CASE WHEN (RTRIM(LTRIM(docket_contract_type)) = '') THEN NULL ELSE docket_contract_type END
                , CASE WHEN (RTRIM(LTRIM(origin_country)) = '') THEN NULL ELSE origin_country END
                , CASE WHEN (RTRIM(LTRIM(destination_country)) = '') THEN NULL ELSE destination_country END
                , CASE WHEN (RTRIM(LTRIM(transportation_type)) = '') THEN NULL ELSE transportation_type END
                , CASE WHEN (RTRIM(LTRIM(vessel)) = '') THEN NULL ELSE vessel END
                , CASE WHEN (RTRIM(LTRIM(transaction_terminal)) = '') THEN NULL ELSE transaction_terminal END
                , CASE WHEN (RTRIM(LTRIM(volume)) = '') THEN NULL ELSE volume END
                , CASE WHEN (RTRIM(LTRIM(measurement_basis)) = '') THEN NULL ELSE measurement_basis END
                , CASE WHEN (RTRIM(LTRIM(price)) = '') THEN NULL ELSE price END
                , CASE WHEN (RTRIM(LTRIM(notes)) = '') THEN NULL ELSE notes END
                , CASE spot WHEN 't' THEN 1 ELSE 0 END AS spot
                , CASE commissioning WHEN 't' THEN 1 ELSE 0 END AS commissioning
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (transaction_type
                , transaction_date
                , ix_company_name
                , supplier_seller_name
                , purchaser
                , docket_license
                , docket_contract_type
                , origin_country
                , destination_country
                , transportation_type
                , vessel
                , transaction_terminal
                , volume
                , measurement_basis
                , price
                , notes
                , spot
                , commissioning)
        ON (target.transaction_date = source.transaction_date)
        AND (target.vessel = source.vessel)
        AND (target.volume = source.volume)
    WHEN MATCHED THEN
        UPDATE
        SET transaction_type = source.transaction_type,
            ix_company_name = source.ix_company_name,
            supplier_seller_name = source.supplier_seller_name,
            purchaser = source.purchaser,
            docket_license = source.docket_license,
            docket_contract_type = source.docket_contract_type,
            origin_country = source.origin_country,
            destination_country = source.destination_country,
            transportation_type = source.transportation_type,
            measurement_basis = source.measurement_basis,
            price = source.price,
            notes = source.notes,
            spot = source.spot,
            commissioning = source.commissioning
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              transaction_type
            , transaction_date
            , ix_company_name
            , supplier_seller_name
            , purchaser
            , docket_license
            , docket_contract_type
            , origin_country
            , destination_country
            , transportation_type
            , vessel
            , transaction_terminal
            , volume
            , measurement_basis
            , price
            , notes
            , spot
            , commissioning
        )
        VALUES (
              source.transaction_type
            , source.transaction_date
            , source.ix_company_name
            , source.supplier_seller_name
            , source.purchaser
            , source.docket_license
            , source.docket_contract_type
            , source.origin_country
            , source.destination_country
            , source.transportation_type
            , source.vessel
            , source.transaction_terminal
            , source.volume
            , source.measurement_basis
            , source.price
            , source.notes
            , source.spot
            , source.commissioning
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


IF OBJECT_ID('natgas.usp_upsert_proprietary_lng_facility_attribute') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_lng_facility_attribute AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_lng_facility_attribute
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_lng_facility_attribute records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert Delete lng_facility_attribute */
    MERGE natgas.lng_facility_attribute AS target
        USING (
            SELECT facility_id
                , facility_name
                , port_name
                , category
                , subcategory
                , status
                , berths
                , territory_name
                , country_name
                , region_name
                , ocean_name
                , sea_name
                , marine
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (facility_id, facility_name, port_name, category, subcategory, status, berths, territory_name, country_name, region_name, ocean_name, sea_name, marine)
        ON (target.facility_id = source.facility_id)
    WHEN MATCHED THEN
        UPDATE
        SET facility_name = source.facility_name,
            port_name = source.port_name,
            category = source.category,
            subcategory = source.subcategory,
            status = source.status,
            berths = source.berths,
            territory_name = source.territory_name,
            country_name = source.country_name,
            region_name = source.region_name,
            ocean_name = source.ocean_name,
            sea_name = source.sea_name,
            marine = source.marine
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              facility_id
            , facility_name
            , port_name
            , category
            , subcategory
            , status
            , berths
            , territory_name
            , country_name
            , region_name
            , ocean_name
            , sea_name
            , marine
        )
        VALUES (
              source.facility_id
            , source.facility_name
            , source.port_name
            , source.category
            , source.subcategory
            , source.status
            , source.berths
            , source.territory_name
            , source.country_name
            , source.region_name
            , source.ocean_name
            , source.sea_name
            , source.marine
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


IF OBJECT_ID('natgas.usp_upsert_proprietary_lng_shipping_history') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_lng_shipping_history AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_lng_shipping_history
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_lng_shipping_history records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert lng_shipping_history */
    MERGE natgas.lng_shipping_history AS target
        USING (
            SELECT CASE WHEN (RTRIM(LTRIM(origin_departure_time)) = '') THEN NULL ELSE LEFT(origin_departure_time, LEN(origin_departure_time)-3) END
                , CASE WHEN (RTRIM(LTRIM(destination_arrival_time)) = '') THEN NULL ELSE LEFT(destination_arrival_time, LEN(destination_arrival_time)-3) END
                , CASE WHEN (RTRIM(LTRIM(destination_departure_time)) = '') THEN NULL ELSE LEFT(destination_departure_time, LEN(destination_departure_time)-3) END
                , origin_id
                , destination_id
                , ship_id
                , contract_type_id
                , CASE WHEN (RTRIM(LTRIM(contract_type)) = '') THEN NULL ELSE contract_type END
                , CASE WHEN (RTRIM(LTRIM(spot)) = '') THEN NULL WHEN spot = 't' THEN 1 ELSE 0 END AS spot
                , CASE WHEN (RTRIM(LTRIM(fsru)) = '') THEN NULL WHEN fsru = 't' THEN 1 ELSE 0 END AS fsru
                , CASE WHEN (RTRIM(LTRIM(notes)) = '') THEN NULL ELSE notes END
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (origin_departure_time
                , destination_arrival_time
                , destination_departure_time
                , origin_id
                , destination_id
                , ship_id
                , contract_type_id
                , contract_type
                , spot
                , fsru
                , notes)
        ON (target.origin_departure_time = source.origin_departure_time)
        AND (target.ship_id = source.ship_id)
    WHEN MATCHED THEN
        UPDATE
        SET destination_arrival_time = source.destination_arrival_time,
            destination_departure_time = source.destination_departure_time,
            origin_id = source.origin_id,
            destination_id = source.destination_id,
            contract_type_id = source.contract_type_id,
            contract_type = source.contract_type,
            spot = source.spot,
            fsru = source.fsru,
            notes = source.notes
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              origin_departure_time
            , destination_arrival_time
            , destination_departure_time
            , origin_id
            , destination_id
            , ship_id
            , contract_type_id
            , contract_type
            , spot
            , fsru
            , notes
    )
        VALUES (
              source.origin_departure_time
            , source.destination_arrival_time
            , source.destination_departure_time
            , source.origin_id
            , source.destination_id
            , source.ship_id
            , source.contract_type_id
            , source.contract_type
            , source.spot
            , source.fsru
            , source.notes
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


IF OBJECT_ID('natgas.usp_upsert_proprietary_lng_live_voyages') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_lng_live_voyages AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_lng_live_voyages
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_lng_live_voyages records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert Delete lng_live_voyages */
    MERGE natgas.lng_live_voyages AS target
        USING (
            SELECT CASE WHEN (RTRIM(LTRIM(last_updated)) = '') THEN NULL
                ELSE REPLACE(last_updated, (REVERSE(LEFT(REVERSE(last_updated), CHARINDEX('.', REVERSE(last_updated))))), '') END
                , vessel_name
                , CASE loaded WHEN 't' THEN 1 ELSE 0 END AS loaded
                , CASE WHEN (RTRIM(LTRIM(origin_facility)) = '') THEN NULL ELSE origin_facility END AS origin_facility
                , CASE WHEN (RTRIM(LTRIM(ais_destination)) = '') THEN NULL ELSE ais_destination END AS ais_destination
                , CASE WHEN (RTRIM(LTRIM(facility_destination_1)) = '') THEN NULL ELSE facility_destination_1 END AS facility_destination_1
                , CASE WHEN (RTRIM(LTRIM(facility_destination_2)) = '') THEN NULL ELSE facility_destination_2 END AS facility_destination_2
                , CASE WHEN (RTRIM(LTRIM(facility_destination_3)) = '') THEN NULL ELSE facility_destination_3 END AS facility_destination_3
                , CASE WHEN (RTRIM(LTRIM(eta_to_facility_destination)) = '') THEN NULL
                    ELSE REPLACE(eta_to_facility_destination, (REVERSE(LEFT(REVERSE(eta_to_facility_destination), CHARINDEX('.', REVERSE(eta_to_facility_destination))))), '')
                    END AS eta_to_facility_destination
                , CASE WHEN (RTRIM(LTRIM(distance_out)) = '') THEN NULL ELSE distance_out END AS distance_out
                , CASE WHEN (RTRIM(LTRIM(speed)) = '') THEN NULL ELSE speed END AS speed
                , CASE WHEN (RTRIM(LTRIM(vessel_volume_bcf)) = '') THEN NULL ELSE vessel_volume_bcf END AS vessel_volume_bcf
                , CASE WHEN (RTRIM(LTRIM(origin_entry_time)) = '') THEN NULL ELSE LEFT(origin_entry_time, LEN(origin_entry_time)-3) END AS origin_entry_time
                , CASE WHEN (RTRIM(LTRIM(origin_exit_time)) = '') THEN NULL ELSE LEFT(origin_exit_time, LEN(origin_exit_time)-3) END AS origin_exit_time
                , CASE WHEN (RTRIM(LTRIM(time_at_origin_port)) = '') THEN NULL ELSE time_at_origin_port END AS time_at_origin_port
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source ( last_updated
                    , vessel_name
                    , loaded
                    , origin_facility
                    , ais_destination
                    , facility_destination_1
                    , facility_destination_2
                    , facility_destination_3
                    , eta_to_facility_destination
                    , distance_out
                    , speed
                    , vessel_volume_bcf
                    , origin_entry_time
                    , origin_exit_time
                    , time_at_origin_port)
        ON (target.origin_exit_time = source.origin_exit_time)
        AND (target.vessel_name = source.vessel_name)
    WHEN MATCHED THEN
        UPDATE
        SET last_updated = source.last_updated,
            loaded = source.loaded,
            origin_facility = source.origin_facility,
            ais_destination = source.ais_destination,
            facility_destination_1 = source.facility_destination_1,
            facility_destination_2 = source.facility_destination_2,
            facility_destination_3 = source.facility_destination_3,
            eta_to_facility_destination = source.eta_to_facility_destination,
            distance_out = source.distance_out,
            speed = source.speed,
            vessel_volume_bcf = source.vessel_volume_bcf,
            origin_entry_time = source.origin_entry_time,
            time_at_origin_port = source.time_at_origin_port
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              last_updated
            , vessel_name
            , loaded
            , origin_facility
            , ais_destination
            , facility_destination_1
            , facility_destination_2
            , facility_destination_3
            , eta_to_facility_destination
            , distance_out
            , speed
            , vessel_volume_bcf
            , origin_entry_time
            , origin_exit_time
            , time_at_origin_port
        )
        VALUES (
              source.last_updated
            , source.vessel_name
            , source.loaded
            , source.origin_facility
            , source.ais_destination
            , source.facility_destination_1
            , source.facility_destination_2
            , source.facility_destination_3
            , source.eta_to_facility_destination
            , source.distance_out
            , source.speed
            , source.vessel_volume_bcf
            , source.origin_entry_time
            , source.origin_exit_time
            , source.time_at_origin_port
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


IF OBJECT_ID('natgas.usp_upsert_proprietary_lng_power_mag_field') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_lng_power_mag_field AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_lng_power_mag_field
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_lng_power_mag_field records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert Delete lng_power_mag_field */
    MERGE natgas.lng_power_mag_field AS target
        USING (
            SELECT date_hour
                , complex_id
                , mag_field
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source ( date_hour
                    , complex_id
                    , mag_field)
        ON (target.date_hour = source.date_hour)
        AND (target.complex_id = source.complex_id)
    WHEN MATCHED THEN
        UPDATE
        SET mag_field = source.mag_field
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              date_hour
            , complex_id
            , mag_field
        )
        VALUES (
              source.date_hour
            , source.complex_id
            , source.mag_field
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


IF OBJECT_ID('natgas.usp_upsert_springrock_daily_pipe_production') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_springrock_daily_pipe_production AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_springrock_daily_pipe_production
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new springrock_daily_pipe_production records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert Delete springrock_daily_pipe_production */
    MERGE natgas.springrock_daily_pipe_production AS target
        USING (
            SELECT report_date
                , gas_day
                , CASE WHEN (RTRIM(LTRIM(region)) = '') THEN NULL ELSE region END
                , CASE WHEN (RTRIM(LTRIM(mmcf)) = '') THEN NULL ELSE mmcf END
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (
              report_date
            , gas_day
            , region
            , mmcf
        )
        ON (target.report_date = source.report_date)
        AND (target.gas_day = source.gas_day)
        AND (target.region = source.region)
    WHEN MATCHED THEN
        UPDATE
        SET report_date = source.report_date,
            gas_day = source.gas_day,
            region = source.region,
            mmcf = source.mmcf
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              report_date
            , gas_day
            , region
            , mmcf
        )
        VALUES (
              source.report_date
            , source.gas_day
            , source.region
            , source.mmcf
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


IF OBJECT_ID('natgas.usp_upsert_springrock_gas_production_forecast') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_springrock_gas_production_forecast AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_springrock_gas_production_forecast
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new springrock_gas_production_forecast records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON
    /* Update Insert Delete springrock_gas_production_forecast */
    MERGE natgas.springrock_gas_production_forecast AS target
        USING (
            SELECT report_date
                , CASE WHEN (RTRIM(LTRIM(month)) = '') THEN NULL ELSE month END
                , CASE WHEN (RTRIM(LTRIM(dry_gas_actual)) = '') THEN NULL ELSE dry_gas_actual END
                , CASE WHEN (RTRIM(LTRIM(dry_gas_forecast)) = '') THEN NULL ELSE dry_gas_forecast END
                , CASE WHEN (RTRIM(LTRIM(dry_gas_percent)) = '') THEN NULL ELSE dry_gas_percent END
                , CASE WHEN (RTRIM(LTRIM(dry_gas_yoy)) = '') THEN NULL ELSE dry_gas_yoy END
                , CASE WHEN (RTRIM(LTRIM(wet_gas_forecast)) = '') THEN NULL ELSE wet_gas_forecast END
                , CASE WHEN (RTRIM(LTRIM(wet_gas_actual)) = '') THEN NULL ELSE wet_gas_actual END
                , CASE WHEN (RTRIM(LTRIM(marketed_gas_percent)) = '') THEN NULL ELSE marketed_gas_percent END
                , CASE WHEN (RTRIM(LTRIM(gas_rigs)) = '') THEN NULL ELSE gas_rigs END
                , CASE WHEN (RTRIM(LTRIM(oil_rigs)) = '') THEN NULL ELSE oil_rigs END
                , CASE WHEN (RTRIM(LTRIM(region)) = '') THEN NULL ELSE region END
                , CASE WHEN (RTRIM(LTRIM(subregion)) = '') THEN NULL ELSE subregion END
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (
              report_date
            , month
            , dry_gas_actual
            , dry_gas_forecast
            , dry_gas_percent
            , dry_gas_yoy
            , wet_gas_forecast
            , wet_gas_actual
            , marketed_gas_percent
            , gas_rigs
            , oil_rigs
            , region
            , subregion
        )
        ON (target.report_date = source.report_date)
        AND (target.month = source.month)
        AND (target.region = source.region)
        AND (target.subregion = source.subregion)
    WHEN MATCHED THEN
        UPDATE
        SET report_date = source.report_date,
            month = source.month,
            dry_gas_actual = source.dry_gas_actual,
            dry_gas_forecast = source.dry_gas_forecast,
            dry_gas_percent = source.dry_gas_percent,
            dry_gas_yoy = source.dry_gas_yoy,
            wet_gas_forecast = source.wet_gas_forecast,
            wet_gas_actual = source.wet_gas_actual,
            marketed_gas_percent = source.marketed_gas_percent,
            gas_rigs = source.gas_rigs,
            oil_rigs = source.oil_rigs,
            region = source.region,
            subregion = source.subregion
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
              report_date
            , month
            , dry_gas_actual
            , dry_gas_forecast
            , dry_gas_percent
            , dry_gas_yoy
            , wet_gas_forecast
            , wet_gas_actual
            , marketed_gas_percent
            , gas_rigs
            , oil_rigs
            , region
            , subregion
        )
        VALUES (
              source.report_date
            , source.month
            , source.dry_gas_actual
            , source.dry_gas_forecast
            , source.dry_gas_percent
            , source.dry_gas_yoy
            , source.wet_gas_forecast
            , source.wet_gas_actual
            , source.marketed_gas_percent
            , source.gas_rigs
            , source.oil_rigs
            , source.region
            , source.subregion
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
