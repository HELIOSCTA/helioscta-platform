import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "private, no-store";
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1_500;

const ROUTE_CONFIG = {
  route: "/api/gas-ebbs/williams-transco",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "private, no-store",
  owner: "frontend",
  purpose: "Williams Transco EBB current notices and derived outages",
  p95TargetMs: 2_500,
  freshnessSource: "gas_ebbs.notices last_seen_at_utc",
} as const;

interface RawGasEbbNoticeRow {
  source_notice_id: string;
  notice_stream: string;
  critical_ind: boolean;
  notice_type: string | null;
  notice_status_desc: string | null;
  subject: string | null;
  posted_at_utc: string | Date | null;
  posted_at_source: string | null;
  effective_at_utc: string | Date | null;
  effective_at_source: string | null;
  end_at_utc: string | Date | null;
  end_at_source: string | null;
  response_at_utc: string | Date | null;
  response_at_source: string | null;
  prior_notice_id: string | null;
  detail_url: string | null;
  download_url: string | null;
  is_current_on_ebb: boolean;
  first_seen_at_utc: string | Date | null;
  last_seen_at_utc: string | Date | null;
  stale_at_utc: string | Date | null;
  last_detail_fetched_at_utc: string | Date | null;
  last_detail_error_at_utc: string | Date | null;
  last_detail_error_message: string | null;
  source_content_hash: string | null;
  notice_text: string | null;
  detail_clean_text: string | null;
  detail_metadata: unknown;
  supporting_data: unknown;
  detail_fetched_at_utc: string | Date | null;
}

interface RawGasEbbOutageRow {
  source_notice_id: string;
  source_content_hash: string;
  outage_sequence: number | string;
  classification: string;
  confidence: number | string;
  notice_type: string | null;
  subject: string | null;
  effective_start_at_utc: string | Date | null;
  effective_end_at_utc: string | Date | null;
  location_id: string | null;
  location_name: string | null;
  zone: string | null;
  delivery_receipt: string | null;
  tsb_type: string | null;
  available_capacity_mdt_per_day: number | string | null;
  highest_priority_included: string | null;
  flow_direction: string | null;
  job_number: string | null;
  source_table_title: string | null;
  source_row_json: unknown;
  derived_at_utc: string | Date | null;
  notice_stream: string;
  critical_ind: boolean;
  notice_status_desc: string | null;
  posted_at_utc: string | Date | null;
  posted_at_source: string | null;
  effective_at_source: string | null;
  end_at_source: string | null;
  detail_url: string | null;
  download_url: string | null;
  prior_notice_id: string | null;
  last_seen_at_utc: string | Date | null;
  last_detail_fetched_at_utc: string | Date | null;
  last_detail_error_at_utc: string | Date | null;
  last_detail_error_message: string | null;
  notice_text: string | null;
  detail_clean_text: string | null;
  detail_metadata: unknown;
  supporting_data: unknown;
  detail_fetched_at_utc: string | Date | null;
}

interface RawGasEbbMetadataRow {
  notice_count: number | string;
  outage_count: number | string;
  critical_notice_count: number | string;
  notices_with_detail_count: number | string;
  latest_posted_at_utc: string | Date | null;
  latest_last_seen_at_utc: string | Date | null;
  latest_detail_fetched_at_utc: string | Date | null;
  latest_outage_derived_at_utc: string | Date | null;
}

const NOTICE_SQL = `
SELECT
    n.source_notice_id,
    n.notice_stream,
    n.critical_ind,
    n.notice_type,
    n.notice_status_desc,
    n.subject,
    n.posted_at_utc,
    n.posted_at_source,
    n.effective_at_utc,
    n.effective_at_source,
    n.end_at_utc,
    n.end_at_source,
    n.response_at_utc,
    n.response_at_source,
    n.prior_notice_id,
    n.detail_url,
    n.download_url,
    n.is_current_on_ebb,
    n.first_seen_at_utc,
    n.last_seen_at_utc,
    n.stale_at_utc,
    n.last_detail_fetched_at_utc,
    n.last_detail_error_at_utc,
    n.last_detail_error_message,
    d.source_content_hash,
    d.notice_text,
    d.detail_clean_text,
    d.detail_metadata,
    d.supporting_data,
    d.detail_fetched_at_utc
FROM gas_ebbs.notices AS n
LEFT JOIN gas_ebbs.notice_details AS d
  ON d.source_family = n.source_family
 AND d.pipeline_key = n.pipeline_key
 AND d.source_notice_id = n.source_notice_id
 AND d.source_content_hash = n.latest_source_content_hash
WHERE n.source_family = 'williams_1line'
  AND n.pipeline_key = 'williams_transco'
  AND n.is_current_on_ebb = TRUE
ORDER BY n.posted_at_utc DESC NULLS LAST, n.source_notice_id DESC
LIMIT $1;
`;

