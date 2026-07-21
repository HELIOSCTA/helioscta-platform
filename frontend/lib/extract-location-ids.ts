import { parse as parseYaml } from "yaml";

/**
 * Extracts and deduplicates locationId values from Genscape/WoodMac lasso output.
 * Imports can be JSON captured from DevTools or YAML watchlist files containing
 * `locationId` or `location_id` fields.
 */

export interface ExtractionResult {
  locationIds: number[];
  count: number;
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

function coerceLocationId(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

/** Recursively collect all location ID values from a parsed JSON/YAML structure. */
function collectLocationIds(data: unknown, ids: Set<number>): void {
  if (Array.isArray(data)) {
    for (const item of data) {
      collectLocationIds(item, ids);
    }
  } else if (data !== null && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["locationId", "location_id"]) {
      if (!(key in obj)) continue;
      const locationId = coerceLocationId(obj[key]);
      if (locationId !== null) ids.add(locationId);
    }

    for (const value of Object.values(obj)) {
      collectLocationIds(value, ids);
    }
  }
}

/**
 * Parses JSON/YAML text from Genscape/WoodMac lasso output and extracts all
 * `locationId` / `location_id` values, deduplicated in insertion order.
 *
 * @throws ExtractionError for empty input, malformed input, or zero IDs found
 */
export function extractLocationIds(input: string): ExtractionResult {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new ExtractionError(
      "No data provided. Paste the JSON output from the Genscape/WoodMac lasso tool."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    try {
      parsed = parseYaml(trimmed);
    } catch {
      throw new ExtractionError(
        "Invalid JSON or YAML format. Ensure the import data is complete."
      );
    }
  }

  const ids = new Set<number>();
  collectLocationIds(parsed, ids);

  if (ids.size === 0) {
    throw new ExtractionError("No locationId values found in the provided data.");
  }

  const locationIds = Array.from(ids);
  return { locationIds, count: locationIds.length };
}
