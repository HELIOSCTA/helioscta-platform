import "server-only";

import type {
  TransmissionOutageChangeType,
  TransmissionOutageDetailPayload,
  TransmissionOutageDetailRecord,
  TransmissionOutageMetadata,
  TransmissionOutagePriorValues,
  TransmissionOutageRow,
  TransmissionOutageSnapshotSummary,
  TransmissionOutageSummary,
  TransmissionOutageTablePayload,
} from "@/lib/pjmTransmissionOutagesTypes";

export interface RawTransmissionOutageSnapshotRow {
  source_report_timestamp: string;
  source_report_timezone: string;
  source_file_sha256: string;
  ingested_at: string;
  source_line_count: number | string | null;
  raw_text: string;
}

interface ParsedSnapshot {
  summary: TransmissionOutageSnapshotSummary;
  records: ParsedOutageRecord[];
  byTicket: Map<string, ParsedOutageRecord>;
}

interface ParsedOutageRecord extends TransmissionOutagePriorValues {
  ticketId: string;
  itemNumber: string;
  sourceRowNumber: number;
  sourceReportTimestamp: string;
  zoneCompany: string;
  openClosed: string;
  rawHeaderLine: string;
  dateLogLines: string[];
  historyLogLines: string[];
  detailLines: string[];
}

