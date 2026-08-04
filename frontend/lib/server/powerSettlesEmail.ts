import "server-only";

import type {
  PowerSettlesDashboardComponent,
  PowerSettlesDashboardIsoRow,
  PowerSettlesDashboardPayload,
  RtLmpSource,
} from "@/lib/server/powerLmps";

export const POWER_SETTLES_EMAIL_TOPIC = "power-settles-email";
export const POWER_SETTLES_EMAIL_ALLOWED_RECIPIENT = "aidan.keaveny@helioscta.com";
export const POWER_SETTLES_EMAIL_RECIPIENTS = [POWER_SETTLES_EMAIL_ALLOWED_RECIPIENT] as const;
export const POWER_SETTLES_EMAIL_DEFAULT_RT_SOURCE: RtLmpSource = "verified";

export interface PowerSettlesEmailQueueMessage {
  recipientEmail: string;
  requestedDate: string | null;
  rtSource: RtLmpSource;
  component?: PowerSettlesDashboardComponent;
  lookbackDays: number;
  reportUrl: string;
  idempotencyKey: string;
  queuedAt: string;
}

interface RenderPowerSettlesEmailOptions {
  payload: PowerSettlesDashboardPayload;
  reportUrl: string;
  generatedAt?: Date;
}

const STATUS_LABELS: Record<PowerSettlesDashboardIsoRow["status"], string> = {
  ok: "Complete",
  partial: "Partial",
  missing: "Missing",
};

const STATUS_COLORS: Record<PowerSettlesDashboardIsoRow["status"], string> = {
  ok: "#166534",
  partial: "#92400e",
  missing: "#991b1b",
};

const SOURCE_COLORS: Record<PowerSettlesDashboardIsoRow["rtSourceStatus"], string> = {
  requested: "#0369a1",
  fallback: "#92400e",
  "single-source": "#0e7490",
};

const MAIN_HUB_BY_ISO: Partial<Record<PowerSettlesDashboardIsoRow["iso"], string>> = {
  pjm: "WESTERN HUB",
  ercot: "HB_NORTH",
  isone: ".H.INTERNAL_HUB",
  caiso: "TH_SP15_GEN-APND",
};

export function normalizePowerSettlesEmailRecipient(value: string): string {
  return value.trim().toLowerCase();
}

export function isAllowedPowerSettlesEmailRecipient(value: string): boolean {
  return normalizePowerSettlesEmailRecipient(value) === POWER_SETTLES_EMAIL_ALLOWED_RECIPIENT;
}

export function getPowerSettlesEmailRecipients(): string[] {
  return [...POWER_SETTLES_EMAIL_RECIPIENTS];
}

export function buildPowerSettlesEmailIdempotencyKey({
  requestedDate,
  rtSource,
  component = "total",
  lookbackDays,
  recipientEmail,
}: {
  requestedDate: string | null;
  rtSource: RtLmpSource;
  component?: PowerSettlesDashboardComponent;
  lookbackDays: number;
  recipientEmail: string;
}): string {
  return [
    "power-settles",
    requestedDate ?? "latest",
    rtSource,
    component,
    String(lookbackDays),
    normalizePowerSettlesEmailRecipient(recipientEmail),
  ].join(":");
}

export function buildPowerSettlesDashboardReportUrl({
  baseUrl,
  requestedDate,
  rtSource,
  component = "total",
  lookbackDays,
}: {
  baseUrl: string;
  requestedDate: string | null;
  rtSource: RtLmpSource;
  component?: PowerSettlesDashboardComponent;
  lookbackDays: number;
}): string {
  const url = new URL("/", normalizedBaseUrl(baseUrl));
  url.searchParams.set("section", "power-settles-dashboard");
  url.searchParams.set("rtSource", rtSource);
  url.searchParams.set("component", component);
  url.searchParams.set("lookbackDays", String(lookbackDays));
  url.searchParams.set("refresh", "1");
  if (requestedDate) url.searchParams.set("date", requestedDate);
  return url.toString();
}

