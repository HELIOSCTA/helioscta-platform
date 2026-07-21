import "server-only";

import type { QueryResultRow } from "pg";
import { query as readQuery } from "@/lib/server/db";
import { writerQuery } from "@/lib/server/dbWriter";

export interface WatchlistRow extends QueryResultRow {
  watchlist_id: number;
  slug: string;
  display_name: string;
  location_role_ids: number[];
  sign_overrides: Record<string, number>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleIdParseResult {
  ok: boolean;
  roleIds: number[];
  error?: string;
}

export interface SignOverridesParseResult {
  ok: boolean;
  signOverrides: Record<string, number>;
  error?: string;
}

export function slugifyWatchlistName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function parseLocationRoleIds(value: unknown, required = false): RoleIdParseResult {
  if (value === undefined) {
    return required
      ? { ok: false, roleIds: [], error: "locationRoleIds is required" }
      : { ok: true, roleIds: [] };
  }

  if (!Array.isArray(value)) {
    return { ok: false, roleIds: [], error: "locationRoleIds must be an array of integers" };
  }

  const numericRoleIds = value.map((item) => (typeof item === "number" ? item : Number.NaN));
  if (!numericRoleIds.every((item) => Number.isInteger(item) && item > 0)) {
    return { ok: false, roleIds: [], error: "locationRoleIds must be positive integers" };
  }

  const roleIds = Array.from(new Set(numericRoleIds)).sort((a, b) => a - b);
  if (required && roleIds.length === 0) {
    return { ok: false, roleIds: [], error: "locationRoleIds must include at least one role ID" };
  }

  return { ok: true, roleIds };
}

export function parseSignOverrides(value: unknown): SignOverridesParseResult {
  if (value === undefined) return { ok: true, signOverrides: {} };
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return { ok: false, signOverrides: {}, error: "signOverrides must be an object" };
  }

  const signOverrides: Record<string, number> = {};
  for (const [rawRoleId, rawSign] of Object.entries(value)) {
    const roleId = Number.parseInt(rawRoleId, 10);
    if (!Number.isInteger(roleId) || roleId <= 0 || String(roleId) !== rawRoleId) {
      return {
        ok: false,
        signOverrides: {},
        error: "signOverrides keys must be positive integer role IDs",
      };
    }

    if (rawSign === null || rawSign === undefined || rawSign === "") continue;
    const sign = typeof rawSign === "number" ? rawSign : Number.NaN;
    if (![-1, 1].includes(sign)) {
      return {
        ok: false,
        signOverrides: {},
        error: "signOverrides values must be -1 or 1",
      };
    }
    signOverrides[String(roleId)] = sign;
  }

  return { ok: true, signOverrides };
}

function pruneSignOverrides(
  signOverrides: Record<string, number>,
  roleIds: number[],
): Record<string, number> {
  const allowedRoleIds = new Set(roleIds.map(String));
  return Object.fromEntries(
    Object.entries(signOverrides).filter(([roleId]) => allowedRoleIds.has(roleId)),
  );
}

async function replaceNormalizedRoles(
  watchlistId: number,
  roleIds: number[],
  userEmail: string,
): Promise<void> {
  await writerQuery(
    `DELETE FROM helioscta_app.genscape_noms_watchlist_roles
     WHERE watchlist_id = $1`,
    [watchlistId],
  );

  if (roleIds.length === 0) return;

  await writerQuery(
    `INSERT INTO helioscta_app.genscape_noms_watchlist_roles
       (watchlist_id, location_role_id, created_by)
     SELECT $1, role_id, $3
     FROM unnest($2::integer[]) AS ids(role_id)
     ON CONFLICT (watchlist_id, location_role_id) DO NOTHING`,
    [watchlistId, roleIds, userEmail],
  );
}

export async function listActiveWatchlists(): Promise<WatchlistRow[]> {
  return readQuery<WatchlistRow>(
    `SELECT watchlist_id,
            slug,
            display_name,
            location_role_ids,
            COALESCE(sign_overrides, '{}'::jsonb) AS sign_overrides,
            created_by,
            created_at,
            updated_at
     FROM helioscta_app.genscape_noms_watchlists
     WHERE is_active = TRUE
     ORDER BY display_name`,
  );
}

export async function createWatchlist({
  name,
  roleIds,
  signOverrides = {},
  userEmail,
}: {
  name: string;
  roleIds: number[];
  signOverrides?: Record<string, number>;
  userEmail: string;
}): Promise<WatchlistRow> {
  const slug = slugifyWatchlistName(name);
  const prunedSignOverrides = pruneSignOverrides(signOverrides, roleIds);
  const result = await writerQuery<WatchlistRow>(
    `INSERT INTO helioscta_app.genscape_noms_watchlists
       (slug, display_name, location_role_ids, sign_overrides, created_by)
     VALUES ($1, $2, $3::integer[], $4::jsonb, $5)
     RETURNING watchlist_id,
               slug,
               display_name,
               location_role_ids,
               COALESCE(sign_overrides, '{}'::jsonb) AS sign_overrides,
               created_by,
               created_at,
               updated_at`,
    [slug, name.trim(), roleIds, JSON.stringify(prunedSignOverrides), userEmail],
  );
  const watchlist = result.rows[0];
  await replaceNormalizedRoles(watchlist.watchlist_id, roleIds, userEmail);
  return watchlist;
}

