{{
  config(
    materialized='ephemeral'
  )
}}

-- -------------------------------------------------------------
-- -------------------------------------------------------------

-- CME_KSAXENA4
-- ksaxena6
-- elacic2

SELECT * FROM (
    VALUES
        ('CME_KSAXENA4', 'KAPIL'),
        ('ksaxena6', 'KAPIL'),
        ('elacic2', 'EDI')
) AS lookup_data(trader, trader_name)
