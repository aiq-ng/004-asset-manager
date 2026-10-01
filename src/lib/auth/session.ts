import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { getEnv } from "@/lib/env";

/**
 * Stateless session cookie (HS256-signed JWT), per the Next.js authentication
 * guide. The cookie carries only the staff id and the account's
 * `sessionVersion`; role and email are re-read from the database on every
 * request so a demotion or deletion takes effect immediately instead of waiting
 * for the token to expire. `sessionVersion` is what makes signing out real:
 * bumping it invalidates tokens that were already handed out.
 */
export const SESSION_COOKIE = "inv-cat-session";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function secret(): Uint8Array {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

export interface SessionPayload {
  /** Staff id. */
  sub: string;
  /** Must match `Staff.sessionVersion` for the token to be accepted. */
  sv: number;
}

export async function createSession(staffId: string, sessionVersion: number): Promise<void> {
  const token = await new SignJWT({ sub: staffId, sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());

  const store = await cookies();

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.APP_URL?.startsWith("https://"),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });

    return typeof payload.sub === "string" && typeof payload.sv === "number"
      ? { sub: payload.sub, sv: payload.sv }
      : null;
  } catch {
    // Expired, tampered with, or signed with a different SESSION_SECRET.
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}