export async function updateWatchlist({
  watchlistId,
  name,
  roleIds,
  signOverrides,
  userEmail,
}: {
  watchlistId: number;
  name?: string;
  roleIds?: number[];
  signOverrides?: Record<string, number>;
  userEmail: string;
}): Promise<WatchlistRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (name !== undefined) {
    sets.push(`display_name = $${idx++}`);
    values.push(name.trim());
    sets.push(`slug = $${idx++}`);
    values.push(slugifyWatchlistName(name));
  }

  if (roleIds !== undefined) {
    sets.push(`location_role_ids = $${idx++}::integer[]`);
    values.push(roleIds);
  }

  if (signOverrides !== undefined) {
    const pruned = roleIds ? pruneSignOverrides(signOverrides, roleIds) : signOverrides;
    sets.push(`sign_overrides = $${idx++}::jsonb`);
    values.push(JSON.stringify(pruned));
  } else if (roleIds !== undefined) {
    sets.push(
      `sign_overrides = COALESCE(
         (
           SELECT jsonb_object_agg(key, value)
           FROM jsonb_each(sign_overrides)
           WHERE key = ANY($${idx++}::text[])
         ),
         '{}'::jsonb
       )`,
    );
    values.push(roleIds.map(String));
  }

  sets.push("updated_at = NOW()");
  values.push(watchlistId);

  const result = await writerQuery<WatchlistRow>(
    `UPDATE helioscta_app.genscape_noms_watchlists
     SET ${sets.join(", ")}
     WHERE watchlist_id = $${idx}
       AND is_active = TRUE
     RETURNING watchlist_id,
               slug,
               display_name,
               location_role_ids,
               COALESCE(sign_overrides, '{}'::jsonb) AS sign_overrides,
               created_by,
               created_at,
               updated_at`,
    values,
  );

  const watchlist = result.rows[0] ?? null;
  if (watchlist && roleIds !== undefined) {
    await replaceNormalizedRoles(watchlistId, roleIds, userEmail);
  }
  return watchlist;
}

export async function addWatchlistRoles({
  watchlistId,
  roleIds,
  userEmail,
}: {
  watchlistId: number;
  roleIds: number[];
  userEmail: string;
}): Promise<WatchlistRow | null> {
  const result = await writerQuery<WatchlistRow>(
    `UPDATE helioscta_app.genscape_noms_watchlists
     SET location_role_ids = COALESCE(
           (
             SELECT array_agg(DISTINCT role_id ORDER BY role_id)
             FROM unnest(location_role_ids || $1::integer[]) AS ids(role_id)
             WHERE role_id IS NOT NULL
           ),
           '{}'::integer[]
         ),
         sign_overrides = COALESCE(
           (
             SELECT jsonb_object_agg(key, value)
             FROM jsonb_each(sign_overrides)
             WHERE (key::integer) <> ALL($1::integer[])
           ),
           '{}'::jsonb
         ),
         updated_at = NOW()
     WHERE watchlist_id = $2
       AND is_active = TRUE
     RETURNING watchlist_id,
               slug,
               display_name,
               location_role_ids,
               COALESCE(sign_overrides, '{}'::jsonb) AS sign_overrides,
               created_by,
               created_at,
               updated_at`,
    [roleIds, watchlistId],
  );

  const watchlist = result.rows[0] ?? null;
  if (watchlist) await replaceNormalizedRoles(watchlistId, watchlist.location_role_ids, userEmail);
  return watchlist;
}

export async function removeWatchlistRoles({
  watchlistId,
  roleIds,
  userEmail,
}: {
  watchlistId: number;
  roleIds: number[];
  userEmail: string;
}): Promise<WatchlistRow | null> {
  const result = await writerQuery<WatchlistRow>(
    `UPDATE helioscta_app.genscape_noms_watchlists
     SET location_role_ids = COALESCE(
           (
             SELECT array_agg(role_id ORDER BY role_id)
             FROM unnest(location_role_ids) AS ids(role_id)
             WHERE NOT role_id = ANY($1::integer[])
           ),
           '{}'::integer[]
         ),
         updated_at = NOW()
     WHERE watchlist_id = $2
       AND is_active = TRUE
     RETURNING watchlist_id,
               slug,
               display_name,
               location_role_ids,
               COALESCE(sign_overrides, '{}'::jsonb) AS sign_overrides,
               created_by,
               created_at,
               updated_at`,
    [roleIds, watchlistId],
  );

  const watchlist = result.rows[0] ?? null;
  if (watchlist) await replaceNormalizedRoles(watchlistId, watchlist.location_role_ids, userEmail);
  return watchlist;
}

export async function softDeleteWatchlist(watchlistId: number): Promise<boolean> {
  const result = await writerQuery(
    `UPDATE helioscta_app.genscape_noms_watchlists
     SET is_active = FALSE,
         updated_at = NOW()
     WHERE watchlist_id = $1
       AND is_active = TRUE`,
    [watchlistId],
  );
  return (result.rowCount ?? 0) > 0;
}
