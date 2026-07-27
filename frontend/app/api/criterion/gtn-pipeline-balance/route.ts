import { criterionGtnPipelineBalanceSql } from "@/lib/criterion/gtnPipelineBalanceSql";
import {
  observedJsonRoute,
  type ObservedRouteResult,
} from "@/lib/server/apiObservability";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import { localOnlyObservedNotFound } from "@/lib/server/localOnlyApi";
import { criterionSnowflakeQuery } from "@/lib/server/snowflake";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "private, no-store";
const ROUTE = "/api/criterion/gtn-pipeline-balance";

const ROUTE_CONFIG = {
  route: ROUTE,
  cacheHeader: CACHE_HEADER,
  cachePolicy: "no-store",
  owner: "gas",
  purpose: "Local-dev GTN pipeline balance report from Criterion Snowflake.",
  p95TargetMs: 5_000,
  freshnessSource:
    "Criterion PRODUCTION.PIPELINES.NOMINATION_POINTS and NOMINATION_SEGMENTS export_timestamp",
} as const;

interface LatestDateRow {
  latestAvailableDate: string | null;
  latestCompleteExportTimestamp: string | null;
  latestSeenGasDay: string | null;
  latestSeenExportTimestamp: string | null;
}

interface CycleRow {
  reportDate?: string | null;
  cycleId?: number | null;
  cycleDesc?: string | null;
  exportTimestamp?: string | null;
}

interface DiagnosticRow extends CycleRow {
  severity?: "error" | "warning" | "info" | string | null;
  diagnosticKey?: string | null;
}

const SOURCE_CONTRACT = {
  sourceSystem: "Criterion Snowflake",
  sourceDatabase: "PRODUCTION",
  sourceSchema: "PIPELINES",
  tspShort: "079",
  sourceTables: [
    "PIPELINES.METADATA",
    "PIPELINES.NOMINATION_POINTS",
    "PIPELINES.NOMINATION_SEGMENTS",
    "PIPELINES.MAX_POINT_FLOW",
  ],
  primaryGrain:
    "TSP_SHORT x EFF_GAS_DAY x CYCLE_ID x METADATA_ID x source table",
  defaultDatePolicy:
    "Defaults to the latest GTN gas day with Intraday 3 coverage for required mapped plant and segment points.",
  explicitDatePolicy:
    "Explicit dates use the latest available nomination cycle for that gas day.",
  units:
    "SCHEDULED_QUANTITY, DESIGN_CAPACITY, OPERATING_CAPACITY, and OPERATIONALLY_AVAILABLE are displayed as Dth/d and MDth/d.",
  mwEstimate:
    "Estimated Avg MW = scheduled Dth/d / assumed heat rate / 24. This is a nomination-derived estimate, not metered generation.",
  runtimeSqlPath: "frontend/sql/criterion-gtn-pipeline-balance/runtime",
  verificationSqlPath: "frontend/sql/criterion-gtn-pipeline-balance/verification",
} as const;

function parseIsoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

function maxTimestamp(values: Array<string | null | undefined>): string | null {
  const filtered = values
    .filter((value): value is string => Boolean(value))
    .filter((value) => !value.startsWith("1900-01-01"))
    .sort();
  return filtered.at(-1) ?? null;
}

function rowCycle(rows: CycleRow[]): Pick<CycleRow, "cycleDesc" | "cycleId"> {
  const row = rows.find((entry) => entry.cycleId != null || entry.cycleDesc);
  return {
    cycleId: row?.cycleId ?? null,
    cycleDesc: row?.cycleDesc ?? null,
  };
}

function diagnosticSummary(diagnostics: DiagnosticRow[]) {
  return {
    errorCount: diagnostics.filter((row) => row.severity === "error").length,
    warningCount: diagnostics.filter((row) => row.severity === "warning").length,
    infoCount: diagnostics.filter((row) => row.severity === "info").length,
    hasMissingMappings: diagnostics.some(
      (row) =>
        row.severity === "error" &&
        (row.diagnosticKey === "missing_source_row" ||
          row.diagnosticKey === "missing_metadata_row"),
    ),
  };
}

