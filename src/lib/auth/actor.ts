import "server-only";

import { cache } from "react";

import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/auth/permissions";
import { readSession } from "@/lib/auth/session";

/**
 * Data Access Layer for the authenticated user (Next.js authentication guide:
 * "create a Data Access Layer to centralise your authorization logic").
 *
 * The session cookie only carries a staff id. Everything else is read from the
 * database on each request, so a role change, a deleted account, or a
 * password reset takes effect on the next call instead of at token expiry.
 *
 * `cache()` de-duplicates the lookup within a single request.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await readSession();
  if (!session) return null;

  const staff = await prisma.staff.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      name: true,
      email: true,
      department: { select: { name: true } },
      role: true,
      sessionVersion: true,
    },
  });

  // Signed out, or the password was changed/reset after this cookie was issued.
  if (!staff || staff.sessionVersion !== session.sv) return null;

  return {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    department: staff.department.name,
    role: staff.role,
  };
});

/** 401 when there is no valid session. Every protected route calls this first. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();

  if (!actor) {
    throw ApiError.unauthenticated(
      "Not signed in. Sign in via POST /api/auth/login and send the session cookie.",
    );
  }

  return actor;
}

export function toActorDto(actor: Actor) {
  return {
    id: actor.id,
    name: actor.name,
    email: actor.email,
    department: actor.department,
    role: actor.role,
  };
}