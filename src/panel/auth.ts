import type { PanelRole } from "./state";

export interface PanelEnv {
  readonly AUTH_SECRET?: string;
  readonly MC_PASSCODE?: string;
  readonly MODERATOR_PASSCODE?: string;
}

export interface AuthState {
  readonly role?: Exclude<PanelRole, "attendee">;
  readonly configured: boolean;
}

const authCookieNames = {
  mc: "panel_auth_mc",
  moderator: "panel_auth_moderator",
} as const satisfies Record<Exclude<PanelRole, "attendee">, string>;
const attendeeCookieName = "panel_attendee";
const oneWeekSeconds = 60 * 60 * 24 * 7;

export function rolePasscodeConfigured(role: Exclude<PanelRole, "attendee">, env: PanelEnv): boolean {
  return getExpectedPasscode(role, env) !== undefined && env.AUTH_SECRET !== undefined;
}

export async function createRoleCookie(role: Exclude<PanelRole, "attendee">, env: PanelEnv, secure: boolean): Promise<string> {
  const value = await signValue(role, requireAuthSecret(env));
  return `${authCookieNames[role]}=${value}; HttpOnly; SameSite=Lax;${secureAttribute(secure)} Path=/; Max-Age=${oneWeekSeconds}`;
}

export async function readAuthState(request: Request, env: PanelEnv): Promise<AuthState> {
  const configured = env.AUTH_SECRET !== undefined;

  if (!configured) {
    return { configured: false };
  }

  const role = await readRequestRole(request, env.AUTH_SECRET);

  return role ? { configured, role } : { configured };
}

export function createLogoutCookies(secure: boolean): readonly string[] {
  return Object.values(authCookieNames).map((name) => `${name}=; HttpOnly; SameSite=Lax;${secureAttribute(secure)} Path=/; Max-Age=0`);
}

export async function passcodeMatches(role: Exclude<PanelRole, "attendee">, passcode: string, env: PanelEnv): Promise<boolean> {
  const expected = getExpectedPasscode(role, env);
  return expected !== undefined && (await constantTimeEqual(passcode, expected));
}

export function getOrCreateAttendeeId(request: Request): { readonly id: string; readonly cookie?: string } {
  const existingId = readCookie(request, attendeeCookieName);

  if (existingId && /^[a-f\d-]{36}$/u.test(existingId)) {
    return { id: existingId };
  }

  const id = globalThis.crypto.randomUUID();
  return {
    id,
    cookie: `${attendeeCookieName}=${id}; HttpOnly; SameSite=Lax;${secureAttribute(new URL(request.url).protocol === "https:")} Path=/; Max-Age=${oneWeekSeconds}`,
  };
}

export function getClientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "local";
}

function getExpectedPasscode(role: Exclude<PanelRole, "attendee">, env: PanelEnv): string | undefined {
  return role === "mc" ? env.MC_PASSCODE : env.MODERATOR_PASSCODE;
}

async function verifyRoleCookie(value: string, secret: string): Promise<Exclude<PanelRole, "attendee"> | undefined> {
  const [role, signature] = value.split(".");

  if ((role !== "mc" && role !== "moderator") || !signature) {
    return undefined;
  }

  const expected = await signPayload(role, secret);
  return (await constantTimeEqual(signature, expected)) ? role : undefined;
}

async function readRequestRole(request: Request, secret: string): Promise<Exclude<PanelRole, "attendee"> | undefined> {
  const preferredRole = requestedRole(new URL(request.url).pathname);
  const roles = preferredRole ? [preferredRole] : (Object.keys(authCookieNames) as Array<Exclude<PanelRole, "attendee">>);

  for (const role of roles) {
    const cookie = readCookie(request, authCookieNames[role]);
    const verifiedRole = cookie ? await verifyRoleCookie(cookie, secret) : undefined;

    if (verifiedRole === role) {
      return role;
    }
  }

  return undefined;
}

function requestedRole(pathname: string): Exclude<PanelRole, "attendee"> | undefined {
  if (pathname === "/mc" || pathname.startsWith("/mc/")) {
    return "mc";
  }

  if (pathname === "/moderate" || pathname.startsWith("/moderate/")) {
    return "moderator";
  }

  return undefined;
}

async function signValue(value: string, secret: string): Promise<string> {
  return `${value}.${await signPayload(value, secret)}`;
}

async function signPayload(value: string, secret: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncode(signature);
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  await Promise.resolve();
  return difference === 0;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function requireAuthSecret(env: PanelEnv): string {
  if (!env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET is required to create a role cookie.");
  }

  return env.AUTH_SECRET;
}

function secureAttribute(secure: boolean): string {
  return secure ? " Secure;" : "";
}

function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");

  if (!cookie) {
    return undefined;
  }

  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");

    if (rawKey === name) {
      return rawValue.join("=");
    }
  }

  return undefined;
}
