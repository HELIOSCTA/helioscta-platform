SELECT TOP (@limit)
  le.location_id,
  le.pipeline_id,
  p.name AS pipeline_name,
  p.short_name AS pipeline_short_name,
  le.tariff_zone,
  le.tz_id,
  le.state,
  le.county,
  le.loc_name,
  le.facility,
  le.interconnecting_entity,
  CAST(le.latitude AS float) AS latitude,
  CAST(le.longitude AS float) AS longitude,
  COUNT(DISTINCT lr.location_role_id) AS location_role_count,
  STRING_AGG(CAST(lr.location_role_id AS varchar(max)), ',') AS location_role_ids,
  STRING_AGG(
    CONCAT(
      CAST(lr.location_role_id AS varchar(max)),
      ':',
      COALESCE(lr.role, ''),
      ':',
      COALESCE(lr.role_code, ''),
      ':',
      COALESCE(CAST(lr.sign AS varchar(max)), '')
    ),
    '|'
  ) AS role_details
FROM natgas.location_extended AS le
JOIN natgas.location_role AS lr
  ON le.location_id = lr.location_id
LEFT JOIN natgas.pipelines AS p
  ON le.pipeline_id = p.pipeline_id
WHERE le.latitude IS NOT NULL
  AND le.longitude IS NOT NULL
  AND CAST(le.latitude AS float) BETWEEN 10 AND 75
  AND CAST(le.longitude AS float) BETWEEN -170 AND -50
  /*PIPELINE_FILTER*/
  /*ROLE_ID_FILTER*/
  /*LOCATION_ID_FILTER*/
  /*SEARCH_FILTER*/
GROUP BY
  le.location_id,
  le.pipeline_id,
  p.name,
  p.short_name,
  le.tariff_zone,
  le.tz_id,
  le.state,
  le.county,
  le.loc_name,
  le.facility,
  le.interconnecting_entity,
  CAST(le.latitude AS float),
  CAST(le.longitude AS float)
ORDER BY p.short_name, le.loc_name, le.location_id
OPTION (RECOMPILE)
