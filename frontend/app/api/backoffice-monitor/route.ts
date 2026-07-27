import {
  measureRoutePhase,
  observedJsonRoute,
  type ObservedRouteResult,
} from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import {
  getCachedRouteValue,
  normalizedSearchCacheKey,
  routeCacheHeaders,
} from "@/lib/server/routeCache";
import type {
  BackOfficeMonitorEmailHistoryDetail,
  BackOfficeMonitorEmailHistoryRow,
  BackOfficeMonitorEmailStatus,
  BackOfficeMonitorEmailWorkflow,
  BackOfficeMonitorPayload,
} from "@/lib/positionsAndTrades/backOfficeMonitorTypes";

export const runtime = "nodejs";

const CACHE_TTL_SECONDS = 5 * 60;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;
const STALE_IF_ERROR_MS = 30 * 60 * 1000;
const CACHE_HEADER = `private, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS}`;
const NO_STORE_HEADER = "no-store";
const LOCAL_DISPLAY_TIME_ZONE = "America/Denver";
const DEFAULT_OUTLOOK_SENDER = "aidan.keaveny@helioscta.com";
const REQUIRED_EMAIL_RECIPIENTS = ["kapil.saxena@helioscta.com"];
const CLEAR_STREET_NAV_EMAIL_RECIPIENT = "helioscta@navfundservices.com";
const INTERNAL_EMAIL_DATASETS = [
  "nav_positions",
  "nav_trade_breaks",
  "clear_street_eod_transactions",
  "clear_street_trades_mufg_upload",
];
const EMAIL_HISTORY_LIMIT = 40;
const SOURCE_CHECKS =
  "Sources: ops.email_notification_outbox and ops.api_fetch_log Microsoft Graph telemetry";

interface EmailWorkflowConfig {
  id: string;
  label: string;
  audience: "Internal" | "External";
  trigger: string;
  deliveryPath: string;
  senderEmail: string;
  senderSource: string;
  recipientSource: string;
  recipientEmails: string[];
  artifact: string;
  datasets?: string[];
  directNavEmail?: boolean;
}

interface OutboxRow {
  dataset: string | null;
  notification_key: string;
  source_event_key: string | null;
  recipient_email: string;
  subject: string;
  status: string;
  provider: string | null;
  attempts: number | string | null;
  max_attempts: number | string | null;
  payload: unknown;
  created_at: string | Date;
  updated_at: string | Date | null;
  sent_at: string | Date | null;
  last_attempt_at: string | Date | null;
  last_error_type: string | null;
  last_error_message: string | null;
}

interface DirectEmailTelemetryRow {
  created_at: string | Date;
  status: string | null;
  rows_written: number | string | null;
  error_type: string | null;
  error_message: string | null;
  metadata: unknown;
}

function firstEnv(names: string[], fallback: string): { value: string; source: string } {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return { value, source: name };
  }
  return { value: fallback, source: `${names[0]} default` };
}

function responseHeaders(forceRefresh: boolean): HeadersInit {
  return {
    "Cache-Control": forceRefresh ? NO_STORE_HEADER : CACHE_HEADER,
    "Vercel-CDN-Cache-Control": NO_STORE_HEADER,
    "X-Helios-Cache-Policy": forceRefresh
      ? "no-store"
      : `browser-cache=${CACHE_TTL_SECONDS}, vercel-cdn no-store`,
  };
}

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && trimmed.includes("@") ? trimmed : null;
}

