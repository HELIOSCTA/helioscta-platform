import "server-only";

import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import { recordDbQuery } from "@/lib/server/apiObservability";

declare global {
  var __pgWriterPool: Pool | undefined;
}

const REQUIRED_DATABASE = "helios_prod";
const REQUIRED_USER = "helios_admin";
const DEFAULT_STATEMENT_TIMEOUT_MS = 25_000;
const DEFAULT_QUERY_TIMEOUT_MS = 28_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 12_000;

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
    throw new Error(`Frontend writer Postgres must connect to ${REQUIRED_DATABASE}.`);
  }
  return database;
}

function assertSafeUser(user: string | null | undefined): string {
  if (user !== REQUIRED_USER) {
    throw new Error(`Frontend writer Postgres must use ${REQUIRED_USER}.`);
  }
  return user;
}

function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function buildConfig(): PoolConfig {
  const url = process.env.HELIOS_POSTGRES_WRITER_URL ?? process.env.DATABASE_WRITE_URL;
  if (url) {
    const parsed = new URL(url);
    assertSafeDatabase(parsed.pathname.replace(/^\//, ""));
    assertSafeUser(decodeURIComponent(parsed.username));
    const sslMode = parsed.searchParams.get("sslmode");
    if (sslMode === "disable") {
      throw new Error("Frontend writer Postgres requires SSL.");
    }

    return {
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30_000,
      ...timeoutConfig(),
    };
  }

  const host = envValue("HELIOS_POSTGRES_WRITER_HOST", "AZURE_POSTGRES_WRITER_HOST");
  const user = envValue("HELIOS_POSTGRES_WRITER_USER", "AZURE_POSTGRES_WRITER_USER");
  const password = envValue("HELIOS_POSTGRES_WRITER_PASSWORD", "AZURE_POSTGRES_WRITER_PASSWORD");
  const database = envValue("HELIOS_POSTGRES_WRITER_DBNAME", "AZURE_POSTGRES_WRITER_DBNAME");
  const port = envValue("HELIOS_POSTGRES_WRITER_PORT", "AZURE_POSTGRES_WRITER_PORT");
  const sslMode = envValue("HELIOS_POSTGRES_WRITER_SSLMODE", "AZURE_POSTGRES_WRITER_SSLMODE");

  if (!host || !user || !password || !database) {
    throw new Error(
      "Postgres writer env missing. Set HELIOS_POSTGRES_WRITER_* or AZURE_POSTGRES_WRITER_* vars in frontend/.env.local.",
    );
  }
  assertSafeDatabase(database);
  assertSafeUser(user);
  if (sslMode && sslMode !== "require") {
    throw new Error("Frontend writer Postgres SSL mode must be require.");
  }

  return {
    host,
    user,
    password,
    database,
    port: port ? Number(port) : 5432,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30_000,
    ...timeoutConfig(),
  };
}

export function getWriterPool(): Pool {
  if (!global.__pgWriterPool) {
    global.__pgWriterPool = new Pool(buildConfig());
  }
  return global.__pgWriterPool;
}

export async function writerQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: ReadonlyArray<unknown>,
): Promise<QueryResult<T>> {
  const pool = getWriterPool();
  const startedAt = performance.now();
  const res = await pool.query<T>(text, values as unknown[] | undefined);
  recordDbQuery(performance.now() - startedAt, res.rowCount ?? res.rows.length);
  return res;
}
