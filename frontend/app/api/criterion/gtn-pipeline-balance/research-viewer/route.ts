import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_HEADER = "private, no-store";
const DEFAULT_REPORT_DATE = "2026-07-27";
const REPORT_PREFIX = "Research Viewer - GTN Pipeline Balance - ";
const REPORT_SUFFIX = ".html";
const DEFAULT_BASE_URL = "https://www.energygps.com/";

function parseIsoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function downloadsReportPath(reportDate: string): string {
  return path.join(
    os.homedir(),
    "Downloads",
    `${REPORT_PREFIX}${reportDate}${REPORT_SUFFIX}`,
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function latestDownloadedReportPath(): Promise<string | null> {
  const downloads = path.join(os.homedir(), "Downloads");
  let entries: string[];
  try {
    entries = await fs.readdir(downloads);
  } catch {
    return null;
  }

  const candidates = entries
    .map((name) => {
      const match = name.match(
        /^Research Viewer - GTN Pipeline Balance - (\d{4}-\d{2}-\d{2})\.html$/,
      );
      return match ? { name, reportDate: match[1] } : null;
    })
    .filter((entry): entry is { name: string; reportDate: string } => Boolean(entry))
    .sort((left, right) => right.reportDate.localeCompare(left.reportDate));

  return candidates[0] ? path.join(downloads, candidates[0].name) : null;
}

async function resolveReportPath(reportDate: string | null): Promise<string> {
  const configuredPath = process.env.GTN_RESEARCH_VIEWER_HTML_PATH;
  if (configuredPath?.trim()) {
    return stripWrappingQuotes(configuredPath.trim());
  }

  if (reportDate) {
    return downloadsReportPath(reportDate);
  }

  return (await latestDownloadedReportPath()) ?? downloadsReportPath(DEFAULT_REPORT_DATE);
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlAttributeEscape(value: string): string {
  return htmlEscape(value).replace(/'/g, "&#39;");
}

function normalizeBaseUrl(value: string | undefined): string {
  const base = value?.trim() || DEFAULT_BASE_URL;
  return base.endsWith("/") ? base : `${base}/`;
}

function prepareResearchViewerHtml(html: string): string {
  const withoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const baseHref = htmlAttributeEscape(
    normalizeBaseUrl(process.env.GTN_RESEARCH_VIEWER_BASE_URL),
  );

  if (/<base\b/i.test(withoutScripts)) {
    return withoutScripts;
  }

  return withoutScripts.replace(/<head([^>]*)>/i, `<head$1>\n<base href="${baseHref}">`);
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": CACHE_HEADER,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function errorHtml(title: string, message: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${htmlEscape(title)}</title>
</head>
<body style="margin:0;font-family:Segoe UI,Arial,sans-serif;background:white;color:#111">
  <div style="padding:16px">
    <h1 style="font-size:20px;margin:0 0 8px">${htmlEscape(title)}</h1>
    <p style="font-size:14px;margin:0;white-space:pre-wrap">${htmlEscape(message)}</p>
  </div>
</body>
</html>`;
}

export async function GET(request: Request): Promise<Response> {
  if (!isLocalOnlyFeatureEnabled()) {
    return htmlResponse(errorHtml("Not found", "Not found"), 404);
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const reportDate = parseIsoDate(dateParam);

  if (dateParam && !reportDate) {
    return htmlResponse(
      errorHtml("Invalid GTN report date", "date must be YYYY-MM-DD."),
      400,
    );
  }

  const reportPath = await resolveReportPath(reportDate);
  if (!(await pathExists(reportPath))) {
    return htmlResponse(
      errorHtml(
        "GTN Research Viewer report not found",
        `Expected local HTML report at:\n${reportPath}\n\nSet GTN_RESEARCH_VIEWER_HTML_PATH to override this path.`,
      ),
      404,
    );
  }

  const html = await fs.readFile(reportPath, "utf8");
  return htmlResponse(prepareResearchViewerHtml(html));
}
