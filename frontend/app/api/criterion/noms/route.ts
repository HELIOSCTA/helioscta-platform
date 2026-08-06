import { criterionNomsSql } from "@/lib/criterion/criterionNomsSql";
import {
  getCriterionWatchlist,
  parseCriterionWatchlistId,
  type CriterionWatchlistPointRow,
} from "@/lib/criterion/criterionWatchlistsDb";
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
const ROUTE = "/api/criterion/noms";

const DEFAULT_STATES = [
  "DE",
  "IL",
  "IN",
  "KY",
  "MD",
  "MI",
  "NJ",
  "OH",
  "PA",
  "TN",
  "VA",
  "WV",
  "DC",
] as const;

const ALLOWED_STATES = new Set([...DEFAULT_STATES, "NC"]);

const SOURCE_CONTRACT = {
  sourceSystem: "Criterion Snowflake",
  sourceDatabase: "PRODUCTION",
  sourceSchema: "PIPELINES",
  sourceTables: ["PIPELINES.METADATA", "PIPELINES.NOMINATION_POINTS"],
  primaryGrain:
    "TSP_SHORT x METADATA_ID x EFF_GAS_DAY with latest EXPORT_TIMESTAMP/CYCLE_ID selected per day",
  defaultStatePolicy:
    "Defaults to PJM footprint states excluding NC. State filtering is a staging proxy, not a reviewed ISO plant mapping.",
  pointFilter:
    "METADATA.CATEGORY_SHORT = 'Power' and delivery points where LOC_QTI_SHORT = 'DPQ' or REC_DEL_SIGN = -1.",
  signPolicy:
    "Scheduled quantities are multiplied by REC_DEL_SIGN so plant deliveries display as negative Dth/d.",
} as const;

interface CriterionNomsSqlRow {
  anchorDate: string | null;
  sourceTable: string;
  tspShort: string;
  metadataId: string;
  state: string | null;
  pipeline: string | null;
  location: string | null;
  locationId: string | null;
  facilityType: string | null;
  county: string | null;
  connectingEntity: string | null;
  categoryShort: string | null;
  locQtiShort: string | null;
  recDelSign: number | string | null;
  tomorrow: number | string | null;
  today: number | string | null;
  yesterday: number | string | null;
  twoDaysOld: number | string | null;
  threeDaysOld: number | string | null;
  fourDaysOld: number | string | null;
  fiveDaysOld: number | string | null;
  sixDaysOld: number | string | null;
  cycleId: number | string | null;
  cycleDesc: string | null;
  dataAsOf: string | null;
}

interface CriterionNomsRow extends Omit<
  CriterionNomsSqlRow,
  | "tomorrow"
  | "today"
  | "yesterday"
  | "twoDaysOld"
  | "threeDaysOld"
  | "fourDaysOld"
  | "fiveDaysOld"
  | "sixDaysOld"
  | "cycleId"
  | "recDelSign"
> {
  tomorrow: number;
  today: number;
  yesterday: number;
  twoDaysOld: number;
  threeDaysOld: number;
  fourDaysOld: number;
  fiveDaysOld: number;
  sixDaysOld: number;
  cycleId: number | null;
  recDelSign: number | null;
}

interface CriterionNomsStateTotal {
  state: string;
  plantPointCount: number;
  tomorrow: number;
  today: number;
  yesterday: number;
  twoDaysOld: number;
  threeDaysOld: number;
  fourDaysOld: number;
  fiveDaysOld: number;
  sixDaysOld: number;
}

const NUMERIC_FIELDS = [
  "tomorrow",
  "today",
  "yesterday",
  "twoDaysOld",
  "threeDaysOld",
  "fourDaysOld",
  "fiveDaysOld",
  "sixDaysOld",
] as const;

function parseIsoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

function parseStates(value: string | null): string[] {
  const rawStates = value
    ?.split(",")
    .map((state) => state.trim().toUpperCase())
    .filter(Boolean);

  const states = rawStates?.length ? rawStates : [...DEFAULT_STATES];
  return Array.from(new Set(states.filter((state) => ALLOWED_STATES.has(state)))).sort();
}

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 500;
  return Math.min(parsed, 1000);
}

