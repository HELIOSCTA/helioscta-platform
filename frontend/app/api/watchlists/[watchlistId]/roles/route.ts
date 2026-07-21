import { NextResponse, type NextRequest } from "next/server";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import {
  addWatchlistRoles,
  parseLocationRoleIds,
  removeWatchlistRoles,
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

function parseWatchlistId(value: string): number | null {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function parseRoleRequest(request: NextRequest) {
  const body = await request.json();
  const parsed = parseLocationRoleIds(body.locationRoleIds, true);
  if (!parsed.ok) {
    return {
      error: NextResponse.json({ error: parsed.error }, { status: 400 }),
      roleIds: [],
    };
  }
  return { error: null, roleIds: parsed.roleIds };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ watchlistId: string }> },
) {
  if (!isLocalOnlyFeatureEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { watchlistId } = await params;
  const id = parseWatchlistId(watchlistId);
  if (!id) {
    return NextResponse.json({ error: "Invalid watchlist ID" }, { status: 400 });
  }

  try {
    const parsed = await parseRoleRequest(request);
    if (parsed.error) return parsed.error;

    const watchlist = await addWatchlistRoles({
      watchlistId: id,
      roleIds: parsed.roleIds,
      userEmail: requestUser(request),
    });

    if (!watchlist) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, watchlist }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[watchlists/roles] POST error:", error);
    return NextResponse.json({ error: "Failed to add watchlist roles" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ watchlistId: string }> },
) {
  if (!isLocalOnlyFeatureEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { watchlistId } = await params;
  const id = parseWatchlistId(watchlistId);
  if (!id) {
    return NextResponse.json({ error: "Invalid watchlist ID" }, { status: 400 });
  }

  try {
    const parsed = await parseRoleRequest(request);
    if (parsed.error) return parsed.error;

    const watchlist = await removeWatchlistRoles({
      watchlistId: id,
      roleIds: parsed.roleIds,
      userEmail: requestUser(request),
    });

    if (!watchlist) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, watchlist }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[watchlists/roles] DELETE error:", error);
    return NextResponse.json({ error: "Failed to remove watchlist roles" }, { status: 500 });
  }
}
