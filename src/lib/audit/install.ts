import "server-only";

import { installAuditPublisher } from "@/lib/audit/queue";

/**
 * Installs the real audit publisher as a side effect of being imported.
 *
 * `recordAudit` reads a module-level publisher that defaults to a no-op, so a
 * process that never imports this writes nothing to the trail — and does so
 * *silently*, because the services cannot tell the difference between "there is
 * nothing to record" and "nobody is listening".
 *
 * Both entry points publish a request context, so both must import this:
 *   - `lib/api.ts` for REST route handlers
 *   - `lib/server/define-action.ts` for Server Actions (i.e. the whole UI)
 *
 * They are separate module instances in the server bundle, so installing in only
 * one of them audits only that half of the app. That is not hypothetical: the
 * UI was completely unaudited for the life of this module.
 *
 * Import for the side effect; it exports nothing on purpose.
 */
installAuditPublisher();