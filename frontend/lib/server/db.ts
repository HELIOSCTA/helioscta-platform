import "server-only";

import { Pool, type PoolConfig } from "pg";
import { recordDbQuery } from "@/lib/server/apiObservability";

declare global {
  var __pgPool: Pool | undefined;
}

const REQUIRED_DATABASE = "helios_prod";
const REQUIRED_USER = "helios_readonly";
const DEFAULT_STATEMENT_TIMEOUT_MS = 25_000;
const DEFAULT_QUERY_TIMEOUT_MS = 28_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function timeoutConfig(): Pick<
  PoolConfig,
  "statement_timeout" | "query_timeout" | "connectionTimeoutMillis"
> {
  return {
    statement_timeout: envInt("HELIOS_POSTGRES_STATEMENT_TIMEOUT_MS", DEFAULT_STATEMENT_TIMEOUT_MS),
    query_timeout: envInt("HELIOS_POSTGRES_QUERY_TIMEOUT_MS", DEFAULT_QUERY_TIMEOUT_MS),
    connectionTimeoutMillis: envInt(
      "HELIOS_POSTGRES_CONNECTION_TIMEOUT_MS",
      DEFAULT_CONNECTION_TIMEOUT_MS,
    ),
  };
}

function assertSafeDatabase(database: string | null | undefined): string {
  if (database !== REQUIRED_DATABASE) {
    throw new Error(`Frontend Postgres must connect to ${REQUIRED_DATABASE}.`);
  }
  return database;
}

function assertSafeUser(user: string | null | undefined): string {
  if (user !== REQUIRED_USER) {
    throw new Error(`Frontend Postgres must use ${REQUIRED_USER}.`);
  }
  return user;
}

function buildConfig(): PoolConfig {
  const url = process.env.DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    assertSafeDatabase(parsed.pathname.replace(/^\//, ""));
    assertSafeUser(decodeURIComponent(parsed.username));
    const sslMode = parsed.searchParams.get("sslmode");
    if (sslMode === "disable") {
      throw new Error("Frontend Postgres requires SSL.");
    }

    return {
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 4,
      idleTimeoutMillis: 30_000,
      ...timeoutConfig(),
    };
  }

  const host = process.env.HELIOS_POSTGRES_READONLY_HOST;
  const user = process.env.HELIOS_POSTGRES_READONLY_USER;
  const password = process.env.HELIOS_POSTGRES_READONLY_PASSWORD;
  const database = process.env.HELIOS_POSTGRES_READONLY_DBNAME;
  const port = process.env.HELIOS_POSTGRES_READONLY_PORT;
  const sslMode = process.env.HELIOS_POSTGRES_READONLY_SSLMODE;

  if (!host || !user || !password || !database) {
    throw new Error(
      "Postgres env missing. Set DATABASE_URL or HELIOS_POSTGRES_READONLY_* vars in frontend/.env.local.",
    );
  }
  assertSafeDatabase(database);
  assertSafeUser(user);
  if (sslMode && sslMode !== "require") {
    throw new Error("HELIOS_POSTGRES_READONLY_SSLMODE must be require.");
  }

  return {
    host,
    user,
    password,
    database,
    port: port ? Number(port) : 5432,
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 30_000,
    ...timeoutConfig(),
  };
}

export function getPool(): Pool {
  if (!global.__pgPool) {
    global.__pgPool = new Pool(buildConfig());
  }
  return global.__pgPool;
}

export async function query<T>(
  text: string,
  values?: ReadonlyArray<unknown>,
): Promise<T[]> {
  const pool = getPool();
  const startedAt = performance.now();
  const res = await pool.query(text, values as unknown[] | undefined);
  recordDbQuery(performance.now() - startedAt, res.rowCount ?? res.rows.length);
  return res.rows as T[];
}
