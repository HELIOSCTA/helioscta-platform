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
  sparkHeatRate: number;
  reportUrl: string;
  idempotencyKey: string;
  queuedAt: string;
}

interface RenderPowerSettlesEmailOptions {
  payload: PowerSettlesDashboardPayload;
  reportUrl: string;
  generatedAt?: Date;
}

const PINNED_REPORT_ISO_ORDER: Array<PowerSettlesDashboardIsoRow["iso"]> = ["pjm", "ercot"];

type PowerSettlesProductSummary = PowerSettlesDashboardIsoRow["products"]["da"];
type PowerSettlesPeriod = "onPeak" | "offPeak";

interface PowerSettlesEmailIsoGroup {
  iso: PowerSettlesDashboardIsoRow["iso"];
  isoLabel: string;
  rows: PowerSettlesDashboardIsoRow[];
}

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
  sparkHeatRate,
  recipientEmail,
}: {
  requestedDate: string | null;
  rtSource: RtLmpSource;
  component?: PowerSettlesDashboardComponent;
  lookbackDays: number;
  sparkHeatRate: number;
  recipientEmail: string;
}): string {
  return [
    "power-settles",
    requestedDate ?? "latest",
    rtSource,
    component,
    String(lookbackDays),
    sparkHeatRate.toFixed(1),
    normalizePowerSettlesEmailRecipient(recipientEmail),
  ].join(":");
}

export function buildPowerSettlesDashboardReportUrl({
  baseUrl,
  requestedDate,
  rtSource,
  component = "total",
  lookbackDays,
  sparkHeatRate,
}: {
  baseUrl: string;
  requestedDate: string | null;
  rtSource: RtLmpSource;
  component?: PowerSettlesDashboardComponent;
  lookbackDays: number;
  sparkHeatRate: number;
}): string {
  const url = new URL("/", normalizedBaseUrl(baseUrl));
  url.searchParams.set("section", "power-settles-dashboard");
  url.searchParams.set("rtSource", rtSource);
  url.searchParams.set("component", component);
  url.searchParams.set("lookbackDays", String(lookbackDays));
  url.searchParams.set("sparkHeatRate", sparkHeatRate.toFixed(1));
  url.searchParams.set("refresh", "1");
  if (requestedDate) url.searchParams.set("date", requestedDate);
  return url.toString();
}

export function buildPowerSettlesEmailSubject(payload: PowerSettlesDashboardPayload): string {
  return `Power Settles report for ${powerSettlesReportDateLabel(payload)} | HeliosCTA | Power Settles`;
}

export function renderPowerSettlesPlainTextEmail({
  payload,
  reportUrl,
}: RenderPowerSettlesEmailOptions): string {
  const groups = orderedIsoGroups(payload);
  const rows = summaryHubRows(groups);
  const lines = [
    buildPowerSettlesEmailSubject(payload),
    "",
    "LMPs:",
    ...rows.map(plainLmpSummary),
    "",
    "HRs:",
    ...rows.map(plainHeatRateSummary),
    "",
    "Sparks:",
    ...rows.map(plainSparkSummary),
    "",
    `Open full report on Vercel: ${reportUrl}`,
  ];
  return lines.join("\n");
}

