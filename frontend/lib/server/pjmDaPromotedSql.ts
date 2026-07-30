import "server-only";

import fs from "node:fs";
import path from "node:path";

export type PjmDaSqlArtifact =
  | "available_target_dates"
  | "meteo_da_price_forecast_hourly"
  | "actual_da_lmps_hourly"
  | "ice_python_next_day_gas";

const ARTIFACT_FILES: Record<PjmDaSqlArtifact, string> = {
  available_target_dates: "available_target_dates.sql",
  meteo_da_price_forecast_hourly: "meteo_da_price_forecast_hourly.sql",
  actual_da_lmps_hourly: "actual_da_lmps_hourly.sql",
  ice_python_next_day_gas: "ice_python_next_day_gas.sql",
};

const sqlCache = new Map<string, string>();
let resolvedRuntimeRoot: string | null = null;
let manifestCache: unknown | null = null;

function candidateRoots(): string[] {
  const roots = [
    process.env.PJM_DA_MODEL_SQL_ROOT,
    path.resolve(process.cwd(), "..", "backend", "modelling", "pjm_da_models", "sql_inputs"),
    path.resolve(process.cwd(), "backend", "modelling", "pjm_da_models", "sql_inputs"),
    path.resolve(process.cwd(), "sql", "pjm_da_model", "sql_inputs"),
  ];

  return roots.filter((root): root is string => Boolean(root));
}

export function pjmDaPromotedSqlRoot(): string {
  if (resolvedRuntimeRoot) return resolvedRuntimeRoot;

  for (const root of candidateRoots()) {
    if (fs.existsSync(path.join(root, "manifest.json"))) {
      resolvedRuntimeRoot = root;
      return root;
    }
  }

  throw new Error(
    "Missing PJM DA promoted SQL inputs. Set PJM_DA_MODEL_SQL_ROOT or run the dbt promotion script so backend/modelling/pjm_da_models/sql_inputs exists.",
  );
}

export function readPjmDaPromotedSql(artifact: PjmDaSqlArtifact): string {
  const root = pjmDaPromotedSqlRoot();
  const fileName = ARTIFACT_FILES[artifact];
  const filePath = path.join(root, fileName);
  const cached = sqlCache.get(filePath);
  if (cached) return cached;
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing PJM DA promoted SQL artifact: ${filePath}`);
  }
  const sql = fs.readFileSync(filePath, "utf8");
  sqlCache.set(filePath, sql);
  return sql;
}

export function readPjmDaPromotedManifest(): unknown {
  if (manifestCache) return manifestCache;
  const filePath = path.join(pjmDaPromotedSqlRoot(), "manifest.json");
  manifestCache = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  return manifestCache;
}

export function bindPromotedSql(
  sql: string,
  params: Record<string, unknown>,
): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const positions = new Map<string, number>();
  const text = sql.replace(/%\(([A-Za-z_][A-Za-z0-9_]*)\)s/g, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) {
      throw new Error(`Missing SQL parameter '${name}' for promoted PJM DA SQL.`);
    }

    let position = positions.get(name);
    if (!position) {
      values.push(params[name] ?? null);
      position = values.length;
      positions.set(name, position);
    }
    return `$${position}`;
  });

  return { text, values };
}
