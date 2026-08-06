import { DuplicateMessageError, QueueClient } from "@vercel/queue";
import { NextResponse } from "next/server";

import {
  buildPowerSettlesDashboardPayload,
  defaultPowerSettlesDashboardDate,
  POWER_SETTLES_EMAIL_REPORT_ISOS,
  parseDate,
  parsePowerSettlesComponent,
  parsePowerSettlesLookbackDays,
  parsePowerSettlesRtSource,
  parsePowerSettlesSparkHeatRate,
  type PowerSettlesDashboardPayload,
} from "@/lib/server/powerLmps";
import {
  buildPowerSettlesDashboardReportUrl,
  buildPowerSettlesEmailIdempotencyKey,
  getPowerSettlesEmailRecipients,
  POWER_SETTLES_EMAIL_DEFAULT_RT_SOURCE,
  POWER_SETTLES_EMAIL_TOPIC,
  type PowerSettlesEmailQueueMessage,
} from "@/lib/server/powerSettlesEmail";

export const runtime = "nodejs";
export const maxDuration = 30;

const { send } = new QueueClient({ region: "sfo1" });

interface PublishResult {
  recipientEmail: string;
  idempotencyKey: string;
  messageId: string | null;
  status: "queued" | "duplicate";
}

export async function GET(request: Request): Promise<Response> {
  const auth = authorizeCron(request);
  if (auth) return auth;

  const url = new URL(request.url);
  const requestedDateParam = parseDate(url.searchParams.get("date"));
  const requestedDate = requestedDateParam ?? defaultPowerSettlesDashboardDate();
  const rtSource = parsePowerSettlesRtSource(
    url.searchParams.get("rtSource") ?? POWER_SETTLES_EMAIL_DEFAULT_RT_SOURCE,
  );
  const component = parsePowerSettlesComponent(url.searchParams.get("component"));
  const lookbackDays = parsePowerSettlesLookbackDays(url.searchParams.get("lookbackDays"));
  const sparkHeatRate = parsePowerSettlesSparkHeatRate(url.searchParams.get("sparkHeatRate"));
  const queuedAt = new Date().toISOString();
  const reportUrl = buildPowerSettlesDashboardReportUrl({
    baseUrl: frontendBaseUrl(request),
    requestedDate,
    rtSource,
    component,
    lookbackDays,
    sparkHeatRate,
  });

  try {
    const reportResult = await buildPowerSettlesDashboardPayload({
      requestedDate,
      lookbackDays,
      rtSource,
      component,
      sparkHeatRate,
      dashboardIsos: POWER_SETTLES_EMAIL_REPORT_ISOS,
    });
    const readiness = powerSettlesEmailReadiness(reportResult.payload);

    const results: PublishResult[] = [];
    for (const recipientEmail of getPowerSettlesEmailRecipients()) {
      const idempotencyKey = buildPowerSettlesEmailIdempotencyKey({
        requestedDate,
        rtSource,
        component,
        lookbackDays,
        sparkHeatRate,
        recipientEmail,
      });
      const message: PowerSettlesEmailQueueMessage = {
        recipientEmail,
        requestedDate,
        rtSource,
        component,
        lookbackDays,
        sparkHeatRate,
        reportUrl,
        idempotencyKey,
        queuedAt,
      };

      try {
        const { messageId } = await send(POWER_SETTLES_EMAIL_TOPIC, message, {
          idempotencyKey,
          retentionSeconds: 86_400,
        });
        results.push({ recipientEmail, idempotencyKey, messageId, status: "queued" });
      } catch (error) {
        if (error instanceof DuplicateMessageError) {
          results.push({ recipientEmail, idempotencyKey, messageId: null, status: "duplicate" });
          continue;
        }
        throw error;
      }
    }

    console.info(
      JSON.stringify({
        event: "power_settles_email_cron_publish",
        topic: POWER_SETTLES_EMAIL_TOPIC,
        requested_date: requestedDate,
        rt_source: rtSource,
        component,
        lookback_days: lookbackDays,
        spark_heat_rate: sparkHeatRate,
        recipient_count: results.length,
        queued_count: results.filter((result) => result.status === "queued").length,
        duplicate_count: results.filter((result) => result.status === "duplicate").length,
        incomplete_count: readiness.incomplete.length,
      }),
    );

    return NextResponse.json({
      ok: true,
      queued: true,
      topic: POWER_SETTLES_EMAIL_TOPIC,
      requestedDate,
      rtSource,
      component,
      lookbackDays,
      sparkHeatRate,
      reportUrl,
      readiness,
      results,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error(
      JSON.stringify({
        event: "power_settles_email_cron_publish_failed",
        topic: POWER_SETTLES_EMAIL_TOPIC,
        requested_date: requestedDate,
        rt_source: rtSource,
        component,
        lookback_days: lookbackDays,
        spark_heat_rate: sparkHeatRate,
        error: detail,
      }),
    );
    return NextResponse.json(
      { ok: false, error: "Power Settles email cron publish failed", detail },
      { status: 500 },
    );
  }
}

function authorizeCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function frontendBaseUrl(request: Request): string {
  const configured = process.env.HELIOS_EMAIL_FRONTEND_BASE_URL?.trim();
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function powerSettlesEmailReadiness(payload: PowerSettlesDashboardPayload) {
  const incomplete = payload.rows
    .filter((row) => row.status !== "ok")
    .map((row) => ({
      iso: row.iso,
      hub: row.hub,
      targetDate: row.targetDate,
      status: row.status,
      detail: row.statusDetail,
    }));

  return {
    ready: true,
    policy: "send_after_payload_build",
    hubCount: payload.summary.hubCount,
    completeHubCount: payload.summary.completeHubCount,
    isoCount: payload.summary.isoCount,
    completeIsoCount: payload.summary.completeIsoCount,
    latestAsOf: payload.summary.latestAsOf,
    incomplete,
  };
}