const OUTAGE_SQL = `
SELECT
    p.source_notice_id,
    p.source_content_hash,
    p.outage_sequence,
    p.classification,
    p.confidence,
    p.notice_type,
    p.subject,
    p.effective_start_at_utc,
    p.effective_end_at_utc,
    p.location_id,
    p.location_name,
    p.zone,
    p.delivery_receipt,
    p.tsb_type,
    p.available_capacity_mdt_per_day,
    p.highest_priority_included,
    p.flow_direction,
    p.job_number,
    p.source_table_title,
    p.source_row_json,
    p.derived_at_utc,
    n.notice_stream,
    n.critical_ind,
    n.notice_status_desc,
    n.posted_at_utc,
    n.posted_at_source,
    n.effective_at_source,
    n.end_at_source,
    n.detail_url,
    n.download_url,
    n.prior_notice_id,
    n.last_seen_at_utc,
    n.last_detail_fetched_at_utc,
    n.last_detail_error_at_utc,
    n.last_detail_error_message,
    d.notice_text,
    d.detail_clean_text,
    d.detail_metadata,
    d.supporting_data,
    d.detail_fetched_at_utc
FROM gas_ebbs.planned_outages AS p
INNER JOIN gas_ebbs.notices AS n
  ON n.source_family = p.source_family
 AND n.pipeline_key = p.pipeline_key
 AND n.source_notice_id = p.source_notice_id
LEFT JOIN gas_ebbs.notice_details AS d
  ON d.source_family = p.source_family
 AND d.pipeline_key = p.pipeline_key
 AND d.source_notice_id = p.source_notice_id
 AND d.source_content_hash = p.source_content_hash
WHERE p.source_family = 'williams_1line'
  AND p.pipeline_key = 'williams_transco'
  AND n.is_current_on_ebb = TRUE
ORDER BY
    p.zone NULLS LAST,
    p.delivery_receipt NULLS LAST,
    p.location_name NULLS LAST,
    p.effective_start_at_utc NULLS LAST,
    p.source_notice_id DESC,
    p.outage_sequence
LIMIT $1;
`;

const METADATA_SQL = `
WITH notice_summary AS (
    SELECT
        COUNT(*) AS notice_count,
        COUNT(*) FILTER (WHERE critical_ind) AS critical_notice_count,
        COUNT(*) FILTER (WHERE latest_source_content_hash IS NOT NULL) AS notices_with_detail_count,
        MAX(posted_at_utc) AS latest_posted_at_utc,
        MAX(last_seen_at_utc) AS latest_last_seen_at_utc,
        MAX(last_detail_fetched_at_utc) AS latest_detail_fetched_at_utc
    FROM gas_ebbs.notices
    WHERE source_family = 'williams_1line'
      AND pipeline_key = 'williams_transco'
      AND is_current_on_ebb = TRUE
),
outage_summary AS (
    SELECT
        COUNT(*) AS outage_count,
        MAX(p.derived_at_utc) AS latest_outage_derived_at_utc
    FROM gas_ebbs.planned_outages AS p
    INNER JOIN gas_ebbs.notices AS n
      ON n.source_family = p.source_family
     AND n.pipeline_key = p.pipeline_key
     AND n.source_notice_id = p.source_notice_id
    WHERE p.source_family = 'williams_1line'
      AND p.pipeline_key = 'williams_transco'
      AND n.is_current_on_ebb = TRUE
)
SELECT
    notice_summary.notice_count,
    outage_summary.outage_count,
    notice_summary.critical_notice_count,
    notice_summary.notices_with_detail_count,
    notice_summary.latest_posted_at_utc,
    notice_summary.latest_last_seen_at_utc,
    notice_summary.latest_detail_fetched_at_utc,
    outage_summary.latest_outage_derived_at_utc
FROM notice_summary
CROSS JOIN outage_summary;
`;

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, parsed);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeSupportingData(value: unknown) {
  return asArray(value).map((item) => {
    const table = asRecord(item);
    const headers = asArray(table.headers).filter(
      (header): header is string => typeof header === "string",
    );
    const rows = asArray(table.rows)
      .map((row) => asRecord(row))
      .filter((row) => Object.keys(row).length > 0);
    return {
      title: typeof table.title === "string" ? table.title : null,
      headers,
      rows,
    };
  });
}

