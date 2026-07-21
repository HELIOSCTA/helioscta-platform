import {
  buildGenscapeNomsCountQuery,
  buildGenscapeNomsListQuery,
} from "@/lib/genscape-noms/sql";
import { observedJsonRoute } from "@/lib/server/apiObservability";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import { localOnlyObservedNotFound } from "@/lib/server/localOnlyApi";
import { mssqlQuery } from "@/lib/server/mssql";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";

interface NomRow {
  gas_day?: string | Date | null;
  update_timestamp?: string | Date | null;
}

function toISODate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseCsv(value: string | null): string[] {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function parseNumberCsv(value: string | null): number[] {
  return parseCsv(value)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function timestampValue(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}

function latestDataAsOf(rows: NomRow[]): string | null {
  let latestUpdate: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  let latestGasDay: string | null = null;

  for (const row of rows) {
    const update = timestampValue(row.update_timestamp);
    if (update) {
      const updateMs = new Date(update).getTime();
      if (Number.isFinite(updateMs) && updateMs > latestMs) {
        latestMs = updateMs;
        latestUpdate = update;
      }
    }

    const gasDay = timestampValue(row.gas_day)?.slice(0, 10) ?? null;
    if (gasDay && (!latestGasDay || gasDay > latestGasDay)) latestGasDay = gasDay;
  }

  return latestUpdate ?? latestGasDay;
}

export const GET = observedJsonRoute(
  {
    route: "/api/genscape-noms",
    cacheHeader: CACHE_HEADER,
    cachePolicy: "s-maxage=300, stale-while-revalidate=60",
    owner: "gas",
    purpose: "Read bounded Genscape nominations rows from Azure SQL.",
    p95TargetMs: 5_000,
    freshnessSource: "GenscapeDataFeed.natgas.nominations.update_timestamp",
  },
  async (request) => {
    if (!isLocalOnlyFeatureEnabled()) {
      return localOnlyObservedNotFound();
    }

    const { searchParams } = new URL(request.url);
    const startDate = toISODate(searchParams.get("start"));
    const endDate = toISODate(searchParams.get("end"));
    const pipelines = parseCsv(searchParams.get("pipeline"));
    const locNames = parseCsv(searchParams.get("locName"));
    const locationIds = parseNumberCsv(searchParams.get("locationId"));
    const roleIds = parseNumberCsv(searchParams.get("locationRoleId"));
    const search = searchParams.get("search") || null;
    const includeCount = searchParams.get("includeCount") !== "false";
    const limitRaw = Number.parseInt(searchParams.get("limit") || "100", 10);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 100;
    const offsetRaw = Number.parseInt(searchParams.get("offset") || "0", 10);
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    if (!startDate || !endDate) {
      return {
        payload: { error: "start and end date are required" },
        status: 400,
        rowCount: 0,
        dataAsOf: null,
      };
    }

    if (
      pipelines.length === 0 &&
      locNames.length === 0 &&
      locationIds.length === 0 &&
      roleIds.length === 0 &&
      !search
    ) {
      return {
        payload: { error: "At least one metadata filter is required" },
        status: 400,
        rowCount: 0,
        dataAsOf: null,
      };
    }

    const queryInput = {
      startDate,
      endDate,
      locationIds,
      roleIds,
      pipelines,
      locNames,
      search,
      limit,
      offset,
    };
    const dataQuery = buildGenscapeNomsListQuery(queryInput);
    const countQuery = includeCount ? buildGenscapeNomsCountQuery(queryInput) : null;

    const [countResult, dataResult] = await Promise.all([
      countQuery
        ? mssqlQuery<{ total: number }>(countQuery.sql, countQuery.params)
        : Promise.resolve([]),
      mssqlQuery<NomRow>(dataQuery.sql, dataQuery.params),
    ]);

    return {
      payload: {
        rows: dataResult,
        total_count: includeCount ? countResult[0]?.total ?? 0 : dataResult.length,
        rowCount: dataResult.length,
      },
      rowCount: dataResult.length,
      dataAsOf: latestDataAsOf(dataResult) ?? `${startDate}/${endDate}`,
      headers: {
        "X-Genscape-Noms-Cache": "ORIGIN",
      },
    };
  },
);
