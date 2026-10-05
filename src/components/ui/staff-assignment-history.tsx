"use client";

import Link from "next/link";
import { VerticalTimeline, VerticalTimelineElement } from "react-vertical-timeline-component";
import { Plus, RefreshCw } from "lucide-react";
import "react-vertical-timeline-component/style.min.css";

import { CodeChip } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils/format";

type StaffHistoryEntry = {
  id: string;
  assetId: string;
  dateAssigned: string | Date;
  dateReturned: string | Date | null;
  note: string | null;
  asset: { description: string; assetType: { name: string } };
};

/**
 * Everything a person has ever held, newest first, as a vertical timeline.
 *
 * A client component because the timeline library needs the browser; the staff
 * page stays a server component and just passes `staff.history` in.
 */
export function StaffAssignmentHistory({ history }: { history: StaffHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <p className="text-c54-sm text-c54-text-secondary">No assignments recorded yet.</p>
    );
  }

  return (
    <div
      className={
        "[&_.vertical-timeline]:mt-0 [&_.vertical-timeline]:w-full " +
        "[&_.vertical-timeline]:max-w-none [&_.vertical-timeline]:py-0 " +
        "[&_.vertical-timeline-element]:my-c54-5"
      }
    >
      <VerticalTimeline
        layout="1-column-left"
        animate={false}
        lineColor="var(--color-c54-border-default)"
      >
        {history.map((entry) => {
          const out = entry.dateReturned === null;

          return (
            <VerticalTimelineElement
              key={entry.id}
              contentStyle={{ background: "transparent", boxShadow: "none", padding: 0 }}
              contentArrowStyle={{ display: "none" }}
              iconClassName={
                out
                  ? "bg-c54-status-healthy text-white"
                  : "bg-c54-bg-card text-c54-text-muted border border-c54-border-strong"
              }
              iconStyle={{ boxShadow: "0 0 0 4px var(--color-c54-bg-card)" }}
              icon={out ? <Plus /> : <RefreshCw />}
            >
              <div className="flex flex-wrap items-center gap-x-c54-2 gap-y-c54-1">
                <Link href={`/assets/${entry.assetId}`} className="hover:underline">
                  <CodeChip>{entry.assetId}</CodeChip>
                </Link>
                <span className="text-c54-sm font-c54-medium text-c54-text-primary">
                  {entry.asset.description}
                </span>
                {out ? (
                  <span className="text-c54-2xs font-c54-medium text-c54-status-healthy">
                    Out now
                  </span>
                ) : null}
              </div>
              <p className="mt-c54-1 text-c54-2xs text-c54-text-muted">
                {entry.asset.assetType.name}
                {" · "}
                {formatDate(entry.dateAssigned)}
                {entry.dateReturned ? ` → ${formatDate(entry.dateReturned)}` : " → present"}
              </p>
              {entry.note ? (
                <p className="mt-c54-2 text-c54-xs text-c54-text-secondary">{entry.note}</p>
              ) : null}
            </VerticalTimelineElement>
          );
        })}
      </VerticalTimeline>
    </div>
  );
}