IF OBJECT_ID('administration.usp_get_error_info') IS NULL
    EXEC('CREATE PROCEDURE administration.usp_get_error_info AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE administration.usp_get_error_info
      @database_name NVARCHAR(128)
    , @stored_procedure NVARCHAR(255)
    , @error NVARCHAR(4000)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Captures error information
Dependencies:   n/a
---------------------------------------------------------------------- */
BEGIN
    SET NOCOUNT ON
    SET ARITHABORT ON

    INSERT INTO administration.error_log (error_date,database_name,error_number, error_severity ,
        error_state,error_procedure,error_line,error_message)
    SELECT
        GETDATE() AS error_date,
        @database_name,
        ERROR_NUMBER() AS ErrorNumber,
        ERROR_SEVERITY() AS ErrorSeverity,
        ERROR_STATE() AS ErrorState,
        @stored_procedure AS ErrorProcedure,
        ERROR_LINE() AS ErrorLine,
        @error AS ErrorMessage;
END
GO


IF OBJECT_ID('natgas.usp_insert_load_status') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_insert_load_status AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_insert_load_status
      @SourceName varchar(128)
    , @SourceType varchar(30)
    , @FileName varchar(256)
    , @FileDate datetime
    , @LoadId integer OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Updates the natgas.load_status table records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
SET NOCOUNT ON
    -- *************************************************************
    -- get source_id from @SourceName
    -- *************************************************************
    DECLARE @source_id integer
    SET @source_id = (SELECT source_id FROM natgas.source WHERE source_name = @SourceName AND source_type = @SourceType);

    -- *************************************************************
    -- insert into load_status
    -- *************************************************************
    IF NOT EXISTS (SELECT * FROM natgas.load_status
            WHERE source_id = @source_id AND file_date = @FileDate AND name_full = @FileName)
        BEGIN
            INSERT INTO natgas.load_status (
                  source_id
                , name_full
                , processed
                , file_date
                , insert_date
                , insert_by
                , update_date
                , update_by
            )
            VALUES (
                  @source_id
                , @FileName
                , 0
                , @FileDate
                , GETDATE()
                , SUSER_NAME()
                , GETDATE()
                , SUSER_NAME()
            );
            SET @LoadId = (SELECT load_id FROM natgas.load_status WHERE load_id = SCOPE_IDENTITY());
        END
    ELSE
        SET @LoadId = (SELECT load_id FROM natgas.load_status
            WHERE source_id = @source_id AND file_date = @FileDate AND name_full = @FileName);

END TRY

BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_get_last_load_processed') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_get_last_load_processed AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_get_last_load_processed
      @SourceName varchar(30)
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Returns the last processed record in load_status
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
SET NOCOUNT ON
    -- *************************************************************
    -- get the last file_date for files processed by this source
    -- *************************************************************
    SELECT MAX(ls.file_date) as max_filedate, s.source_name
    FROM natgas.load_status ls
    JOIN natgas.source s
    ON s.source_id = ls.source_id
    WHERE ls.processed = 1
    AND s.source_name = @SourceName
    GROUP BY s.source_name
END TRY

BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO

