import "server-only";

import { readFileSync } from "fs";
import path from "path";

type Params = Record<string, unknown>;

export interface GenscapeNomsQueryInput {
  startDate: string | null;
  endDate: string | null;
  locationIds: number[];
  roleIds: number[];
  pipelines: string[];
  locNames: string[];
  search: string | null;
  limit: number;
  offset: number;
}

export interface GenscapeRoleDetailsQueryInput {
  roleIds?: number[];
  locationIds?: number[];
  pipelines?: string[];
  locNames?: string[];
  search?: string | null;
}

export interface GenscapeNomsMapQueryInput extends GenscapeRoleDetailsQueryInput {
  startDate: string | null;
  endDate: string | null;
  limit: number;
}

interface BuiltQuery {
  sql: string;
  params: Params;
}

const sqlDir = path.join(process.cwd(), "sql", "genscape-noms");
const templates = {
  list: readFileSync(path.join(sqlDir, "list.sql"), "utf8"),
  count: readFileSync(path.join(sqlDir, "count.sql"), "utf8"),
  map: readFileSync(path.join(sqlDir, "map.sql"), "utf8"),
  roleDetails: readFileSync(path.join(sqlDir, "role-details.sql"), "utf8"),
  pipelines: readFileSync(path.join(sqlDir, "pipelines.sql"), "utf8"),
  locNames: readFileSync(path.join(sqlDir, "loc-names.sql"), "utf8"),
};

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

function buildDateFilter(
  startDate: string | null,
  endDate: string | null,
  params: Params
): string {
  const clauses: string[] = [];

  if (startDate) {
    params.startDate = startDate;
    clauses.push("AND noms.gas_day >= CAST(@startDate AS date)");
  }

  if (endDate) {
    params.endDate = endDate;
    clauses.push("AND noms.gas_day < DATEADD(day, 1, CAST(@endDate AS date))");
  }

  return clauses.join("\n  ");
}

function buildSearchFilter(search: string | null | undefined, params: Params): string {
  if (!search) return "";

  params.search = `%${search}%`;
  return [
    "AND (",
    "  le.loc_name LIKE @search",
    "  OR le.facility LIKE @search",
    "  OR le.interconnecting_entity LIKE @search",
    ")",
  ].join("\n  ");
}

function applyCommonFilters(
  template: string,
  input: GenscapeRoleDetailsQueryInput,
  params: Params
): string {
  return template
    .replace(
      "/*ROLE_ID_FILTER*/",
      addNumberInFilter(input.roleIds ?? [], "lr.location_role_id", "role", params)
    )
    .replace(
      "/*LOCATION_ID_FILTER*/",
      addNumberInFilter(input.locationIds ?? [], "lr.location_id", "location", params)
    )
    .replace(
      "/*PIPELINE_FILTER*/",
      addStringInFilter(input.pipelines ?? [], "p.short_name", "pipeline", params)
    )
    .replace(
      "/*LOC_NAME_FILTER*/",
      addStringInFilter(input.locNames ?? [], "le.loc_name", "locName", params)
    )
    .replace("/*SEARCH_FILTER*/", buildSearchFilter(input.search, params));
}

function applyNominationsRoleFilter(
  sql: string,
  roleIds: number[],
  params: Params
): string {
  return sql.replace(
    "/*NOMS_ROLE_ID_FILTER*/",
    addNumberInFilter(roleIds, "noms.location_role_id", "nomsRole", params)
  );
}

function compactSql(sql: string): string {
  return sql.replace(/^[ \t]+$/gm, "").trim();
}

export function buildGenscapeNomsListQuery(input: GenscapeNomsQueryInput): BuiltQuery {
  const params: Params = {
    limit: input.limit,
    offset: input.offset,
  };

  const sql = applyNominationsRoleFilter(
    applyCommonFilters(
      templates.list,
      {
        roleIds: input.roleIds,
        locationIds: input.locationIds,
        pipelines: input.pipelines,
        locNames: input.locNames,
        search: input.search,
      },
      params
    ),
    input.roleIds,
    params
  ).replace("/*DATE_FILTER*/", buildDateFilter(input.startDate, input.endDate, params));

  return { sql: compactSql(sql), params };
}

export function buildGenscapeNomsCountQuery(input: GenscapeNomsQueryInput): BuiltQuery {
  const params: Params = {};

  const sql = applyNominationsRoleFilter(
    applyCommonFilters(
      templates.count,
      {
        roleIds: input.roleIds,
        locationIds: input.locationIds,
        pipelines: input.pipelines,
        locNames: input.locNames,
        search: input.search,
      },
      params
    ),
    input.roleIds,
    params
  ).replace("/*DATE_FILTER*/", buildDateFilter(input.startDate, input.endDate, params));

  return { sql: compactSql(sql), params };
}

export function buildGenscapeNomsMapQuery(input: GenscapeNomsMapQueryInput): BuiltQuery {
  const params: Params = {
    limit: input.limit,
  };

  const sql = applyNominationsRoleFilter(
    applyCommonFilters(
      templates.map,
      {
        roleIds: input.roleIds,
        locationIds: input.locationIds,
        pipelines: input.pipelines,
        locNames: input.locNames,
        search: input.search,
      },
      params
    ),
    input.roleIds ?? [],
    params
  ).replace("/*DATE_FILTER*/", buildDateFilter(input.startDate, input.endDate, params));

  return { sql: compactSql(sql), params };
}

export function buildGenscapeRoleDetailsQuery(
  input: GenscapeRoleDetailsQueryInput
): BuiltQuery {
  const params: Params = {};
  const sql = applyCommonFilters(templates.roleDetails, input, params);

  return { sql: compactSql(sql), params };
}

export function buildGenscapeLocNamesQuery(
  input: GenscapeRoleDetailsQueryInput
): BuiltQuery {
  const params: Params = {};
  const sql = applyCommonFilters(templates.locNames, input, params);

  return { sql: compactSql(sql), params };
}

export function buildGenscapePipelinesQuery(): BuiltQuery {
  return { sql: compactSql(templates.pipelines), params: {} };
}
