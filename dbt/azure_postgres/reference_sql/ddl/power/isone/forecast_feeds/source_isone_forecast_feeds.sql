{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- Placeholder model for ISO-NE forecast feed source grouping.
-- Individual source models live beside this file.
---------------------------

SELECT 1 AS source_group_marker
