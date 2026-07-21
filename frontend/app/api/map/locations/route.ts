import { buildMapLocationsQuery } from "@/lib/map-metadata/sql";
import { observedJsonRoute } from "@/lib/server/apiObservability";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import { localOnlyObservedNotFound } from "@/lib/server/localOnlyApi";
import { mssqlQuery } from "@/lib/server/mssql";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=1800, stale-while-revalidate=300";

function parseCsv(value: string | null): string[] {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function parseNumberCsv(value: string | null): number[] {
  return parseCsv(value)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item) && item > 0);
}

export const GET = observedJsonRoute(
  {
    route: "/api/map/locations",
    cacheHeader: CACHE_HEADER,
    cachePolicy: "s-maxage=1800, stale-while-revalidate=300",
    owner: "gas",
    purpose: "Read bounded Genscape map locations from Azure SQL.",
    p95TargetMs: 2_500,
    freshnessSource: "GenscapeDataFeed.natgas metadata",
  },
  async (request) => {
    if (!isLocalOnlyFeatureEnabled()) {
      return localOnlyObservedNotFound();
    }

    const { searchParams } = new URL(request.url);
    const pipelineShortNames = parseCsv(searchParams.get("pipeline"));
    const locationRoleIds = parseNumberCsv(searchParams.get("locationRoleId"));
    const locationIds = parseNumberCsv(searchParams.get("locationId"));
    const search = searchParams.get("q") || null;
    const includeAll = searchParams.get("all") === "true";
    const limitRaw = Number.parseInt(searchParams.get("limit") || "1000", 10);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 1000;

    if (
      !includeAll &&
      pipelineShortNames.length === 0 &&
      locationRoleIds.length === 0 &&
      locationIds.length === 0 &&
      !search?.trim()
    ) {
      return {
        payload: {
          locations: [],
          location_count: 0,
          rowCount: 0,
        },
        rowCount: 0,
        dataAsOf: "metadata",
        headers: {
          "X-Map-Locations-Cache": "EMPTY",
        },
      };
    }

    const query = buildMapLocationsQuery({
      pipelineShortNames,
      locationRoleIds,
      locationIds,
      search,
      limit,
    });
    const locations = await mssqlQuery(query.sql, query.params);

    return {
      payload: {
        locations,
        location_count: locations.length,
        rowCount: locations.length,
      },
      rowCount: locations.length,
      dataAsOf: "metadata",
      headers: {
        "X-Map-Locations-Cache": "ORIGIN",
      },
    };
  },
);
