{{
  config(
    materialized='ephemeral'
  )
}}

-- -------------------------------------------------------------
-- -------------------------------------------------------------

-- Marex Position File
-- "10051" -- ACIM
-- "GRAN2" -- Andy
-- "QZB01" -- Mac

-- Marex Allocated Trades
-- UBE10051 -- ACIM
-- UDXGRAN2 -- Andy
-- UDXQZB01 -- Mac

-- NAV Position File
-- "ABN AMRO_1251PT034" -- PNT
-- "RJO_35511229" -- DICKSON

-- Clear Street Trades
-- 365
-- ADU
-- RJO
-- 905
-- 685
-- FCR
-- 690
-- EFD

SELECT * FROM (
    VALUES

        -- ACIM
        ('ACIM', 'UBE 10051', 'NAV Position File'),
        ('ACIM', '51014112.0', 'NAV Position File'),
        ('ACIM', '51014112', 'NAV Position File'),
        ('ACIM', '10051', 'Marex Position File'),
        ('ACIM', 'UBE10051', 'Marex Allocated Trades'),
        -- 'EFD', ''
        ('ACIM', 'EFD', 'Clear Street Trades'),
        ('ACIM', '365', 'Clear Street Trades'),

        -- ANDY
        ('ANDY', 'GRAN2', 'Marex Position File'),
        ('ANDY', 'UDXGRAN2', 'Marex Allocated Trades'),

        -- MAC
        ('MAC', 'QZB01', 'Marex Position File'),
        ('MAC', 'UDXQZB01', 'Marex Allocated Trades'),

        -- PNT
        ('PNT', 'ABN AMRO_1251PT034', 'NAV Position File'),
        ('PNT', '1251PT034', 'Marex Allocated Trades'),
        -- 'FCR', '690'
        ('PNT', 'FCR', 'Clear Street Trades'),
        ('PNT', '690', 'Clear Street Trades'),

        -- DICKSON
        ('DICKSON', 'RJO_35511229', 'NAV Position File'),
        ('DICKSON', '35511229', 'Marex Allocated Trades'),
        -- 'RJO', '685'
        ('DICKSON', 'RJO', 'Clear Street Trades'),
        ('DICKSON', '685', 'Clear Street Trades'),

        -- TITAN
        ('TITAN', '969 ESKHL', 'NAV Position File'),
        -- 'ADU', '905'
        ('TITAN', 'ADU', 'Clear Street Trades'),
        ('TITAN', '905', 'Clear Street Trades')

) AS lookup_data(account_name, account, source)
