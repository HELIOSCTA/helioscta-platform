import "server-only";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

export interface GraphMailAttachment {
  name: string;
  contentType: string;
  content: string;
}

export interface GraphMailArgs {
  recipientEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  senderEmail?: string;
  attachments?: GraphMailAttachment[];
}

interface GraphTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

export function buildGraphSendMailPayload({
  recipientEmail,
  subject,
  bodyText,
  bodyHtml,
  attachments = [],
}: GraphMailArgs) {
  const message: Record<string, unknown> = {
    subject,
    body: {
      contentType: bodyHtml ? "HTML" : "Text",
      content: bodyHtml ?? bodyText,
    },
    toRecipients: [
      {
        emailAddress: {
          address: recipientEmail,
        },
      },
    ],
  };

  if (attachments.length) {
    message.attachments = attachments.map((attachment) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: attachment.name,
      contentType: attachment.contentType,
      contentBytes: Buffer.from(attachment.content, "utf8").toString("base64"),
    }));
  }

  return {
    message,
    saveToSentItems: false,
  };
}

export async function sendMailViaMicrosoftGraph(args: GraphMailArgs): Promise<void> {
  const sender = requiredEnv("AZURE_OUTLOOK_SENDER", args.senderEmail ?? process.env.AZURE_OUTLOOK_SENDER);
  const token = await graphAccessToken();
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGraphSendMailPayload(args)),
    },
  );

  if (response.status !== 202) {
    const body = await response.text().catch(() => "");
    throw new Error(`Microsoft Graph sendMail failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
}

async function graphAccessToken(): Promise<string> {
  const clientId = requiredEnv("AZURE_OUTLOOK_CLIENT_ID", process.env.AZURE_OUTLOOK_CLIENT_ID);
  const tenantId = requiredEnv("AZURE_OUTLOOK_TENANT_ID", process.env.AZURE_OUTLOOK_TENANT_ID);
  const clientSecret = requiredEnv(
    "AZURE_OUTLOOK_CLIENT_SECRET",
    process.env.AZURE_OUTLOOK_CLIENT_SECRET,
  );
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: GRAPH_SCOPE,
        grant_type: "client_credentials",
      }).toString(),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as GraphTokenResponse;
  if (!response.ok) {
    const detail = payload.error_description ?? payload.error ?? "unknown token error";
    throw new Error(`Microsoft Graph token request failed with HTTP ${response.status}: ${detail.slice(0, 500)}`);
  }
  if (!payload.access_token) {
    throw new Error("Microsoft Graph token response did not include access_token");
  }
  return payload.access_token;
}

function requiredEnv(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`${name} is required for Vercel Power Settles email delivery.`);
  }
  return value.trim();
}
