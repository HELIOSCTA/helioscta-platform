import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

import type { NavPositionsClientAuth } from "@/lib/appAuthTypes";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";

export const AUTH_SESSION_COOKIE = "helios_app_session";
export const OAUTH_STATE_COOKIE = "helios_oauth_state";
export const OAUTH_NONCE_COOKIE = "helios_oauth_nonce";
export const OAUTH_CODE_VERIFIER_COOKIE = "helios_oauth_code_verifier";
export const OAUTH_RETURN_TO_COOKIE = "helios_oauth_return_to";

const DEFAULT_SIGN_IN_RETURN_TO = "/?section=nav-positions";
const MAX_SESSION_SECONDS = 8 * 60 * 60;

export interface AppAuthSession {
  email: string;
  name: string | null;
  username: string | null;
  issuedAt: string;
  expiresAt: string;
}

interface FeatureAccess {
  authConfigured: boolean;
  signedIn: boolean;
  allowed: boolean;
  localBypass: boolean;
  serviceBypass: boolean;
  userEmail: string | null;
  deniedReason: string | null;
}

interface VercelAuthConfig {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
}

export function isSecureCookieRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getVercelAuthConfig(): VercelAuthConfig | null {
  const clientId = process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID?.trim();
  const clientSecret = process.env.VERCEL_APP_CLIENT_SECRET?.trim();
  const sessionSecret = process.env.HELIOS_APP_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();

  if (!clientId || !clientSecret || !sessionSecret) return null;

  return { clientId, clientSecret, sessionSecret };
}

