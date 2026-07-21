/****************************************
------- IF YOU NEED TO DROP FIRST -------
USE [master]
GO
ALTER DATABASE [GenscapeDataFeed] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
GO
DROP DATABASE [GenscapeDataFeed]
GO
****************************************/
USE [master]
GO
CREATE DATABASE [GenscapeDataFeed]
 ON  PRIMARY
( NAME = N'GenscapeDataFeed', FILENAME = N'C:\SQLData\GenscapeDataFeed.mdf' , SIZE = 20GB , FILEGROWTH = 512MB )
 LOG ON 
( NAME = N'GenscapeDataFeed_log', FILENAME = N'C:\SQLData\GenscapeDataFeed_log.ldf' , SIZE = 10GB , FILEGROWTH = 512MB )
GO
ALTER DATABASE [GenscapeDataFeed] SET AUTO_CLOSE OFF
GO
ALTER DATABASE [GenscapeDataFeed] SET AUTO_SHRINK OFF
GO
ALTER DATABASE [GenscapeDataFeed] SET READ_WRITE
GO
ALTER DATABASE [GenscapeDataFeed] SET RECOVERY SIMPLE
GO
ALTER DATABASE [GenscapeDataFeed] SET MULTI_USER
GO

USE [GenscapeDataFeed]
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'administration')
BEGIN
    EXEC( 'CREATE SCHEMA administration AUTHORIZATION dbo' );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'natgas')
BEGIN
    EXEC( 'CREATE SCHEMA natgas AUTHORIZATION dbo' );
END
GO
