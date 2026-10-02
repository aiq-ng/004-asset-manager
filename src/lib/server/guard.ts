import "server-only";

import { cache } from "react";
import { forbidden, redirect } from "next/navigation";

import { getActor } from "@/lib/auth/actor";
import { can, type Actor, type Permission } from "@/lib/auth/permissions";

/**
 * Route guard for the authenticated part of the app.
 *
 * The API has its own guards (`apiRoute` / `permissionRoute` in `lib/api.ts`).
 * This is the page-side equivalent: pages read data directly through the
 * services, so they need their own way to guarantee a session exists before any
 * query runs.
 *
 * `cache()` means the guard and the page that renders the actor share a single
 * database lookup per request.
 */
export const requirePageActor = cache(async (): Promise<Actor> => {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
});

/**
 * Optional actor, for chrome that renders differently when signed in (the login
 * link in the masthead, for instance).
 */
export const readPageActor = getActor;

/**
 * Guard for a route the backend reserves entirely.
 *
 * Pages read through the services, which authorise individual *writes* but not
 * reads — the read restriction lives in `permissionRoute` in the API. A page is
 * not an API route, so without this a signed-in user could reach the audit trail
 * by typing the URL even though `GET /api/audit-logs` answers them 403.
 *
 * Only use it where the restriction is on the whole route. Controls on a page
 * that most roles may read (the "Register asset" button, say) are hidden by
 * capability instead, because hiding a button is a usability decision while
 * hiding a page is an authorization one.
 *
 * `forbidden()` renders the app's 403 boundary rather than redirecting: quietly
 * sending someone to the dashboard would hide the fact that the page exists and
 * does apply to them.
 */
export const requirePagePermission = cache(
  async (permission: Permission): Promise<Actor> => {
    const actor = await requirePageActor();
    if (!can(actor.role, permission)) forbidden();
    return actor;
  },
);