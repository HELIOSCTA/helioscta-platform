import "server-only";

import { readFileSync } from "fs";
import path from "path";

type Params = Record<string, unknown>;

interface BuiltQuery {
  sql: string;
  params: Params;
}

export interface MapLocationsQueryInput {
  pipelineShortNames?: string[];
  locationRoleIds?: number[];
  locationIds?: number[];
  search?: string | null;
  limit?: number;
}

export interface MapSearchQueryInput {
  search: string;
  limit?: number;
}

const sqlDir = path.join(process.cwd(), "sql", "map-metadata");
const templates = {
  pipelines: readFileSync(path.join(sqlDir, "pipelines.sql"), "utf8"),
  locations: readFileSync(path.join(sqlDir, "locations.sql"), "utf8"),
  searchPipelines: readFileSync(path.join(sqlDir, "search-pipelines.sql"), "utf8"),
};

function compactSql(sql: string): string {
  return sql.replace(/^[ \t]+$/gm, "").trim();
}

function addStringInFilter(
  values: string[],
  column: string,
  prefix: string,
  params: Params
): string {
  const filtered = values.map((value) => value.trim()).filter(Boolean);
  if (filtered.length === 0) return "";

  const placeholders = filtered.map((value, index) => {
    const key = `${prefix}${index}`;
    params[key] = value;
    return `@${key}`;
  });

  return `AND ${column} IN (${placeholders.join(", ")})`;
}

function addNumberInFilter(
  values: number[],
  column: string,
  prefix: string,
  params: Params
): string {
  if (values.length === 0) return "";

  const placeholders = values.map((value, index) => {
    const key = `${prefix}${index}`;
    params[key] = value;
    return `@${key}`;
  });

  return `AND ${column} IN (${placeholders.join(", ")})`;
}

function buildLocationSearchFilter(search: string | null | undefined, params: Params): string {
  if (!search?.trim()) return "";

  const trimmed = search.trim();
  params.search = `%${trimmed}%`;

  const numeric = Number.parseInt(trimmed, 10);
  if (Number.isFinite(numeric) && String(numeric) === trimmed) {
    params.searchId = numeric;
    return [
      "AND (",
      "  p.short_name LIKE @search",
      "  OR p.name LIKE @search",
      "  OR le.loc_name LIKE @search",
      "  OR le.facility LIKE @search",
      "  OR le.interconnecting_entity LIKE @search",
      "  OR le.state LIKE @search",
      "  OR le.county LIKE @search",
      "  OR le.location_id = @searchId",
      "  OR lr.location_role_id = @searchId",
      ")",
    ].join("\n  ");
  }

  return [
    "AND (",
    "  p.short_name LIKE @search",
    "  OR p.name LIKE @search",
    "  OR le.loc_name LIKE @search",
    "  OR le.facility LIKE @search",
    "  OR le.interconnecting_entity LIKE @search",
    "  OR le.state LIKE @search",
    "  OR le.county LIKE @search",
    ")",
  ].join("\n  ");
}

export function buildMapPipelinesQuery(): BuiltQuery {
  return { sql: compactSql(templates.pipelines), params: {} };
}

export function buildMapLocationsQuery(input: MapLocationsQueryInput): BuiltQuery {
  const params: Params = {
    limit: input.limit && input.limit > 0 ? Math.min(input.limit, 5000) : 1000,
  };

  const sql = templates.locations
    .replace(
      "/*PIPELINE_FILTER*/",
      addStringInFilter(input.pipelineShortNames ?? [], "p.short_name", "pipeline", params)
    )
    .replace(
      "/*ROLE_ID_FILTER*/",
      addNumberInFilter(input.locationRoleIds ?? [], "lr.location_role_id", "role", params)
    )
    .replace(
      "/*LOCATION_ID_FILTER*/",
      addNumberInFilter(input.locationIds ?? [], "le.location_id", "location", params)
    )
    .replace("/*SEARCH_FILTER*/", buildLocationSearchFilter(input.search, params));

  return { sql: compactSql(sql), params };
}

export function buildMapSearchPipelinesQuery(input: MapSearchQueryInput): BuiltQuery {
  const params: Params = {
    search: `%${input.search.trim()}%`,
    limit: input.limit && input.limit > 0 ? Math.min(input.limit, 100) : 25,
  };

  return { sql: compactSql(templates.searchPipelines), params };
}