export function renderPowerSettlesInlineEmailHtml({
  payload,
  reportUrl,
  generatedAt = new Date(),
}: RenderPowerSettlesEmailOptions): string {
  const groups = orderedIsoGroups(payload);
  const summaryRows = summaryHubRows(groups);
  const summaryHtml = renderInlineSummaryBands({
    rows: summaryRows,
    reportUrl,
    sparkHeatRate: payload.sparkHeatRate,
  });

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;color:#111827;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="880" cellspacing="0" cellpadding="0" style="width:880px;max-width:100%;background:#ffffff;border:1px solid #d1d5db;">
            <tr>
              <td style="padding:18px 24px 0 24px;">
                <a href="${escapeAttribute(reportUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:bold;font-size:13px;padding:10px 14px;border-radius:4px;">Open full report on Vercel</a>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px 12px 24px;">
                <div style="font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#6b7280;">HeliosCTA Power Settles</div>
                <h1 style="margin:8px 0 6px 0;font-size:24px;line-height:30px;color:#111827;">${escapeHtml(powerSettlesReportDateLabel(payload))}</h1>
                <div style="font-size:13px;line-height:20px;color:#4b5563;">LMPs, HRs, and Sparks summaries for representative dashboard hubs.</div>
              </td>
            </tr>
            ${summaryHtml}
            <tr>
              <td style="padding:0 24px 24px 24px;">
                <div style="font-size:11px;line-height:16px;color:#6b7280;">Generated ${escapeHtml(fmtStamp(generatedAt.toISOString()))}.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function powerSettlesReportDateLabel(payload: PowerSettlesDashboardPayload): string {
  if (payload.requestedDate) return payload.requestedDate;
  return payload.defaultDate;
}

function renderInlineSummaryBands({
  rows,
  reportUrl,
  sparkHeatRate,
  includeIsoColumn = true,
}: {
  rows: PowerSettlesDashboardIsoRow[];
  reportUrl: string;
  sparkHeatRate: number;
  includeIsoColumn?: boolean;
}): string {
  return `<tr>
    <td style="padding:0 24px 20px 24px;">
      ${renderInlineLmpTable({ rows, reportUrl, includeIsoColumn })}
      ${renderInlineHeatRateTable({ rows, reportUrl, includeIsoColumn })}
      ${renderInlineSparkTable({ rows, reportUrl, sparkHeatRate, includeIsoColumn })}
    </td>
  </tr>`;
}

function renderInlineLmpTable({
  rows,
  reportUrl,
  includeIsoColumn,
}: {
  rows: PowerSettlesDashboardIsoRow[];
  reportUrl: string;
  includeIsoColumn: boolean;
}): string {
  if (rows.length === 0) return "";
  return `<div style="margin-top:10px;">
    ${renderInlineBandHeading("LMPs", `${rows.length} ${rows.length === 1 ? "hub" : "hubs"}`)}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #d1d5db;font-size:12px;">
      <thead>${inlineLmpHeader(includeIsoColumn)}</thead>
      <tbody>${rows.map((row) => renderInlineLmpRow(row, reportUrl, includeIsoColumn)).join("")}</tbody>
    </table>
  </div>`;
}

function renderInlineHeatRateTable({
  rows,
  reportUrl,
  includeIsoColumn,
}: {
  rows: PowerSettlesDashboardIsoRow[];
  reportUrl: string;
  includeIsoColumn: boolean;
}): string {
  if (rows.length === 0) return "";
  return `<div style="margin-top:14px;">
    ${renderInlineBandHeading("HRs", "DA HR / RT HR / Gas")}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #d1d5db;font-size:12px;">
      <thead>${inlineHeatRateHeader(includeIsoColumn)}</thead>
      <tbody>${rows.map((row) => renderInlineHeatRateRow(row, reportUrl, includeIsoColumn)).join("")}</tbody>
    </table>
  </div>`;
}

function renderInlineSparkTable({
  rows,
  reportUrl,
  sparkHeatRate,
  includeIsoColumn,
}: {
  rows: PowerSettlesDashboardIsoRow[];
  reportUrl: string;
  sparkHeatRate: number;
  includeIsoColumn: boolean;
}): string {
  if (rows.length === 0) return "";
  return `<div style="margin-top:14px;">
    ${renderInlineBandHeading("Sparks", `Spark HR ${fmtSparkHeatRate(sparkHeatRate)} MMBtu/MWh`)}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #d1d5db;font-size:12px;">
      <thead>${inlineSparkHeader(includeIsoColumn)}</thead>
      <tbody>${rows.map((row) => renderInlineSparkRow(row, reportUrl, includeIsoColumn)).join("")}</tbody>
    </table>
  </div>`;
}

function renderInlineBandHeading(title: string, meta: string): string {
  return `<div style="display:block;margin:0 0 6px 0;border-bottom:1px solid #d1d5db;padding-bottom:5px;">
    <span style="font-size:13px;font-weight:bold;color:#111827;">${escapeHtml(title)}</span>
    <span style="margin-left:8px;font-size:11px;font-weight:bold;color:#6b7280;">${escapeHtml(meta)}</span>
  </div>`;
}

function inlineLmpHeader(includeIsoColumn: boolean): string {
  return `<tr style="background:#111827;color:#f9fafb;">
    ${includeIsoColumn ? `<th align="left" rowspan="2" style="${thStyle()}">ISO</th>` : ""}
    <th align="left" rowspan="2" style="${thStyle()}">Date</th>
    <th align="left" rowspan="2" style="${thStyle()}">Hub</th>
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

function inlineHeatRateHeader(includeIsoColumn: boolean): string {
  return `<tr style="background:#111827;color:#f9fafb;">
    ${includeIsoColumn ? `<th align="left" rowspan="2" style="${thStyle()}">ISO</th>` : ""}
    <th align="left" rowspan="2" style="${thStyle()}">Date</th>
    <th align="left" rowspan="2" style="${thStyle()}">Hub</th>
    <th align="left" rowspan="2" style="${thStyle()}">Gas Hub</th>
    <th align="right" rowspan="2" style="${thStyle()}">HRs</th>
    <th align="center" colspan="3" style="${thStyle()}border-left:1px solid #374151;text-align:center;">OnPk</th>
    <th align="center" colspan="3" style="${thStyle()}border-left:1px solid #374151;text-align:center;">OffPeak</th>
  </tr>
  <tr style="background:#111827;color:#f9fafb;">
    <th align="right" style="${thStyle()}border-left:1px solid #374151;">DA HR</th>
    <th align="right" style="${thStyle()}">RT HR</th>
    <th align="right" style="${thStyle()}">Gas</th>
    <th align="right" style="${thStyle()}border-left:1px solid #374151;">DA HR</th>
    <th align="right" style="${thStyle()}">RT HR</th>
    <th align="right" style="${thStyle()}">Gas</th>
  </tr>`;
}

function inlineSparkHeader(includeIsoColumn: boolean): string {
  return `<tr style="background:#111827;color:#f9fafb;">
    ${includeIsoColumn ? `<th align="left" rowspan="2" style="${thStyle()}">ISO</th>` : ""}
    <th align="left" rowspan="2" style="${thStyle()}">Date</th>
    <th align="left" rowspan="2" style="${thStyle()}">Hub</th>
    <th align="left" rowspan="2" style="${thStyle()}">Gas Hub</th>
    <th align="right" rowspan="2" style="${thStyle()}">Spark HR</th>
    <th align="right" rowspan="2" style="${thStyle()}">Sparks</th>
    <th align="center" colspan="3" style="${thStyle()}border-left:1px solid #374151;text-align:center;">OnPk</th>
    <th align="center" colspan="3" style="${thStyle()}border-left:1px solid #374151;text-align:center;">OffPeak</th>
  </tr>
  <tr style="background:#111827;color:#f9fafb;">
    <th align="right" style="${thStyle()}border-left:1px solid #374151;">DA</th>
    <th align="right" style="${thStyle()}">RT</th>
    <th align="right" style="${thStyle()}">Gas</th>
    <th align="right" style="${thStyle()}border-left:1px solid #374151;">DA</th>
    <th align="right" style="${thStyle()}">RT</th>
    <th align="right" style="${thStyle()}">Gas</th>
  </tr>`;
}

function renderInlineLmpRow(
  row: PowerSettlesDashboardIsoRow,
  reportUrl: string,
  includeIsoColumn: boolean,
): string {
  return `<tr>
    ${includeIsoColumn ? `<td style="${tdStyle()}font-weight:bold;">${escapeHtml(row.isoLabel)}</td>` : ""}
    <td style="${tdStyle()}">${escapeHtml(row.targetDate ?? "-")}</td>
    <td style="${tdStyle()}font-weight:bold;">${escapeHtml(row.hub)}</td>
    <td align="right" style="${tdStyle()}">${renderInlineLmpLink(row, reportUrl)}</td>
    ${renderInlineLmpPeriodCells(row, "onPeak")}
    ${renderInlineLmpPeriodCells(row, "offPeak")}
  </tr>`;
}

function renderInlineLmpPeriodCells(
  row: PowerSettlesDashboardIsoRow,
  period: PowerSettlesPeriod,
): string {
  return `<td align="right" style="${metricTdStyle()}border-left:1px solid #e5e7eb;">${escapeHtml(fmtPrice(periodValue(row.products.da, period)))}</td>
    <td align="right" style="${metricTdStyle()}">${escapeHtml(fmtPrice(periodValue(row.products.rt, period)))}</td>
    <td align="right" style="${metricTdStyle(periodValue(row.products.dart, period), true)}">${escapeHtml(fmtPrice(periodValue(row.products.dart, period), true))}</td>`;
}

function renderInlineHeatRateRow(
  row: PowerSettlesDashboardIsoRow,
  reportUrl: string,
  includeIsoColumn: boolean,
): string {
  return `<tr>
    ${includeIsoColumn ? `<td style="${tdStyle()}font-weight:bold;">${escapeHtml(row.isoLabel)}</td>` : ""}
    <td style="${tdStyle()}">${escapeHtml(row.targetDate ?? "-")}</td>
    <td style="${tdStyle()}font-weight:bold;">${escapeHtml(row.hub)}</td>
    <td style="${tdStyle()}">${escapeHtml(row.inputs?.gasHubLabel ?? "-")}</td>
    <td align="right" style="${tdStyle()}">${renderInlineHeatRateLink(row, reportUrl)}</td>
    ${renderInlineHeatRatePeriodCells(row, "onPeak")}
    ${renderInlineHeatRatePeriodCells(row, "offPeak")}
  </tr>`;
}

function renderInlineSparkRow(
  row: PowerSettlesDashboardIsoRow,
  reportUrl: string,
  includeIsoColumn: boolean,
): string {
  return `<tr>
    ${includeIsoColumn ? `<td style="${tdStyle()}font-weight:bold;">${escapeHtml(row.isoLabel)}</td>` : ""}
    <td style="${tdStyle()}">${escapeHtml(row.targetDate ?? "-")}</td>
    <td style="${tdStyle()}font-weight:bold;">${escapeHtml(row.hub)}</td>
    <td style="${tdStyle()}">${escapeHtml(row.inputs?.gasHubLabel ?? "-")}</td>
    <td align="right" style="${tdStyle()}">${escapeHtml(fmtSparkHeatRate(row.inputs?.sparkHeatRate ?? null))}</td>
    <td align="right" style="${tdStyle()}">${renderInlineSparkLink(row, reportUrl)}</td>
    ${renderInlineSparkPeriodCells(row, "onPeak")}
    ${renderInlineSparkPeriodCells(row, "offPeak")}
  </tr>`;
}

function renderInlineHeatRatePeriodCells(
  row: PowerSettlesDashboardIsoRow,
  period: PowerSettlesPeriod,
): string {
  const daHeatRate = row.inputs ? periodValue(row.inputs.daHeatRate, period) : null;
  const rtHeatRate = row.inputs ? periodValue(row.inputs.rtHeatRate, period) : null;
  const gas = row.inputs ? periodValue(row.inputs.gas, period) : null;
  return `<td align="right" style="${metricTdStyle()}border-left:1px solid #e5e7eb;">${escapeHtml(fmtHeatRate(daHeatRate))}</td>
    <td align="right" style="${metricTdStyle()}">${escapeHtml(fmtHeatRate(rtHeatRate))}</td>
    <td align="right" style="${metricTdStyle()}">${escapeHtml(fmtPrice(gas))}</td>`;
}

function renderInlineSparkPeriodCells(
  row: PowerSettlesDashboardIsoRow,
  period: PowerSettlesPeriod,
): string {
  const daSpark = row.inputs ? periodValue(row.inputs.daSpark, period) : null;
  const rtSpark = row.inputs ? periodValue(row.inputs.rtSpark, period) : null;
  const gas = row.inputs ? periodValue(row.inputs.gas, period) : null;
  return `<td align="right" style="${metricTdStyle(daSpark, true)}border-left:1px solid #e5e7eb;">${escapeHtml(fmtPrice(daSpark))}</td>
    <td align="right" style="${metricTdStyle(rtSpark, true)}">${escapeHtml(fmtPrice(rtSpark))}</td>
    <td align="right" style="${metricTdStyle()}">${escapeHtml(fmtPrice(gas))}</td>`;
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

function fmtHeatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(2);
}

function fmtSparkHeatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(1);
}

function periodValue(
  summary: PowerSettlesProductSummary,
  period: PowerSettlesPeriod,
): number | null {
  return period === "onPeak" ? summary.onPeakAvg : summary.offPeakAvg;
}

function plainLmpSummary(row: PowerSettlesDashboardIsoRow): string {
  const onPeak = plainLmpPeriod(row, "onPeak");
  const offPeak = plainLmpPeriod(row, "offPeak");
  return `${plainRowIdentity(row)}: OnPk ${onPeak}; OffPeak ${offPeak}`;
}

function plainHeatRateSummary(row: PowerSettlesDashboardIsoRow): string {
  if (!row.inputs) return `${plainRowIdentity(row)}: HR unavailable`;
  const onPeak = plainHeatRatePeriod(row, "onPeak");
  const offPeak = plainHeatRatePeriod(row, "offPeak");
  return `${plainRowIdentity(row)} ${row.inputs.gasHubLabel}: OnPk ${onPeak}; OffPeak ${offPeak}`;
}

function plainSparkSummary(row: PowerSettlesDashboardIsoRow): string {
  return `${plainRowIdentity(row)}: ${plainSparkMetric(row, "onPeak")}; ${plainSparkMetric(row, "offPeak")}`;
}

function plainLmpPeriod(row: PowerSettlesDashboardIsoRow, period: PowerSettlesPeriod): string {
  return `DA ${fmtPrice(periodValue(row.products.da, period))} | RT ${fmtPrice(periodValue(row.products.rt, period))} | DART ${fmtPrice(periodValue(row.products.dart, period), true)}`;
}

function plainHeatRatePeriod(row: PowerSettlesDashboardIsoRow, period: PowerSettlesPeriod): string {
  if (!row.inputs) return "HR unavailable";
  return `DA HR ${fmtHeatRate(periodValue(row.inputs.daHeatRate, period))} | RT HR ${fmtHeatRate(periodValue(row.inputs.rtHeatRate, period))} | Gas ${fmtPrice(periodValue(row.inputs.gas, period))}`;
}

function plainSparkMetric(
  row: PowerSettlesDashboardIsoRow,
  period: PowerSettlesPeriod,
): string {
  if (!row.inputs) return `${period === "onPeak" ? "OnPk" : "OffPeak"} Spark unavailable`;
  const label = period === "onPeak" ? "OnPk" : "OffPeak";
  const daSpark = fmtPrice(periodValue(row.inputs.daSpark, period));
  const rtSpark = fmtPrice(periodValue(row.inputs.rtSpark, period));
  const gas = fmtPrice(periodValue(row.inputs.gas, period));
  return `${label} DA Spark ${daSpark} | RT Spark ${rtSpark} | Gas ${gas} ${row.inputs.gasHubLabel} | Spark HR ${fmtSparkHeatRate(row.inputs.sparkHeatRate)}`;
}

function plainRowIdentity(row: PowerSettlesDashboardIsoRow): string {
  return `${row.isoLabel} ${row.targetDate ?? "no date"} ${row.hub}`;
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

function orderedIsoGroups(payload: PowerSettlesDashboardPayload): PowerSettlesEmailIsoGroup[] {
  const groups: PowerSettlesEmailIsoGroup[] = [];
  const rowsByIso = new Map<PowerSettlesDashboardIsoRow["iso"], PowerSettlesDashboardIsoRow[]>();
  for (const row of payload.rows) {
    const existing = rowsByIso.get(row.iso) ?? [];
    if (existing.length === 0) {
      groups.push({ iso: row.iso, isoLabel: row.isoLabel, rows: existing });
    }
    existing.push(row);
    rowsByIso.set(row.iso, existing);
  }

  const ordered = [
    ...PINNED_REPORT_ISO_ORDER.map((iso) => groups.find((group) => group.iso === iso)).filter(
      (group): group is PowerSettlesEmailIsoGroup => Boolean(group),
    ),
    ...groups.filter((group) => !PINNED_REPORT_ISO_ORDER.includes(group.iso)),
  ];

  return ordered;
}

function summaryHubRows(groups: PowerSettlesEmailIsoGroup[]): PowerSettlesDashboardIsoRow[] {
  return groups.flatMap((group) => group.rows.slice(0, group.iso === "caiso" ? 2 : 1));
}

function renderInlineLmpLink(row: PowerSettlesDashboardIsoRow, reportUrl: string): string {
  const href = rowDetailUrl(row, reportUrl);
  if (!href) return "-";
  return `<a href="${escapeAttribute(href)}" style="color:#1d4ed8;text-decoration:none;font-weight:bold;">LMPs</a>`;
}

function renderInlineHeatRateLink(row: PowerSettlesDashboardIsoRow, reportUrl: string): string {
  const href = heatRateDetailUrl(row, reportUrl);
  if (!href) return "-";
  return `<a href="${escapeAttribute(href)}" style="color:#1d4ed8;text-decoration:none;font-weight:bold;">HRs</a>`;
}

function renderInlineSparkLink(row: PowerSettlesDashboardIsoRow, reportUrl: string): string {
  const href = sparkDetailUrl(row, reportUrl);
  if (!href) return "-";
  return `<a href="${escapeAttribute(href)}" style="color:#1d4ed8;text-decoration:none;font-weight:bold;">Spark</a>`;
}

function rowDetailUrl(row: PowerSettlesDashboardIsoRow, reportUrl: string): string | null {
  return detailUrl(row.detailUrl, reportUrl);
}

function heatRateDetailUrl(row: PowerSettlesDashboardIsoRow, reportUrl: string): string | null {
  if (!row.detailUrl || !row.inputs) return null;
  const url = new URL(row.detailUrl, reportUrl);
  url.searchParams.set("product", "da");
  url.searchParams.set("metric", "heat-rate");
  url.searchParams.set("gasHub", row.inputs.gasHub);
  url.searchParams.set("refresh", "1");
  return url.toString();
}

function sparkDetailUrl(row: PowerSettlesDashboardIsoRow, reportUrl: string): string | null {
  if (!row.detailUrl || !row.inputs) return null;
  const url = new URL(row.detailUrl, reportUrl);
  url.searchParams.set("product", "da");
  url.searchParams.set("metric", "spark-spread");
  url.searchParams.set("component", "total");
  url.searchParams.set("gasHub", row.inputs.gasHub);
  url.searchParams.set("sparkHeatRate", row.inputs.sparkHeatRate.toFixed(1));
  url.searchParams.set("refresh", "1");
  return url.toString();
}

function detailUrl(value: string | null, reportUrl: string): string | null {
  if (!value) return null;
  return new URL(value, reportUrl).toString();
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
