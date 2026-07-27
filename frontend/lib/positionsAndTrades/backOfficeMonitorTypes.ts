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

export interface BackOfficeMonitorEmailHistoryDetail {
  id: string;
  channel: "outbox" | "direct";
  recipientEmail: string | null;
  senderEmail: string | null;
  status: BackOfficeMonitorEmailStatus;
  statusLabel: string;
  activityAt: string | null;
  activityLabel: string;
  subject: string | null;
  notificationKey: string | null;
  attemptsLabel: string;
  artifactLabel: string;
  error: string | null;
}

export interface BackOfficeMonitorEmailHistoryRow {
  id: string;
  workflowId: string;
  workflowLabel: string;
  audience: "Internal" | "External";
  businessDate: string | null;
  businessDateLabel: string;
  latestActivityAt: string | null;
  latestActivityLabel: string;
  status: BackOfficeMonitorEmailStatus;
  statusLabel: string;
  subject: string | null;
  recipientsLabel: string;
  rowCountLabel: string;
  artifactLabel: string;
  detail: string;
  details: BackOfficeMonitorEmailHistoryDetail[];
}

export interface BackOfficeMonitorPayload {
  source: "backoffice-monitor";
  generatedAt: string;
  emailWorkflows: BackOfficeMonitorEmailWorkflow[];
  emailHistory: BackOfficeMonitorEmailHistoryRow[];
  sourceChecks: string;
}
