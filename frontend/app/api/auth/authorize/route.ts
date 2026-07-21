import { NextResponse, type NextRequest } from "next/server";

import {
  OAUTH_CODE_VERIFIER_COOKIE,
  OAUTH_NONCE_COOKIE,
  OAUTH_RETURN_TO_COOKIE,
  OAUTH_STATE_COOKIE,
  authCookieOptions,
  getVercelAuthConfig,
  randomBase64Url,
  safeReturnTo,
  sha256Base64Url,
} from "@/lib/server/appAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<Response> {
  const config = getVercelAuthConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/auth/error", request.url));
  }

  const state = randomBase64Url();
  const nonce = randomBase64Url();
  const codeVerifier = randomBase64Url(48);
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const redirectUri = `${request.nextUrl.origin}/api/auth/callback`;
  const authUrl = new URL("https://vercel.com/oauth/authorize");
  authUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: sha256Base64Url(codeVerifier),
    code_challenge_method: "S256",
  }).toString();

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, authCookieOptions(10 * 60));
  response.cookies.set(OAUTH_NONCE_COOKIE, nonce, authCookieOptions(10 * 60));
  response.cookies.set(OAUTH_CODE_VERIFIER_COOKIE, codeVerifier, authCookieOptions(10 * 60));
  response.cookies.set(OAUTH_RETURN_TO_COOKIE, returnTo, authCookieOptions(10 * 60));
  return response;
}