function normalizeNotice(row: RawGasEbbNoticeRow) {
  return {
    sourceNoticeId: row.source_notice_id,
    noticeStream: row.notice_stream,
    criticalInd: row.critical_ind,
    noticeType: row.notice_type,
    noticeStatusDesc: row.notice_status_desc,
    subject: row.subject,
    postedAtUtc: toIsoString(row.posted_at_utc),
    postedAtSource: row.posted_at_source,
    effectiveAtUtc: toIsoString(row.effective_at_utc),
    effectiveAtSource: row.effective_at_source,
    endAtUtc: toIsoString(row.end_at_utc),
    endAtSource: row.end_at_source,
    responseAtUtc: toIsoString(row.response_at_utc),
    responseAtSource: row.response_at_source,
    priorNoticeId: row.prior_notice_id,
    detailUrl: row.detail_url,
    downloadUrl: row.download_url,
    isCurrentOnEbb: row.is_current_on_ebb,
    firstSeenAtUtc: toIsoString(row.first_seen_at_utc),
    lastSeenAtUtc: toIsoString(row.last_seen_at_utc),
    staleAtUtc: toIsoString(row.stale_at_utc),
    lastDetailFetchedAtUtc: toIsoString(row.last_detail_fetched_at_utc),
    lastDetailErrorAtUtc: toIsoString(row.last_detail_error_at_utc),
    lastDetailErrorMessage: row.last_detail_error_message,
    sourceContentHash: row.source_content_hash,
    noticeText: row.notice_text,
    detailCleanText: row.detail_clean_text,
    detailMetadata: asRecord(row.detail_metadata),
    supportingData: normalizeSupportingData(row.supporting_data),
    detailFetchedAtUtc: toIsoString(row.detail_fetched_at_utc),
  };
}

function normalizeOutage(row: RawGasEbbOutageRow) {
  return {
    sourceNoticeId: row.source_notice_id,
    sourceContentHash: row.source_content_hash,
    outageSequence: toNumber(row.outage_sequence) ?? 0,
    classification: row.classification,
    confidence: toNumber(row.confidence),
    noticeType: row.notice_type,
    subject: row.subject,
    effectiveStartAtUtc: toIsoString(row.effective_start_at_utc),
    effectiveEndAtUtc: toIsoString(row.effective_end_at_utc),
    locationId: row.location_id,
    locationName: row.location_name,
    zone: row.zone,
    deliveryReceipt: row.delivery_receipt,
    tsbType: row.tsb_type,
    availableCapacityMdtPerDay: toNumber(row.available_capacity_mdt_per_day),
    highestPriorityIncluded: row.highest_priority_included,
    flowDirection: row.flow_direction,
    jobNumber: row.job_number,
    sourceTableTitle: row.source_table_title,
    sourceRowJson: asRecord(row.source_row_json),
    derivedAtUtc: toIsoString(row.derived_at_utc),
    noticeStream: row.notice_stream,
    criticalInd: row.critical_ind,
    noticeStatusDesc: row.notice_status_desc,
    postedAtUtc: toIsoString(row.posted_at_utc),
    postedAtSource: row.posted_at_source,
    effectiveAtSource: row.effective_at_source,
    endAtSource: row.end_at_source,
    detailUrl: row.detail_url,
    downloadUrl: row.download_url,
    priorNoticeId: row.prior_notice_id,
    lastSeenAtUtc: toIsoString(row.last_seen_at_utc),
    lastDetailFetchedAtUtc: toIsoString(row.last_detail_fetched_at_utc),
    lastDetailErrorAtUtc: toIsoString(row.last_detail_error_at_utc),
    lastDetailErrorMessage: row.last_detail_error_message,
    noticeText: row.notice_text,
    detailCleanText: row.detail_clean_text,
    detailMetadata: asRecord(row.detail_metadata),
    supportingData: normalizeSupportingData(row.supporting_data),
    detailFetchedAtUtc: toIsoString(row.detail_fetched_at_utc),
  };
}

function normalizeMetadata(row: RawGasEbbMetadataRow | undefined) {
  return {
    sourceFamily: "williams_1line",
    pipelineKey: "williams_transco",
    pipelineName: "Williams Transco",
    sourceTable: "gas_ebbs.notices / gas_ebbs.planned_outages",
    currentNoticeCount: toNumber(row?.notice_count) ?? 0,
    currentOutageCount: toNumber(row?.outage_count) ?? 0,
    currentCriticalNoticeCount: toNumber(row?.critical_notice_count) ?? 0,
    noticesWithDetailCount: toNumber(row?.notices_with_detail_count) ?? 0,
    latestPostedAtUtc: toIsoString(row?.latest_posted_at_utc),
    latestLastSeenAtUtc: toIsoString(row?.latest_last_seen_at_utc),
    latestDetailFetchedAtUtc: toIsoString(row?.latest_detail_fetched_at_utc),
    latestOutageDerivedAtUtc: toIsoString(row?.latest_outage_derived_at_utc),
  };
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  if (!isLocalOnlyFeatureEnabled()) {
    return {
      status: 404,
      payload: { error: "Not found" },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const [noticeRows, outageRows, metadataRows] = await Promise.all([
    query<RawGasEbbNoticeRow>(NOTICE_SQL, [limit]),
    query<RawGasEbbOutageRow>(OUTAGE_SQL, [limit]),
    query<RawGasEbbMetadataRow>(METADATA_SQL),
  ]);
  const metadata = normalizeMetadata(metadataRows[0]);

  return {
    payload: {
      generatedAtUtc: new Date().toISOString(),
      metadata,
      notices: noticeRows.map(normalizeNotice),
      outages: outageRows.map(normalizeOutage),
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: noticeRows.length + outageRows.length,
    dataAsOf: metadata.latestLastSeenAtUtc ?? metadata.latestPostedAtUtc,
  };
});

export function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
