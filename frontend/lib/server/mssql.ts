import "server-only";

import sql from "mssql";
import { recordDbQuery } from "@/lib/server/apiObservability";

declare global {
  var __heliosMssqlPoolPromise: Promise<sql.ConnectionPool> | undefined;
}

const REQUIRED_DATABASE = "GenscapeDataFeed";
const DEFAULT_CONNECTION_TIMEOUT_MS = 12_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 28_000;

function requiredEnv(name: string, aliases: string[] = []): string {
  const names = [name, ...aliases];
  const value = names.map((envName) => process.env[envName]).find(Boolean);
  if (!value) {
    throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
  }
  return value;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function assertSafeDatabase(database: string): string {
  if (database !== REQUIRED_DATABASE) {
    throw new Error(`Frontend Azure SQL must connect to ${REQUIRED_DATABASE}.`);
  }
  return database;
}

function buildConfig(): sql.config {
  return {
    server: requiredEnv("AZURE_SQL_DB_HOST", ["AZURE_SQL_SERVER"]),
    port: envInt("AZURE_SQL_DB_PORT", 1433),
    database: assertSafeDatabase(requiredEnv("AZURE_SQL_DB_NAME", ["AZURE_SQL_DATABASE"])),
    user: requiredEnv("AZURE_SQL_DB_USER", ["AZURE_SQL_USER"]),
    password: requiredEnv("AZURE_SQL_DB_PASSWORD", ["AZURE_SQL_PASSWORD"]),
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    pool: {
      max: 4,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
    connectionTimeout: envInt(
      "AZURE_SQL_CONNECTION_TIMEOUT_MS",
      DEFAULT_CONNECTION_TIMEOUT_MS,
    ),
    requestTimeout: envInt("AZURE_SQL_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS),
  };
}

async function getPool(): Promise<sql.ConnectionPool> {
  if (!globalThis.__heliosMssqlPoolPromise) {
    globalThis.__heliosMssqlPoolPromise = new sql.ConnectionPool(buildConfig()).connect();
  }
  return globalThis.__heliosMssqlPoolPromise;
}

export async function mssqlQuery<T = Record<string, unknown>>(
  sqlText: string,
  params?: Readonly<Record<string, unknown>>,
): Promise<T[]> {
  const pool = await getPool();
  const request = pool.request();

  for (const [key, value] of Object.entries(params ?? {})) {
    request.input(key, value);
  }

  const startedAt = performance.now();
  const result = await request.query(sqlText);
  const rows = (result.recordset ?? []) as T[];
  recordDbQuery(performance.now() - startedAt, rows.length);
  return rows;
}