function parseEmailList(value: string | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  for (const raw of value.split(/[,\s;]+/)) {
    const email = normalizeEmail(raw);
    if (email) seen.add(email);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

function mergeEmails(...lists: string[][]): string[] {
  return [...new Set(lists.flat())].sort((a, b) => a.localeCompare(b));
}

function emailsFromEnv(name: string, fallback: string[]): string[] {
  const parsed = parseEmailList(process.env[name]);
  const base = parsed.length > 0 ? parsed : fallback;
  return mergeEmails(base, REQUIRED_EMAIL_RECIPIENTS);
}

function clearStreetNavEmails(): string[] {
  return [CLEAR_STREET_NAV_EMAIL_RECIPIENT];
}

function formatTimestamp(value: string | Date | null): string {
  if (!value) return "--";
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "--";
  return parsed.toLocaleString("en-US", {
    timeZone: LOCAL_DISPLAY_TIME_ZONE,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function isoTimestamp(value: string | Date | null): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function activityAt(row: OutboxRow): string | Date | null {
  return row.sent_at ?? row.last_attempt_at ?? row.updated_at ?? row.created_at;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function numberLabel(value: number): string {
  return value.toLocaleString();
}

function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeMonitorDate(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function monitorDateFromPayload(payload: Record<string, unknown>, fallback: unknown): string | null {
  for (const key of [
    "nav_date",
    "trade_date",
    "trade_date_from_sftp",
    "expected_trade_date",
    "expected_trade_date_from_sftp",
    "sftp_date",
  ]) {
    const date = normalizeMonitorDate(payload[key]);
    if (date) return date;
  }
  return normalizeMonitorDate(fallback);
}

function formatDateOnly(value: string | null): string {
  if (!value) return "--";
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusFromOutbox(rows: OutboxRow[]): BackOfficeMonitorEmailStatus {
  if (rows.length === 0) return "unknown";
  const statuses = rows.map((row) => row.status.toLowerCase());
  if (statuses.some((status) => status === "dead" || status === "failed")) return "failed";
  if (statuses.some((status) => status === "pending" || status === "sending")) return "queued";
  if (statuses.every((status) => status === "sent")) return "sent";
  return "unknown";
}

function statusLabel(status: BackOfficeMonitorEmailStatus): string {
  if (status === "sent") return "SENT";
  if (status === "queued") return "QUEUED";
  if (status === "failed") return "FAILED";
  return "UNKNOWN";
}

function buildEmailWorkflowConfigs(): EmailWorkflowConfig[] {
  const graphSender = firstEnv(
    ["AZURE_OUTLOOK_SENDER", "HELIOS_EMAIL_FROM_ADDRESS"],
    DEFAULT_OUTLOOK_SENDER,
  );
  const navSender = firstEnv(
    ["CLEAR_STREET_NAV_EMAIL_SENDER", "AZURE_OUTLOOK_SENDER", "HELIOS_EMAIL_FROM_ADDRESS"],
    DEFAULT_OUTLOOK_SENDER,
  );
  const internalRecipients = emailsFromEnv("HELIOS_EMAIL_RECIPIENTS", [
    "aidan.keaveny@helioscta.com",
  ]);
  const navRecipients = clearStreetNavEmails();

  return [
    {
      id: "nav_positions",
      label: "NAV Positions Review",
      audience: "Internal",
      trigger: "All target NAV position workbooks loaded",
      deliveryPath: "Email outbox -> Microsoft Graph",
      senderEmail: graphSender.value,
      senderSource: graphSender.source,
      recipientSource: "HELIOS_EMAIL_RECIPIENTS",
      recipientEmails: internalRecipients,
      artifact: "Raw NAV position workbooks",
      datasets: ["nav_positions"],
    },
    {
      id: "nav_trade_breaks",
      label: "NAV Trade Breaks Review",
      audience: "Internal",
      trigger: "Target NAV Trade Breaks workbook found",
      deliveryPath: "Email outbox -> Microsoft Graph",
      senderEmail: graphSender.value,
      senderSource: graphSender.source,
      recipientSource: "HELIOS_EMAIL_RECIPIENTS",
      recipientEmails: internalRecipients,
      artifact: "Raw NAV Trade Breaks workbook",
      datasets: ["nav_trade_breaks"],
    },
    {
      id: "clear_street_source",
      label: "Clear Street Source File",
      audience: "Internal",
      trigger: "Clear Street EOD CSV loaded to Postgres",
      deliveryPath: "Email outbox -> Microsoft Graph",
      senderEmail: graphSender.value,
      senderSource: graphSender.source,
      recipientSource: "HELIOS_EMAIL_RECIPIENTS",
      recipientEmails: internalRecipients,
      artifact: "Raw Clear Street CSV",
      datasets: ["clear_street_eod_transactions"],
    },
    {
      id: "clear_street_mufg",
      label: "Clear Street MUFG Confirmation",
      audience: "Internal",
      trigger: "Filtered MUFG CSV uploaded to MUFG SFTP",
      deliveryPath: "Email outbox -> Microsoft Graph",
      senderEmail: graphSender.value,
      senderSource: graphSender.source,
      recipientSource: "HELIOS_EMAIL_RECIPIENTS",
      recipientEmails: internalRecipients,
      artifact: "Filtered MUFG CSV",
      datasets: ["clear_street_trades_mufg_upload"],
    },
    {
      id: "clear_street_nav",
      label: "Clear Street to NAV",
      audience: "External",
      trigger: "Clear Street source file succeeds",
      deliveryPath: "Direct Microsoft Graph send",
      senderEmail: navSender.value,
      senderSource: navSender.source,
      recipientSource: "CLEAR_STREET_NAV_EMAIL_RECIPIENTS",
      recipientEmails: navRecipients,
      artifact: "Raw Clear Street CSV",
      directNavEmail: true,
    },
  ];
}

async function loadOutboxRows(): Promise<OutboxRow[]> {
  try {
    return await query<OutboxRow>(
      `
      SELECT
        dataset,
        notification_key,
        source_event_key,
        recipient_email,
        subject,
        status,
        provider,
        attempts,
        max_attempts,
        payload,
        created_at,
        updated_at,
        sent_at,
        last_attempt_at,
        last_error_type,
        last_error_message
      FROM ops.email_notification_outbox
      WHERE dataset = ANY($1::text[])
      ORDER BY COALESCE(sent_at, last_attempt_at, updated_at, created_at) DESC
      LIMIT 250
      `,
      [INTERNAL_EMAIL_DATASETS],
    );
  } catch {
    return [];
  }
}

async function loadDirectNavEmailRows(): Promise<DirectEmailTelemetryRow[]> {
  try {
    return await query<DirectEmailTelemetryRow>(
      `
      SELECT
        created_at,
        status,
        rows_written,
        error_type,
        error_message,
        metadata
      FROM ops.api_fetch_log
      WHERE lower(coalesce(provider, '')) = 'microsoft_graph'
        AND (
          lower(coalesce(operation_name, '')) = 'clear_street_trades_nav_email'
          OR lower(coalesce(pipeline_name, '')) = 'clear_street_trades_nav_email'
          OR lower(coalesce(target_table, '')) = 'nav_email.clear_street_trades'
        )
      ORDER BY created_at DESC
      LIMIT 120
      `,
    );
  } catch {
    return [];
  }
}

function outboxWorkflow(
  config: EmailWorkflowConfig,
  rows: OutboxRow[],
): BackOfficeMonitorEmailWorkflow {
  const workflowRows = rows.filter((row) => config.datasets?.includes(row.dataset ?? ""));
  const latest = workflowRows[0];
  if (!latest) {
    return {
      ...config,
      latestStatus: "unknown",
      latestStatusLabel: "UNKNOWN",
      latestActivityAt: null,
      latestActivityLabel: "--",
      latestSubject: null,
      latestDetail: `No recent outbox rows found. Expected routing uses ${config.senderSource} -> ${config.recipientSource}.`,
      latestError: null,
    };
  }

  const latestKey = latest.source_event_key ?? latest.notification_key;
  const eventRows = workflowRows.filter(
    (row) => (row.source_event_key ?? row.notification_key) === latestKey,
  );
  const recipients = mergeEmails(
    eventRows.map((row) => row.recipient_email.trim().toLowerCase()).filter(Boolean),
  );
  const status = statusFromOutbox(eventRows);
  const activity = activityAt(latest);
  const attempts = eventRows.reduce((total, row) => total + Number(row.attempts ?? 0), 0);
  const failed = eventRows.find((row) => row.last_error_message || row.last_error_type);
  const payload = toRecord(latest.payload);
  const attachmentCount = stringArray(payload.attachment_paths).length;

  return {
    ...config,
    recipientEmails: recipients.length > 0 ? recipients : config.recipientEmails,
    latestStatus: status,
    latestStatusLabel: statusLabel(status),
    latestActivityAt: isoTimestamp(activity),
    latestActivityLabel: formatTimestamp(activity),
    latestSubject: latest.subject,
    latestDetail: `${eventRows.length} recipient row(s), ${attempts} total attempt(s)${
      attachmentCount ? `, ${attachmentCount} attachment(s)` : ""
    }.`,
    latestError: failed?.last_error_message ?? failed?.last_error_type ?? null,
  };
}

function directNavWorkflow(
  config: EmailWorkflowConfig,
  telemetry: DirectEmailTelemetryRow | null,
): BackOfficeMonitorEmailWorkflow {
  if (!telemetry) {
    return {
      ...config,
      latestStatus: "unknown",
      latestStatusLabel: "UNKNOWN",
      latestActivityAt: null,
      latestActivityLabel: "--",
      latestSubject: null,
      latestDetail: `No recent Microsoft Graph telemetry found. Expected routing uses ${config.senderSource} -> ${config.recipientSource}.`,
      latestError: null,
    };
  }

  const metadata = toRecord(telemetry.metadata);
  const status = telemetry.status?.toLowerCase() === "success" ? "sent" : "failed";
  const recipients = stringArray(metadata.recipient_emails);
  const sender = normalizeEmail(String(metadata.sender_email ?? "")) ?? config.senderEmail;
  const subject = typeof metadata.email_subject === "string" ? metadata.email_subject : null;
  const sourceFilename = typeof metadata.source_filename === "string" ? metadata.source_filename : null;
  const detailParts = [`${Number(telemetry.rows_written ?? 0)} email send(s)`];
  if (sourceFilename) detailParts.push(`source file ${sourceFilename}`);
  if (recipients.length > 0) {
    detailParts.push(`latest recipient(s) ${recipients.join(", ")}`);
  }

  return {
    ...config,
    senderEmail: sender,
    recipientEmails: config.recipientEmails,
    latestStatus: status,
    latestStatusLabel: statusLabel(status),
    latestActivityAt: isoTimestamp(telemetry.created_at),
    latestActivityLabel: formatTimestamp(telemetry.created_at),
    latestSubject: subject,
    latestDetail: `${detailParts.join(", ")}.`,
    latestError: telemetry.error_message ?? telemetry.error_type ?? null,
  };
}

function statusFromOutboxRow(row: OutboxRow): BackOfficeMonitorEmailStatus {
  const status = row.status.toLowerCase();
  if (status === "dead" || status === "failed") return "failed";
  if (status === "pending" || status === "sending") return "queued";
  if (status === "sent") return "sent";
  return "unknown";
}

function statusFromDirectTelemetry(row: DirectEmailTelemetryRow): BackOfficeMonitorEmailStatus {
  const status = row.status?.toLowerCase();
  if (status === "success") return "sent";
  if (status === "failure" || status === "failed" || row.error_message || row.error_type) {
    return "failed";
  }
  return "unknown";
}

function latestIso(values: Array<string | Date | null>): string | null {
  const latestTime = values.reduce<number | null>((latest, value) => {
    if (!value) return latest;
    const parsed = value instanceof Date ? value : new Date(value);
    const time = parsed.getTime();
    if (!Number.isFinite(time)) return latest;
    return latest === null || time > latest ? time : latest;
  }, null);
  return latestTime === null ? null : new Date(latestTime).toISOString();
}

function basename(value: string): string {
  return value.split(/[\\/]/).pop() || value;
}

function payloadNumber(
  payload: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (value == null || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function attachmentCount(payload: Record<string, unknown>): number {
  return stringList(payload.attachment_paths).length || stringList(payload.attachments).length;
}

function artifactLabel(config: EmailWorkflowConfig, payload: Record<string, unknown>): string {
  const filenames = [
    ...stringList(payload.source_filenames),
    cleanText(payload.source_filename),
    cleanText(payload.downloaded_filename),
    cleanText(payload.filename),
    cleanText(payload.remote_filename),
  ].filter((value): value is string => Boolean(value));
  if (filenames.length > 0) {
    const unique = [...new Set(filenames.map((value) => basename(value)))];
    const first = unique.slice(0, 2).join(", ");
    return unique.length > 2 ? `${first} +${unique.length - 2}` : first;
  }

  const attachments = stringList(payload.attachment_paths).map(basename);
  if (attachments.length > 0) {
    const first = attachments.slice(0, 2).join(", ");
    return attachments.length > 2 ? `${first} +${attachments.length - 2}` : first;
  }

  return config.artifact;
}

function rowCountLabel(payload: Record<string, unknown>, fallback: number | null = null): string {
  const rows = payloadNumber(payload, [
    "rows_processed",
    "rows_uploaded",
    "rows_exported",
    "rows_loaded",
    "emails_sent",
  ]);
  if (rows !== null) return numberLabel(rows);
  return fallback !== null ? numberLabel(fallback) : "--";
}

function attemptsLabel(row: OutboxRow): string {
  const attempts = Number(row.attempts ?? 0);
  const maxAttempts = Number(row.max_attempts ?? 0);
  if (maxAttempts > 0) return `${numberLabel(attempts)}/${numberLabel(maxAttempts)}`;
  return numberLabel(attempts);
}

function buildOutboxHistoryDetail(
  row: OutboxRow,
  index: number,
): BackOfficeMonitorEmailHistoryDetail {
  const payload = toRecord(row.payload);
  const activity = activityAt(row);
  const status = statusFromOutboxRow(row);
  return {
    id: `${row.notification_key}:${row.recipient_email}:${index}`,
    channel: "outbox",
    recipientEmail: normalizeEmail(row.recipient_email),
    senderEmail: null,
    status,
    statusLabel: statusLabel(status),
    activityAt: isoTimestamp(activity),
    activityLabel: formatTimestamp(activity),
    subject: row.subject,
    notificationKey: row.notification_key,
    attemptsLabel: attemptsLabel(row),
    artifactLabel: artifactLabel(
      {
        id: row.dataset ?? "outbox",
        label: row.dataset ?? "Outbox",
        audience: "Internal",
        trigger: "",
        deliveryPath: "",
        senderEmail: "",
        senderSource: "",
        recipientSource: "",
        recipientEmails: [],
        artifact: "Email artifact",
      },
      payload,
    ),
    error: row.last_error_message ?? row.last_error_type ?? null,
  };
}

function outboxHistoryRows(
  config: EmailWorkflowConfig,
  rows: OutboxRow[],
): BackOfficeMonitorEmailHistoryRow[] {
  const workflowRows = rows.filter((row) => config.datasets?.includes(row.dataset ?? ""));
  const byEvent = new Map<string, OutboxRow[]>();
  for (const row of workflowRows) {
    const key = row.source_event_key ?? row.notification_key;
    byEvent.set(key, [...(byEvent.get(key) ?? []), row]);
  }

  return [...byEvent.entries()].map(([eventKey, eventRows]) => {
    const latest = eventRows[0];
    const payload = toRecord(latest.payload);
    const activityAtIso = latestIso(eventRows.map(activityAt));
    const status = statusFromOutbox(eventRows);
    const details = eventRows.map(buildOutboxHistoryDetail);
    const recipients = mergeEmails(
      eventRows.map((row) => row.recipient_email.trim().toLowerCase()).filter(Boolean),
    );
    const attachmentTotal = attachmentCount(payload);
    const rowCount = rowCountLabel(payload);
    const artifact = artifactLabel(config, payload);
    const businessDate = monitorDateFromPayload(payload, activityAtIso ?? latest.created_at);

    return {
      id: `${config.id}:${eventKey}`,
      workflowId: config.id,
      workflowLabel: config.label,
      audience: config.audience,
      businessDate,
      businessDateLabel: formatDateOnly(businessDate),
      latestActivityAt: activityAtIso,
      latestActivityLabel: formatTimestamp(activityAtIso),
      status,
      statusLabel: statusLabel(status),
      subject: latest.subject,
      recipientsLabel: `${numberLabel(recipients.length)} recipient row(s)`,
      rowCountLabel: rowCount,
      artifactLabel: artifact,
      detail: `${numberLabel(eventRows.length)} outbox row(s), ${numberLabel(
        eventRows.reduce((total, row) => total + Number(row.attempts ?? 0), 0),
      )} total attempt(s)${attachmentTotal ? `, ${numberLabel(attachmentTotal)} attachment(s)` : ""}.`,
      details,
    };
  });
}

function directNavHistoryRows(
  config: EmailWorkflowConfig,
  rows: DirectEmailTelemetryRow[],
): BackOfficeMonitorEmailHistoryRow[] {
  return rows.map((row, index) => {
    const metadata = toRecord(row.metadata);
    const status = statusFromDirectTelemetry(row);
    const recipients = stringArray(metadata.recipient_emails);
    const sender = normalizeEmail(String(metadata.sender_email ?? "")) ?? config.senderEmail;
    const subject = typeof metadata.email_subject === "string" ? metadata.email_subject : null;
    const sourceFilename = cleanText(metadata.source_filename);
    const businessDate = monitorDateFromPayload(metadata, row.created_at);
    const activityAtIso = isoTimestamp(row.created_at);
    const fallbackRows = Number(row.rows_written ?? recipients.length);
    const details: BackOfficeMonitorEmailHistoryDetail[] =
      (recipients.length > 0 ? recipients : [null]).map((recipient, recipientIndex) => ({
        id: `${config.id}:${activityAtIso ?? index}:${recipient ?? "recipient"}:${recipientIndex}`,
        channel: "direct",
        recipientEmail: recipient,
        senderEmail: sender,
        status,
        statusLabel: statusLabel(status),
        activityAt: activityAtIso,
        activityLabel: formatTimestamp(row.created_at),
        subject,
        notificationKey: null,
        attemptsLabel: status === "sent" ? "1" : "--",
        artifactLabel: sourceFilename ? basename(sourceFilename) : config.artifact,
        error: row.error_message ?? row.error_type ?? null,
      }));

    return {
      id: `${config.id}:${activityAtIso ?? index}`,
      workflowId: config.id,
      workflowLabel: config.label,
      audience: config.audience,
      businessDate,
      businessDateLabel: formatDateOnly(businessDate),
      latestActivityAt: activityAtIso,
      latestActivityLabel: formatTimestamp(row.created_at),
      status,
      statusLabel: statusLabel(status),
      subject,
      recipientsLabel: `${numberLabel(recipients.length || Number(row.rows_written ?? 0))} recipient row(s)`,
      rowCountLabel: rowCountLabel(metadata, Number.isFinite(fallbackRows) ? fallbackRows : null),
      artifactLabel: sourceFilename ? basename(sourceFilename) : artifactLabel(config, metadata),
      detail: `${numberLabel(Number(row.rows_written ?? recipients.length ?? 0))} direct email send(s)${
        sourceFilename ? `, source file ${basename(sourceFilename)}` : ""
      }.`,
      details,
    };
  });
}

function buildEmailHistory(
  configs: EmailWorkflowConfig[],
  outboxRows: OutboxRow[],
  directNavRows: DirectEmailTelemetryRow[],
): BackOfficeMonitorEmailHistoryRow[] {
  const rows = configs.flatMap((config) =>
    config.directNavEmail
      ? directNavHistoryRows(config, directNavRows)
      : outboxHistoryRows(config, outboxRows),
  );

  return rows
    .sort((left, right) => {
      const leftTime = left.latestActivityAt ? Date.parse(left.latestActivityAt) : 0;
      const rightTime = right.latestActivityAt ? Date.parse(right.latestActivityAt) : 0;
      return rightTime - leftTime;
    })
    .slice(0, EMAIL_HISTORY_LIMIT);
}

async function loadEmailMonitorData(): Promise<{
  emailWorkflows: BackOfficeMonitorEmailWorkflow[];
  emailHistory: BackOfficeMonitorEmailHistoryRow[];
}> {
  const configs = buildEmailWorkflowConfigs();
  const [outboxRows, directNavRows] = await Promise.all([
    loadOutboxRows(),
    loadDirectNavEmailRows(),
  ]);
  return {
    emailWorkflows: configs.map((config) =>
      config.directNavEmail
        ? directNavWorkflow(config, directNavRows[0] ?? null)
        : outboxWorkflow(config, outboxRows),
    ),
    emailHistory: buildEmailHistory(configs, outboxRows, directNavRows),
  };
}

function latestWorkflowActivity(workflows: BackOfficeMonitorEmailWorkflow[]): string | null {
  const latestTime = workflows.reduce<number | null>((latest, workflow) => {
    if (!workflow.latestActivityAt) return latest;
    const value = Date.parse(workflow.latestActivityAt);
    if (!Number.isFinite(value)) return latest;
    return latest === null || value > latest ? value : latest;
  }, null);
  return latestTime === null ? null : new Date(latestTime).toISOString();
}

export const GET = observedJsonRoute(
  {
    route: "/api/backoffice-monitor",
    cacheHeader: CACHE_HEADER,
    cachePolicy: `browser-cache=${CACHE_TTL_SECONDS}, vercel-cdn no-store`,
    owner: "frontend",
    purpose: "Back Office Monitor email routing summary.",
    p95TargetMs: 500,
    freshnessSource: SOURCE_CHECKS,
  },
  async (request) => {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.has("refresh");
    const { value, cacheStatus } = await getCachedRouteValue<ObservedRouteResult>({
      namespace: "/api/backoffice-monitor",
      key: normalizedSearchCacheKey(url.searchParams),
      ttlMs: CACHE_TTL_MS,
      staleIfErrorMs: STALE_IF_ERROR_MS,
      forceRefresh,
      dataCache: true,
      dataCacheTtlSeconds: CACHE_TTL_SECONDS,
      load: async () => {
        const generatedAt = new Date().toISOString();
        const { emailWorkflows, emailHistory } = await measureRoutePhase(
          "email-monitor-data",
          loadEmailMonitorData,
        );
        const dataAsOf = latestWorkflowActivity(emailWorkflows) ?? generatedAt;

        const payload: BackOfficeMonitorPayload = {
          source: "backoffice-monitor",
          generatedAt,
          emailWorkflows,
          emailHistory,
          sourceChecks: SOURCE_CHECKS,
        };

        return {
          payload,
          headers: responseHeaders(forceRefresh),
          rowCount: emailWorkflows.reduce(
            (total, workflow) => total + workflow.recipientEmails.length,
            0,
          ),
          dataAsOf,
        };
      },
    });

    return {
      ...value,
      headers: {
        ...responseHeaders(forceRefresh),
        ...routeCacheHeaders(cacheStatus),
      },
    };
  },
);
