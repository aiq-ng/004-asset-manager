import Link from "next/link";

import { Badge, CodeChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Icons } from "@/components/ui/icons";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { ReturnButton } from "@/features/assignments/return-button";
import { StatusBadge } from "@/features/assets/asset-table";
import { formatDate } from "@/lib/utils/format";

export interface AssignmentListItem {
  id: string;
  assetId: string;
  asset: { description: string; status: string };
  dateAssigned: string;
  dateReturned: string | null;
  note: string | null;
  staff: { id: string; name: string; department: string };
}

/**
 * Assignment rows.
 *
 * Server Component; only the per-row return control is a client island, because a
 * return cannot be undone and needs a confirmation step.
 */
export function AssignmentTable({
  assignments,
  canReturn,
}: {
  assignments: AssignmentListItem[];
  canReturn: boolean;
}) {
  return (
    <>
      <div className="hidden md:block">
        <Table sticky>
          <thead>
            <TableRow>
              <TableHeader>Asset</TableHeader>
              <TableHeader>Holder</TableHeader>
              <TableHeader className="w-36">Status</TableHeader>
              <TableHeader className="w-36">Assigned</TableHeader>
              <TableHeader className="w-36">Returned</TableHeader>
              <TableHeader>Note</TableHeader>
              <TableHeader className="w-24">
                <span className="sr-only">Actions</span>
              </TableHeader>
            </TableRow>
          </thead>
          <TableBody>
            {assignments.map((assignment) => (
              <AssignmentRow
                key={assignment.id}
                assignment={assignment}
                canReturn={canReturn}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-c54-border-default md:hidden">
        {assignments.map((assignment) => (
          <li key={assignment.id} className="flex items-start gap-c54-3 px-c54-pad-lg py-c54-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-c54-2">
                <CodeChip>{assignment.assetId}</CodeChip>
                <Badge tone={assignment.dateReturned ? "neutral" : "success"} size="sm">
                  {assignment.dateReturned ? "Returned" : "Out"}
                </Badge>
              </div>
              <p className="mt-c54-2 text-c54-sm font-c54-medium">{assignment.asset.description}</p>
              <p className="mt-c54-1 text-c54-2xs text-c54-text-muted">
                {assignment.staff.name} · {assignment.staff.department} · from{" "}
                {formatDate(assignment.dateAssigned)}
              </p>
              {assignment.note ? (
                <p className="mt-c54-2 text-c54-xs text-c54-text-secondary">{assignment.note}</p>
              ) : null}
            </div>
            {assignment.dateReturned === null && canReturn ? (
              <ReturnButton assignmentId={assignment.id} assetId={assignment.assetId} />
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

function AssignmentRow({
  assignment,
  canReturn,
}: {
  assignment: AssignmentListItem;
  canReturn: boolean;
}) {
  const active = assignment.dateReturned === null;

  return (
    <TableRow>
      <TableCell>
        <Link href={`/assets/${assignment.assetId}`} className="block">
          <CodeChip>{assignment.assetId}</CodeChip>
          <span className="mt-c54-1 block max-w-64 truncate text-c54-xs text-c54-text-secondary">
            {assignment.asset.description}
          </span>
        </Link>
      </TableCell>
      <TableCell>
        <Link href={`/staff/${assignment.staff.id}`} className="text-c54-sm hover:underline">
          {assignment.staff.name}
        </Link>
        <span className="block text-c54-2xs text-c54-text-muted">{assignment.staff.department}</span>
      </TableCell>
      <TableCell>
        <StatusBadge status={assignment.asset.status} />
      </TableCell>
      <TableCell className="text-c54-xs text-c54-text-secondary">
        {formatDate(assignment.dateAssigned)}
      </TableCell>
      <TableCell className="text-c54-xs text-c54-text-secondary">
        {assignment.dateReturned ? formatDate(assignment.dateReturned) : "—"}
      </TableCell>
      <TableCell className="max-w-56">
        {assignment.note ? (
          <span className="block truncate text-c54-xs text-c54-text-secondary" title={assignment.note}>
            {assignment.note}
          </span>
        ) : (
          <span className="text-c54-text-muted">—</span>
        )}
      </TableCell>
      <TableCell>
        {active && canReturn ? (
          <ReturnButton assignmentId={assignment.id} assetId={assignment.assetId} />
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function AssignmentEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <Card>
      <EmptyState
        icon={<Icons.Clipboard className="size-5" />}
        title={filtered ? "No assignments match those filters" : "Nothing has been assigned yet"}
        description={
          filtered
            ? "Try clearing the filters, or search by a different asset id."
            : "Assign an available asset from its detail page to get started."
        }
        action={
          filtered ? (
            <Link href="/assignments">
              <Button>Clear filters</Button>
            </Link>
          ) : (
            <Link href="/assets?status=AVAILABLE">
              <Button>Browse available assets</Button>
            </Link>
          )
        }
      />
    </Card>
  );
}