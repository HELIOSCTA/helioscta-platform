import {
  buildGenscapePipelinesQuery,
  buildGenscapeRoleDetailsQuery,
} from "@/lib/genscape-noms/sql";
import { observedJsonRoute } from "@/lib/server/apiObservability";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import { localOnlyObservedNotFound } from "@/lib/server/localOnlyApi";
import { mssqlQuery } from "@/lib/server/mssql";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=3600, stale-while-revalidate=300";

interface RoleDetailRow {
  location_role_id: number;
  pipeline_short_name: string | null;
  tariff_zone: string | null;
  loc_name: string | null;
  location_id: number;
  facility?: string | null;
  role?: string | null;
}

function parseCsv(value: string | null): string[] {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function parseNumberCsv(value: string | null): number[] {
  return parseCsv(value)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function uniqueSorted<T extends string | number>(values: T[]): T[] {
  return Array.from(new Set(values)).sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true }),
  );
}

function roleDetailsResponse(rows: RoleDetailRow[]) {
  return {
    pipelines: uniqueSorted(
      rows
        .map((row) => row.pipeline_short_name)
        .filter((value): value is string => Boolean(value)),
    ),
    loc_names: uniqueSorted(
      rows.map((row) => row.loc_name).filter((value): value is string => Boolean(value)),
    ),
    location_role_ids: uniqueSorted(
      rows
        .map((row) => row.location_role_id)
        .filter((value): value is number => value != null),
    ),
    location_ids: uniqueSorted(
      rows.map((row) => row.location_id).filter((value): value is number => value != null),
    ),
    role_id_details: rows.map((row) => ({
      location_role_id: row.location_role_id,
      pipeline: row.pipeline_short_name ?? "",
      tariff_zone: row.tariff_zone ?? "",
      loc_name: row.loc_name ?? "",
      location_id: row.location_id,
      facility: row.facility ?? "",
      role: row.role ?? "",
    })),
    rowCount: rows.length,
  };
}

export const GET = observedJsonRoute(
  {
    route: "/api/genscape-noms/filters",
    cacheHeader: CACHE_HEADER,
    cachePolicy: "s-maxage=3600, stale-while-revalidate=300",
    owner: "gas",
    purpose: "Read Genscape nominations filter metadata from Azure SQL.",
    p95TargetMs: 2_500,
    freshnessSource: "GenscapeDataFeed.natgas metadata",
  },
  async (request) => {
    if (!isLocalOnlyFeatureEnabled()) {
      return localOnlyObservedNotFound();
    }

    const { searchParams } = new URL(request.url);
    const pipelines = parseCsv(searchParams.get("pipelines"));
    const locNames = parseCsv(searchParams.get("locNames"));
    const roleIds = parseNumberCsv(searchParams.get("locationRoleIds"));
    const locationIds = parseNumberCsv(searchParams.get("locationIds"));

    if (
      locationIds.length > 0 ||
      roleIds.length > 0 ||
      pipelines.length > 0 ||
      locNames.length > 0
    ) {
      const query = buildGenscapeRoleDetailsQuery({
        roleIds,
        locationIds,
        pipelines,
        locNames,
      });
      const rows = await mssqlQuery<RoleDetailRow>(query.sql, query.params);
      return {
        payload: roleDetailsResponse(rows),
        rowCount: rows.length,
        dataAsOf: "metadata",
        headers: {
          "X-Genscape-Filters-Cache": "ORIGIN",
        },
      };
    }

    const query = buildGenscapePipelinesQuery();
    const pipelineRows = await mssqlQuery<{ pipeline_short_name: string }>(
      query.sql,
      query.params,
    );
    const pipelinesPayload = pipelineRows.map((row) => row.pipeline_short_name).filter(Boolean);

    return {
      payload: {
        pipelines: pipelinesPayload,
        rowCount: pipelineRows.length,
      },
      rowCount: pipelineRows.length,
      dataAsOf: "metadata",
      headers: {
        "X-Genscape-Filters-Cache": "ORIGIN",
      },
    };
  },
);