const observedGET = observedJsonRoute(
  ROUTE_CONFIG,
  async (request: Request): Promise<ObservedRouteResult> => {
    if (!isLocalOnlyFeatureEnabled()) {
      return localOnlyObservedNotFound();
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const requestedDate = parseIsoDate(dateParam);
    const refresh = searchParams.get("refresh") === "1";

    if (dateParam && !requestedDate) {
      return {
        status: 400,
        payload: { error: "date must be YYYY-MM-DD." },
        headers: { "Cache-Control": "no-store" },
        rowCount: 0,
        dataAsOf: null,
      };
    }

    const latestRows = await criterionSnowflakeQuery<LatestDateRow>(
      criterionGtnPipelineBalanceSql.latestCompleteDate,
    );
    const latest = latestRows[0] ?? {
      latestAvailableDate: null,
      latestCompleteExportTimestamp: null,
      latestSeenGasDay: null,
      latestSeenExportTimestamp: null,
    };
    const reportDate = requestedDate ?? latest.latestAvailableDate;

    if (!reportDate) {
      return {
        status: 404,
        payload: {
          reportDate: null,
          latestAvailableDate: latest.latestAvailableDate,
          dataAsOf: latest.latestSeenExportTimestamp,
          sourceContract: SOURCE_CONTRACT,
          flowSummary: [],
          componentBalance: [],
          plantNoms: [],
          capacity: [],
          diagnostics: [
            {
              severity: "error",
              diagnosticKey: "no_gtn_data",
              message: "No GTN Criterion nomination data is available.",
            },
          ],
        },
        headers: { "Cache-Control": "no-store" },
        rowCount: 0,
        dataAsOf: latest.latestSeenExportTimestamp,
      };
    }

    const binds: [string] = [reportDate];
    const [flowSummary, componentBalance, plantNoms, capacity, diagnostics] =
      await Promise.all([
        criterionSnowflakeQuery<CycleRow>(
          criterionGtnPipelineBalanceSql.flowSummary,
          binds,
        ),
        criterionSnowflakeQuery<CycleRow>(
          criterionGtnPipelineBalanceSql.componentBalance,
          binds,
        ),
        criterionSnowflakeQuery<CycleRow>(
          criterionGtnPipelineBalanceSql.plantNoms,
          binds,
        ),
        criterionSnowflakeQuery<CycleRow>(
          criterionGtnPipelineBalanceSql.capacity,
          binds,
        ),
        criterionSnowflakeQuery<DiagnosticRow>(
          criterionGtnPipelineBalanceSql.diagnostics,
          binds,
        ),
      ]);

    const cycle = rowCycle([
      ...flowSummary,
      ...plantNoms,
      ...capacity,
      ...diagnostics,
    ]);
    const dataAsOf =
      maxTimestamp([
        ...flowSummary.map((row) => row.exportTimestamp),
        ...componentBalance.map((row) => row.exportTimestamp),
        ...plantNoms.map((row) => row.exportTimestamp),
        ...capacity.map((row) => row.exportTimestamp),
        ...diagnostics.map((row) => row.exportTimestamp),
        requestedDate
          ? latest.latestSeenExportTimestamp
          : latest.latestCompleteExportTimestamp,
      ]) ?? latest.latestSeenExportTimestamp;

    return {
      payload: {
        reportDate,
        latestAvailableDate: latest.latestAvailableDate,
        latestSeenGasDay: latest.latestSeenGasDay,
        dataAsOf,
        cycleId: cycle.cycleId,
        cycleDesc: cycle.cycleDesc,
        sourceContract: SOURCE_CONTRACT,
        flowSummary,
        componentBalance,
        plantNoms,
        capacity,
        diagnostics,
        diagnosticSummary: diagnosticSummary(diagnostics),
      },
      headers: {
        "Cache-Control": CACHE_HEADER,
        "X-Criterion-GTN-Cache": "ORIGIN",
        "X-Criterion-GTN-Refresh": refresh ? "1" : "0",
      },
      rowCount:
        flowSummary.length +
        componentBalance.length +
        plantNoms.length +
        capacity.length +
        diagnostics.length,
      dataAsOf,
    };
  },
);

export function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
