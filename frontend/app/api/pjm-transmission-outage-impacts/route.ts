import { observedJsonRoute } from "@/lib/server/apiObservability";
import {
  buildZoneImpacts,
  limitOutageRows,
  linkedConstraintActive,
  linkedOutageRows,
  loadTransmissionOutageImpactUniverse,
  parseLinkedConstraint,
} from "@/lib/server/pjmTransmissionOutageImpacts";
import type {
  TransmissionOutageImpactPayload,
  TransmissionOutageImpactSummary,
} from "@/lib/pjmTransmissionOutagesTypes";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_LIMIT = 750;
const MAX_LIMIT = 2_000;
const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=300, stale-if-error=900";
const ROUTE_CONFIG = {
  route: "/api/pjm-transmission-outage-impacts",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=300, stale-if-error=900",
  owner: "frontend",
  purpose: "PJM transmission outage tickets with RAW-derived Western Hub sensitivities",
  p95TargetMs: 4_000,
  freshnessSource: "pjm.transmission_outages_raw / pjm.agg_definitions / frontend RAW model",
} as const;

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "1";
  const limit = parseLimit(searchParams.get("limit"));
  const linkedConstraint = parseLinkedConstraint(searchParams);
  const linkedActive = linkedConstraintActive(linkedConstraint);
  const universe = await loadTransmissionOutageImpactUniverse(searchParams);
  const activeRows = linkedActive
    ? linkedOutageRows(
        universe.filteredRows,
        linkedConstraint,
        universe.model.scoreBranchNeighborhood,
      )
    : universe.filteredRows.map((row) => ({ ...row, constraintLink: null }));
  const rows = limitOutageRows(activeRows, limit, linkedActive);
  const matchedTicketCount = activeRows.filter((row) => row.matchStatus === "matched").length;
  const ambiguousTicketCount = activeRows.filter((row) => row.matchStatus === "ambiguous").length;
  const unmatchedTicketCount = activeRows.filter(
    (row) => row.matchStatus === "no_match" || row.matchStatus === "model_unavailable",
  ).length;
  const maxAbsShiftFactor = Math.max(
    0,
    ...rows.map((row) => Math.abs(row.shiftFactor ?? 0)),
  );
  const summary: TransmissionOutageImpactSummary = {
    ...universe.tablePayload.summary,
    latestTicketCount: universe.tablePayload.summary.latestTicketCount,
    candidateTicketCount: activeRows.length,
    modeledTicketCount: universe.estimatedRows.length,
    returnedTicketCount: rows.length,
    matchedTicketCount,
    ambiguousTicketCount,
    unmatchedTicketCount,
    maxAbsShiftFactor,
    zoneImpacts: buildZoneImpacts(activeRows),
    model: {
      ...universe.model.summary,
      westernHubBusCount: universe.westernHubBusCount,
    },
  };
  const payload: TransmissionOutageImpactPayload = {
    mode: "impact",
    snapshots: universe.tablePayload.snapshots,
    selectedSnapshot: universe.tablePayload.selectedSnapshot,
    priorSnapshot: universe.tablePayload.priorSnapshot,
    summary,
    metadata: universe.tablePayload.metadata,
    rows,
    limit,
    truncated: activeRows.length > rows.length || universe.tablePayload.truncated,
  };

  return {
    payload,
    headers: {
      "Cache-Control": refresh ? "no-store" : CACHE_HEADER,
    },
    rowCount: rows.length,
    dataAsOf: universe.tablePayload.selectedSnapshot?.sourceReportTimestamp ?? null,
  };
});
