This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Backend setup

The API needs Postgres, MinIO and Redis. All three are defined in
`docker-compose.yml`:

```bash
docker compose up -d      # postgres (5432) + minio (9000, console on 9001) + redis (6379)
cp .env.example .env      # if .env does not exist yet
pnpm db:migrate           # apply prisma migrations (or: pnpm prisma:migrate)
pnpm db:seed              # optional sample data
pnpm dev                  # http://localhost:3000
pnpm worker:audit         # audit worker, in a second terminal
```

Redis is only needed for the [audit trail](#audit-trail); without it the API runs
normally but does not record audit events.

Full endpoint reference: [`docs/API.md`](docs/API.md). Example requests: `api.http`.

## Authentication & RBAC

The API uses email/password authentication with HTTP-only, sameSite-lax session
cookies (HS256-signed JWT). Sessions are database-backed (`Staff.sessionVersion`)
so signing out, changing a password, or a superadmin resetting a password
immediately revokes any previously issued cookies. Role and profile are re-read
from PostgreSQL on every request, so role changes take effect immediately (the
JWT only carries `sub` and `sv`).

**Roles (hierarchy):**
- `USER` – authenticated read-only access to inventory and history.
- `ASSIGNER` – read access, create/return assignments, and status-only updates to assets (no full asset edits).
- `ADMIN` – inherits ASSIGNER and may create/update/retire assets, manage asset types, and upload/remove asset images.
- `SUPERADMIN` – full access, including creating/updating/deleting staff, managing roles, and reading the audit trail. Exactly one SUPERADMIN is intended.

**Assignment target rules:**
- `ASSIGNER` may assign to `USER` or another `ASSIGNER`; they cannot assign to themselves, `ADMIN`, or `SUPERADMIN`.
- `ADMIN` and `SUPERADMIN` may assign to anyone, including themselves.

**Policies:**
- Password minimum length: 12 characters.
- `SESSION_SECRET` (env) must be at least 32 characters in production.
- SUPERADMIN cannot be granted through the API; it is created via `pnpm auth:create-superadmin` (interactive or via flags/env). The CLI refuses to create one if a SUPERADMIN already exists.
- Staff accounts with `passwordHash` NULL cannot log in. The SUPERADMIN bootstrap sets an initial password.

**Auth endpoints (public/protected):**
- `POST /api/auth/login` (public) – signs in with `{ email, password }` and returns the actor (no sensitive fields). Returns `401` for invalid credentials (no user enumeration).
- `POST /api/auth/logout` (requires session) – increments `sessionVersion`, deletes the cookie, and returns `{ signedOut: true }`. Replayed tokens are rejected after logout.
- `GET /api/auth/me` (requires session) – returns the current actor including `role` and `hasPassword`.
- `POST /api/auth/change-password` (requires session, self-service) – takes `{ currentPassword, newPassword }`, revokes other sessions and refreshes the caller’s cookie so they remain signed in. Weak passwords are rejected.

See `docs/API.md` for per-endpoint RBAC and response shapes. Example request flows are in `api.http`.

## Superadmin bootstrap

```bash
# Interactive (prompts for email/password)
pnpm auth:create-superadmin

# Non-interactive
SUPERADMIN_EMAIL="ana.ribeiro@example.com" SUPERADMIN_PASSWORD="SuperSecretDev123!" pnpm auth:create-superadmin
```

On a fresh DB, the CLI creates the SUPERADMIN. If any staff already exist, it promotes the oldest existing staff account to SUPERADMIN (and sets/updates their password). It never grants SUPERADMIN through the staff management API.

## Audit trail

Every meaningful action is recorded as an append-only audit event. The write path
is split in two so that auditing can never slow down or break the API:

```
Next.js route handler -> service -> recordAudit() -> Redis (BullMQ)  ─┐
                                                                      │ queue
                                        audit worker (pnpm worker:audit) ┘
                                                                      │
                                                                      v
                                                          PostgreSQL "AuditLog"
```

- **Producer** (`src/lib/audit/queue.ts`): the handler returns as soon as Redis
  accepts the job. The API never waits for the audit database.
- **Worker** (`src/workers/audit.worker.ts`): a separate long-lived process that
  drains the queue into PostgreSQL, with `concurrency: 10`.
- **Retries**: 5 attempts with exponential backoff (2s → 32s).
- **Idempotency**: `eventId` is generated by the producer and used as the BullMQ
  job id *and* as a unique column in Postgres. A crashed worker that replays a
  job upserts instead of inserting, so a retry can never duplicate a row.
- **Retention**: completed jobs are dropped after 1 hour, failed jobs after 24
  hours (kept for debugging). Audit rows in Postgres are never dropped.
- **Immutability**: database triggers reject `UPDATE` and `DELETE` on
  `"AuditLog"`. The single exception is the FK's `ON DELETE SET NULL` unlink
  when the staff member is deleted, so accounts stay deletable while the
  `actorName`/`actorEmail`/`actorRole` snapshot is preserved.
- **Redis durability**: `appendonly yes` with `appendfsync everysec`, and
  `maxmemory-policy noeviction` (set in `docker-compose.yml`). Do not change
  that policy: BullMQ stores jobs in ordinary keys, and any eviction would
  silently drop audit events.
- **Failure behaviour**: if Redis is unreachable the API still serves requests.
  The enqueue is bounded (`commandTimeout` + a 1s deadline) and a circuit breaker
  pauses auditing for 30s after 3 consecutive failures. Audit events are
  *dropped* during a Redis outage by design — availability of the inventory API
  wins over completeness of the trail. Watch the `[audit]` log lines to detect it.

### Running the worker

```bash
pnpm worker:audit         # production
pnpm worker:audit:watch   # development
```

The worker is a separate process, so it needs its own container/service in a
real deployment and should run under a supervisor (systemd, Docker
`--restart=always`) so a hard kill is recovered automatically.

### What gets recorded

`LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGED`,
`ASSET_CREATED`, `ASSET_UPDATED`, `ASSET_RETIRED`, `ASSET_IMAGE_UPLOADED`,
`ASSET_IMAGE_REMOVED`, `ASSET_TYPE_CREATED`, `ASSET_TYPE_UPDATED`,
`STAFF_CREATED`, `STAFF_UPDATED`, `STAFF_ROLE_CHANGED`, `STAFF_PASSWORD_RESET`,
`STAFF_DELETED`, `ASSIGNMENT_CREATED`, `ASSIGNMENT_RETURNED`,
`AUTHORIZATION_DENIED`.

Passwords never enter the trail: `changes`/`metadata` are passed through a
redactor that replaces `password`, `token`, `secret`, etc. with `[redacted]`.

### Reading the trail

`GET /api/audit-logs` is `SUPERADMIN`-only (rows contain emails and client IPs).
Filters: `action`, `entityType`, `entityId`, `q`, `from`, `to`, `page`,
`pageSize`. Reading it is not itself audited — access is controlled by RBAC.

## Design tokens

The UI theme lives in the workspace package `packages/tokens` (`@c54/tokens`), generated with Style Dictionary from `src/primitives` + `src/semantic` + `src/themes`:

```bash
pnpm tokens:build   # regenerate packages/tokens/build (also runs automatically before pnpm build)
pnpm tokens:clean   # remove the build output
```

- `src/app/theme.css` imports the generated CSS variables and bridges every token into Tailwind v4 with `@theme inline`, so utilities compile to `var(--c54-*)` and themes swap at runtime without a rebuild.
- The active theme is set on the root element in `src/app/layout.tsx`: `data-c54-theme="wire-desk"`, plus `data-c54-mode="dark"` for dark mode.
- Available themes: `wire-desk` (default, dense), `visual-led`, `measured-editorial`.

```tsx
<div className="bg-c54-bg-card text-c54-text-primary border border-c54-border-default rounded-c54-card p-c54-pad-lg shadow-c54-popover">
```

Utility prefixes: `bg-c54-bg-*`, `text-c54-text-*`, `border-c54-border-*`, `*-c54-action-*`, `bg-c54-status-*`, `rounded-c54-*`, `p-/m-/gap-c54-*`, `font-c54-{display,sans,mono,serif}`, `text-c54-{2xs…hero}`, `leading-c54-*`, `tracking-c54-*`, `shadow-c54-{popover,dialog,command}`. Primitive ramps, opacity steps and density stay available as raw custom properties such as `var(--c54-color-gray-100)`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
