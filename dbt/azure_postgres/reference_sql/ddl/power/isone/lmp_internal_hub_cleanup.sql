-- Operator cleanup for narrowing ISO-NE hourly LMP source tables to
-- .H.INTERNAL_HUB only.
--
-- Run manually with helios_admin after deploying hub-only scrapes. This script
-- deletes historical non-hub rows, adds table-level guardrails, and replaces
-- now-redundant location indexes with date/hour indexes.
--
-- Destructive: review the preflight counts before COMMIT.

BEGIN;

SELECT
    'isone.da_hrl_lmps' AS table_name,
    COUNT(*) AS total_rows,
    COUNT(*) FILTER (
        WHERE
            location_id = 4000
            AND location_name = '.H.INTERNAL_HUB'
            AND location_type = 'HUB'
    ) AS internal_hub_rows,
    COUNT(*) FILTER (
        WHERE NOT (
            location_id = 4000
            AND location_name = '.H.INTERNAL_HUB'
            AND location_type = 'HUB'
        )
    ) AS rows_to_delete
FROM isone.da_hrl_lmps
UNION ALL
SELECT
    'isone.rt_hrl_lmps_final' AS table_name,
    COUNT(*) AS total_rows,
    COUNT(*) FILTER (
        WHERE
            location_id = 4000
            AND location_name = '.H.INTERNAL_HUB'
            AND location_type = 'HUB'
    ) AS internal_hub_rows,
    COUNT(*) FILTER (
        WHERE NOT (
            location_id = 4000
            AND location_name = '.H.INTERNAL_HUB'
            AND location_type = 'HUB'
        )
    ) AS rows_to_delete
FROM isone.rt_hrl_lmps_final
UNION ALL
SELECT
    'isone.rt_hrl_lmps_prelim' AS table_name,
    COUNT(*) AS total_rows,
    COUNT(*) FILTER (WHERE location = '.H.INTERNAL_HUB') AS internal_hub_rows,
    COUNT(*) FILTER (WHERE location <> '.H.INTERNAL_HUB') AS rows_to_delete
FROM isone.rt_hrl_lmps_prelim;

DELETE FROM isone.da_hrl_lmps
WHERE NOT (
    location_id = 4000
    AND location_name = '.H.INTERNAL_HUB'
    AND location_type = 'HUB'
);

DELETE FROM isone.rt_hrl_lmps_final
WHERE NOT (
    location_id = 4000
    AND location_name = '.H.INTERNAL_HUB'
    AND location_type = 'HUB'
);

DELETE FROM isone.rt_hrl_lmps_prelim
WHERE location <> '.H.INTERNAL_HUB';

ALTER TABLE isone.da_hrl_lmps
    DROP CONSTRAINT IF EXISTS chk_isone_da_hrl_lmps_internal_hub;

ALTER TABLE isone.da_hrl_lmps
    ADD CONSTRAINT chk_isone_da_hrl_lmps_internal_hub
    CHECK (
        location_id = 4000
        AND location_name = '.H.INTERNAL_HUB'
        AND location_type = 'HUB'
    );

ALTER TABLE isone.rt_hrl_lmps_final
    DROP CONSTRAINT IF EXISTS chk_isone_rt_hrl_lmps_final_internal_hub;

ALTER TABLE isone.rt_hrl_lmps_final
    ADD CONSTRAINT chk_isone_rt_hrl_lmps_final_internal_hub
    CHECK (
        location_id = 4000
        AND location_name = '.H.INTERNAL_HUB'
        AND location_type = 'HUB'
    );

ALTER TABLE isone.rt_hrl_lmps_prelim
    DROP CONSTRAINT IF EXISTS chk_isone_rt_hrl_lmps_prelim_internal_hub;

ALTER TABLE isone.rt_hrl_lmps_prelim
    ADD CONSTRAINT chk_isone_rt_hrl_lmps_prelim_internal_hub
    CHECK (location = '.H.INTERNAL_HUB');

DROP INDEX IF EXISTS isone.idx_isone_da_hrl_lmps_location_date_hour;
DROP INDEX IF EXISTS isone.idx_isone_da_hrl_lmps_internal_hub_date_hour;
DROP INDEX IF EXISTS isone.idx_isone_rt_hrl_lmps_final_location_date_hour;
DROP INDEX IF EXISTS isone.idx_isone_rt_hrl_lmps_final_internal_hub_date_hour;
DROP INDEX IF EXISTS isone.idx_isone_rt_hrl_lmps_prelim_location_date_hour;
DROP INDEX IF EXISTS isone.idx_isone_rt_hrl_lmps_prelim_internal_hub_date_hour;

CREATE INDEX IF NOT EXISTS idx_isone_da_hrl_lmps_date_hour
ON isone.da_hrl_lmps (date, hour_ending);

CREATE INDEX IF NOT EXISTS idx_isone_rt_hrl_lmps_final_date_hour
ON isone.rt_hrl_lmps_final (date, hour_ending);

CREATE INDEX IF NOT EXISTS idx_isone_rt_hrl_lmps_prelim_date_hour
ON isone.rt_hrl_lmps_prelim (date, hour_ending);

SELECT
    'isone.da_hrl_lmps' AS table_name,
    COUNT(*) AS remaining_rows,
    COUNT(*) FILTER (
        WHERE NOT (
            location_id = 4000
            AND location_name = '.H.INTERNAL_HUB'
            AND location_type = 'HUB'
        )
    ) AS remaining_non_hub_rows
FROM isone.da_hrl_lmps
UNION ALL
SELECT
    'isone.rt_hrl_lmps_final' AS table_name,
    COUNT(*) AS remaining_rows,
    COUNT(*) FILTER (
        WHERE NOT (
            location_id = 4000
            AND location_name = '.H.INTERNAL_HUB'
            AND location_type = 'HUB'
        )
    ) AS remaining_non_hub_rows
FROM isone.rt_hrl_lmps_final
UNION ALL
SELECT
    'isone.rt_hrl_lmps_prelim' AS table_name,
    COUNT(*) AS remaining_rows,
    COUNT(*) FILTER (WHERE location <> '.H.INTERNAL_HUB') AS remaining_non_hub_rows
FROM isone.rt_hrl_lmps_prelim;

COMMIT;
