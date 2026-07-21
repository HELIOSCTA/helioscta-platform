WITH candidate_roles AS (
  SELECT
    lr.location_role_id,
    lr.location_id,
    lr.sign,
    le.pipeline_id,
    p.short_name AS pipeline_short_name,
    le.state,
    le.county,
    le.loc_name,
    le.facility,
    le.latitude,
    le.longitude
  FROM natgas.location_role AS lr
  LEFT JOIN natgas.location_extended AS le
    ON lr.location_id = le.location_id
  LEFT JOIN natgas.pipelines AS p
    ON le.pipeline_id = p.pipeline_id
  WHERE 1 = 1
    /*ROLE_ID_FILTER*/
    /*LOCATION_ID_FILTER*/
    /*PIPELINE_FILTER*/
    /*LOC_NAME_FILTER*/
    /*SEARCH_FILTER*/
),
filtered_noms AS (
  SELECT
    noms.gas_day,
    noms.location_role_id,
    noms.scheduled_cap,
    cr.location_id,
    cr.sign,
    cr.pipeline_id,
    cr.pipeline_short_name,
    cr.state,
    cr.county,
    cr.loc_name,
    cr.facility,
    cr.latitude,
    cr.longitude
  FROM natgas.nominations AS noms
  JOIN candidate_roles AS cr
    ON noms.location_role_id = cr.location_role_id
  WHERE 1 = 1
    AND cr.latitude IS NOT NULL
    AND cr.longitude IS NOT NULL
    /*NOMS_ROLE_ID_FILTER*/
    /*DATE_FILTER*/
),
location_rollup AS (
  SELECT
    location_id,
    pipeline_id,
    pipeline_short_name,
    state,
    county,
    loc_name,
    facility,
    CAST(latitude AS float) AS latitude,
    CAST(longitude AS float) AS longitude,
    COUNT(*) AS row_count,
    COUNT(DISTINCT location_role_id) AS role_count,
    COUNT(DISTINCT gas_day) AS gas_day_count,
    MIN(gas_day) AS first_gas_day,
    MAX(gas_day) AS latest_gas_day,
    SUM(COALESCE(scheduled_cap, 0)) AS scheduled_cap_sum,
    SUM(COALESCE(scheduled_cap, 0) * COALESCE(sign, 0)) AS signed_scheduled_cap_sum
  FROM filtered_noms
  GROUP BY
    location_id,
    pipeline_id,
    pipeline_short_name,
    state,
    county,
    loc_name,
    facility,
    CAST(latitude AS float),
    CAST(longitude AS float)
),
latest_rollup AS (
  SELECT
    fn.location_id,
    fn.pipeline_id,
    SUM(COALESCE(fn.scheduled_cap, 0)) AS latest_scheduled_cap,
    SUM(COALESCE(fn.scheduled_cap, 0) * COALESCE(fn.sign, 0)) AS latest_signed_scheduled_cap
  FROM filtered_noms AS fn
  JOIN location_rollup AS lr
    ON fn.location_id = lr.location_id
    AND fn.pipeline_id = lr.pipeline_id
    AND fn.gas_day = lr.latest_gas_day
  GROUP BY
    fn.location_id,
    fn.pipeline_id
)
SELECT TOP (@limit)
  lr.location_id,
  lr.pipeline_id,
  lr.pipeline_short_name,
  lr.state,
  lr.county,
  lr.loc_name,
  lr.facility,
  lr.latitude,
  lr.longitude,
  lr.row_count,
  lr.role_count,
  lr.gas_day_count,
  lr.first_gas_day,
  lr.latest_gas_day,
  lr.scheduled_cap_sum,
  lr.signed_scheduled_cap_sum,
  latest.latest_scheduled_cap,
  latest.latest_signed_scheduled_cap
FROM location_rollup AS lr
LEFT JOIN latest_rollup AS latest
  ON lr.location_id = latest.location_id
  AND lr.pipeline_id = latest.pipeline_id
ORDER BY ABS(lr.signed_scheduled_cap_sum) DESC, lr.pipeline_short_name, lr.loc_name
OPTION (RECOMPILE)
