import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

const SALT_FACILITIES_PROMOTED_SQL_PATH =
  "frontend/sql/salts/marts/marts_v1_salt_facilities_bcf.sql";
const SALT_INVENTORIES_PROMOTED_SQL_PATH =
  "frontend/sql/salts/marts/marts_v1_salt_inventories.sql";
const SALT_FACILITIES_DBT_MODEL_PATH =
  "dbt/dbt_azure_sql/models/salts/marts/marts_v1_salt_facilities_bcf.sql";
const SALT_INVENTORIES_DBT_MODEL_PATH =
  "dbt/dbt_azure_sql/models/salts/marts/marts_v1_salt_inventories.sql";
const SALT_FACILITIES_DBT_COMPILED_PATH =
  "dbt/dbt_azure_sql/target/compiled/dbt_azure_sql/models/salts/marts/marts_v1_salt_facilities_bcf.sql";
const SALT_INVENTORIES_DBT_COMPILED_PATH =
  "dbt/dbt_azure_sql/target/compiled/dbt_azure_sql/models/salts/marts/marts_v1_salt_inventories.sql";

const SOURCE_DATE_FILTER = "WHERE noms.gas_day >= '2020-01-01'";
const FINAL_SELECT_PATTERN = /SELECT\s+\*\s+FROM\s+FINAL\s*;?\s*$/i;
type SaltFacilitiesWxAdjSeason = "WINTER" | "SUMMER";
const SALT_FACILITIES_WX_ADJ_MONTHS_BY_SEASON: Record<
  SaltFacilitiesWxAdjSeason,
  readonly number[]
> = {
  WINTER: [11, 12, 1, 2, 3],
  SUMMER: [4, 5, 6, 7, 8, 9, 10],
};
const SALT_FACILITIES_WX_ADJ_COLUMNS = [
  "salts_total",
  "salts_tx",
  "salts_la",
  "salts_ms",
  "salts_al",
] as const;
const SALT_FACILITIES_TABLE_COLUMNS = [
  ...SALT_FACILITIES_WX_ADJ_COLUMNS,
  "golden_triangle",
  "keystone",
  "moss_bluff",
  "tres_palacios",
  "arcadia",
  "boardwalk",
  "bobcat",
  "egan",
  "jefferson_island",
  "la_storage",
  "perryville",
  "pine_prarie",
  "eminence",
  "leaf_river",
  "mississippi_hub",
  "petal",
  "southern_pines",
  "bay_gas",
] as const;
const SALT_FACILITIES_FORECAST_COLUMNS = [
  "salts_total",
  "salts_la",
  "salts_ms",
  "salts_al",
] as const;
const SALT_INVENTORIES_TABLE_COLUMNS = [
  "eminence_inv",
  "eminence_delta",
  "eminence_daily_flows",
  "eminence_available_cap",
  "eminence_operational_cap",
  "eminence_design_cap",
  "golden_triangle_inv",
  "golden_triangle_delta",
  "golden_triangle_daily_flows",
  "golden_triangle_available_cap",
  "golden_triangle_operational_cap",
  "golden_triangle_design_cap",
  "perryville_inv",
  "perryville_daily_flows",
  "perryville_available_cap",
  "perryville_operational_cap",
  "perryville_design_cap",
  "pine_prarie_inv",
  "pine_prarie_delta",
  "pine_prarie_daily_flows",
  "pine_prarie_available_cap",
  "pine_prarie_operational_cap",
  "pine_prarie_design_cap",
  "southern_pines_inv",
  "southern_pines_daily_flows",
  "southern_pines_available_cap",
  "southern_pines_operational_cap",
  "southern_pines_design_cap",
] as const;

let cachedSaltFacilitiesBcfSql: string | null = null;
let cachedSaltInventoriesSql: string | null = null;

export interface PromotedSaltsSql {
  sql: string;
  promotedSqlPath: string;
  dbtModelPath: string;
  dbtCompiledPath: string;
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

async function readPromotedSql(promotedSqlPath: string): Promise<string> {
  for (const candidatePath of runtimePathsForPromotedSql(promotedSqlPath)) {
    try {
      return (await readFile(candidatePath, "utf8")).trim().replace(/;\s*$/, "");
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: unknown }).code
          : null;
      if (code !== "ENOENT") throw error;
    }
  }

  throw new Error(`Unable to read promoted salts SQL at ${promotedSqlPath}.`);
}

function assertPromotedSaltsSql(sql: string, metricCte: string): void {
  if (
    !sql.includes("__dbt__cte__source_v1_genscape_noms") ||
    !sql.includes(metricCte) ||
    !sql.includes('"GenscapeDataFeed"."natgas"."nominations"') ||
    !FINAL_SELECT_PATTERN.test(sql)
  ) {
    throw new Error("Promoted salts SQL is not a compiled dbt salts mart.");
  }
}

function buildPromotedSql({
  sql,
  promotedSqlPath,
  dbtModelPath,
  dbtCompiledPath,
}: PromotedSaltsSql): PromotedSaltsSql {
  return {
    sql,
    promotedSqlPath,
    dbtModelPath,
    dbtCompiledPath,
  };
}

