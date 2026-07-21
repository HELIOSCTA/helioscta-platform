import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_SESSION_COOKIE,
  OAUTH_CODE_VERIFIER_COOKIE,
  OAUTH_NONCE_COOKIE,
  OAUTH_RETURN_TO_COOKIE,
  OAUTH_STATE_COOKIE,
  clearAuthCookieOptions,
  safeReturnTo,
} from "@/lib/server/appAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<Response> {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo") ?? "/");
  const response = NextResponse.redirect(new URL(returnTo, request.url));
  clearCookies(response);
  return response;
}

export async function POST(): Promise<Response> {
  const response = NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    },
  );
  clearCookies(response);
  return response;
}

function clearCookies(response: NextResponse): void {
  response.cookies.set(AUTH_SESSION_COOKIE, "", clearAuthCookieOptions());
  response.cookies.set(OAUTH_STATE_COOKIE, "", clearAuthCookieOptions());
  response.cookies.set(OAUTH_NONCE_COOKIE, "", clearAuthCookieOptions());
  response.cookies.set(OAUTH_CODE_VERIFIER_COOKIE, "", clearAuthCookieOptions());
  response.cookies.set(OAUTH_RETURN_TO_COOKIE, "", clearAuthCookieOptions());
}
