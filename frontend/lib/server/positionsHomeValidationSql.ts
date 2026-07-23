import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  getPositionsAndTradesArtifact,
  type PositionsAndTradesManifestArtifact,
} from "@/lib/server/positionsAndTradesManifest";

export const POSITIONS_HOME_VALIDATION_ARTIFACT_ID = "positions_trades_validation_summary";
export const POSITIONS_HOME_VALIDATION_FAILURES_ARTIFACT_ID =
  "positions_trades_validation_failures";

export interface PromotedPositionsHomeValidationSql {
  sql: string;
  promotedSqlPath: string;
  dbtModelPath: string;
  dbtCompiledPath: string;
  artifactId: string;
  artifactDisplayName: string;
}

function runtimePathsForPromotedSql(promotedSqlPath: string): string[] {
  const frontendRelativePath = promotedSqlPath.startsWith("frontend/")
    ? promotedSqlPath.slice("frontend/".length)
    : promotedSqlPath;
  return [
    path.join(process.cwd(), ...frontendRelativePath.split("/")),
    path.join(process.cwd(), ...promotedSqlPath.split("/")),
  ];
}

async function readPromotedSql(
  artifact: PositionsAndTradesManifestArtifact,
  requiredMarkers: string[],
  artifactDescription: string,
): Promise<string> {
  let content: string | null = null;
  for (const candidatePath of runtimePathsForPromotedSql(artifact.promotedSql)) {
    try {
      content = await readFile(candidatePath, "utf8");
      break;
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: unknown }).code
          : null;
      if (code !== "ENOENT") throw error;
    }
  }

  if (content === null) {
    throw new Error(
      `Unable to read ${artifact.promotedSql}. Run dbt/azure_postgres/scripts/promote_positions_trades_sql.py.`,
    );
  }

  const sql = content.trim().replace(/;\s*$/, "");
  const lowered = sql.toLowerCase();
  if (!sql.includes("__dbt__cte__") || requiredMarkers.some((marker) => !lowered.includes(marker))) {
    throw new Error(
      `${artifact.promotedSql} is not a compiled dbt ${artifactDescription}.`,
    );
  }

  return sql;
}

export async function loadPromotedPositionsHomeValidationSql(): Promise<PromotedPositionsHomeValidationSql> {
  const { artifact } = await getPositionsAndTradesArtifact(POSITIONS_HOME_VALIDATION_ARTIFACT_ID);
  const sql = await readPromotedSql(
    artifact,
    [
      "validation_scope",
      "scope_label",
      "clear_street_vendor_code_failures",
      "nav_vendor_code_failures",
      "sample_failure_reason",
    ],
    "positions/trades validation summary",
  );

  return {
    sql,
    promotedSqlPath: artifact.promotedSql,
    dbtModelPath: artifact.dbtModel,
    dbtCompiledPath: artifact.dbtCompiledSql,
    artifactId: POSITIONS_HOME_VALIDATION_ARTIFACT_ID,
    artifactDisplayName: artifact.displayName,
  };
}

export async function loadPromotedPositionsHomeValidationFailuresSql(): Promise<PromotedPositionsHomeValidationSql> {
  const { artifact } = await getPositionsAndTradesArtifact(
    POSITIONS_HOME_VALIDATION_FAILURES_ARTIFACT_ID,
  );
  const sql = await readPromotedSql(
    artifact,
    [
      "validation_scope",
      "scope_label",
      "source_record_key",
      "source_product",
      "route_exchange",
      "vendor_ice_code",
      "clear_street_vendor_code_failures",
      "nav_vendor_code_failures",
    ],
    "positions/trades validation failure-row detail",
  );

  return {
    sql,
    promotedSqlPath: artifact.promotedSql,
    dbtModelPath: artifact.dbtModel,
    dbtCompiledPath: artifact.dbtCompiledSql,
    artifactId: POSITIONS_HOME_VALIDATION_FAILURES_ARTIFACT_ID,
    artifactDisplayName: artifact.displayName,
  };
}