export function buildPowerSettlesEmailSubject(payload: PowerSettlesDashboardPayload): string {
  return `Power Settles report for ${powerSettlesReportDateLabel(payload)} | HeliosCTA | Power Settles`;
}

export function powerSettlesAttachmentName(payload: PowerSettlesDashboardPayload): string {
  const datePart = payload.requestedDate ?? payload.defaultDate;
  return `power-settles-${datePart}-${payload.component}-${payload.rtSource}.html`;
}

export function renderPowerSettlesPlainTextEmail({
  payload,
  reportUrl,
}: RenderPowerSettlesEmailOptions): string {
  const rows = mainHubRows(payload);
  const lines = [
    buildPowerSettlesEmailSubject(payload),
    "",
    `Component: ${componentLabel(payload.component)}`,
    `RT source: ${titleCase(payload.rtSource)} default`,
    `Report date: ${payload.requestedDate ?? payload.defaultDate}`,
    `Coverage: ${payload.summary.completeHubCount}/${payload.summary.hubCount} hubs complete, ${payload.summary.partialHubCount} partial, ${payload.summary.missingHubCount} missing`,
    `Data as of: ${payload.summary.latestAsOf ?? "unknown"}`,
    "",
    "Main hubs:",
    ...rows.map((row) => {
      return `${row.isoLabel} ${row.targetDate ?? "no date"} ${row.hub} ${sourceLabel(row)} (${STATUS_LABELS[row.status]}): OnPk DA ${fmtPrice(row.products.da.onPeakAvg)} | RT ${fmtPrice(row.products.rt.onPeakAvg)} | DART ${fmtPrice(row.products.dart.onPeakAvg, true)}; OffPeak DA ${fmtPrice(row.products.da.offPeakAvg)} | RT ${fmtPrice(row.products.rt.offPeakAvg)} | DART ${fmtPrice(row.products.dart.offPeakAvg, true)}`;
    }),
    "",
    "The attached HTML report includes all dashboard hubs.",
    `Open report: ${reportUrl}`,
  ];
  return lines.join("\n");
}

