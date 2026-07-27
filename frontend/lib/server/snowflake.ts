import "server-only";

import * as snowflake from "snowflake-sdk";
import { recordDbQuery } from "@/lib/server/apiObservability";

declare global {
  var __heliosCriterionSnowflakeConnection:
    | Promise<snowflake.Connection>
    | undefined;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value : undefined;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function connect(connection: snowflake.Connection): Promise<snowflake.Connection> {
  return new Promise((resolve, reject) => {
    connection.connect((error, connectedConnection) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(connectedConnection);
    });
  });
}

function buildConnection(): snowflake.Connection {
  snowflake.configure({
    logLevel: "ERROR",
    ocspFailOpen: true,
  });

  return snowflake.createConnection({
    account: requiredEnv("CRITERION_SNOWFLAKE_ACCOUNT"),
    username: requiredEnv("CRITERION_SNOWFLAKE_USER"),
    password: requiredEnv("CRITERION_SNOWFLAKE_PASSWORD"),
    warehouse: requiredEnv("CRITERION_SNOWFLAKE_WAREHOUSE"),
    database: requiredEnv("CRITERION_SNOWFLAKE_DATABASE"),
    role: requiredEnv("CRITERION_SNOWFLAKE_ROLE"),
    schema: optionalEnv("CRITERION_SNOWFLAKE_SCHEMA"),
    authenticator: optionalEnv("CRITERION_SNOWFLAKE_AUTHENTICATOR"),
    application: "helioscta_frontend_local_dev",
    timeout: envInt("CRITERION_SNOWFLAKE_QUERY_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    rowMode: "object",
  });
}

async function getConnection(): Promise<snowflake.Connection> {
  if (!globalThis.__heliosCriterionSnowflakeConnection) {
    globalThis.__heliosCriterionSnowflakeConnection = connect(buildConnection());
  }

  const connection = await globalThis.__heliosCriterionSnowflakeConnection;
  if (!(await connection.isValidAsync())) {
    globalThis.__heliosCriterionSnowflakeConnection = connect(buildConnection());
    return globalThis.__heliosCriterionSnowflakeConnection;
  }

  return connection;
}

export async function criterionSnowflakeQuery<T = Record<string, unknown>>(
  sqlText: string,
  binds: snowflake.Binds = [],
): Promise<T[]> {
  const connection = await getConnection();
  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText,
      binds,
      complete: (error, _statement, rows) => {
        const resultRows = (rows ?? []) as T[];
        recordDbQuery(performance.now() - startedAt, resultRows.length);

        if (error) {
          reject(error);
          return;
        }

        resolve(resultRows);
      },
    });
  });
}
