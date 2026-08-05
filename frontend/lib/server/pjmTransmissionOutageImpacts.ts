import "server-only";

import { queryWithStatementTimeout } from "@/lib/server/db";
import {
  loadPjmShiftFactorModel,
  type ConstraintShiftEstimate,
  type RawBranchNeighborhoodScore,
} from "@/lib/server/pjmNetworkShiftFactors";
import {
  buildTransmissionOutageTablePayload,
  type RawTransmissionOutageSnapshotRow,
} from "@/lib/server/pjmTransmissionOutages";
import type { PjmConstraintOutagePreview } from "@/lib/pjmConstraintShiftFactorsTypes";
import { type TransmissionOutageDateBasis } from "@/lib/pjmTransmissionOutageFilters";
import type {
  TransmissionOutageConstraintLink,
  TransmissionOutageConstraintRelation,
  TransmissionOutageImpactRow,
  TransmissionOutageRow,
  TransmissionOutageTablePayload,
  TransmissionOutageZoneImpact,
  TransmissionOutageZoneImpactTicket,
} from "@/lib/pjmTransmissionOutagesTypes";

interface WesternHubBusRow {
  bus_pnode_name: string;
  bus_pnode_factor: number | string;
}

interface ResolvedDateFilter {
  basis: TransmissionOutageDateBasis;
  startDate: string | null;
  endDate: string | null;
  startOrdinal: number | null;
  endOrdinal: number | null;
}

export interface OutageImpactFilters {
  statuses: Set<string>;
  ticketIds: Set<string>;
  equipmentTerms: string[];
  includePhrases: string[];
  excludePhrases: string[];
  dateFilter: ResolvedDateFilter;
}

export interface LinkedConstraint {
  facilityText: string | null;
  branchKey: string | null;
  evidenceTokens: string[];
}

export interface LinkedConstraintSource {
  monitoredFacility: string;
  matchedBranchKey: string | null;
  matchedBranchName: string | null;
  fromBusName: string | null;
  toBusName: string | null;
  circuitId: string | null;
}

export interface TransmissionOutageImpactUniverse {
  tablePayload: TransmissionOutageTablePayload;
  estimatedRows: TransmissionOutageImpactRow[];
  filteredRows: TransmissionOutageImpactRow[];
  selectedDate: string;
  model: Awaited<ReturnType<typeof loadPjmShiftFactorModel>>;
  westernHubBusCount: number;
}

const QUERY_TIMEOUT = {
  statementTimeoutMs: 18_000,
  queryTimeoutMs: 22_000,
};
const MONTH_INDEX_BY_LABEL: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};
const LINK_EVIDENCE_STOP_TOKENS = new Set([
  "ACTUAL",
  "BRANCH",
  "CIRCUIT",
  "CONTINGENCY",
  "CONSTRAINT",
  "FACILITY",
  "LINE",
  "LOAD",
  "MODEL",
  "OUTAGE",
  "TRANSFORMER",
  "WESTERN",
  "WHUB",
  "XFM",
  "XFMR",
]);

export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeToken(value: string): string {
  return value.trim().toUpperCase();
}

function splitParamValues(
  searchParams: URLSearchParams,
  names: string[],
  splitPattern: RegExp,
): string[] {
  return names
    .flatMap((name) => searchParams.getAll(name))
    .flatMap((value) => value.split(splitPattern))
    .map((value) => value.trim())
    .filter(Boolean);
}