export async function loadPromotedSaltFacilitiesBcfSql(): Promise<PromotedSaltsSql> {
  if (!cachedSaltFacilitiesBcfSql) {
    const sql = await readPromotedSql(SALT_FACILITIES_PROMOTED_SQL_PATH);
    assertPromotedSaltsSql(sql, "SALTS_DAILY_FLOWS");
    cachedSaltFacilitiesBcfSql = sql;
  }

  return buildPromotedSql({
    sql: cachedSaltFacilitiesBcfSql,
    promotedSqlPath: SALT_FACILITIES_PROMOTED_SQL_PATH,
    dbtModelPath: SALT_FACILITIES_DBT_MODEL_PATH,
    dbtCompiledPath: SALT_FACILITIES_DBT_COMPILED_PATH,
  });
}

export async function loadPromotedSaltInventoriesSql(): Promise<PromotedSaltsSql> {
  if (!cachedSaltInventoriesSql) {
    const sql = await readPromotedSql(SALT_INVENTORIES_PROMOTED_SQL_PATH);
    assertPromotedSaltsSql(sql, "SALTS_DAILY_FLOWS");
    cachedSaltInventoriesSql = sql;
  }

  return buildPromotedSql({
    sql: cachedSaltInventoriesSql,
    promotedSqlPath: SALT_INVENTORIES_PROMOTED_SQL_PATH,
    dbtModelPath: SALT_INVENTORIES_DBT_MODEL_PATH,
    dbtCompiledPath: SALT_INVENTORIES_DBT_COMPILED_PATH,
  });
}

function replaceSourceDateFilter(promotedSql: string, replacement: string): string {
  const sourceDateFilterCount = promotedSql.split(SOURCE_DATE_FILTER).length - 1;
  if (sourceDateFilterCount !== 1) {
    throw new Error("Promoted salts source date filter was not recognized.");
  }

  return promotedSql.replace(SOURCE_DATE_FILTER, replacement);
}

function replaceFinalSelect(promotedSql: string, columns: readonly string[]): string {
  if (!FINAL_SELECT_PATTERN.test(promotedSql)) {
    throw new Error("Promoted salts FINAL select was not recognized.");
  }

  const columnSelect = columns
    .map((column) => `  CAST(${column} AS FLOAT) AS ${column}`)
    .join(",\n");

  return promotedSql.replace(
    FINAL_SELECT_PATTERN,
    `
SELECT
  CONVERT(varchar(10), CAST(gas_day AS DATE), 23) AS date,
${columnSelect}
FROM FINAL
WHERE gas_day IS NOT NULL
ORDER BY gas_day ASC`,
  );
}

function wxAdjSeasonMonthPredicate(season: SaltFacilitiesWxAdjSeason): string {
  const months = SALT_FACILITIES_WX_ADJ_MONTHS_BY_SEASON[season];
  if (!months?.length) {
    throw new Error("Salt facilities weather-adjusted season was not recognized.");
  }

  return `DATEPART(month, CAST(noms.gas_day AS DATE)) IN (${months.join(", ")})`;
}

export function buildSaltFacilitiesWxAdjSql(
  promotedSql: string,
  season: SaltFacilitiesWxAdjSeason,
): string {
  const boundedPromotedSql = replaceSourceDateFilter(
    promotedSql,
    `WHERE noms.gas_day >= DATEFROMPARTS(@startYear, 1, 1)
      AND noms.gas_day <= CAST(GETDATE() AS DATE)
      AND ${wxAdjSeasonMonthPredicate(season)}`,
  );

  return replaceFinalSelect(boundedPromotedSql, SALT_FACILITIES_WX_ADJ_COLUMNS);
}

export function buildSaltFacilitiesTableSql(promotedSql: string): string {
  const boundedPromotedSql = replaceSourceDateFilter(
    promotedSql,
    `WHERE noms.gas_day >= DATEADD(month, @tableLookbackMonths * -1, CAST(GETDATE() AS DATE))
      AND noms.gas_day <= CAST(GETDATE() AS DATE)`,
  );

  return replaceFinalSelect(boundedPromotedSql, SALT_FACILITIES_TABLE_COLUMNS);
}

export function buildSaltFacilitiesForecastSql(promotedSql: string): string {
  const boundedPromotedSql = replaceSourceDateFilter(
    promotedSql,
    `WHERE noms.gas_day >= DATEADD(day, @lookbackDays * -1, CAST(GETDATE() AS DATE))
      AND noms.gas_day <= CAST(GETDATE() AS DATE)`,
  );

  return replaceFinalSelect(boundedPromotedSql, SALT_FACILITIES_FORECAST_COLUMNS);
}

export function buildSaltInventoriesTableSql(promotedSql: string): string {
  const boundedPromotedSql = replaceSourceDateFilter(
    promotedSql,
    `WHERE noms.gas_day >= DATEADD(day, @saltPlotLookbackDays * -1, CAST(GETDATE() AS DATE))
      AND noms.gas_day <= CAST(GETDATE() AS DATE)`,
  );

  return replaceFinalSelect(boundedPromotedSql, SALT_INVENTORIES_TABLE_COLUMNS);
}
