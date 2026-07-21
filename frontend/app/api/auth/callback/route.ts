import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_SESSION_COOKIE,
  OAUTH_CODE_VERIFIER_COOKIE,
  OAUTH_NONCE_COOKIE,
  OAUTH_RETURN_TO_COOKIE,
  OAUTH_STATE_COOKIE,
  authCookieOptions,
  clampSessionSeconds,
  clearAuthCookieOptions,
  createSessionCookieValue,
  getVercelAuthConfig,
  safeReturnTo,
} from "@/lib/server/appAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface TokenResponse {
  access_token: string;
  id_token?: string;
  expires_in?: number;
}

interface UserInfoResponse {
  email?: string;
  name?: string;
  preferred_username?: string;
}

export async function GET(request: NextRequest): Promise<Response> {
  const config = getVercelAuthConfig();
  if (!config) return redirectToAuthError(request, "auth-not-configured");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = request.cookies.get(OAUTH_CODE_VERIFIER_COOKIE)?.value;
  const returnTo = safeReturnTo(request.cookies.get(OAUTH_RETURN_TO_COOKIE)?.value);

  if (!code) return redirectToAuthError(request, "missing-code", { hasState: Boolean(state) });
  if (!state) return redirectToAuthError(request, "missing-state", { hasCode: true });
  if (!storedState) return redirectToAuthError(request, "missing-state-cookie");
  if (state !== storedState) return redirectToAuthError(request, "state-mismatch");
  if (!codeVerifier) return redirectToAuthError(request, "missing-code-verifier-cookie");

  try {
    const token = await exchangeCodeForToken({
      code,
      codeVerifier,
      origin: request.nextUrl.origin,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    const user = await fetchUserInfo(token.access_token);
    const tokenNonce = decodeJwtClaim(token.id_token, "nonce");
    const storedNonce = request.cookies.get(OAUTH_NONCE_COOKIE)?.value;
    if (!storedNonce) {
      return redirectToAuthError(request, "missing-nonce-cookie", {
        hasIdToken: Boolean(token.id_token),
      });
    }
    if (!token.id_token) return redirectToAuthError(request, "missing-id-token");
    if (!tokenNonce) return redirectToAuthError(request, "missing-token-nonce");
    if (tokenNonce !== storedNonce) return redirectToAuthError(request, "nonce-mismatch");
    if (!user.email) return redirectToAuthError(request, "missing-user-email");

    const expiresInSeconds = clampSessionSeconds(token.expires_in ?? 60 * 60);
    const sessionCookie = createSessionCookieValue({
      email: user.email,
      name: user.name ?? null,
      username: user.preferred_username ?? null,
      expiresInSeconds,
    });

    const response = NextResponse.redirect(new URL(returnTo, request.url));
    response.cookies.set(AUTH_SESSION_COOKIE, sessionCookie, authCookieOptions(expiresInSeconds));
    clearOAuthCookies(response);
    return response;
  } catch (error) {
    console.error("[auth] Vercel OAuth callback failed:", error);
    return redirectToAuthError(request, "oauth-callback-exception");
  }
}

async function exchangeCodeForToken({
  code,
  codeVerifier,
  origin,
  clientId,
  clientSecret,
}: {
  code: string;
  codeVerifier: string;
  origin: string;
  clientId: string;
  clientSecret: string;
}): Promise<TokenResponse> {
  const response = await fetch("https://api.vercel.com/login/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      redirect_uri: `${origin}/api/auth/callback`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed with ${response.status}`);
  }

  return (await response.json()) as TokenResponse;
}

async function fetchUserInfo(accessToken: string): Promise<UserInfoResponse> {
  const response = await fetch("https://api.vercel.com/login/oauth/userinfo", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Userinfo failed with ${response.status}`);
  }

  return (await response.json()) as UserInfoResponse;
}

function decodeJwtClaim(token: string | undefined, claim: string): string | null {
  if (!token) return null;

  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    const value = decoded[claim];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function clearOAuthCookies(response: NextResponse): void {
  response.cookies.set(OAUTH_STATE_COOKIE, "", clearAuthCookieOptions());
  response.cookies.set(OAUTH_NONCE_COOKIE, "", clearAuthCookieOptions());
  response.cookies.set(OAUTH_CODE_VERIFIER_COOKIE, "", clearAuthCookieOptions());
  response.cookies.set(OAUTH_RETURN_TO_COOKIE, "", clearAuthCookieOptions());
}

function redirectToAuthError(
  request: NextRequest,
  reason: string,
  details: Record<string, boolean | number | string | null> = {},
): Response {
  console.warn(
    JSON.stringify({
      event: "auth_callback_rejected",
      reason,
      host: request.nextUrl.host,
      hasCode: request.nextUrl.searchParams.has("code"),
      hasState: request.nextUrl.searchParams.has("state"),
      ...details,
    }),
  );

  const url = new URL("/auth/error", request.url);
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}
