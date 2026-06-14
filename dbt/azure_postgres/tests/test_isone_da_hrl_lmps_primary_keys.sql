WITH duplicate_keys AS (
    SELECT
        date
        ,hour_ending
        ,location_id
        ,location_name
        ,location_type
        ,COUNT(*) AS row_count
    FROM "{{ target.database }}"."isone"."da_hrl_lmps"
    GROUP BY
        date,
        hour_ending,
        location_id,
        location_name,
        location_type
    HAVING COUNT(*) > 1
)

SELECT * FROM duplicate_keys
