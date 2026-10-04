import { Alert } from "@/components/ui/feedback";
import {
  hasAuditBacklog,
  type AuditQueueHealth,
} from "@/lib/audit/heartbeat";
import { formatRelative, pluralize } from "@/lib/utils/format";

/**
 * Warns when the audit worker is not draining the queue.
 *
 * The trail is written asynchronously, so a missing worker does not break the
 * app: events keep being queued in Redis and everything else looks healthy. That
 * is precisely why it is dangerous, and why the warning has to be visible on the
 * page whose entire job is accountability. Rendering nothing but "No events yet"
 * is what let this gap go unnoticed.
 *
 * Renders nothing in the healthy case. An audit page that always carries a
 * banner trains people to stop reading banners.
 */
export function AuditWorkerStatus({
  health,
  now,
}: {
  health: AuditQueueHealth;
  now: Date;
}) {
  if (hasAuditBacklog(health)) {
    return (
      <Alert tone="danger" title="The audit worker is not running">
        <p>
          {pluralize(health.waiting, "event")} {health.waiting === 1 ? "is" : "are"} queued and
          not yet written to the trail. Nothing is lost: they are held in Redis and will be
          recorded once the worker starts again.
        </p>
        <p className="font-c54-mono text-c54-2xs">
          {health.lastSeenAt
            ? `Last seen ${formatRelative(health.lastSeenAt, now)}.`
            : "This worker has never been seen."}{" "}
          Start it with <code>pnpm worker:audit</code>.
        </p>
      </Alert>
    );
  }

  // A worker that is down but has an empty queue has lost nothing. Worth a
  // quieter note than the backlog case above, but still worth saying: the next
  // action somebody takes will be queued with nobody to write it.
  if (!health.workerRunning && health.lastSeenAt) {
    return (
      <Alert tone="warning" title="The audit worker is not running">
        <p>
          The queue is empty, so nothing is missing, but new events will not be recorded until
          it starts again.{" "}
          {health.lastSeenAt ? `Last seen ${formatRelative(health.lastSeenAt, now)}.` : null}
        </p>
      </Alert>
    );
  }

  // Events that burned all their retries are written off. This is the one case
  // where data really is gone, and no amount of restarting the worker brings it
  // back, so it is surfaced even though the worker may be perfectly healthy.
  if (health.failed > 0) {
    return (
      <Alert tone="danger" title={`${pluralize(health.failed, "event")} could not be recorded`}>
        <p>
          They exhausted their retries and have been written off. The worker logs the reason for
          each one.
        </p>
      </Alert>
    );
  }

  return null;
}