export function randomBase64Url(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256Base64Url(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return DEFAULT_SIGN_IN_RETURN_TO;

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return DEFAULT_SIGN_IN_RETURN_TO;

  try {
    const url = new URL(trimmed, "https://helioscta.local");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_SIGN_IN_RETURN_TO;
  }
}

export function authCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: isSecureCookieRuntime(),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function clearAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: isSecureCookieRuntime(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export function createSessionCookieValue({
  email,
  name,
  username,
  expiresInSeconds,
}: {
  email: string;
  name: string | null;
  username: string | null;
  expiresInSeconds: number;
}): string {
  const config = getVercelAuthConfig();
  if (!config) throw new Error("App auth is not configured.");

  const maxAge = clampSessionSeconds(expiresInSeconds);
  const issuedAtMs = Date.now();
  const session: AppAuthSession = {
    email: normalizeEmail(email),
    name,
    username,
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(issuedAtMs + maxAge * 1000).toISOString(),
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = signPayload(payload, config.sessionSecret);
  return `${payload}.${signature}`;
}

export async function getCurrentAppSession(): Promise<AppAuthSession | null> {
  const cookieStore = await cookies();
  return verifySessionCookie(cookieStore.get(AUTH_SESSION_COOKIE)?.value ?? null);
}

export function getCurrentAppSessionFromRequest(request: Request): AppAuthSession | null {
  return verifySessionCookie(parseCookieHeader(request.headers.get("cookie")).get(AUTH_SESSION_COOKIE) ?? null);
}

export async function getNavPositionsClientAuth(): Promise<NavPositionsClientAuth> {
  const access = await getNavPositionsAccess();
  return toNavPositionsClientAuth(access);
}

export async function getNavPositionsAccess(): Promise<FeatureAccess> {
  const session = await getCurrentAppSession();
  return evaluateNavPositionsAccess(session, false);
}

export function getNavPositionsAccessFromRequest(request: Request): FeatureAccess {
  const session = getCurrentAppSessionFromRequest(request);
  return evaluateNavPositionsAccess(session, hasValidNavPositionsServiceToken(request));
}

export function navPositionsDeniedResponse(): Response {
  return Response.json(
    { error: "Not found" },
    {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
        "X-Helios-Cache-Policy": "no-store, unauthorized",
      },
    },
  );
}

export function toNavPositionsClientAuth(access: FeatureAccess): NavPositionsClientAuth {
  return {
    authConfigured: access.authConfigured,
    signedIn: access.signedIn,
    allowed: access.allowed,
    localBypass: access.localBypass,
    userEmail: access.userEmail,
    signInUrl: `/api/auth/authorize?returnTo=${encodeURIComponent(DEFAULT_SIGN_IN_RETURN_TO)}`,
    signOutUrl: "/api/auth/signout?returnTo=/",
  };
}

function evaluateNavPositionsAccess(
  session: AppAuthSession | null,
  serviceBypass: boolean,
): FeatureAccess {
  const authConfigured = Boolean(getVercelAuthConfig());
  const localBypass = isNavPositionsLocalBypassEnabled();
  const userEmail = session?.email ?? null;

  if (localBypass || serviceBypass) {
    return {
      authConfigured,
      signedIn: Boolean(session),
      allowed: true,
      localBypass,
      serviceBypass,
      userEmail,
      deniedReason: null,
    };
  }

  if (!authConfigured) {
    return {
      authConfigured,
      signedIn: Boolean(session),
      allowed: false,
      localBypass,
      serviceBypass,
      userEmail,
      deniedReason: "auth-not-configured",
    };
  }

  if (!session) {
    return {
      authConfigured,
      signedIn: false,
      allowed: false,
      localBypass,
      serviceBypass,
      userEmail: null,
      deniedReason: "not-signed-in",
    };
  }

  const allowedEmails = navPositionsAllowedEmails();
  if (!allowedEmails.size) {
    return {
      authConfigured,
      signedIn: true,
      allowed: false,
      localBypass,
      serviceBypass,
      userEmail,
      deniedReason: "allowlist-empty",
    };
  }

  const allowed = allowedEmails.has(session.email);
  return {
    authConfigured,
    signedIn: true,
    allowed,
    localBypass,
    serviceBypass,
    userEmail,
    deniedReason: allowed ? null : "email-not-allowed",
  };
}

function isNavPositionsLocalBypassEnabled(): boolean {
  return (
    isLocalOnlyFeatureEnabled() &&
    process.env.HELIOS_NAV_POSITIONS_AUTH_LOCAL_BYPASS !== "0"
  );
}

function hasValidNavPositionsServiceToken(request: Request): boolean {
  const expected = process.env.HELIOS_NAV_POSITIONS_SERVICE_TOKEN?.trim();
  if (!expected) return false;

  const headerToken =
    request.headers.get("x-helios-nav-positions-token") ??
    bearerToken(request.headers.get("authorization"));
  return constantTimeEqual(headerToken, expected);
}

function navPositionsAllowedEmails(): Set<string> {
  const raw =
    process.env.HELIOS_NAV_POSITIONS_ALLOWED_EMAILS ??
    process.env.NAV_POSITIONS_ALLOWED_EMAILS ??
    "";
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((email) => normalizeEmail(email))
      .filter(Boolean),
  );
}

function verifySessionCookie(value: string | null): AppAuthSession | null {
  const config = getVercelAuthConfig();
  if (!config || !value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  if (!constantTimeEqual(signature, signPayload(payload, config.sessionSecret))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AppAuthSession>;
    const email = normalizeEmail(parsed.email);
    if (!email || !parsed.expiresAt) return null;
    if (Date.parse(parsed.expiresAt) <= Date.now()) return null;

    return {
      email,
      name: typeof parsed.name === "string" ? parsed.name : null,
      username: typeof parsed.username === "string" ? parsed.username : null,
      issuedAt: typeof parsed.issuedAt === "string" ? parsed.issuedAt : "",
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function parseCookieHeader(value: string | null): Map<string, string> {
  const result = new Map<string, string>();
  if (!value) return result;

  for (const part of value.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) continue;
    const name = part.slice(0, separatorIndex).trim();
    const cookieValue = part.slice(separatorIndex + 1).trim();
    if (name) result.set(name, cookieValue);
  }

  return result;
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function bearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function constantTimeEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function clampSessionSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 60 * 60;
  return Math.min(Math.trunc(value), MAX_SESSION_SECONDS);
}
