import { NextResponse, type NextRequest } from "next/server";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import {
  createWatchlist,
  listActiveWatchlists,
  parseLocationRoleIds,
  parseSignOverrides,
  slugifyWatchlistName,
} from "@/lib/watchlists-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "iad1";
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

export async function GET() {
  if (!isLocalOnlyFeatureEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const watchlists = await listActiveWatchlists();
    return NextResponse.json(
      { watchlists },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Helios-Route": "/api/watchlists",
        },
      },
    );
  } catch (error) {
    console.error("[watchlists] GET error:", error);
    return NextResponse.json({ error: "Failed to list watchlists" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isLocalOnlyFeatureEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { name, locationRoleIds = [], signOverrides } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (!slugifyWatchlistName(name)) {
      return NextResponse.json(
        { error: "name must include at least one letter or number" },
        { status: 400 },
      );
    }

    const parsedRoleIds = parseLocationRoleIds(locationRoleIds);
    if (!parsedRoleIds.ok) {
      return NextResponse.json({ error: parsedRoleIds.error }, { status: 400 });
    }

    const parsedSignOverrides = parseSignOverrides(signOverrides);
    if (!parsedSignOverrides.ok) {
      return NextResponse.json({ error: parsedSignOverrides.error }, { status: 400 });
    }

    const watchlist = await createWatchlist({
      name,
      roleIds: parsedRoleIds.roleIds,
      signOverrides: parsedSignOverrides.signOverrides,
      userEmail: requestUser(request),
    });

    return NextResponse.json(
      {
        watchlist,
        watchlist_id: watchlist.watchlist_id,
        slug: watchlist.slug,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
          "X-Helios-Route": "/api/watchlists",
        },
      },
    );
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError.code === "23505") {
      return NextResponse.json(
        { error: "A watchlist with that name already exists" },
        { status: 409 },
      );
    }
    console.error("[watchlists] POST error:", error);
    return NextResponse.json({ error: "Failed to create watchlist" }, { status: 500 });
  }
}
