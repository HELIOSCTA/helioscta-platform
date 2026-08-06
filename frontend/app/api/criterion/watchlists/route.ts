import { NextResponse, type NextRequest } from "next/server";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import {
  createCriterionWatchlist,
  listCriterionWatchlists,
  parseCriterionFilterConfig,
  parseCriterionPointInputs,
  slugifyCriterionWatchlistName,
  validateCriterionPlantPoints,
} from "@/lib/criterion/criterionWatchlistsDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_USER = "frontend";
const ROUTE = "/api/criterion/watchlists";

function requestUser(request: NextRequest): string {
  return (
    request.headers.get("x-vercel-user-email") ??
    request.headers.get("x-forwarded-email") ??
    process.env.HELIOS_WATCHLIST_DEFAULT_USER ??
    DEFAULT_USER
  );
}

function responseHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Helios-Route": ROUTE,
  };
}

export async function GET() {
  if (!isLocalOnlyFeatureEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const watchlists = await listCriterionWatchlists();
    return NextResponse.json({ watchlists }, { headers: responseHeaders() });
  } catch (error) {
    console.error("[criterion-watchlists] GET error:", error);
    return NextResponse.json({ error: "Failed to list Criterion watchlists" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isLocalOnlyFeatureEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const name = body.name ?? body.displayName ?? body.display_name;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!slugifyCriterionWatchlistName(name)) {
      return NextResponse.json(
        { error: "name must include at least one letter or number" },
        { status: 400 },
      );
    }

    const parsedFilterConfig = parseCriterionFilterConfig(body.filterConfig ?? body.filter_config);
    if (!parsedFilterConfig.ok) {
      return NextResponse.json({ error: parsedFilterConfig.error }, { status: 400 });
    }

    const parsedPoints = parseCriterionPointInputs(body.points);
    if (!parsedPoints.ok) {
      return NextResponse.json({ error: parsedPoints.error }, { status: 400 });
    }

    const validation = await validateCriterionPlantPoints(parsedPoints.points);
    if (validation.invalidPoints.length > 0) {
      return NextResponse.json(
        {
          error: "One or more Criterion points were not valid power plant nomination points.",
          invalidPoints: validation.invalidPoints,
        },
        { status: 400 },
      );
    }

    const watchlist = await createCriterionWatchlist({
      name,
      filterConfig: parsedFilterConfig.filterConfig,
      points: validation.validPoints,
      userEmail: requestUser(request),
    });

    return NextResponse.json(
      {
        watchlist: watchlist?.watchlist,
        points: watchlist?.points ?? [],
        watchlist_id: watchlist?.watchlist.watchlist_id,
        slug: watchlist?.watchlist.slug,
      },
      { status: 201, headers: responseHeaders() },
    );
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError.code === "23505") {
      return NextResponse.json(
        { error: "A Criterion watchlist with that name already exists" },
        { status: 409 },
      );
    }
    console.error("[criterion-watchlists] POST error:", error);
    return NextResponse.json({ error: "Failed to create Criterion watchlist" }, { status: 500 });
  }
}