export function renderPowerSettlesInlineEmailHtml({
  payload,
  reportUrl,
  generatedAt = new Date(),
}: RenderPowerSettlesEmailOptions): string {
  const rowHtml = mainHubRows(payload).map((row) => renderInlineSummaryRow(row, reportUrl)).join("");
  const kpis = [
    ["Coverage", `${payload.summary.completeHubCount}/${payload.summary.hubCount} hubs complete`],
    ["Component", componentLabel(payload.component)],
    ["RT Source", rtSourceSummary(payload)],
    ["Data As Of", fmtStamp(payload.summary.latestAsOf)],
  ];

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;color:#111827;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="880" cellspacing="0" cellpadding="0" style="width:880px;max-width:100%;background:#ffffff;border:1px solid #d1d5db;">
            <tr>
              <td style="padding:22px 24px 12px 24px;">
                <div style="font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#6b7280;">HeliosCTA Power Settles</div>
                <h1 style="margin:8px 0 6px 0;font-size:24px;line-height:30px;color:#111827;">${escapeHtml(powerSettlesReportDateLabel(payload))}</h1>
                <div style="font-size:13px;line-height:20px;color:#4b5563;">Main hub ${escapeHtml(componentLabel(payload.component))} summary with OnPk and OffPeak DA, RT, and DART grouped like the dashboard.</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 16px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>${kpis.map(([label, value]) => renderKpiCell(label, value)).join("")}</tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 20px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #d1d5db;font-size:12px;">
                  <thead>
                    ${inlineGroupedHeader()}
                  </thead>
                  <tbody>${rowHtml}</tbody>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;">
                <a href="${escapeAttribute(reportUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:bold;font-size:13px;padding:10px 14px;border-radius:4px;">Open live report</a>
                <div style="margin-top:12px;font-size:11px;line-height:16px;color:#6b7280;">Generated ${escapeHtml(fmtStamp(generatedAt.toISOString()))}. Full standalone HTML is attached.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderPowerSettlesStandaloneHtml({
  payload,
  reportUrl,
  generatedAt = new Date(),
}: RenderPowerSettlesEmailOptions): string {
  const mainRows = mainHubRows(payload);
  const isoGroups = isoRowGroups(payload);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(buildPowerSettlesEmailSubject(payload))}</title>
    <style>
      body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, Helvetica, sans-serif; }
      main { max-width: 1120px; margin: 0 auto; padding: 28px 18px 40px; }
      .eyebrow { color: #6b7280; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
      h1 { margin: 8px 0 4px; font-size: 28px; line-height: 34px; }
      .subtitle { margin: 0 0 18px; color: #4b5563; font-size: 14px; }
      .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
      .kpi { background: #ffffff; border: 1px solid #d1d5db; padding: 12px; }
      .kpi-label { color: #6b7280; font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; }
      .kpi-value { margin-top: 7px; font-size: 18px; font-weight: 700; }
      .table-section { margin-top: 18px; }
      .section-title { margin: 0 0 3px; font-size: 17px; line-height: 22px; }
      .section-subtitle { margin: 0 0 8px; color: #6b7280; font-size: 12px; }
      .table-wrap { overflow-x: auto; background: #ffffff; border: 1px solid #d1d5db; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 1040px; }
      th { background: #111827; color: #f9fafb; text-align: left; padding: 9px 10px; font-size: 10px; letter-spacing: 0.8px; text-transform: uppercase; }
      td { border-top: 1px solid #e5e7eb; padding: 9px 10px; vertical-align: top; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      .group { text-align: center; }
      .group-start { border-left: 1px solid #d1d5db; }
      .status { color: #ffffff; font-weight: 700; padding: 3px 6px; border-radius: 3px; display: inline-block; }
      .muted { color: #6b7280; }
      .link { color: #1d4ed8; font-weight: 700; }
      .small-link { color: #1d4ed8; font-weight: 700; text-decoration: none; }
      .pos { color: #047857; font-weight: 700; }
      .neg { color: #b91c1c; font-weight: 700; }
      @media (max-width: 760px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">HeliosCTA Power Settles</div>
      <h1>${escapeHtml(powerSettlesReportDateLabel(payload))}</h1>
      <p class="subtitle">DA, RT, and DART ${escapeHtml(componentLabel(payload.component))} summary across dashboard ISO hubs. Generated ${escapeHtml(fmtStamp(generatedAt.toISOString()))}.</p>
      <p><a class="link" href="${escapeAttribute(reportUrl)}">Open live report</a></p>
      <section class="kpis">
        ${renderStandaloneKpi("Coverage", `${payload.summary.completeHubCount}/${payload.summary.hubCount} hubs complete`)}
        ${renderStandaloneKpi("Component", componentLabel(payload.component))}
        ${renderStandaloneKpi("RT Source", rtSourceSummary(payload))}
        ${renderStandaloneKpi("Report Date", payload.requestedDate ?? payload.defaultDate)}
      </section>
      ${renderStandaloneReportTable({
        title: "Main Hubs",
        subtitle: "One hub per ISO, matching the dashboard summary.",
        rows: mainRows,
        reportUrl,
      })}
      ${isoGroups
        .map((group) =>
          renderStandaloneReportTable({
            title: group.isoLabel,
            subtitle: isoSectionSubtitle(group.rows),
            rows: group.rows,
            reportUrl,
            includeIsoColumn: false,
          }),
        )
        .join("")}
    </main>
  </body>
</html>`;
}

export function powerSettlesReportDateLabel(payload: PowerSettlesDashboardPayload): string {
  if (payload.requestedDate) return payload.requestedDate;
  return payload.defaultDate;
}

function renderKpiCell(label: string, value: string): string {
  return `<td width="25%" style="padding:0 6px 0 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #d1d5db;background:#f9fafb;">
      <tr><td style="padding:10px;">
        <div style="font-size:10px;font-weight:bold;letter-spacing:0.8px;text-transform:uppercase;color:#6b7280;">${escapeHtml(label)}</div>
        <div style="margin-top:6px;font-size:16px;font-weight:bold;color:#111827;">${escapeHtml(value)}</div>
      </td></tr>
    </table>
  </td>`;
}

function inlineGroupedHeader(): string {
  return `<tr style="background:#111827;color:#f9fafb;">
    <th align="left" rowspan="2" style="${thStyle()}">ISO</th>
    <th align="left" rowspan="2" style="${thStyle()}">Date</th>
    <th align="left" rowspan="2" style="${thStyle()}">Hub</th>
    <th align="left" rowspan="2" style="${thStyle()}">Source</th>
    <th align="left" rowspan="2" style="${thStyle()}">Status</th>
    <th align="right" rowspan="2" style="${thStyle()}">LMPs</th>
    <th align="center" colspan="3" style="${thStyle()}border-left:1px solid #374151;text-align:center;">OnPk</th>
    <th align="center" colspan="3" style="${thStyle()}border-left:1px solid #374151;text-align:center;">OffPeak</th>
  </tr>
  <tr style="background:#111827;color:#f9fafb;">
    <th align="right" style="${thStyle()}border-left:1px solid #374151;">DA</th>
    <th align="right" style="${thStyle()}">RT</th>
    <th align="right" style="${thStyle()}">DART</th>
    <th align="right" style="${thStyle()}border-left:1px solid #374151;">DA</th>
    <th align="right" style="${thStyle()}">RT</th>
    <th align="right" style="${thStyle()}">DART</th>
  </tr>`;
}

function renderInlineSummaryRow(row: PowerSettlesDashboardIsoRow, reportUrl: string): string {
  return `<tr>
    <td style="${tdStyle()}font-weight:bold;">${escapeHtml(row.isoLabel)}</td>
    <td style="${tdStyle()}">${escapeHtml(row.targetDate ?? "-")}</td>
    <td style="${tdStyle()}">${escapeHtml(row.hub)}</td>
    <td style="${tdStyle()}"><span style="background:${SOURCE_COLORS[row.rtSourceStatus]};color:#ffffff;font-weight:bold;padding:3px 6px;border-radius:3px;">${escapeHtml(sourceLabel(row))}</span></td>
    <td style="${tdStyle()}"><span style="background:${STATUS_COLORS[row.status]};color:#ffffff;font-weight:bold;padding:3px 6px;border-radius:3px;">${STATUS_LABELS[row.status]}</span></td>
    <td align="right" style="${tdStyle()}">${renderInlineLmpLink(row, reportUrl)}</td>
    <td align="right" style="${metricTdStyle()}border-left:1px solid #e5e7eb;">${escapeHtml(fmtPrice(row.products.da.onPeakAvg))}</td>
    <td align="right" style="${metricTdStyle()}">${escapeHtml(fmtPrice(row.products.rt.onPeakAvg))}</td>
    <td align="right" style="${metricTdStyle(row.products.dart.onPeakAvg, true)}">${escapeHtml(fmtPrice(row.products.dart.onPeakAvg, true))}</td>
    <td align="right" style="${metricTdStyle()}border-left:1px solid #e5e7eb;">${escapeHtml(fmtPrice(row.products.da.offPeakAvg))}</td>
    <td align="right" style="${metricTdStyle()}">${escapeHtml(fmtPrice(row.products.rt.offPeakAvg))}</td>
    <td align="right" style="${metricTdStyle(row.products.dart.offPeakAvg, true)}">${escapeHtml(fmtPrice(row.products.dart.offPeakAvg, true))}</td>
  </tr>`;
}

function renderStandaloneReportTable({
  title,
  subtitle,
  rows,
  reportUrl,
  includeIsoColumn = true,
}: {
  title: string;
  subtitle: string;
  rows: PowerSettlesDashboardIsoRow[];
  reportUrl: string;
  includeIsoColumn?: boolean;
}): string {
  return `<section class="table-section">
    <h2 class="section-title">${escapeHtml(title)}</h2>
    <p class="section-subtitle">${escapeHtml(subtitle)}</p>
    <div class="table-wrap">
      <table>
        <thead>${standaloneGroupedHeader(includeIsoColumn)}</thead>
        <tbody>${rows.map((row) => renderStandaloneSummaryRow(row, reportUrl, includeIsoColumn)).join("")}</tbody>
      </table>
    </div>
  </section>`;
}

function standaloneGroupedHeader(includeIsoColumn: boolean): string {
  return `<tr>
    ${includeIsoColumn ? '<th rowspan="2">ISO</th>' : ""}
    <th rowspan="2">Date</th>
    <th rowspan="2">Hub</th>
    <th rowspan="2">Source</th>
    <th rowspan="2">Status</th>
    <th rowspan="2" class="num">LMPs</th>
    <th colspan="3" class="group group-start">OnPk</th>
    <th colspan="3" class="group group-start">OffPeak</th>
    <th rowspan="2">As Of</th>
  </tr>
  <tr>
    <th class="num group-start">DA</th>
    <th class="num">RT</th>
    <th class="num">DART</th>
    <th class="num group-start">DA</th>
    <th class="num">RT</th>
    <th class="num">DART</th>
  </tr>`;
}

function renderStandaloneSummaryRow(
  row: PowerSettlesDashboardIsoRow,
  reportUrl: string,
  includeIsoColumn: boolean,
): string {
  return `<tr>
    ${includeIsoColumn ? `<td><strong>${escapeHtml(row.isoLabel)}</strong></td>` : ""}
    <td>${escapeHtml(row.targetDate ?? "-")}</td>
    <td>${escapeHtml(row.hub)}</td>
    <td><span class="status" style="background:${SOURCE_COLORS[row.rtSourceStatus]}">${escapeHtml(sourceLabel(row))}</span></td>
    <td><span class="status" style="background:${STATUS_COLORS[row.status]}">${STATUS_LABELS[row.status]}</span><div class="muted">${escapeHtml(row.statusDetail)}</div></td>
    <td class="num">${renderStandaloneLmpLink(row, reportUrl)}</td>
    <td class="num group-start">${escapeHtml(fmtPrice(row.products.da.onPeakAvg))}</td>
    <td class="num">${escapeHtml(fmtPrice(row.products.rt.onPeakAvg))}</td>
    <td class="num ${signedMetricClass(row.products.dart.onPeakAvg)}">${escapeHtml(fmtPrice(row.products.dart.onPeakAvg, true))}</td>
    <td class="num group-start">${escapeHtml(fmtPrice(row.products.da.offPeakAvg))}</td>
    <td class="num">${escapeHtml(fmtPrice(row.products.rt.offPeakAvg))}</td>
    <td class="num ${signedMetricClass(row.products.dart.offPeakAvg)}">${escapeHtml(fmtPrice(row.products.dart.offPeakAvg, true))}</td>
    <td>${escapeHtml(fmtStamp(row.dataAsOf))}</td>
  </tr>`;
}

function renderStandaloneKpi(label: string, value: string): string {
  return `<div class="kpi"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${escapeHtml(value)}</div></div>`;
}

function normalizedBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("HELIOS_EMAIL_FRONTEND_BASE_URL is required to build Power Settles report links.");
  return trimmed;
}

function fmtPrice(value: number | null, signed = false): string {
  if (value === null || !Number.isFinite(value)) return "-";
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function signedMetricClass(value: number | null): string {
  if (value === null) return "";
  if (value > 0) return "pos";
  if (value < 0) return "neg";
  return "";
}

function signedMetricColor(value: number | null): string {
  if (value === null) return "#111827";
  if (value > 0) return "#047857";
  if (value < 0) return "#b91c1c";
  return "#111827";
}

function fmtStamp(value: string | null): string {
  if (!value) return "unknown";
  return value.replace("T", " ").slice(0, 16);
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function componentLabel(value: PowerSettlesDashboardComponent): string {
  if (value === "energy") return "Energy";
  if (value === "congestion") return "Congestion";
  if (value === "loss") return "Loss";
  return "Total";
}

function sourceLabel(row: PowerSettlesDashboardIsoRow): string {
  if (row.rtSourceStatus === "fallback") return "Unverified RT";
  if (row.rtSourceStatus === "single-source") {
    if (row.iso === "ercot") return "Settlement RT";
    if (row.iso === "caiso") return "Five-Min RT";
  }
  return row.effectiveRtSource === "verified" ? "Verified RT" : "Unverified RT";
}

function rtSourceSummary(payload: PowerSettlesDashboardPayload): string {
  if (payload.summary.unverifiedFallbackHubCount > 0) {
    return `${titleCase(payload.rtSource)} (${payload.summary.unverifiedFallbackHubCount} fallback)`;
  }
  return titleCase(payload.rtSource);
}

function thStyle(): string {
  return "padding:8px;border-bottom:1px solid #d1d5db;font-size:10px;letter-spacing:0.8px;text-transform:uppercase;";
}

function tdStyle(): string {
  return "padding:8px;border-bottom:1px solid #e5e7eb;color:#111827;";
}

function metricTdStyle(value: number | null = null, signed = false): string {
  const color = signed ? signedMetricColor(value) : "#111827";
  const weight = signed && value !== null && value !== 0 ? "font-weight:bold;" : "";
  return `padding:8px;border-bottom:1px solid #e5e7eb;color:${color};font-variant-numeric:tabular-nums;${weight}`;
}

function isoRowGroups(payload: PowerSettlesDashboardPayload): Array<{
  iso: PowerSettlesDashboardIsoRow["iso"];
  isoLabel: string;
  rows: PowerSettlesDashboardIsoRow[];
}> {
  const rowsByIso = new Map<PowerSettlesDashboardIsoRow["iso"], PowerSettlesDashboardIsoRow[]>();
  for (const row of payload.rows) {
    const existing = rowsByIso.get(row.iso) ?? [];
    existing.push(row);
    rowsByIso.set(row.iso, existing);
  }

  return Array.from(rowsByIso.entries()).map(([iso, rows]) => ({
    iso,
    isoLabel: rows[0]?.isoLabel ?? iso,
    rows,
  }));
}

function mainHubRows(payload: PowerSettlesDashboardPayload): PowerSettlesDashboardIsoRow[] {
  return isoRowGroups(payload).flatMap(({ iso, rows }) => {
    const preferredHub = MAIN_HUB_BY_ISO[iso];
    const preferred = preferredHub ? rows.find((row) => row.hub === preferredHub) : null;
    const row = preferred ?? rows[0];
    return row ? [row] : [];
  });
}

function isoSectionSubtitle(rows: PowerSettlesDashboardIsoRow[]): string {
  const complete = rows.filter((row) => row.status === "ok").length;
  const partial = rows.filter((row) => row.status === "partial").length;
  const missing = rows.filter((row) => row.status === "missing").length;
  return `${rows.length} ${rows.length === 1 ? "hub" : "hubs"}; ${complete} complete, ${partial} partial, ${missing} missing.`;
}

function renderInlineLmpLink(row: PowerSettlesDashboardIsoRow, reportUrl: string): string {
  const href = rowDetailUrl(row, reportUrl);
  if (!href) return "-";
  return `<a href="${escapeAttribute(href)}" style="color:#1d4ed8;text-decoration:none;font-weight:bold;">LMPs</a>`;
}

function renderStandaloneLmpLink(row: PowerSettlesDashboardIsoRow, reportUrl: string): string {
  const href = rowDetailUrl(row, reportUrl);
  if (!href) return "-";
  return `<a class="small-link" href="${escapeAttribute(href)}">LMPs</a>`;
}

function rowDetailUrl(row: PowerSettlesDashboardIsoRow, reportUrl: string): string | null {
  if (!row.detailUrl) return null;
  return new URL(row.detailUrl, reportUrl).toString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
