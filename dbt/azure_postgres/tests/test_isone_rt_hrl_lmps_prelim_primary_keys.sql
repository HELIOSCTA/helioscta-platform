WITH duplicate_keys AS (
    SELECT
        date
        ,hour_ending
        ,location
        ,COUNT(*) AS row_count
    FROM "{{ target.database }}"."isone"."rt_hrl_lmps_prelim"
    GROUP BY
        date,
        hour_ending,
        location
    HAVING COUNT(*) > 1
)

SELECT * FROM duplicate_keys
