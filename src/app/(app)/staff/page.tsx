import { Suspense } from "react";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Icons } from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar } from "@/features/shared/filter-bar";
import type { DepartmentOption } from "@/features/departments/department-select";
import { StaffCreateButton, StaffEditButton } from "@/features/staff/staff-forms";
import { rolePresentation, STAFF_ROLES } from "@/features/staff/role-presentation";
import { StaffRoleBadge } from "@/features/staff/staff-role-badge";
import { listDepartmentOptions } from "@/lib/services/departments";
import { listStaff } from "@/lib/services/staff";
import { can } from "@/lib/auth/permissions";
import { requirePageActor } from "@/lib/server/guard";
import { queryFromSearchParams } from "@/lib/server/query";
import { buildHref, hasActiveFilters, normalizeSearchParams } from "@/lib/utils/search-params";
import { listStaffQuerySchema } from "@/lib/validators/staff";

/** Staff directory. Reads are open to any signed-in user; management is gated. */
export default async function StaffPage({ searchParams }: PageProps<"/staff">) {
  const actor = await requirePageActor();
  const current = normalizeSearchParams(await searchParams);
  const query = await queryFromSearchParams(listStaffQuerySchema, Promise.resolve(current));

  const results = listStaff(query);
  const canManage = can(actor.role, "staff:manage");
  // Awaited rather than streamed: the filter and both sheets need the list, and it
  // is one small table that nothing here is allowed to mutate while it renders.
  const departments = await listDepartmentOptions();

  return (
    <>
      <PageHeader
        title="Staff"
        description="Everyone who can hold an asset, and what they are allowed to do."
        actions={canManage ? <StaffCreateButton departments={departments} /> : null}
      />

      <div className="flex flex-col gap-c54-section">
        <FilterBar
          current={current}
          placeholder="Search name, email or department"
          selects={[
            {
              name: "departmentId",
              label: "Department",
              value: current.departmentId ?? "",
              options: [
                { value: "", label: "Any department" },
                ...departments.map((department) => ({
                  value: department.id,
                  label: department.name,
                })),
              ],
            },
            {
              name: "role",
              label: "Role",
              value: current.role ?? "",
              options: [
                { value: "", label: "Any role" },
                ...STAFF_ROLES.map((role) => ({
                  value: role,
                  label: rolePresentation(role).label,
                })),
              ],
            },
          ]}
        />

        <Suspense fallback={<div className="h-40" />}>
          <StaffResults
            results={results}
            canManage={canManage}
            current={current}
            departments={departments}
          />
        </Suspense>
      </div>
    </>
  );
}

async function StaffResults({
  results,
  canManage,
  current,
  departments,
}: {
  results: Promise<Awaited<ReturnType<typeof listStaff>>>;
  canManage: boolean;
  current: Record<string, string>;
  departments: DepartmentOption[];
}) {
  const { items, total, page, pageSize } = await results;

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Icons.Users className="size-5" />}
          title={hasActiveFilters(current) ? "Nobody matches those filters" : "No staff yet"}
          description={
            hasActiveFilters(current)
              ? "Try a different name, or clear the department and role filters."
              : "Add the first account to start assigning assets."
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-c54-4">
      <div className="overflow-hidden rounded-c54-card border border-c54-border-default bg-c54-bg-card">
        <Table>
          <thead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Department</TableHeader>
              <TableHeader>Email</TableHeader>
              <TableHeader className="w-40">Role</TableHeader>
              <TableHeader className="w-32">Phone</TableHeader>
              {canManage ? <TableHeader className="w-28" /> : null}
            </TableRow>
          </thead>
          <TableBody>
            {items.map((person) => (
              <TableRow key={person.id}>
                <TableCell>
                  <StaffNameCell staff={person} />
                </TableCell>
                <TableCell className="text-c54-xs text-c54-text-secondary">
                  {person.department}
                </TableCell>
                <TableCell className="text-c54-xs">
                  <a
                    href={`mailto:${person.email}`}
                    className="flex items-center gap-c54-2 hover:underline"
                  >
                    <Icons.Mail className="size-3.5 shrink-0 text-c54-text-muted" />
                    <span className="truncate">{person.email}</span>
                  </a>
                </TableCell>
                <TableCell>
                  <StaffRoleBadge role={person.role} />
                </TableCell>
                <TableCell className="text-c54-xs text-c54-text-secondary">
                  {person.phone ?? <span className="text-c54-text-muted">—</span>}
                </TableCell>
                {canManage ? (
                  <TableCell>
                    <StaffEditButton staff={person} departments={departments} />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {total > pageSize ? (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          buildHref={(next) => buildHref("/staff", { ...current, page: next > 1 ? next : undefined })}
        />
      ) : (
        <p className="text-c54-xs text-c54-text-muted">
          Showing all {total} {total === 1 ? "person" : "people"}.
        </p>
      )}
    </div>
  );
}

function StaffNameCell({
  staff,
}: {
  staff: { id: string; name: string; department: string; role: string };
}) {
  return (
    <Link href={`/staff/${staff.id}`} className="flex items-center gap-c54-2 hover:underline">
      <Badge tone="neutral" size="sm" className="font-c54-mono">
        {initials(staff.name)}
      </Badge>
      <span className="text-c54-sm font-c54-medium">{staff.name}</span>
    </Link>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}