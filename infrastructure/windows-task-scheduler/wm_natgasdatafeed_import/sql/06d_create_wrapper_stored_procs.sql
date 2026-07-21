IF OBJECT_ID('natgas.usp_upsert_gasdatafeed_metadata') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_gasdatafeed_metadata AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_gasdatafeed_metadata
    @FileName varchar(128)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Takes in a metadata table name and runs the appropriate load function
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    IF @FileName = 'pipelines.csv'
        EXEC natgas.usp_upsert_gasdatafeed_pipelines
    ELSE IF @FileName = 'location_extended.csv'
        EXEC natgas.usp_upsert_gasdatafeed_location_extended
    ELSE IF @FileName = 'location_role.csv'
        EXEC natgas.usp_upsert_gasdatafeed_location_role
    ELSE IF @FileName = 'plants.csv'
        EXEC natgas.usp_upsert_gasdatafeed_plants
    ELSE IF @FileName = 'pipeline_scheduling.csv'
        EXEC natgas.usp_upsert_gasdatafeed_pipeline_scheduling
    ELSE IF @FileName = 'nomination_cycles.csv'
        EXEC natgas.usp_upsert_gasdatafeed_nomination_cycles
    ELSE IF @FileName = 'scheduling_cycles.csv'
        EXEC natgas.usp_upsert_gasdatafeed_scheduling_cycles
    ELSE
        RAISERROR('Incorrect value passed to @FileName',0,1)

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_proprietary_metadata') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_metadata AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_metadata
    @FileName varchar(128)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary metadata records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    IF @FileName = 'complex.csv'
        EXEC natgas.usp_upsert_proprietary_complex
    ELSE IF @FileName = 'complex_member_element.csv'
        EXEC natgas.usp_upsert_proprietary_complex_member_element
    ELSE
        RAISERROR('Incorrect value passed to @FileName',0,1)

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_proprietary_intrastate_storage') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_intrastate_storage AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_intrastate_storage
    @FileName varchar(128)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_intrastate_storage records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    IF @FileName = 'flow_estimates.csv'
        EXEC natgas.usp_upsert_proprietary_intrastate_storage_flow_estimates
    ELSE IF @FileName = 'flow_indicators.csv'
        EXEC natgas.usp_upsert_proprietary_intrastate_storage_flow_indicators
    ELSE IF @FileName = 'raw_observations.csv'
        EXEC natgas.usp_upsert_proprietary_intrastate_storage_raw_observations
    ELSE
        RAISERROR('Incorrect value passed to @FileName',0,1)

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_proprietary_alabama_intrastate_storage') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_alabama_intrastate_storage AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_alabama_intrastate_storage
    @FileName varchar(128)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_alabama_intrastate_storage records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    IF @FileName = 'alabama_flow_estimates.csv'
        EXEC natgas.usp_upsert_proprietary_intrastate_storage_flow_estimates
    ELSE
        RAISERROR('Incorrect value passed to @FileName',0,1)

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_proprietary_illinois_intrastate_storage') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_illinois_intrastate_storage AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_illinois_intrastate_storage
    @FileName varchar(128)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_illinois_intrastate_storage records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    IF @FileName = 'illinois_flow_indicators.csv'
        EXEC natgas.usp_upsert_proprietary_intrastate_storage_flow_indicators
    ELSE IF @FileName = 'illinois_raw_observations.csv'
        EXEC natgas.usp_upsert_proprietary_intrastate_storage_raw_observations
    ELSE
        RAISERROR('Incorrect value passed to @FileName',0,1)

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_proprietary_michigan_intrastate_storage') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_michigan_intrastate_storage AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_michigan_intrastate_storage
    @FileName varchar(128)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_michigan_intrastate_storage records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    IF @FileName = 'michigan_flow_indicators.csv'
        EXEC natgas.usp_upsert_proprietary_intrastate_storage_flow_indicators
    ELSE IF @FileName = 'michigan_raw_observations.csv'
        EXEC natgas.usp_upsert_proprietary_intrastate_storage_raw_observations
    ELSE
        RAISERROR('Incorrect value passed to @FileName',0,1)

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_proprietary_ngpl_storage_breakout') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_ngpl_storage_breakout AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_ngpl_storage_breakout
    @FileName varchar(128)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new proprietary_michigan_intrastate_storage records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    IF @FileName = 'ngpl_flow_indicators.csv'
        EXEC natgas.usp_upsert_proprietary_intrastate_storage_flow_indicators
    ELSE IF @FileName = 'ngpl_raw_observations.csv'
        EXEC natgas.usp_upsert_proprietary_intrastate_storage_raw_observations
    ELSE
        RAISERROR('Incorrect value passed to @FileName',0,1)

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_proprietary_mexico_exports') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_mexico_exports AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_mexico_exports
    @FileName varchar(128)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Takes in a mexico exports table name and runs the appropriate load function
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    IF @FileName = 'by_point_daily.csv'
        EXEC natgas.usp_upsert_proprietary_mexico_exports_by_point_daily
    ELSE IF @FileName = 'by_point_monthly.csv'
        EXEC natgas.usp_upsert_proprietary_mexico_exports_by_point_monthly
    ELSE IF @FileName = 'monitored_pipeline_daily.csv'
        EXEC natgas.usp_upsert_proprietary_mexico_exports_monitored_pipeline_daily
    ELSE IF @FileName = 'total_estimate_daily.csv'
        EXEC natgas.usp_upsert_proprietary_mexico_exports_total_estimate_daily
    ELSE
        RAISERROR('Incorrect value passed to @FileName',0,1)

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_proprietary_lng') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_lng AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_lng
    @FileName varchar(128)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Takes in an LNG table name and runs the appropriate load function
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    IF @FileName = 'lng_complex_detail.csv'
        EXEC natgas.usp_upsert_proprietary_lng_complex_detail
    ELSE IF @FileName = 'lng_ship_attribute.csv'
        EXEC natgas.usp_upsert_proprietary_lng_ship_attribute
    ELSE IF @FileName = 'lng_berth_observations.csv'
        EXEC natgas.usp_upsert_proprietary_lng_berth_observations
    ELSE IF @FileName = 'lng_derived_storage.csv'
        EXEC natgas.usp_upsert_proprietary_lng_derived_storage
    ELSE IF @FileName = 'lng_regulatory_import_export_reports.csv'
        EXEC natgas.usp_upsert_proprietary_lng_regulatory_import_export_reports
    ELSE IF @FileName = 'lng_power_mag_field.csv'
        EXEC natgas.usp_upsert_proprietary_lng_power_mag_field
    ELSE
        RAISERROR('Incorrect value passed to @FileName',0,1)

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_proprietary_lng_shipping') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_proprietary_lng_shipping AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_proprietary_lng_shipping
    @FileName varchar(128)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Takes in an LNG Shipping table name and runs the appropriate load function
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    IF @FileName = 'lng_facility_attribute.csv'
        EXEC natgas.usp_upsert_proprietary_lng_facility_attribute
    ELSE IF @FileName = 'lng_shipping_history.csv'
        EXEC natgas.usp_upsert_proprietary_lng_shipping_history
    ELSE IF @FileName = 'lng_live_voyages.csv'
        EXEC natgas.usp_upsert_proprietary_lng_live_voyages
    ELSE
        RAISERROR('Incorrect value passed to @FileName',0,1)

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_springrock_datafeed') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_springrock_datafeed AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_springrock_datafeed
    @FileName varchar(128)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Takes in a Springrock table name and runs the appropriate load function
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    IF @FileName = 'daily_pipe_production.csv'
        EXEC natgas.usp_upsert_springrock_daily_pipe_production
    ELSE IF @FileName = 'gas_production_forecast.csv'
        EXEC natgas.usp_upsert_springrock_gas_production_forecast
    ELSE
        RAISERROR('Incorrect value passed to @FileName',0,1)

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO
