"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DescriptionList, DetailRow } from "@/components/ui/table";

/**
 * Expands the raw `changes` payload of an audit row.
 *
 * `changes` is stored as JSON and its shape depends on the action — a before/after
 * map for updates, sometimes absent entirely. Rendering it generically keeps the
 * audit page from having to know about every action, while still surfacing the
 * before/after pairs that make a row useful.
 */
export function AuditChanges({ changes }: { changes: unknown }) {
  const [open, setOpen] = useState(false);

  if (changes == null) return null;

  const entries = toEntries(changes);
  if (entries.length === 0) return null;

  return (
    <div className="mt-c54-2">
      <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
        {open ? "Hide changes" : `Show changes (${entries.length})`}
      </Button>

      {open ? (
        <DescriptionList className="mt-c54-2 rounded-c54-sm bg-c54-bg-muted p-c54-3">
          {entries.map(({ field, from, to }) => (
            <DetailRow key={field} term={field}>
              <span className="line-through opacity-70">{from}</span>
              <span className="mx-c54-2 text-c54-text-muted">&rarr;</span>
              <span className="font-c54-medium">{to}</span>
            </DetailRow>
          ))}
        </DescriptionList>
      ) : null}
    </div>
  );
}

interface NormalisedChange {
  field: string;
  from: string;
  to: string;
}

function toEntries(changes: unknown): NormalisedChange[] {
  if (typeof changes !== "object" || changes === null) return [];

  return Object.entries(changes as Record<string, unknown>)
    .map(([field, value]) => {
      // The services record `{ from, to }` for a real change; anything else is
      // rendered as a plain value so nothing is silently dropped.
      if (isBeforeAfter(value)) {
        return { field, from: display(value.from), to: display(value.to) };
      }
      return { field, from: "—", to: display(value) };
    })
    .sort((a, b) => a.field.localeCompare(b.field));
}

function isBeforeAfter(value: unknown): value is { from: unknown; to: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "from" in value &&
    "to" in value
  );
}

function display(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);

  return String(value);
}