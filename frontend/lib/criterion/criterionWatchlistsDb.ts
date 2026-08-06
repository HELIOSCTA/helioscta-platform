import "server-only";

import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { recordDbQuery } from "@/lib/server/apiObservability";
import { query as readQuery } from "@/lib/server/db";
import { getWriterPool } from "@/lib/server/dbWriter";
import { criterionSnowflakeQuery } from "@/lib/server/snowflake";

export const CRITERION_PJM_POWER_PLANTS_WATCHLIST_TYPE = "pjm_power_plants";
export const CRITERION_NOMINATION_POINT_ENTITY_TYPE = "nomination_point";
export const CRITERION_NOMINATION_POINT_SOURCE_TABLE =
  "PRODUCTION.PIPELINES.NOMINATION_POINTS";

const MAX_POINTS_PER_REQUEST = 2_000;
const VALIDATION_CHUNK_SIZE = 200;

export interface CriterionWatchlistRow extends QueryResultRow {
  watchlist_id: number;
  slug: string;
  display_name: string;
  watchlist_type: string;
  source_system: string;
  filter_config: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  point_count: number | string;
}

export interface CriterionWatchlistPointRow extends QueryResultRow {
  watchlist_id: number;
  entity_type: string;
  source_table: string;
  source_key: string;
  tsp_short: string;
  metadata_id: string;
  display_snapshot: Record<string, unknown>;
  source_attrs: Record<string, unknown>;
  state_abb: string | null;
  pipeline_name: string | null;
  location_name: string | null;
  location_id: string | null;
  county_name: string | null;
  connecting_entity: string | null;
  category_short: string | null;
  loc_qti_short: string | null;
  rec_del_sign: number | string | null;
  display_name_override: string | null;
  sort_order: number | null;
  created_by: string | null;
  created_at: string;
}

export interface CriterionWatchlistWithPoints {
  watchlist: CriterionWatchlistRow;
  points: CriterionWatchlistPointRow[];
}

export interface CriterionPointInput {
  sourceTable?: unknown;
  source_table?: unknown;
  tspShort?: unknown;
  tsp_short?: unknown;
  metadataId?: unknown;
  metadata_id?: unknown;
  displayNameOverride?: unknown;
  display_name_override?: unknown;
  sortOrder?: unknown;
  sort_order?: unknown;
}

export interface ParsedCriterionPoint {
  sourceTable: string;
  tspShort: string;
  metadataId: string;
  displayNameOverride: string | null;
  sortOrder: number | null;
}

export interface ValidatedCriterionPoint extends ParsedCriterionPoint {
  state: string | null;
  pipeline: string | null;
  location: string | null;
  locationId: string | null;
  county: string | null;
  connectingEntity: string | null;
  categoryShort: string | null;
  locQtiShort: string | null;
  recDelSign: number | null;
}

export interface CriterionPointParseResult {
  ok: boolean;
  points: ParsedCriterionPoint[];
  error?: string;
}

export interface FilterConfigParseResult {
  ok: boolean;
  filterConfig: Record<string, unknown>;
  error?: string;
}

interface SnowflakeCriterionPointMetadata {
  sourceTable: string;
  tspShort: string;
  metadataId: string;
  state: string | null;
  pipeline: string | null;
  location: string | null;
  locationId: string | null;
  county: string | null;
  connectingEntity: string | null;
  categoryShort: string | null;
  locQtiShort: string | null;
  recDelSign: number | string | null;
}

function pointKey(point: Pick<ParsedCriterionPoint, "sourceTable" | "tspShort" | "metadataId">): string {
  return `${point.sourceTable}|${point.tspShort}|${point.metadataId}`;
}

function criterionNominationPointSourceKey(
  point: Pick<ParsedCriterionPoint, "tspShort" | "metadataId">,
): string {
  return `${point.tspShort}|${point.metadataId}`;
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function metadataIdValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function displayNameOverrideValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const text = stringValue(value);
  return text ? text.slice(0, 255) : null;
}

