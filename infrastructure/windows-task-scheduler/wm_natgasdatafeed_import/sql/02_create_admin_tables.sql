/************************************************************************
Admin Tables
************************************************************************/
IF OBJECT_ID('administration.error_log', 'U') IS NOT NULL
    PRINT 'administration.error_log Exists'
ELSE
BEGIN
    CREATE TABLE administration.error_log (
        [error_log_id] [int] IDENTITY(1,1) NOT NULL,
        [error_date] [datetime] NOT NULL,
        [database_name] [nvarchar](128) NOT NULL,
        [error_number] [int] NULL,
        [error_severity] [int] NULL,
        [error_state] [int] NULL,
        [error_procedure] [nvarchar](126) NULL,
        [error_line] [int] NULL,
        [error_message] [nvarchar](4000) NULL,
        CONSTRAINT [PK_error_log_error_log_id] PRIMARY KEY CLUSTERED
        (
            [error_log_id] ASC
        )
    )
    PRINT 'Table administration.error_log Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.load_status', 'U') IS NOT NULL
    PRINT 'natgas.load_status Exists'
ELSE
BEGIN
    CREATE TABLE natgas.load_status (
        [load_id] [int] IDENTITY(1,1) NOT NULL,
        [source_id] [int] NOT NULL,
        [name_full] [varchar](256) NOT NULL,
        [processed] [tinyint] NULL CONSTRAINT [DF_load_status_processed] DEFAULT (0),
        [file_date] [datetime] NOT NULL,
        [insert_date] [datetime] NOT NULL,
        [insert_by] [varchar](48) NOT NULL,
        [update_date] [datetime] NOT NULL,
        [update_by] [varchar](48) NOT NULL,
        [row_count] [int] NULL,
        CONSTRAINT [PK_loading_status] PRIMARY KEY CLUSTERED
        (
            [load_id] ASC
        ),
        INDEX ix_load_status_source_id NONCLUSTERED (source_id) INCLUDE (processed, file_date)
    )
    PRINT 'Table natgas.load_status Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.source', 'U') IS NOT NULL
    PRINT 'natgas.source Exists'
ELSE
BEGIN
    CREATE TABLE natgas.source (
        [source_id] [int] IDENTITY(1,1) NOT NULL,
        [source_name] [varchar](128) NOT NULL,
        [source_type] [varchar](30) NOT NULL,
        [load_type] [varchar](30) NOT NULL,
        [load_proc] [varchar](256) NOT NULL,
        [source_path] [varchar](256) NOT NULL,
        CONSTRAINT [PK_source_source_id] PRIMARY KEY CLUSTERED ([source_id] ASC),
        CONSTRAINT [UNQ_source_name_type] UNIQUE ([source_name], [source_type])
    )
    PRINT 'Table natgas.source Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.quoted_file', 'U') IS NOT NULL
    PRINT 'natgas.quoted_file Exists'
ELSE
BEGIN
    CREATE TABLE natgas.quoted_file (
        [quoted_file_id] [int] IDENTITY(1,1) NOT NULL,
        [file_name] [varchar](128) NOT NULL,
        [quoted_columns] [varchar](500) NOT NULL,
        CONSTRAINT [PK_quoted_file_quoted_file_id] PRIMARY KEY CLUSTERED ([quoted_file_id] ASC),
        CONSTRAINT [UNQ_quoted_file_file_name] UNIQUE ([file_name])
    )
    PRINT 'Table natgas.quoted_file Created'
END
GO
