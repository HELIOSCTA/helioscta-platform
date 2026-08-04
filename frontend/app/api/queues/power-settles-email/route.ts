import { QueueClient } from "@vercel/queue";

import { sendMailViaMicrosoftGraph } from "@/lib/server/microsoftGraphMail";
import { buildPowerSettlesDashboardPayload, parsePowerSettlesComponent } from "@/lib/server/powerLmps";
import {
  buildPowerSettlesEmailSubject,
  isAllowedPowerSettlesEmailRecipient,
  normalizePowerSettlesEmailRecipient,
  powerSettlesAttachmentName,
  renderPowerSettlesInlineEmailHtml,
  renderPowerSettlesPlainTextEmail,
  renderPowerSettlesStandaloneHtml,
  type PowerSettlesEmailQueueMessage,
} from "@/lib/server/powerSettlesEmail";

export const runtime = "nodejs";
export const maxDuration = 60;

class PermanentPowerSettlesQueueError extends Error {}

const { handleCallback } = new QueueClient({ region: "sfo1" });

const queuePost = handleCallback<unknown>(
  async (message, metadata) => {
    const parsed = parsePowerSettlesEmailQueueMessage(message);
    const recipientEmail = normalizePowerSettlesEmailRecipient(parsed.recipientEmail);

    if (!isAllowedPowerSettlesEmailRecipient(recipientEmail)) {
      console.warn(
        JSON.stringify({
          event: "power_settles_email_skipped_recipient",
          topic: metadata.topicName,
          message_id: metadata.messageId,
          recipient_email: recipientEmail,
        }),
      );
      return;
    }

    const result = await buildPowerSettlesDashboardPayload({
      requestedDate: parsed.requestedDate,
      lookbackDays: parsed.lookbackDays,
      rtSource: parsed.rtSource,
      component: parsed.component ?? "total",
    });
    const payload = result.payload;
    const subject = buildPowerSettlesEmailSubject(payload);
    const bodyHtml = renderPowerSettlesInlineEmailHtml({
      payload,
      reportUrl: parsed.reportUrl,
    });
    const bodyText = renderPowerSettlesPlainTextEmail({
      payload,
      reportUrl: parsed.reportUrl,
    });
    const attachmentHtml = renderPowerSettlesStandaloneHtml({
      payload,
      reportUrl: parsed.reportUrl,
    });

    await sendMailViaMicrosoftGraph({
      recipientEmail,
      subject,
      bodyText,
      bodyHtml,
      attachments: [
        {
          name: powerSettlesAttachmentName(payload),
          contentType: "text/html",
          content: attachmentHtml,
        },
      ],
    });

    console.info(
      JSON.stringify({
        event: "power_settles_email_sent",
        topic: metadata.topicName,
        message_id: metadata.messageId,
        delivery_count: metadata.deliveryCount,
        recipient_email: recipientEmail,
        requested_date: parsed.requestedDate,
        rt_source: parsed.rtSource,
        component: parsed.component ?? "total",
        lookback_days: parsed.lookbackDays,
        data_as_of: result.dataAsOf,
        row_count: result.rowCount,
      }),
    );
  },
  {
    visibilityTimeoutSeconds: 600,
    retry: (error, metadata) => {
      const permanent = error instanceof PermanentPowerSettlesQueueError;
      if (permanent || metadata.deliveryCount >= 6) {
        console.error(
          JSON.stringify({
            event: "power_settles_email_queue_acknowledged_after_failure",
            topic: metadata.topicName,
            message_id: metadata.messageId,
            delivery_count: metadata.deliveryCount,
            permanent,
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        );
        return { acknowledge: true };
      }
      return { afterSeconds: Math.min(900, 2 ** metadata.deliveryCount * 30) };
    },
  },
);

export function POST(request: Request): Promise<Response> {
  return queuePost(request);
}

function parsePowerSettlesEmailQueueMessage(value: unknown): PowerSettlesEmailQueueMessage {
  if (!isRecord(value)) {
    throw new PermanentPowerSettlesQueueError("Power Settles queue message must be a JSON object.");
  }

  const recipientEmail = stringField(value, "recipientEmail");
  const requestedDate = nullableDateField(value, "requestedDate");
  const rtSource = value.rtSource === "verified" ? "verified" : value.rtSource === "unverified" ? "unverified" : null;
  const component =
    typeof value.component === "string" ? parsePowerSettlesComponent(value.component) : "total";
  const lookbackDays = numberField(value, "lookbackDays");
  const reportUrl = stringField(value, "reportUrl");
  const idempotencyKey = stringField(value, "idempotencyKey");
  const queuedAt = stringField(value, "queuedAt");

  if (!rtSource) {
    throw new PermanentPowerSettlesQueueError("Power Settles queue message rtSource must be verified or unverified.");
  }
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 14) {
    throw new PermanentPowerSettlesQueueError("Power Settles queue message lookbackDays must be 1..14.");
  }
  try {
    const parsed = new URL(reportUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("invalid protocol");
    }
  } catch {
    throw new PermanentPowerSettlesQueueError("Power Settles queue message reportUrl must be an absolute URL.");
  }

  return {
    recipientEmail,
    requestedDate,
    rtSource,
    component,
    lookbackDays,
    reportUrl,
    idempotencyKey,
    queuedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, field: string): string {
  const raw = value[field];
  if (typeof raw !== "string" || !raw.trim()) {
    throw new PermanentPowerSettlesQueueError(`Power Settles queue message ${field} must be a non-empty string.`);
  }
  return raw.trim();
}

function nullableDateField(value: Record<string, unknown>, field: string): string | null {
  const raw = value[field];
  if (raw === null) return null;
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  throw new PermanentPowerSettlesQueueError(`Power Settles queue message ${field} must be null or YYYY-MM-DD.`);
}

function numberField(value: Record<string, unknown>, field: string): number {
  const raw = value[field];
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new PermanentPowerSettlesQueueError(`Power Settles queue message ${field} must be a finite number.`);
  }
  return Math.trunc(raw);
}