function sortOrderValue(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isInteger(parsed)) return undefined;
  return parsed;
}

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSourceTable(value: unknown): string | null {
  const sourceTable =
    typeof value === "string" && value.trim()
      ? value.trim().toUpperCase()
      : CRITERION_NOMINATION_POINT_SOURCE_TABLE;
  return sourceTable === CRITERION_NOMINATION_POINT_SOURCE_TABLE ? sourceTable : null;
}

export function slugifyCriterionWatchlistName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function parseCriterionWatchlistId(value: string | null | undefined): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function parseCriterionFilterConfig(value: unknown): FilterConfigParseResult {
  if (value === undefined) return { ok: true, filterConfig: {} };
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return { ok: false, filterConfig: {}, error: "filterConfig must be an object" };
  }
  return { ok: true, filterConfig: value as Record<string, unknown> };
}

export function parseCriterionPointInputs(
  value: unknown,
  required = false,
): CriterionPointParseResult {
  if (value === undefined) {
    return required
      ? { ok: false, points: [], error: "points is required" }
      : { ok: true, points: [] };
  }

  if (!Array.isArray(value)) {
    return { ok: false, points: [], error: "points must be an array" };
  }
  if (required && value.length === 0) {
    return { ok: false, points: [], error: "points must include at least one Criterion point" };
  }
  if (value.length > MAX_POINTS_PER_REQUEST) {
    return {
      ok: false,
      points: [],
      error: `points is limited to ${MAX_POINTS_PER_REQUEST.toLocaleString()} entries`,
    };
  }

  const points: ParsedCriterionPoint[] = [];
  const seen = new Set<string>();

  for (const [index, rawPoint] of value.entries()) {
    if (!rawPoint || Array.isArray(rawPoint) || typeof rawPoint !== "object") {
      return { ok: false, points: [], error: `points[${index}] must be an object` };
    }
    const point = rawPoint as CriterionPointInput;
    const sourceTable = normalizeSourceTable(point.sourceTable ?? point.source_table);
    if (!sourceTable) {
      return {
        ok: false,
        points: [],
        error: `points[${index}].sourceTable must be ${CRITERION_NOMINATION_POINT_SOURCE_TABLE}`,
      };
    }

    const tspShort = stringValue(point.tspShort ?? point.tsp_short);
    if (!tspShort) {
      return { ok: false, points: [], error: `points[${index}].tspShort is required` };
    }

    const metadataId = metadataIdValue(point.metadataId ?? point.metadata_id);
    if (!metadataId) {
      return { ok: false, points: [], error: `points[${index}].metadataId is required` };
    }

    const sortOrder = sortOrderValue(point.sortOrder ?? point.sort_order);
    if (sortOrder === undefined) {
      return {
        ok: false,
        points: [],
        error: `points[${index}].sortOrder must be an integer when provided`,
      };
    }

    const parsedPoint = {
      sourceTable,
      tspShort,
      metadataId,
      displayNameOverride: displayNameOverrideValue(
        point.displayNameOverride ?? point.display_name_override,
      ),
      sortOrder,
    };
    const key = pointKey(parsedPoint);
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(parsedPoint);
  }

  return { ok: true, points };
}

async function timedClientQuery<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  text: string,
  values?: ReadonlyArray<unknown>,
): Promise<QueryResult<T>> {
  const startedAt = performance.now();
  const result = await client.query<T>(text, values as unknown[] | undefined);
  recordDbQuery(performance.now() - startedAt, result.rowCount ?? result.rows.length);
  return result;
}

