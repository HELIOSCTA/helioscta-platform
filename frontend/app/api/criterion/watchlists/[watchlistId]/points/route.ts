import { NextResponse, type NextRequest } from "next/server";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import {
  addCriterionWatchlistPoints,
  parseCriterionPointInputs,
  parseCriterionWatchlistId,
  removeCriterionWatchlistPoints,
  validateCriterionPlantPoints,
  type ParsedCriterionPoint,
  type ValidatedCriterionPoint,
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
    "X-Helios-Route": "/api/criterion/watchlists/[watchlistId]/points",
  };
}

async function routeWatchlistId(params: Promise<{ watchlistId: string }>): Promise<number | null> {
  const { watchlistId } = await params;
  return parseCriterionWatchlistId(watchlistId);
}

interface PointRequestResult<TPoint> {
  error: NextResponse | null;
  points: TPoint[];
}

async function parseParsedPointRequest(
  request: NextRequest,
): Promise<PointRequestResult<ParsedCriterionPoint>> {
  const body = await request.json();
  const parsed = parseCriterionPointInputs(body.points, true);
  if (!parsed.ok) {
    return {
      error: NextResponse.json({ error: parsed.error }, { status: 400 }),
      points: [],
    };
  }

  return { error: null, points: parsed.points };
}

async function parseValidatedPointRequest(
  request: NextRequest,
): Promise<PointRequestResult<ValidatedCriterionPoint>> {
  const parsed = await parseParsedPointRequest(request);
  if (parsed.error) return { error: parsed.error, points: [] };

  const validation = await validateCriterionPlantPoints(parsed.points);
  if (validation.invalidPoints.length > 0) {
    return {
      error: NextResponse.json(
        {
          error: "One or more Criterion points were not valid power plant nomination points.",
          invalidPoints: validation.invalidPoints,
        },
        { status: 400 },
      ),
      points: [],
    };
  }

  return { error: null, points: validation.validPoints };
}

export async function POST(
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
    const parsed = await parseValidatedPointRequest(request);
    if (parsed.error) return parsed.error;

    const watchlist = await addCriterionWatchlistPoints({
      watchlistId: id,
      points: parsed.points,
      userEmail: requestUser(request),
    });

    if (!watchlist) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...watchlist }, { headers: responseHeaders() });
  } catch (error) {
    console.error("[criterion-watchlists/points] POST error:", error);
    return NextResponse.json({ error: "Failed to add Criterion watchlist points" }, { status: 500 });
  }
}

export async function DELETE(
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
    const parsed = await parseParsedPointRequest(request);
    if (parsed.error) return parsed.error;

    const watchlist = await removeCriterionWatchlistPoints({
      watchlistId: id,
      points: parsed.points,
    });

    if (!watchlist) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...watchlist }, { headers: responseHeaders() });
  } catch (error) {
    console.error("[criterion-watchlists/points] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to remove Criterion watchlist points" },
      { status: 500 },
    );
  }
}
