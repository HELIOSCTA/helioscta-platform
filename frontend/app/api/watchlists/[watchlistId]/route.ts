import { NextResponse, type NextRequest } from "next/server";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import {
  parseLocationRoleIds,
  parseSignOverrides,
  softDeleteWatchlist,
  updateWatchlist,
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

export async function PATCH(
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
    const body = await request.json();
    const { name, locationRoleIds, signOverrides } = body;

    let parsedRoleIds: number[] | undefined;
    let parsedSignOverrides: Record<string, number> | undefined;
    let hasUpdate = false;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      hasUpdate = true;
    }

    if (locationRoleIds !== undefined) {
      const parseResult = parseLocationRoleIds(locationRoleIds);
      if (!parseResult.ok) {
        return NextResponse.json({ error: parseResult.error }, { status: 400 });
      }
      parsedRoleIds = parseResult.roleIds;
      hasUpdate = true;
    }

    if (signOverrides !== undefined) {
      const parseResult = parseSignOverrides(signOverrides);
      if (!parseResult.ok) {
        return NextResponse.json({ error: parseResult.error }, { status: 400 });
      }
      parsedSignOverrides = parseResult.signOverrides;
      hasUpdate = true;
    }

    if (!hasUpdate) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const watchlist = await updateWatchlist({
      watchlistId: id,
      name,
      roleIds: parsedRoleIds,
      signOverrides: parsedSignOverrides,
      userEmail: requestUser(request),
    });

    if (!watchlist) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, watchlist }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError.code === "23505") {
      return NextResponse.json(
        { error: "A watchlist with that name already exists" },
        { status: 409 },
      );
    }
    console.error("[watchlists] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update watchlist" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
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
    const deleted = await softDeleteWatchlist(id);
    if (!deleted) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[watchlists] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete watchlist" }, { status: 500 });
  }
}