async function withWriterTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getWriterPool().connect();
  try {
    await timedClientQuery(client, "BEGIN");
    const result = await callback(client);
    await timedClientQuery(client, "COMMIT");
    return result;
  } catch (error) {
    await timedClientQuery(client, "ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function validateCriterionPointChunk(
  points: ParsedCriterionPoint[],
): Promise<SnowflakeCriterionPointMetadata[]> {
  if (points.length === 0) return [];
  const valuesSql = points.map(() => "(?, ?)").join(", ");
  const binds = points.flatMap((point) => [point.tspShort, point.metadataId]);
  const sql = `
with requested_points(tsp_short, metadata_id) as (
  select column1::varchar, column2::varchar
  from values ${valuesSql}
),
metadata_rows as (
  select
    '${CRITERION_NOMINATION_POINT_SOURCE_TABLE}' as "sourceTable",
    m.tsp_short::varchar as "tspShort",
    to_varchar(m.metadata_id) as "metadataId",
    m.state_abb::varchar as "state",
    m.pipeline_name::varchar as "pipeline",
    coalesce(nullif(m.loc_name, ''), nullif(m.connecting_entity, ''), to_varchar(m.metadata_id))::varchar as "location",
    m.loc::varchar as "locationId",
    m.county_name::varchar as "county",
    m.connecting_entity::varchar as "connectingEntity",
    m.category_short::varchar as "categoryShort",
    m.loc_qti_short::varchar as "locQtiShort",
    m.rec_del_sign as "recDelSign"
  from requested_points rp
  join production.pipelines.metadata m
    on m.tsp_short = rp.tsp_short
    and to_varchar(m.metadata_id) = rp.metadata_id
  where m.category_short = 'Power'
    and (m.loc_qti_short = 'DPQ' or m.rec_del_sign = -1)
  qualify row_number() over (
    partition by m.tsp_short, to_varchar(m.metadata_id)
    order by m.pipeline_name, m.loc_name
  ) = 1
)
select *
from metadata_rows
order by "state", "pipeline", "location"
`;
  return criterionSnowflakeQuery<SnowflakeCriterionPointMetadata>(sql, binds);
}

export async function validateCriterionPlantPoints(
  points: ParsedCriterionPoint[],
): Promise<{
  validPoints: ValidatedCriterionPoint[];
  invalidPoints: ParsedCriterionPoint[];
}> {
  const metadataRows: SnowflakeCriterionPointMetadata[] = [];
  for (let index = 0; index < points.length; index += VALIDATION_CHUNK_SIZE) {
    metadataRows.push(...(await validateCriterionPointChunk(points.slice(index, index + VALIDATION_CHUNK_SIZE))));
  }

  const metadataByKey = new Map(
    metadataRows.map((row) => [
      pointKey({
        sourceTable: row.sourceTable,
        tspShort: row.tspShort,
        metadataId: row.metadataId,
      }),
      row,
    ]),
  );
  const validPoints: ValidatedCriterionPoint[] = [];
  const invalidPoints: ParsedCriterionPoint[] = [];

  for (const point of points) {
    const metadata = metadataByKey.get(pointKey(point));
    if (!metadata) {
      invalidPoints.push(point);
      continue;
    }
    validPoints.push({
      ...point,
      state: metadata.state,
      pipeline: metadata.pipeline,
      location: metadata.location,
      locationId: metadata.locationId,
      county: metadata.county,
      connectingEntity: metadata.connectingEntity,
      categoryShort: metadata.categoryShort,
      locQtiShort: metadata.locQtiShort,
      recDelSign: numberOrNull(metadata.recDelSign),
    });
  }

  return { validPoints, invalidPoints };
}

function pointsInsertValues(points: ValidatedCriterionPoint[], userEmail: string) {
  return [
    points.map((point) => point.sourceTable),
    points.map((point) => criterionNominationPointSourceKey(point)),
    points.map((point) => point.tspShort),
    points.map((point) => point.metadataId),
    points.map((point) => point.state),
    points.map((point) => point.pipeline),
    points.map((point) => point.location),
    points.map((point) => point.locationId),
    points.map((point) => point.county),
    points.map((point) => point.connectingEntity),
    points.map((point) => point.categoryShort),
    points.map((point) => point.locQtiShort),
    points.map((point) => point.recDelSign),
    points.map((point) => point.displayNameOverride),
    points.map((point) => point.sortOrder),
    points.map(() => userEmail),
  ];
}

async function insertCriterionWatchlistPoints(
  client: PoolClient,
  watchlistId: number,
  points: ValidatedCriterionPoint[],
  userEmail: string,
): Promise<void> {
  if (points.length === 0) return;

  await timedClientQuery(
    client,
    `INSERT INTO helioscta_app.criterion_watchlist_items
       (watchlist_id,
        entity_type,
        source_table,
        source_key,
        tsp_short,
        metadata_id,
        display_snapshot,
        source_attrs,
        display_name_override,
        sort_order,
        created_by)
     SELECT $1,
            '${CRITERION_NOMINATION_POINT_ENTITY_TYPE}',
            source_table,
            source_key,
            tsp_short,
            metadata_id,
            jsonb_strip_nulls(
              jsonb_build_object(
                'state', state_abb,
                'pipeline', pipeline_name,
                'location', location_name,
                'locationId', location_id,
                'county', county_name,
                'connectingEntity', connecting_entity
              )
            ),
            jsonb_strip_nulls(
              jsonb_build_object(
                'categoryShort', category_short,
                'locQtiShort', loc_qti_short,
                'recDelSign', rec_del_sign
              )
            ),
            display_name_override,
            sort_order,
            created_by
     FROM unnest(
       $2::text[],
       $3::text[],
       $4::text[],
       $5::text[],
       $6::text[],
       $7::text[],
       $8::text[],
       $9::text[],
       $10::text[],
       $11::text[],
       $12::text[],
       $13::text[],
       $14::smallint[],
       $15::text[],
       $16::integer[],
       $17::varchar[]
     ) AS rows(
       source_table,
       source_key,
       tsp_short,
       metadata_id,
       state_abb,
       pipeline_name,
       location_name,
       location_id,
       county_name,
       connecting_entity,
       category_short,
       loc_qti_short,
       rec_del_sign,
       display_name_override,
       sort_order,
       created_by
     )
     ON CONFLICT (watchlist_id, entity_type, source_table, source_key) DO UPDATE
     SET tsp_short = EXCLUDED.tsp_short,
         metadata_id = EXCLUDED.metadata_id,
         display_snapshot = EXCLUDED.display_snapshot,
         source_attrs = EXCLUDED.source_attrs,
         display_name_override = EXCLUDED.display_name_override,
         sort_order = EXCLUDED.sort_order`,
    [watchlistId, ...pointsInsertValues(points, userEmail)],
  );
}

export async function listCriterionWatchlists(): Promise<CriterionWatchlistRow[]> {
  return readQuery<CriterionWatchlistRow>(
    `SELECT wl.watchlist_id,
            wl.slug,
            wl.display_name,
            wl.watchlist_type,
            wl.source_system,
            COALESCE(wl.filter_config, '{}'::jsonb) AS filter_config,
            wl.created_by,
            wl.created_at,
            wl.updated_at,
            count(wli.source_key)::integer AS point_count
     FROM helioscta_app.criterion_watchlists AS wl
     LEFT JOIN helioscta_app.criterion_watchlist_items AS wli
       ON wli.watchlist_id = wl.watchlist_id
      AND wli.entity_type = $2
     WHERE wl.is_active = TRUE
       AND wl.source_system = 'criterion'
       AND wl.watchlist_type = $1
     GROUP BY wl.watchlist_id,
              wl.slug,
              wl.display_name,
              wl.watchlist_type,
              wl.source_system,
              wl.filter_config,
              wl.created_by,
              wl.created_at,
              wl.updated_at
     ORDER BY wl.display_name`,
    [CRITERION_PJM_POWER_PLANTS_WATCHLIST_TYPE, CRITERION_NOMINATION_POINT_ENTITY_TYPE],
  );
}

export async function getCriterionWatchlist(
  watchlistId: number,
): Promise<CriterionWatchlistWithPoints | null> {
  const watchlists = await readQuery<CriterionWatchlistRow>(
    `SELECT wl.watchlist_id,
            wl.slug,
            wl.display_name,
            wl.watchlist_type,
            wl.source_system,
            COALESCE(wl.filter_config, '{}'::jsonb) AS filter_config,
            wl.created_by,
            wl.created_at,
            wl.updated_at,
            count(wli.source_key)::integer AS point_count
     FROM helioscta_app.criterion_watchlists AS wl
     LEFT JOIN helioscta_app.criterion_watchlist_items AS wli
       ON wli.watchlist_id = wl.watchlist_id
      AND wli.entity_type = $3
     WHERE wl.watchlist_id = $1
       AND wl.is_active = TRUE
       AND wl.source_system = 'criterion'
       AND wl.watchlist_type = $2
     GROUP BY wl.watchlist_id,
              wl.slug,
              wl.display_name,
              wl.watchlist_type,
              wl.source_system,
              wl.filter_config,
              wl.created_by,
              wl.created_at,
              wl.updated_at`,
    [watchlistId, CRITERION_PJM_POWER_PLANTS_WATCHLIST_TYPE, CRITERION_NOMINATION_POINT_ENTITY_TYPE],
  );
  const watchlist = watchlists[0] ?? null;
  if (!watchlist) return null;

  const points = await readQuery<CriterionWatchlistPointRow>(
    `SELECT watchlist_id,
            entity_type,
            source_table,
            source_key,
            tsp_short,
            metadata_id,
            COALESCE(display_snapshot, '{}'::jsonb) AS display_snapshot,
            COALESCE(source_attrs, '{}'::jsonb) AS source_attrs,
            display_snapshot ->> 'state' AS state_abb,
            display_snapshot ->> 'pipeline' AS pipeline_name,
            display_snapshot ->> 'location' AS location_name,
            display_snapshot ->> 'locationId' AS location_id,
            display_snapshot ->> 'county' AS county_name,
            display_snapshot ->> 'connectingEntity' AS connecting_entity,
            source_attrs ->> 'categoryShort' AS category_short,
            source_attrs ->> 'locQtiShort' AS loc_qti_short,
            source_attrs ->> 'recDelSign' AS rec_del_sign,
            display_name_override,
            sort_order,
            created_by,
            created_at
     FROM helioscta_app.criterion_watchlist_items
     WHERE watchlist_id = $1
       AND entity_type = $2
     ORDER BY sort_order NULLS LAST,
              display_snapshot ->> 'state' NULLS LAST,
              display_snapshot ->> 'pipeline' NULLS LAST,
              display_snapshot ->> 'location' NULLS LAST,
              metadata_id`,
    [watchlistId, CRITERION_NOMINATION_POINT_ENTITY_TYPE],
  );

  return { watchlist, points };
}

export async function createCriterionWatchlist({
  name,
  filterConfig,
  points,
  userEmail,
}: {
  name: string;
  filterConfig: Record<string, unknown>;
  points: ValidatedCriterionPoint[];
  userEmail: string;
}): Promise<CriterionWatchlistWithPoints | null> {
  const slug = slugifyCriterionWatchlistName(name);
  const watchlistId = await withWriterTransaction(async (client) => {
    const result = await timedClientQuery<CriterionWatchlistRow>(
      client,
      `INSERT INTO helioscta_app.criterion_watchlists
         (slug, display_name, watchlist_type, source_system, filter_config, created_by)
       VALUES ($1, $2, $3, 'criterion', $4::jsonb, $5)
       RETURNING watchlist_id`,
      [slug, name.trim(), CRITERION_PJM_POWER_PLANTS_WATCHLIST_TYPE, JSON.stringify(filterConfig), userEmail],
    );
    const id = result.rows[0]?.watchlist_id;
    if (!id) throw new Error("Failed to create Criterion watchlist");
    await insertCriterionWatchlistPoints(client, id, points, userEmail);
    return id;
  });

  return getCriterionWatchlist(watchlistId);
}

export async function updateCriterionWatchlist({
  watchlistId,
  name,
  filterConfig,
  points,
  userEmail,
}: {
  watchlistId: number;
  name?: string;
  filterConfig?: Record<string, unknown>;
  points?: ValidatedCriterionPoint[];
  userEmail: string;
}): Promise<CriterionWatchlistWithPoints | null> {
  const exists = await withWriterTransaction(async (client) => {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name !== undefined) {
      sets.push(`display_name = $${idx++}`);
      values.push(name.trim());
      sets.push(`slug = $${idx++}`);
      values.push(slugifyCriterionWatchlistName(name));
    }

    if (filterConfig !== undefined) {
      sets.push(`filter_config = $${idx++}::jsonb`);
      values.push(JSON.stringify(filterConfig));
    }

    sets.push("updated_at = now()");
    values.push(watchlistId);

    const updateResult = await timedClientQuery(
      client,
      `UPDATE helioscta_app.criterion_watchlists
       SET ${sets.join(", ")}
       WHERE watchlist_id = $${idx}
         AND is_active = TRUE
         AND source_system = 'criterion'
         AND watchlist_type = $${idx + 1}`,
      [...values, CRITERION_PJM_POWER_PLANTS_WATCHLIST_TYPE],
    );
    if ((updateResult.rowCount ?? 0) === 0) return false;

    if (points !== undefined) {
      await timedClientQuery(
        client,
        `DELETE FROM helioscta_app.criterion_watchlist_items
         WHERE watchlist_id = $1
           AND entity_type = $2`,
        [watchlistId, CRITERION_NOMINATION_POINT_ENTITY_TYPE],
      );
      await insertCriterionWatchlistPoints(client, watchlistId, points, userEmail);
    }

    return true;
  });

  return exists ? getCriterionWatchlist(watchlistId) : null;
}

