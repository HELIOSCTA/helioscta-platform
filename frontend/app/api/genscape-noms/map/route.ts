import { buildGenscapeNomsMapQuery } from "@/lib/genscape-noms/sql";
import { observedJsonRoute } from "@/lib/server/apiObservability";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import { localOnlyObservedNotFound } from "@/lib/server/localOnlyApi";
import { mssqlQuery } from "@/lib/server/mssql";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";

interface NomsMapPoint {
  latest_gas_day?: string | Date | null;
}

function toISODate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseCsv(value: string | null): string[] {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function parseNumberCsv(value: string | null): number[] {
  return parseCsv(value)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function latestGasDay(points: NomsMapPoint[]): string | null {
  let latest: string | null = null;
  for (const point of points) {
    const raw = point.latest_gas_day;
    if (!raw) continue;
    const day = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
    if (!latest || day > latest) latest = day;
  }
  return latest;
}

export const GET = observedJsonRoute(
  {
    route: "/api/genscape-noms/map",
    cacheHeader: CACHE_HEADER,
    cachePolicy: "s-maxage=300, stale-while-revalidate=60",
    owner: "gas",
    purpose: "Read bounded Genscape nominations map rollups from Azure SQL.",
    p95TargetMs: 5_000,
    freshnessSource: "GenscapeDataFeed.natgas.nominations.gas_day",
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
    const limitRaw = Number.parseInt(searchParams.get("limit") || "1000", 10);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 3000) : 1000;

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

    const query = buildGenscapeNomsMapQuery({
      startDate,
      endDate,
      locationIds,
      roleIds,
      pipelines,
      locNames,
      search,
      limit,
    });
    const points = await mssqlQuery<NomsMapPoint>(query.sql, query.params);

    return {
      payload: {
        points,
        point_count: points.length,
        rowCount: points.length,
      },
      rowCount: points.length,
      dataAsOf: latestGasDay(points) ?? `${startDate}/${endDate}`,
      headers: {
        "X-Genscape-Noms-Map-Cache": "ORIGIN",
      },
    };
  },
);
