SELECT TOP (@limit)
  p.pipeline_id,
  p.name AS pipeline_name,
  p.short_name AS pipeline_short_name,
  COUNT(DISTINCT le.location_id) AS mapped_location_count,
  COUNT(DISTINCT lr.location_role_id) AS location_role_count
FROM natgas.pipelines AS p
JOIN natgas.location_extended AS le
  ON p.pipeline_id = le.pipeline_id
JOIN natgas.location_role AS lr
  ON le.location_id = lr.location_id
WHERE p.short_name IS NOT NULL
  AND p.short_name <> ''
  AND le.latitude IS NOT NULL
  AND le.longitude IS NOT NULL
  AND CAST(le.latitude AS float) BETWEEN 10 AND 75
  AND CAST(le.longitude AS float) BETWEEN -170 AND -50
  AND (
    p.short_name LIKE @search
    OR p.name LIKE @search
  )
GROUP BY
  p.pipeline_id,
  p.name,
  p.short_name
ORDER BY p.short_name
OPTION (RECOMPILE)
