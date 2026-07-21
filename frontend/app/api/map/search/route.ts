import {
  buildMapLocationsQuery,
  buildMapSearchPipelinesQuery,
} from "@/lib/map-metadata/sql";
import { observedJsonRoute } from "@/lib/server/apiObservability";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import { localOnlyObservedNotFound } from "@/lib/server/localOnlyApi";
import { mssqlQuery } from "@/lib/server/mssql";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=900, stale-while-revalidate=120";

export const GET = observedJsonRoute(
  {
    route: "/api/map/search",
    cacheHeader: CACHE_HEADER,
    cachePolicy: "s-maxage=900, stale-while-revalidate=120",
    owner: "gas",
    purpose: "Search Genscape map pipeline and location metadata from Azure SQL.",
    p95TargetMs: 2_500,
    freshnessSource: "GenscapeDataFeed.natgas metadata",
  },
  async (request) => {
    if (!isLocalOnlyFeatureEnabled()) {
      return localOnlyObservedNotFound();
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const limitRaw = Number.parseInt(searchParams.get("limit") || "25", 10);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25;

    if (q.length < 2) {
      return {
        payload: {
          pipelines: [],
          locations: [],
          rowCount: 0,
        },
        rowCount: 0,
        dataAsOf: "metadata",
      };
    }

    const pipelineQuery = buildMapSearchPipelinesQuery({ search: q, limit });
    const locationQuery = buildMapLocationsQuery({ search: q, limit });
    const [pipelines, locations] = await Promise.all([
      mssqlQuery(pipelineQuery.sql, pipelineQuery.params),
      mssqlQuery(locationQuery.sql, locationQuery.params),
    ]);
    const rowCount = pipelines.length + locations.length;

    return {
      payload: {
        pipelines,
        locations,
        rowCount,
      },
      rowCount,
      dataAsOf: "metadata",
      headers: {
        "X-Map-Search-Cache": "ORIGIN",
      },
    };
  },
);