function termList(value: string | null): string[] {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function phraseList(searchParams: URLSearchParams, names: string[]): string[] {
  return splitParamValues(searchParams, names, /[,\n]+/)
    .map(normalizeSearchText)
    .filter(Boolean)
    .slice(0, 24);
}

function equipmentSearchText(row: TransmissionOutageImpactRow): string {
  return normalizeSearchText([
    row.facilityName,
    row.relatedEquipmentText,
    row.matchedBranchName,
    row.modelFacilityText,
    row.fromBusName,
    row.toBusName,
    row.circuitId,
  ].join(" "));
}

function rowPhraseSearchText(row: TransmissionOutageImpactRow): string {
  return normalizeSearchText([
    row.ticketId,
    row.zoneCompany,
    row.facilityName,
    row.relatedEquipmentText,
    row.detailSearchText,
    row.matchedBranchName,
    row.modelFacilityText,
    row.fromBusName,
    row.toBusName,
    row.circuitId,
    row.currentStatus,
    row.previousStatus,
    row.startAtText,
    row.startDate,
    row.startTime,
    row.endAtText,
    row.endDate,
    row.endTime,
  ].join(" "));
}

export function snapshotDate(value: string | null | undefined): string {
  const text = value ?? "";
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? new Date().toISOString().slice(0, 10);
}

function normalizeDateKey(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${yearText}-${monthText}-${dayText}`;
}

function dateKeyOrdinal(value: string | null): number | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return Math.trunc(Date.UTC(year, month - 1, day) / 86_400_000);
}

function parseDateBasis(value: string | null): TransmissionOutageDateBasis {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "start") return "start";
  if (normalized === "end") return "end";
  return "active";
}

function resolveDateFilter(searchParams: URLSearchParams): ResolvedDateFilter {
  const basis = parseDateBasis(searchParams.get("dateBasis"));
  const legacyDate = normalizeDateKey(searchParams.get("date"));
  const startParam = normalizeDateKey(searchParams.get("startDate")) ?? legacyDate;
  const endParam = normalizeDateKey(searchParams.get("endDate")) ?? startParam ?? legacyDate;
  const startDate = startParam ?? endParam;
  const endDate = endParam ?? startDate;

  const startOrdinal = dateKeyOrdinal(startDate);
  const endOrdinal = dateKeyOrdinal(endDate);
  if (startOrdinal !== null && endOrdinal !== null && startOrdinal > endOrdinal) {
    return {
      basis,
      startDate: endDate,
      endDate: startDate,
      startOrdinal: endOrdinal,
      endOrdinal: startOrdinal,
    };
  }
  return {
    basis,
    startDate,
    endDate,
    startOrdinal,
    endOrdinal,
  };
}

function outageDateKey(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  const pjmMatch = text.match(/^(\d{1,2})-([A-Z]{3})-(\d{2,4})\s+\d{3,4}$/i);
  if (pjmMatch) {
    const [, rawDay, rawMonthLabel, rawYear] = pjmMatch;
    const month = MONTH_INDEX_BY_LABEL[rawMonthLabel.toUpperCase()];
    if (!month) return null;
    const yearNumber = Number(rawYear);
    const year =
      rawYear.length === 2
        ? yearNumber >= 70
          ? 1900 + yearNumber
          : 2000 + yearNumber
        : yearNumber;
    const day = Number(rawDay);
    return normalizeDateKey(
      `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }

  const usMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+\d{1,2}:?\d{2}(?:\s*[AP]M)?$/i);
  if (usMatch) {
    const [, rawMonth, rawDay, rawYear] = usMatch;
    const yearNumber = Number(rawYear);
    const year =
      rawYear.length === 2
        ? yearNumber >= 70
          ? 1900 + yearNumber
          : 2000 + yearNumber
        : yearNumber;
    return normalizeDateKey(
      `${String(year).padStart(4, "0")}-${rawMonth.padStart(2, "0")}-${rawDay.padStart(2, "0")}`,
    );
  }

  return normalizeDateKey(text.slice(0, 10));
}

function dateInRange(value: number | null, start: number | null, end: number | null): boolean {
  if (value === null || start === null || end === null) return false;
  return value >= start && value <= end;
}

function rowMatchesDateFilter(row: TransmissionOutageImpactRow, filter: ResolvedDateFilter): boolean {
  if (filter.startOrdinal === null || filter.endOrdinal === null) return true;
  const startOrdinal = dateKeyOrdinal(row.startDate ?? outageDateKey(row.startAtText));
  const endOrdinal = dateKeyOrdinal(row.endDate ?? outageDateKey(row.endAtText));

  if (filter.basis === "start") {
    return dateInRange(startOrdinal, filter.startOrdinal, filter.endOrdinal);
  }
  if (filter.basis === "end") {
    return dateInRange(endOrdinal, filter.startOrdinal, filter.endOrdinal);
  }

  if (startOrdinal === null && endOrdinal === null) return false;
  const rowStart = Math.min(startOrdinal ?? endOrdinal ?? 0, endOrdinal ?? startOrdinal ?? 0);
  const rowEnd = Math.max(startOrdinal ?? endOrdinal ?? 0, endOrdinal ?? startOrdinal ?? 0);
  return rowStart <= filter.endOrdinal && rowEnd >= filter.startOrdinal;
}

