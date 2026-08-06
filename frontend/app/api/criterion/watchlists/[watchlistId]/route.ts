import { NextResponse, type NextRequest } from "next/server";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import {
  getCriterionWatchlist,
  parseCriterionFilterConfig,
  parseCriterionPointInputs,
  parseCriterionWatchlistId,
  softDeleteCriterionWatchlist,
  slugifyCriterionWatchlistName,
  updateCriterionWatchlist,
  validateCriterionPlantPoints,
} from "@/lib/criterion/criterionWatchlistsDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_USER = "frontend";

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
    "X-Helios-Route": "/api/criterion/watchlists/[watchlistId]",
  };
}

async function routeWatchlistId(params: Promise<{ watchlistId: string }>): Promise<number | null> {
  const { watchlistId } = await params;
  return parseCriterionWatchlistId(watchlistId);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ watchlistId: string }> },
) {
  if (!isLocalOnlyFeatureEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const id = await routeWatchlistId(params);
  if (!id) {
    return NextResponse.json({ error: "Invalid watchlist ID" }, { status: 400 });
  }

  try {
    const watchlist = await getCriterionWatchlist(id);
    if (!watchlist) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    return NextResponse.json(watchlist, { headers: responseHeaders() });
  } catch (error) {
    console.error("[criterion-watchlists] GET one error:", error);
    return NextResponse.json({ error: "Failed to load Criterion watchlist" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ watchlistId: string }> },
) {
  if (!isLocalOnlyFeatureEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const id = await routeWatchlistId(params);
  if (!id) {
    return NextResponse.json({ error: "Invalid watchlist ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const name = body.name ?? body.displayName ?? body.display_name;
    let hasUpdate = false;
    let parsedName: string | undefined;
    let parsedFilterConfig: Record<string, unknown> | undefined;
    let parsedPoints:
      | Awaited<ReturnType<typeof validateCriterionPlantPoints>>["validPoints"]
      | undefined;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      if (!slugifyCriterionWatchlistName(name)) {
        return NextResponse.json(
          { error: "name must include at least one letter or number" },
          { status: 400 },
        );
      }
      parsedName = name;
      hasUpdate = true;
    }

    if (body.filterConfig !== undefined || body.filter_config !== undefined) {
      const parsed = parseCriterionFilterConfig(body.filterConfig ?? body.filter_config);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      parsedFilterConfig = parsed.filterConfig;
      hasUpdate = true;
    }

    if (body.points !== undefined) {
      const parsed = parseCriterionPointInputs(body.points);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      const validation = await validateCriterionPlantPoints(parsed.points);
      if (validation.invalidPoints.length > 0) {
        return NextResponse.json(
          {
            error: "One or more Criterion points were not valid power plant nomination points.",
            invalidPoints: validation.invalidPoints,
          },
          { status: 400 },
        );
      }
      parsedPoints = validation.validPoints;
      hasUpdate = true;
    }

    if (!hasUpdate) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const watchlist = await updateCriterionWatchlist({
      watchlistId: id,
      name: parsedName,
      filterConfig: parsedFilterConfig,
      points: parsedPoints,
      userEmail: requestUser(request),
    });

    if (!watchlist) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...watchlist }, { headers: responseHeaders() });
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError.code === "23505") {
      return NextResponse.json(
        { error: "A Criterion watchlist with that name already exists" },
        { status: 409 },
      );
    }
    console.error("[criterion-watchlists] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update Criterion watchlist" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ watchlistId: string }> },
) {
  if (!isLocalOnlyFeatureEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const id = await routeWatchlistId(params);
  if (!id) {
    return NextResponse.json({ error: "Invalid watchlist ID" }, { status: 400 });
  }

  try {
    const deleted = await softDeleteCriterionWatchlist(id);
    if (!deleted) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true }, { headers: responseHeaders() });
  } catch (error) {
    console.error("[criterion-watchlists] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete Criterion watchlist" }, { status: 500 });
  }
}