export async function addCriterionWatchlistPoints({
  watchlistId,
  points,
  userEmail,
}: {
  watchlistId: number;
  points: ValidatedCriterionPoint[];
  userEmail: string;
}): Promise<CriterionWatchlistWithPoints | null> {
  const exists = await withWriterTransaction(async (client) => {
    const result = await timedClientQuery(
      client,
      `SELECT 1
       FROM helioscta_app.criterion_watchlists
       WHERE watchlist_id = $1
         AND is_active = TRUE
         AND source_system = 'criterion'
         AND watchlist_type = $2`,
      [watchlistId, CRITERION_PJM_POWER_PLANTS_WATCHLIST_TYPE],
    );
    if (result.rows.length === 0) return false;
    await insertCriterionWatchlistPoints(client, watchlistId, points, userEmail);
    return true;
  });

  return exists ? getCriterionWatchlist(watchlistId) : null;
}

export async function removeCriterionWatchlistPoints({
  watchlistId,
  points,
}: {
  watchlistId: number;
  points: ParsedCriterionPoint[];
}): Promise<CriterionWatchlistWithPoints | null> {
  const exists = await withWriterTransaction(async (client) => {
    const watchlistResult = await timedClientQuery(
      client,
      `SELECT 1
       FROM helioscta_app.criterion_watchlists
       WHERE watchlist_id = $1
         AND is_active = TRUE
         AND source_system = 'criterion'
         AND watchlist_type = $2`,
      [watchlistId, CRITERION_PJM_POWER_PLANTS_WATCHLIST_TYPE],
    );
    if (watchlistResult.rows.length === 0) return false;

    await timedClientQuery(
      client,
      `DELETE FROM helioscta_app.criterion_watchlist_items
       WHERE watchlist_id = $1
         AND entity_type = $2
         AND (source_table, source_key) IN (
           SELECT source_table, source_key
           FROM unnest(
             $3::text[],
             $4::text[]
           ) AS keys(source_table, source_key)
         )`,
      [
        watchlistId,
        CRITERION_NOMINATION_POINT_ENTITY_TYPE,
        points.map((point) => point.sourceTable),
        points.map((point) => criterionNominationPointSourceKey(point)),
      ],
    );
    return true;
  });

  return exists ? getCriterionWatchlist(watchlistId) : null;
}

export async function softDeleteCriterionWatchlist(watchlistId: number): Promise<boolean> {
  const exists = await withWriterTransaction(async (client) => {
    const result = await timedClientQuery(
      client,
      `UPDATE helioscta_app.criterion_watchlists
       SET is_active = FALSE,
           updated_at = now()
       WHERE watchlist_id = $1
         AND is_active = TRUE
         AND source_system = 'criterion'
         AND watchlist_type = $2`,
      [watchlistId, CRITERION_PJM_POWER_PLANTS_WATCHLIST_TYPE],
    );
    return (result.rowCount ?? 0) > 0;
  });

  return exists;
}
