import { observedJsonRoute } from "@/lib/server/apiObservability";
import { queryWithStatementTimeout } from "@/lib/server/db";
import {
  buildTransmissionOutageDetailPayload,
  buildTransmissionOutageTablePayload,
  type RawTransmissionOutageSnapshotRow,
} from "@/lib/server/pjmTransmissionOutages";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_LIMIT = 10_000;
const MAX_LIMIT = 10_000;
const CACHE_HEADER = "public, s-maxage=120, stale-while-revalidate=120, stale-if-error=600";
const ROUTE_CONFIG = {
  route: "/api/pjm-transmission-outages",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=120, stale-while-revalidate=120, stale-if-error=600",
  owner: "frontend",
  purpose: "PJM transmission outage TXT snapshot table",
  p95TargetMs: 2_500,
  freshnessSource: "pjm.transmission_outages_raw.source_report_timestamp",
} as const;

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

async function loadSnapshots(): Promise<RawTransmissionOutageSnapshotRow[]> {
  return queryWithStatementTimeout<RawTransmissionOutageSnapshotRow>(
    `
      select
        source_report_timestamp::text as source_report_timestamp,
        source_report_timezone,
        source_file_sha256,
        ingested_at::text as ingested_at,
        source_line_count,
        raw_text
      from pjm.transmission_outages_raw
      order by source_report_timestamp desc, ingested_at desc
      limit 2
    `,
    [],
    {
      statementTimeoutMs: 20_000,
      queryTimeoutMs: 24_000,
    },
  );
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const ticketId = searchParams.get("ticketId")?.trim() ?? "";
  const refresh = searchParams.get("refresh") === "1";
  const rawRows = await loadSnapshots();

  if (ticketId) {
    const payload = buildTransmissionOutageDetailPayload(rawRows, ticketId);
    const dataAsOf = payload.snapshots[0]?.snapshot.sourceReportTimestamp ?? null;
    return {
      payload,
      headers: {
        "Cache-Control": refresh ? "no-store" : CACHE_HEADER,
      },
      rowCount: payload.snapshots.filter((snapshot) => snapshot.record !== null).length,
      dataAsOf,
    };
  }

  const limit = parseLimit(searchParams.get("limit"));
  const payload = buildTransmissionOutageTablePayload(rawRows, limit);
  return {
    payload,
    headers: {
      "Cache-Control": refresh ? "no-store" : CACHE_HEADER,
    },
    rowCount: payload.rows.length,
    dataAsOf: payload.selectedSnapshot?.sourceReportTimestamp ?? null,
  };
});
