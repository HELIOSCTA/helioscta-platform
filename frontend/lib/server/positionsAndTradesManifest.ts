import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export const POSITIONS_AND_TRADES_MANIFEST_RELATIVE_PATH =
  "frontend/sql/positions-and-trades/manifest.json";

const MANIFEST_RUNTIME_PATHS = [
  path.join(process.cwd(), "sql", "positions-and-trades", "manifest.json"),
  path.join(process.cwd(), "frontend", "sql", "positions-and-trades", "manifest.json"),
];

export interface PositionsAndTradesManifestArtifact {
  displayName: string;
  promotedSql: string;
  dbtModel: string;
  dbtCompiledSql: string;
}

export interface PositionsAndTradesManifest {
  contractId: string;
  displayName: string;
  dbtModelFamily: string;
  dbtModelFamilyPath: string;
  referenceSchema: string;
  referenceTables: string[];
  generatedBy: string;
  artifacts: Record<string, PositionsAndTradesManifestArtifact>;
}

let cachedManifest: PositionsAndTradesManifest | null = null;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function asString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(
      `${POSITIONS_AND_TRADES_MANIFEST_RELATIVE_PATH} is missing string field ${key}.`,
    );
  }
  return value;
}

function validateArtifact(
  artifactId: string,
  value: unknown,
): PositionsAndTradesManifestArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `${POSITIONS_AND_TRADES_MANIFEST_RELATIVE_PATH} artifact ${artifactId} is invalid.`,
    );
  }
  const record = value as Record<string, unknown>;
  return {
    displayName: asString(record, "displayName"),
    promotedSql: asString(record, "promotedSql"),
    dbtModel: asString(record, "dbtModel"),
    dbtCompiledSql: asString(record, "dbtCompiledSql"),
  };
}

function validateManifest(value: unknown): PositionsAndTradesManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${POSITIONS_AND_TRADES_MANIFEST_RELATIVE_PATH} is invalid JSON.`);
  }

  const record = value as Record<string, unknown>;
  const referenceTables = record.referenceTables;
  const rawArtifacts = record.artifacts;
  if (!isStringArray(referenceTables)) {
    throw new Error(
      `${POSITIONS_AND_TRADES_MANIFEST_RELATIVE_PATH} is missing referenceTables.`,
    );
  }
  if (!rawArtifacts || typeof rawArtifacts !== "object" || Array.isArray(rawArtifacts)) {
    throw new Error(`${POSITIONS_AND_TRADES_MANIFEST_RELATIVE_PATH} is missing artifacts.`);
  }

  return {
    contractId: asString(record, "contractId"),
    displayName: asString(record, "displayName"),
    dbtModelFamily: asString(record, "dbtModelFamily"),
    dbtModelFamilyPath: asString(record, "dbtModelFamilyPath"),
    referenceSchema: asString(record, "referenceSchema"),
    referenceTables,
    generatedBy: asString(record, "generatedBy"),
    artifacts: Object.fromEntries(
      Object.entries(rawArtifacts).map(([artifactId, artifact]) => [
        artifactId,
        validateArtifact(artifactId, artifact),
      ]),
    ),
  };
}

export async function loadPositionsAndTradesManifest(): Promise<PositionsAndTradesManifest> {
  if (cachedManifest) return cachedManifest;

  let content: string | null = null;
  for (const candidatePath of MANIFEST_RUNTIME_PATHS) {
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
      `Unable to read ${POSITIONS_AND_TRADES_MANIFEST_RELATIVE_PATH}. Run dbt/azure_postgres/scripts/promote_positions_trades_sql.py.`,
    );
  }

  cachedManifest = validateManifest(JSON.parse(content));
  return cachedManifest;
}

export async function getPositionsAndTradesArtifact(
  artifactId: string,
): Promise<{
  manifest: PositionsAndTradesManifest;
  artifact: PositionsAndTradesManifestArtifact;
}> {
  const manifest = await loadPositionsAndTradesManifest();
  const artifact = manifest.artifacts[artifactId];
  if (!artifact) {
    throw new Error(
      `${POSITIONS_AND_TRADES_MANIFEST_RELATIVE_PATH} is missing artifact ${artifactId}.`,
    );
  }
  return { manifest, artifact };
}