export function parseOutageImpactFilters(searchParams: URLSearchParams): OutageImpactFilters {
  const equipmentSearch = [
    searchParams.get("equipmentSearch"),
    searchParams.get("equipment"),
    searchParams.get("search"),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");

  return {
    statuses: new Set(
      splitParamValues(searchParams, ["status", "statuses", "pjmStatus"], /[,\n]+/)
        .map(normalizeToken),
    ),
    ticketIds: new Set(
      splitParamValues(searchParams, ["ticketId", "ticketIds", "tickets"], /[,\s]+/)
        .map(normalizeToken),
    ),
    equipmentTerms: termList(equipmentSearch),
    includePhrases: phraseList(searchParams, ["includeTerms", "includeTerm"]),
    excludePhrases: phraseList(searchParams, ["excludeTerms", "excludeTerm"]),
    dateFilter: resolveDateFilter(searchParams),
  };
}

function cleanLinkedParam(value: string | null): string | null {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return text ? text : null;
}

function evidenceTokens(value: string | null): string[] {
  return Array.from(
    new Set(
      (value ?? "")
        .toUpperCase()
        .split(/[^A-Z0-9]+/)
        .map((token) => token.trim())
        .filter(
          (token) =>
            token.length >= 4 &&
            !/^\d+(?:KV)?$/.test(token) &&
            !LINK_EVIDENCE_STOP_TOKENS.has(token),
        ),
    ),
  ).slice(0, 16);
}

export function linkedConstraintFacilityText(source: LinkedConstraintSource): string {
  return [
    source.monitoredFacility,
    source.matchedBranchName,
    source.fromBusName,
    source.toBusName,
    source.circuitId,
  ]
    .filter(Boolean)
    .join(" ");
}

export function linkedConstraintFromSource(source: LinkedConstraintSource): LinkedConstraint {
  const facilityText = cleanLinkedParam(linkedConstraintFacilityText(source));
  return {
    facilityText,
    branchKey: cleanLinkedParam(source.matchedBranchKey),
    evidenceTokens: evidenceTokens(facilityText),
  };
}

export function parseLinkedConstraint(searchParams: URLSearchParams): LinkedConstraint {
  const facilityText = cleanLinkedParam(searchParams.get("linkedConstraintFacility"));
  const branchKey = cleanLinkedParam(searchParams.get("linkedConstraintBranchKey"));
  return {
    facilityText,
    branchKey,
    evidenceTokens: evidenceTokens(facilityText),
  };
}

export function linkedConstraintActive(linkedConstraint: LinkedConstraint): boolean {
  return Boolean(linkedConstraint.facilityText || linkedConstraint.branchKey);
}

export function applyOutageFilters(
  rows: TransmissionOutageImpactRow[],
  filters: OutageImpactFilters,
): TransmissionOutageImpactRow[] {
  return rows.filter((row) => {
    if (filters.statuses.size > 0 && !filters.statuses.has(normalizeToken(row.currentStatus))) {
      return false;
    }
    if (filters.ticketIds.size > 0 && !filters.ticketIds.has(normalizeToken(row.ticketId))) {
      return false;
    }
    if (!rowMatchesDateFilter(row, filters.dateFilter)) {
      return false;
    }

    const text = equipmentSearchText(row);
    if (filters.equipmentTerms.length > 0 && !filters.equipmentTerms.every((term) => text.includes(term))) {
      return false;
    }
    const phraseText = rowPhraseSearchText(row);
    if (filters.includePhrases.length > 0 && !filters.includePhrases.some((phrase) => phraseText.includes(phrase))) {
      return false;
    }
    if (filters.excludePhrases.length > 0 && filters.excludePhrases.some((phrase) => phraseText.includes(phrase))) {
      return false;
    }
    return true;
  });
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

async function loadWesternHubBuses(selectedDate: string): Promise<WesternHubBusRow[]> {
  return queryWithStatementTimeout<WesternHubBusRow>(
    `
      with selected as (
        select
          bus_pnode_name,
          bus_pnode_factor
        from pjm.agg_definitions
        where agg_pnode_name = 'WESTERN HUB'
          and effective_date_ept <= $1::date
          and terminate_date_ept > $1::date
      ),
      fallback_active as (
        select
          bus_pnode_name,
          bus_pnode_factor
        from pjm.agg_definitions
        where agg_pnode_name = 'WESTERN HUB'
          and terminate_date_ept = DATE '9999-12-31'
          and not exists (select 1 from selected)
      )
      select *
      from selected
      union all
      select *
      from fallback_active
    `,
    [selectedDate],
    QUERY_TIMEOUT,
  );
}

function candidateTexts(row: TransmissionOutageRow): string[] {
  const related = row.relatedEquipmentText
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  return Array.from(
    new Set(
      [row.facilityName, ...related]
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter((value) => value.length >= 4),
    ),
  ).slice(0, 12);
}

function emptyEstimate(): ConstraintShiftEstimate & { modelFacilityText: string | null } {
  return {
    modelFacilityText: null,
    shiftFactor: null,
    absoluteShiftFactor: null,
    estimatedWesternHubImpact: null,
    direction: "unknown",
    matchStatus: "no_match",
    matchConfidence: 0,
    matchedBranchKey: null,
    matchedBranchName: null,
    fromBusNumber: null,
    fromBusName: null,
    toBusNumber: null,
    toBusName: null,
    circuitId: null,
  };
}

function matchRank(value: ConstraintShiftEstimate["matchStatus"]): number {
  if (value === "matched") return 3;
  if (value === "ambiguous") return 2;
  if (value === "no_match") return 1;
  return 0;
}

function betterEstimate(
  left: ConstraintShiftEstimate & { modelFacilityText: string | null },
  right: ConstraintShiftEstimate & { modelFacilityText: string | null },
): ConstraintShiftEstimate & { modelFacilityText: string | null } {
  const rankDiff = matchRank(left.matchStatus) - matchRank(right.matchStatus);
  if (rankDiff !== 0) return rankDiff > 0 ? left : right;
  if (left.matchConfidence !== right.matchConfidence) {
    return left.matchConfidence > right.matchConfidence ? left : right;
  }
  return (left.absoluteShiftFactor ?? -1) >= (right.absoluteShiftFactor ?? -1)
    ? left
    : right;
}

function estimateOutageRow(
  row: TransmissionOutageRow,
  estimateForFacility: (facility: string, averageShadowPrice: number) => ConstraintShiftEstimate,
  estimateCache: Map<string, ConstraintShiftEstimate>,
): TransmissionOutageImpactRow {
  const estimate = candidateTexts(row).reduce((best, candidate) => {
    const cached = estimateCache.get(candidate);
    if (cached) {
      return betterEstimate({ ...cached, modelFacilityText: candidate }, best);
    }
    const next = {
      ...estimateForFacility(candidate, 1),
      modelFacilityText: candidate,
    };
    estimateCache.set(candidate, next);
    return betterEstimate(next, best);
  }, emptyEstimate());

  return {
    ...row,
    modelFacilityText: estimate.modelFacilityText,
    shiftFactor: estimate.shiftFactor,
    absoluteShiftFactor: estimate.absoluteShiftFactor,
    whubDirection: estimate.direction,
    matchStatus: estimate.matchStatus,
    matchConfidence: estimate.matchConfidence,
    matchedBranchKey: estimate.matchedBranchKey,
    matchedBranchName: estimate.matchedBranchName,
    fromBusNumber: estimate.fromBusNumber,
    fromBusName: estimate.fromBusName,
    toBusNumber: estimate.toBusNumber,
    toBusName: estimate.toBusName,
    circuitId: estimate.circuitId,
  };
}

function relationLabel(value: "same_branch" | "shared_bus" | "nearby_raw"): TransmissionOutageConstraintRelation {
  if (value === "same_branch") return "Same branch";
  if (value === "shared_bus") return "Shared bus";
  return "Nearby RAW";
}

function constraintEvidenceText(row: TransmissionOutageImpactRow): string {
  return normalizeSearchText([
    row.facilityName,
    row.relatedEquipmentText,
    row.detailSearchText,
    row.modelFacilityText,
    row.matchedBranchName,
    row.fromBusName,
    row.toBusName,
  ].join(" "));
}

function textEvidenceMatch(
  row: TransmissionOutageImpactRow,
  linkedConstraint: LinkedConstraint,
): { tokens: string[]; text: string } | null {
  if (linkedConstraint.evidenceTokens.length === 0) return null;
  const text = constraintEvidenceText(row);
  const matchedTokens = linkedConstraint.evidenceTokens
    .filter((token) => text.includes(token.toLowerCase()))
    .slice(0, 4);
  if (matchedTokens.length === 0) return null;
  return {
    tokens: matchedTokens,
    text: `Selected token ${matchedTokens.join(", ")} appears in outage text.`,
  };
}

export function attachConstraintLink(
  row: TransmissionOutageImpactRow,
  linkedConstraint: LinkedConstraint,
  scoreBranchNeighborhood: (
    sourceBranchKey: string | null | undefined,
    targetBranchKey: string | null | undefined,
  ) => RawBranchNeighborhoodScore | null,
): TransmissionOutageImpactRow {
  if (!linkedConstraint.facilityText && !linkedConstraint.branchKey) {
    return { ...row, constraintLink: null };
  }

  const textEvidence = textEvidenceMatch(row, linkedConstraint);
  const rawEvidence =
    linkedConstraint.branchKey && row.matchedBranchKey
      ? scoreBranchNeighborhood(linkedConstraint.branchKey, row.matchedBranchKey)
      : null;

  if (rawEvidence?.relation) {
    const branchEvidenceText =
      rawEvidence.relation === "same_branch"
        ? "Exact RAW branch key match."
        : rawEvidence.relation === "shared_bus"
          ? `RAW branches share bus ${rawEvidence.sharedBusNumber ?? "-"}.`
          : `RAW endpoints are within ${rawEvidence.hopDistance} branch hops.`;
    const constraintLink: TransmissionOutageConstraintLink = {
      relation: relationLabel(rawEvidence.relation),
      score: Math.min(1, rawEvidence.score + (textEvidence ? 0.05 : 0)),
      hopDistance: rawEvidence.hopDistance,
      evidenceText: textEvidence
        ? `${branchEvidenceText} ${textEvidence.text}`
        : branchEvidenceText,
    };
    return { ...row, constraintLink };
  }

  if (textEvidence) {
    return {
      ...row,
      constraintLink: {
        relation: "Text evidence",
        score: Math.min(0.6, 0.42 + textEvidence.tokens.length * 0.04),
        hopDistance: null,
        evidenceText: textEvidence.text,
      },
    };
  }

  return { ...row, constraintLink: null };
}

function zoneLabel(value: string): string {
  return value.trim() || "Blank";
}

function zoneTicket(row: TransmissionOutageImpactRow): TransmissionOutageZoneImpactTicket | null {
  if (row.shiftFactor === null || row.shiftFactor === undefined) return null;
  return {
    ticketId: row.ticketId,
    facilityName: row.facilityName,
    shiftFactor: row.shiftFactor,
  };
}

export function buildZoneImpacts(rows: TransmissionOutageImpactRow[]): TransmissionOutageZoneImpact[] {
  const byZone = new Map<string, TransmissionOutageZoneImpact>();
  for (const row of rows) {
    const zoneCompany = zoneLabel(row.zoneCompany);
    const current =
      byZone.get(zoneCompany) ??
      {
        zoneCompany,
        ticketCount: 0,
        matchedCount: 0,
        whubPositiveCount: 0,
        whubNegativeCount: 0,
        maxAbsShiftFactor: 0,
        topBullish: null,
        topBearish: null,
      };
    current.ticketCount += 1;
    if (row.shiftFactor !== null && row.shiftFactor !== undefined) {
      current.matchedCount += 1;
      current.maxAbsShiftFactor = Math.max(
        current.maxAbsShiftFactor,
        Math.abs(row.shiftFactor),
      );
      if (row.whubDirection === "positive") current.whubPositiveCount += 1;
      if (row.whubDirection === "negative") current.whubNegativeCount += 1;
      const ticket = zoneTicket(row);
      if (
        ticket &&
        row.shiftFactor > 0 &&
        (!current.topBullish || row.shiftFactor > current.topBullish.shiftFactor)
      ) {
        current.topBullish = ticket;
      }
      if (
        ticket &&
        row.shiftFactor < 0 &&
        (!current.topBearish || row.shiftFactor < current.topBearish.shiftFactor)
      ) {
        current.topBearish = ticket;
      }
    }
    byZone.set(zoneCompany, current);
  }

  return Array.from(byZone.values()).sort((left, right) => {
    if (left.maxAbsShiftFactor !== right.maxAbsShiftFactor) {
      return right.maxAbsShiftFactor - left.maxAbsShiftFactor;
    }
    if (left.matchedCount !== right.matchedCount) {
      return right.matchedCount - left.matchedCount;
    }
    return left.zoneCompany.localeCompare(right.zoneCompany, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export function baseOutageSort(
  left: TransmissionOutageImpactRow,
  right: TransmissionOutageImpactRow,
): number {
  const leftScore = left.absoluteShiftFactor ?? -1;
  const rightScore = right.absoluteShiftFactor ?? -1;
  if (leftScore !== rightScore) return rightScore - leftScore;
  if (left.changed !== right.changed) return left.changed ? -1 : 1;
  return left.ticketId.localeCompare(right.ticketId, undefined, { numeric: true });
}

export function linkedOutageSort(
  left: TransmissionOutageImpactRow,
  right: TransmissionOutageImpactRow,
): number {
  const leftLinkScore = left.constraintLink?.score ?? -1;
  const rightLinkScore = right.constraintLink?.score ?? -1;
  if (leftLinkScore !== rightLinkScore) return rightLinkScore - leftLinkScore;
  return baseOutageSort(left, right);
}

export function limitOutageRows(
  rows: TransmissionOutageImpactRow[],
  limit: number,
  linkedActive: boolean,
): TransmissionOutageImpactRow[] {
  const sortedRows = rows.slice().sort(linkedActive ? linkedOutageSort : baseOutageSort);
  return sortedRows.slice(0, limit);
}

export async function loadTransmissionOutageImpactUniverse(
  searchParams: URLSearchParams,
): Promise<TransmissionOutageImpactUniverse> {
  const filters = parseOutageImpactFilters(searchParams);
  const rawRows = await loadSnapshots();
  const tablePayload = buildTransmissionOutageTablePayload(rawRows, 10_000);
  const selectedDate = snapshotDate(tablePayload.selectedSnapshot?.sourceReportTimestamp);
  const westernHubRows = await loadWesternHubBuses(selectedDate);
  const model = await loadPjmShiftFactorModel(
    westernHubRows.map((row) => ({
      busPnodeName: row.bus_pnode_name,
      busPnodeFactor: toNumber(row.bus_pnode_factor),
    })),
  );

  const estimateCache = new Map<string, ConstraintShiftEstimate>();
  const estimatedRows = tablePayload.rows.map((row) =>
    estimateOutageRow(row, model.estimateForFacility, estimateCache),
  );
  const filteredRows = applyOutageFilters(estimatedRows, filters);

  return {
    tablePayload,
    estimatedRows,
    filteredRows,
    selectedDate,
    model,
    westernHubBusCount: westernHubRows.length,
  };
}

export function linkedOutageRows(
  rows: TransmissionOutageImpactRow[],
  linkedConstraint: LinkedConstraint,
  scoreBranchNeighborhood: (
    sourceBranchKey: string | null | undefined,
    targetBranchKey: string | null | undefined,
  ) => RawBranchNeighborhoodScore | null,
): TransmissionOutageImpactRow[] {
  if (!linkedConstraintActive(linkedConstraint)) {
    return rows.map((row) => ({ ...row, constraintLink: null }));
  }
  return rows
    .map((row) => attachConstraintLink(row, linkedConstraint, scoreBranchNeighborhood))
    .filter((row) => Boolean(row.constraintLink));
}

export function buildOutagePreviewForConstraint(
  rows: TransmissionOutageImpactRow[],
  linkedConstraint: LinkedConstraint,
  scoreBranchNeighborhood: (
    sourceBranchKey: string | null | undefined,
    targetBranchKey: string | null | undefined,
  ) => RawBranchNeighborhoodScore | null,
): PjmConstraintOutagePreview {
  const relatedRows = linkedOutageRows(
    rows,
    linkedConstraint,
    scoreBranchNeighborhood,
  ).sort(linkedOutageSort);
  const topRow = relatedRows[0] ?? null;
  const relatedTicketCount = relatedRows.length;
  const maxAbsRelatedOutageShiftFactor =
    relatedTicketCount > 0
      ? Math.max(...relatedRows.map((row) => Math.abs(row.shiftFactor ?? 0)))
      : null;

  return {
    relatedTicketCount,
    sameBranchCount: relatedRows.filter((row) => row.constraintLink?.relation === "Same branch").length,
    sharedBusCount: relatedRows.filter((row) => row.constraintLink?.relation === "Shared bus").length,
    nearbyRawCount: relatedRows.filter((row) => row.constraintLink?.relation === "Nearby RAW").length,
    textEvidenceCount: relatedRows.filter((row) => row.constraintLink?.relation === "Text evidence").length,
    maxAbsRelatedOutageShiftFactor,
    topRelation: topRow?.constraintLink?.relation ?? null,
    topTicketId: topRow?.ticketId ?? null,
    topFacilityName: topRow?.facilityName ?? null,
    score: topRow?.constraintLink?.score ?? 0,
  };
}
