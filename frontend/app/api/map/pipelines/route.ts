import { buildMapPipelinesQuery } from "@/lib/map-metadata/sql";
import { observedJsonRoute } from "@/lib/server/apiObservability";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import { localOnlyObservedNotFound } from "@/lib/server/localOnlyApi";
import { mssqlQuery } from "@/lib/server/mssql";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=3600, stale-while-revalidate=300";

export const GET = observedJsonRoute(
  {
    route: "/api/map/pipelines",
    cacheHeader: CACHE_HEADER,
    cachePolicy: "s-maxage=3600, stale-while-revalidate=300",
    owner: "gas",
    purpose: "Read Genscape map pipeline metadata from Azure SQL.",
    p95TargetMs: 1_500,
    freshnessSource: "GenscapeDataFeed.natgas metadata",
  },
  async () => {
    if (!isLocalOnlyFeatureEnabled()) {
      return localOnlyObservedNotFound();
    }

    const query = buildMapPipelinesQuery();
    const pipelines = await mssqlQuery(query.sql, query.params);

    return {
      payload: {
        pipelines,
        rowCount: pipelines.length,
      },
      rowCount: pipelines.length,
      dataAsOf: "metadata",
    };
  },
);