function parseBoolean(value: string | null): boolean {
  return value === "1" || value === "true";
}

function numberValue(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function nullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRow(row: CriterionNomsSqlRow): CriterionNomsRow {
  return {
    ...row,
    tomorrow: numberValue(row.tomorrow),
    today: numberValue(row.today),
    yesterday: numberValue(row.yesterday),
    twoDaysOld: numberValue(row.twoDaysOld),
    threeDaysOld: numberValue(row.threeDaysOld),
    fourDaysOld: numberValue(row.fourDaysOld),
    fiveDaysOld: numberValue(row.fiveDaysOld),
    sixDaysOld: numberValue(row.sixDaysOld),
    cycleId: nullableNumber(row.cycleId),
    recDelSign: nullableNumber(row.recDelSign),
  };
}

function hasAnyNom(row: CriterionNomsRow): boolean {
  return NUMERIC_FIELDS.some((field) => row[field] !== 0);
}

function latestString(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function buildStateTotals(rows: CriterionNomsRow[]): CriterionNomsStateTotal[] {
  const totals = new Map<string, CriterionNomsStateTotal>();

  for (const row of rows) {
    const state = row.state ?? "Unknown";
    const current =
      totals.get(state) ??
      {
        state,
        plantPointCount: 0,
        tomorrow: 0,
        today: 0,
        yesterday: 0,
        twoDaysOld: 0,
        threeDaysOld: 0,
        fourDaysOld: 0,
        fiveDaysOld: 0,
        sixDaysOld: 0,
      };

    current.plantPointCount += 1;
    for (const field of NUMERIC_FIELDS) current[field] += row[field];
    totals.set(state, current);
  }

  return Array.from(totals.values()).sort(
    (a, b) => Math.abs(b.today) - Math.abs(a.today) || a.state.localeCompare(b.state),
  );
}

function sumField(rows: CriterionNomsRow[], field: (typeof NUMERIC_FIELDS)[number]): number {
  return rows.reduce((total, row) => total + row[field], 0);
}

function watchlistPointKeys(points: CriterionWatchlistPointRow[]) {
  return points.map((point) => ({
    sourceTable: point.source_table,
    tspShort: point.tsp_short,
    metadataId: point.metadata_id,
  }));
}

function watchlistStates(points: CriterionWatchlistPointRow[]): string[] {
  return Array.from(
    new Set(
      points
        .map((point) => point.state_abb)
        .filter((state): state is string => Boolean(state)),
    ),
  ).sort();
}

const observedGET = observedJsonRoute(
  {
    route: ROUTE,
    cacheHeader: CACHE_HEADER,
    cachePolicy: "no-store",
    owner: "gas",
    purpose: "Local-dev Criterion plant-level nomination report.",
    p95TargetMs: 5_000,
    freshnessSource: "Criterion PRODUCTION.PIPELINES.NOMINATION_POINTS export_timestamp",
  },
  async (request: Request): Promise<ObservedRouteResult> => {
    if (!isLocalOnlyFeatureEnabled()) {
      return localOnlyObservedNotFound();
    }

    const { searchParams } = new URL(request.url);
    const requestedDate = parseIsoDate(searchParams.get("date"));
    const invalidDate = searchParams.has("date") && !requestedDate;
    const stateParam = searchParams.get("states") ?? searchParams.get("state");
    let selectedStates = parseStates(stateParam);
    const includeZero = parseBoolean(searchParams.get("includeZero"));
    const limit = parseLimit(searchParams.get("limit"));
    const watchlistId = parseCriterionWatchlistId(searchParams.get("watchlistId"));
    const invalidWatchlistId = searchParams.has("watchlistId") && !watchlistId;

    if (invalidDate) {
      return {
        payload: { error: "date must be YYYY-MM-DD." },
        status: 400,
        rowCount: 0,
        dataAsOf: null,
      };
    }

    if (invalidWatchlistId) {
      return {
        payload: { error: "watchlistId must be a positive integer." },
        status: 400,
        rowCount: 0,
        dataAsOf: null,
      };
    }

    const watchlist = watchlistId ? await getCriterionWatchlist(watchlistId) : null;
    if (watchlistId && !watchlist) {
      return {
        payload: { error: "Watchlist not found." },
        status: 404,
        rowCount: 0,
        dataAsOf: null,
      };
    }

    const useStateFilter = !watchlist || Boolean(stateParam);
    if (watchlist && !stateParam) {
      selectedStates = watchlistStates(watchlist.points);
    }

    if (useStateFilter && selectedStates.length === 0) {
      return {
        payload: { error: "No valid state filters were provided." },
        status: 400,
        rowCount: 0,
        dataAsOf: null,
      };
    }

    if (watchlist && watchlist.points.length === 0) {
      return {
        payload: {
          sourceContract: SOURCE_CONTRACT,
          anchorDate: requestedDate,
          selectedStates,
          defaultStates: DEFAULT_STATES,
          stateOptions: Array.from(ALLOWED_STATES).sort(),
          includeZero,
          limit,
          watchlist: {
            watchlistId: watchlist.watchlist.watchlist_id,
            slug: watchlist.watchlist.slug,
            displayName: watchlist.watchlist.display_name,
            pointCount: 0,
          },
          rows: [],
          stateTotals: [],
          totalCount: 0,
          returnedCount: 0,
          summary: {
            plantPointCount: 0,
            stateCount: 0,
            today: 0,
            yesterday: 0,
            tomorrow: 0,
            dataAsOf: null,
          },
        },
        rowCount: 0,
        dataAsOf: null,
        headers: {
          "Cache-Control": CACHE_HEADER,
          "X-Criterion-Noms-Cache": "ORIGIN",
        },
      };
    }

    const sqlRows = await criterionSnowflakeQuery<CriterionNomsSqlRow>(
      criterionNomsSql.plantNoms,
      [
        requestedDate ?? "",
        watchlist ? "1" : "",
        useStateFilter ? "1" : "",
        selectedStates.join(","),
        JSON.stringify(watchlist ? watchlistPointKeys(watchlist.points) : []),
      ],
    );
    const normalizedRows = sqlRows.map(normalizeRow);
    const filteredRows = includeZero ? normalizedRows : normalizedRows.filter(hasAnyNom);
    const rows = filteredRows.slice(0, limit);
    const stateTotals = buildStateTotals(filteredRows);
    const dataAsOf = latestString(filteredRows.map((row) => row.dataAsOf));
    const anchorDate =
      latestString(filteredRows.map((row) => row.anchorDate)) ?? requestedDate ?? null;

    return {
      payload: {
        sourceContract: SOURCE_CONTRACT,
        anchorDate,
        selectedStates,
        defaultStates: DEFAULT_STATES,
        stateOptions: Array.from(ALLOWED_STATES).sort(),
        includeZero,
        limit,
        watchlist: watchlist
          ? {
              watchlistId: watchlist.watchlist.watchlist_id,
              slug: watchlist.watchlist.slug,
              displayName: watchlist.watchlist.display_name,
              pointCount: Number(watchlist.watchlist.point_count),
            }
          : null,
        rows,
        stateTotals,
        totalCount: filteredRows.length,
        returnedCount: rows.length,
        summary: {
          plantPointCount: filteredRows.length,
          stateCount: stateTotals.length,
          today: sumField(filteredRows, "today"),
          yesterday: sumField(filteredRows, "yesterday"),
          tomorrow: sumField(filteredRows, "tomorrow"),
          dataAsOf,
        },
      },
      rowCount: rows.length,
      dataAsOf,
      headers: {
        "Cache-Control": CACHE_HEADER,
        "X-Criterion-Noms-Cache": "ORIGIN",
      },
    };
  },
);

export function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
