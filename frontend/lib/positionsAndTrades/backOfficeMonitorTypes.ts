export type BackOfficeMonitorEmailStatus = "sent" | "queued" | "failed" | "unknown";

export interface BackOfficeMonitorEmailWorkflow {
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
  latestStatus: BackOfficeMonitorEmailStatus;
  latestStatusLabel: string;
  latestActivityAt: string | null;
  latestActivityLabel: string;
  latestSubject: string | null;
  latestDetail: string;
  latestError: string | null;
}

export interface BackOfficeMonitorPayload {
  source: "backoffice-monitor";
  generatedAt: string;
  emailWorkflows: BackOfficeMonitorEmailWorkflow[];
  sourceChecks: string;
}