const HEADER_PATTERN = /^\s*\d+\s+\d+\s+\S+/;
const DATE_LOG_PATTERN = /^\(\d{2}-[A-Z]{3}-\d{4}/;
const HISTORY_LOG_PATTERN = /^\([A-Za-z]+\s+\d{2}\/\d{2}\/\d{4}/;
const DEFAULT_LIMIT = 10_000;
const EMPTY_SUMMARY: TransmissionOutageSummary = {
  latestTicketCount: 0,
  priorTicketCount: 0,
  ticketsPresentInBoth: 0,
  newTicketCount: 0,
  removedTicketCount: 0,
  changedTicketCount: 0,
  statusChangeCount: 0,
  windowChangeCount: 0,
  facilityChangeCount: 0,
  dateLogChangeCount: 0,
  historyLogChangeCount: 0,
  equipmentChangeCount: 0,
  multipleHistoryEventCount: 0,
  multipleDateWindowCount: 0,
  currentStatusRevisedCount: 0,
  previousStatusRevisedCount: 0,
};

function cleanLine(line: string): string {
  return line.replace(/\r$/, "");
}

function fixed(line: string, start: number, end: number): string {
  return cleanLine(line).slice(start, end).trim();
}

function normalizeTimestamp(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function snapshotSummary(
  row: RawTransmissionOutageSnapshotRow,
  scheduledOutageCount: number,
): TransmissionOutageSnapshotSummary {
  return {
    sourceReportTimestamp: normalizeTimestamp(row.source_report_timestamp),
    sourceReportTimezone: row.source_report_timezone,
    sourceFileSha256: row.source_file_sha256,
    ingestedAt: normalizeTimestamp(row.ingested_at),
    sourceLineCount: Number(row.source_line_count ?? 0),
    scheduledOutageCount,
  };
}

function findScheduledSection(lines: string[]): [number, number] {
  const scheduledHeadingIndex = lines.findIndex((line) =>
    cleanLine(line).startsWith("SCHEDULED OUTAGES"),
  );
  if (scheduledHeadingIndex < 0) return [0, 0];

  const plannedHeadingOffset = lines
    .slice(scheduledHeadingIndex + 1)
    .findIndex((line) => cleanLine(line).startsWith("PLANNED OUTAGES"));
  const sectionEnd =
    plannedHeadingOffset >= 0 ? scheduledHeadingIndex + 1 + plannedHeadingOffset : lines.length;

  return [scheduledHeadingIndex + 1, sectionEnd];
}

function parseRecord(
  sourceReportTimestamp: string,
  sourceRowNumber: number,
  blockLines: string[],
): ParsedOutageRecord | null {
  const headerLine = cleanLine(blockLines[0] ?? "");
  const ticketId = fixed(headerLine, 8, 16);
  if (!ticketId) return null;

  const dateLogLines: string[] = [];
  const historyLogLines: string[] = [];
  const detailLines: string[] = [];

  for (const line of blockLines.slice(1)) {
    const text = cleanLine(line).trim();
    if (!text || text.startsWith("+")) continue;
    if (DATE_LOG_PATTERN.test(text)) {
      dateLogLines.push(text);
      continue;
    }
    if (HISTORY_LOG_PATTERN.test(text)) {
      historyLogLines.push(text);
      continue;
    }
    detailLines.push(text);
  }

  return {
    ticketId,
    itemNumber: fixed(headerLine, 0, 6),
    sourceRowNumber,
    sourceReportTimestamp,
    zoneCompany: fixed(headerLine, 16, 24),
    facilityName: fixed(headerLine, 25, 72),
    startAtText: fixed(headerLine, 74, 90),
    endAtText: fixed(headerLine, 92, 108),
    openClosed: fixed(headerLine, 110, 111),
    currentStatus: fixed(headerLine, 113, 122),
    statusTimestampText: fixed(headerLine, 122, 138),
    availability: fixed(headerLine, 150, 159),
    risk: fixed(headerLine, 161, 169),
    previousStatus: fixed(headerLine, 169, 178),
    onTime: fixed(headerLine, 179, 182),
    lastEvaluatedText: fixed(headerLine, 183, 199),
    dateLogCount: dateLogLines.length,
    historyLogCount: historyLogLines.length,
    detailLineCount: detailLines.length,
    rawHeaderLine: headerLine,
    dateLogLines,
    historyLogLines,
    detailLines,
  };
}

function parseSnapshot(row: RawTransmissionOutageSnapshotRow): ParsedSnapshot {
  const sourceReportTimestamp = normalizeTimestamp(row.source_report_timestamp);
  const lines = row.raw_text.split(/\n/);
  const [sectionStart, sectionEnd] = findScheduledSection(lines);
  const records: ParsedOutageRecord[] = [];

  let currentStartLine = 0;
  let currentBlock: string[] = [];

  for (let index = sectionStart; index < sectionEnd; index += 1) {
    const line = lines[index] ?? "";
    if (HEADER_PATTERN.test(line)) {
      if (currentBlock.length > 0) {
        const record = parseRecord(sourceReportTimestamp, currentStartLine, currentBlock);
        if (record) records.push(record);
      }
      currentStartLine = index + 1;
      currentBlock = [line];
      continue;
    }
    if (currentBlock.length > 0) currentBlock.push(line);
  }

  if (currentBlock.length > 0) {
    const record = parseRecord(sourceReportTimestamp, currentStartLine, currentBlock);
    if (record) records.push(record);
  }

  return {
    summary: snapshotSummary(row, records.length),
    records,
    byTicket: new Map(records.map((record) => [record.ticketId, record])),
  };
}

function toPrior(record: ParsedOutageRecord): TransmissionOutagePriorValues {
  return {
    facilityName: record.facilityName,
    startAtText: record.startAtText,
    endAtText: record.endAtText,
    currentStatus: record.currentStatus,
    statusTimestampText: record.statusTimestampText,
    availability: record.availability,
    risk: record.risk,
    previousStatus: record.previousStatus,
    onTime: record.onTime,
    lastEvaluatedText: record.lastEvaluatedText,
    dateLogCount: record.dateLogCount,
    historyLogCount: record.historyLogCount,
    detailLineCount: record.detailLineCount,
  };
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function changeTypes(
  current: ParsedOutageRecord,
  prior: ParsedOutageRecord | undefined,
): TransmissionOutageChangeType[] {
  if (!prior) return ["new"];

  const changes: TransmissionOutageChangeType[] = [];
  if (
    current.currentStatus !== prior.currentStatus ||
    current.statusTimestampText !== prior.statusTimestampText ||
    current.previousStatus !== prior.previousStatus
  ) {
    changes.push("status");
  }
  if (current.startAtText !== prior.startAtText || current.endAtText !== prior.endAtText) {
    changes.push("window");
  }
  if (current.facilityName !== prior.facilityName) changes.push("facility");
  if (!arraysEqual(current.dateLogLines, prior.dateLogLines)) changes.push("date_log");
  if (!arraysEqual(current.historyLogLines, prior.historyLogLines)) changes.push("history_log");
  if (!arraysEqual(current.detailLines, prior.detailLines)) changes.push("equipment");
  return changes.length > 0 ? changes : ["unchanged"];
}

function toRow(
  current: ParsedOutageRecord,
  prior: ParsedOutageRecord | undefined,
): TransmissionOutageRow {
  const changes = changeTypes(current, prior);
  return {
    ...toPrior(current),
    ticketId: current.ticketId,
    itemNumber: current.itemNumber,
    sourceRowNumber: current.sourceRowNumber,
    sourceReportTimestamp: current.sourceReportTimestamp,
    zoneCompany: current.zoneCompany,
    openClosed: current.openClosed,
    changeTypes: changes,
    changed: changes.some((change) => change !== "unchanged"),
    prior: prior ? toPrior(prior) : null,
  };
}

function toDetailRecord(
  current: ParsedOutageRecord,
  prior: ParsedOutageRecord | undefined,
): TransmissionOutageDetailRecord {
  return {
    ...toRow(current, prior),
    rawHeaderLine: current.rawHeaderLine,
    dateLogLines: current.dateLogLines,
    historyLogLines: current.historyLogLines,
    detailLines: current.detailLines,
  };
}

function optionList(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
  );
}

function buildMetadata(rows: TransmissionOutageRow[]): TransmissionOutageMetadata {
  return {
    zones: optionList(rows.map((row) => row.zoneCompany)),
    statuses: optionList(rows.map((row) => row.currentStatus)),
    previousStatuses: optionList(rows.map((row) => row.previousStatus)),
    availabilities: optionList(rows.map((row) => row.availability)),
    risks: optionList(rows.map((row) => row.risk)),
    onTimes: optionList(rows.map((row) => row.onTime)),
    changeTypes: optionList(rows.flatMap((row) => row.changeTypes)) as TransmissionOutageChangeType[],
  };
}

function buildSummary(
  latest: ParsedSnapshot | undefined,
  prior: ParsedSnapshot | undefined,
  rows: TransmissionOutageRow[],
): TransmissionOutageSummary {
  if (!latest) return EMPTY_SUMMARY;

  const priorTickets = prior ? new Set(prior.records.map((record) => record.ticketId)) : new Set<string>();
  const latestTickets = new Set(latest.records.map((record) => record.ticketId));

  let removedTicketCount = 0;
  priorTickets.forEach((ticketId) => {
    if (!latestTickets.has(ticketId)) removedTicketCount += 1;
  });

  return {
    latestTicketCount: latest.records.length,
    priorTicketCount: prior?.records.length ?? 0,
    ticketsPresentInBoth: rows.filter((row) => row.prior !== null).length,
    newTicketCount: rows.filter((row) => row.changeTypes.includes("new")).length,
    removedTicketCount,
    changedTicketCount: rows.filter((row) => row.changed).length,
    statusChangeCount: rows.filter((row) => row.changeTypes.includes("status")).length,
    windowChangeCount: rows.filter((row) => row.changeTypes.includes("window")).length,
    facilityChangeCount: rows.filter((row) => row.changeTypes.includes("facility")).length,
    dateLogChangeCount: rows.filter((row) => row.changeTypes.includes("date_log")).length,
    historyLogChangeCount: rows.filter((row) => row.changeTypes.includes("history_log")).length,
    equipmentChangeCount: rows.filter((row) => row.changeTypes.includes("equipment")).length,
    multipleHistoryEventCount: rows.filter((row) => row.historyLogCount >= 2).length,
    multipleDateWindowCount: rows.filter((row) => row.dateLogCount >= 2).length,
    currentStatusRevisedCount: rows.filter((row) => row.currentStatus === "Revised").length,
    previousStatusRevisedCount: rows.filter((row) => row.previousStatus === "Revised").length,
  };
}

export function buildTransmissionOutageTablePayload(
  rawRows: RawTransmissionOutageSnapshotRow[],
  limit = DEFAULT_LIMIT,
): TransmissionOutageTablePayload {
  const parsedSnapshots = rawRows.map(parseSnapshot);
  const latest = parsedSnapshots[0];
  const prior = parsedSnapshots[1];
  const rows =
    latest?.records.map((record) => toRow(record, prior?.byTicket.get(record.ticketId))) ?? [];

  rows.sort((left, right) => {
    if (left.changed !== right.changed) return left.changed ? -1 : 1;
    const startComparison = left.startAtText.localeCompare(right.startAtText, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (startComparison !== 0) return startComparison;
    return left.ticketId.localeCompare(right.ticketId, undefined, { numeric: true });
  });

  const boundedLimit = Math.max(1, Math.min(limit, DEFAULT_LIMIT));
  const visibleRows = rows.slice(0, boundedLimit);

  return {
    mode: "table",
    snapshots: parsedSnapshots.map((snapshot) => snapshot.summary),
    selectedSnapshot: latest?.summary ?? null,
    priorSnapshot: prior?.summary ?? null,
    summary: buildSummary(latest, prior, rows),
    metadata: buildMetadata(rows),
    rows: visibleRows,
    limit: boundedLimit,
    truncated: rows.length > boundedLimit,
  };
}

export function buildTransmissionOutageDetailPayload(
  rawRows: RawTransmissionOutageSnapshotRow[],
  ticketId: string,
): TransmissionOutageDetailPayload {
  const parsedSnapshots = rawRows.map(parseSnapshot);
  return {
    mode: "detail",
    ticketId,
    snapshots: parsedSnapshots.map((snapshot, index) => {
      const record = snapshot.byTicket.get(ticketId);
      const comparisonSnapshot = index === 0 ? parsedSnapshots[1] : parsedSnapshots[0];
      const prior = comparisonSnapshot?.byTicket.get(ticketId);
      return {
        snapshot: snapshot.summary,
        record: record ? toDetailRecord(record, prior) : null,
      };
    }),
  };
}
