import { Suspense } from "react";
import { Building } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/layout/page-header";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  DepartmentCreateButton,
  DepartmentDeleteControl,
  DepartmentRenameButton,
} from "@/features/departments/department-forms";
import { listDepartments } from "@/lib/services/departments";
import { wantsCreateSheet } from "@/features/shared/create-sheet-param";
import { can } from "@/lib/auth/permissions";
import { requirePageActor } from "@/lib/server/guard";

/**
 * Department register.
 *
 * Reads are open to any signed-in user: the names appear in staff pickers and
 * filters, so hiding the list would only make them harder to recognise. Adding,
 * renaming and deleting are gated on `department:manage`.
 */
export default async function DepartmentsPage({ searchParams }: PageProps<"/departments">) {
  const actor = await requirePageActor();
  const canManage = can(actor.role, "department:manage");
  // `/departments?new` opens the sheet directly, so the dashboard can link here
  // instead of to a route that does not exist. Ignored when the person cannot
  // manage departments anyway — the button that owns the sheet is not rendered.
  const openSheet = canManage && wantsCreateSheet(await searchParams);

  return (
    <>
      <PageHeader
        title="Departments"
        description="The list staff accounts pick from, so every spelling of a department stays consistent."
        actions={canManage ? <DepartmentCreateButton openInitially={openSheet} /> : null}
      />

      <div className="flex flex-col gap-c54-section">
        <Suspense fallback={<div className="h-40" />}>
          <DepartmentResults canManage={canManage} />
        </Suspense>
      </div>
    </>
  );
}

async function DepartmentResults({ canManage }: { canManage: boolean }) {
  const departments = await listDepartments();

  if (departments.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Building className="size-5" />}
          title="No departments yet"
          description={
            canManage
              ? "Add the first department so staff accounts can be assigned to one."
              : "Departments have not been set up yet."
          }
        />
      </Card>
    );
  }

  return (
    <div className="overflow-hidden rounded-c54-card border border-c54-border-default bg-c54-bg-card">
      <Table>
        <thead>
          <TableRow>
            <TableHeader>Name</TableHeader>
            <TableHeader className="w-32">Staff</TableHeader>
            {canManage ? <TableHeader className="w-44" /> : null}
          </TableRow>
        </thead>
        <TableBody>
          {departments.map((department) => (
            <TableRow key={department.id}>
              <TableCell>
                <span className="flex items-center gap-c54-2">
                  <Building className="size-3.5 shrink-0 text-c54-text-muted" />
                  <span className="text-c54-sm font-c54-medium">{department.name}</span>
                </span>
              </TableCell>
              <TableCell>
                {department.staffCount === 0 ? (
                  <Badge tone="neutral" size="sm">
                    Empty
                  </Badge>
                ) : (
                  <span className="text-c54-xs text-c54-text-secondary">
                    {department.staffCount}{" "}
                    {department.staffCount === 1 ? "person" : "people"}
                  </span>
                )}
              </TableCell>
              {canManage ? (
                <TableCell>
                  <div className="flex justify-end gap-c54-2">
                    <DepartmentRenameButton department={department} />
                    <DepartmentDeleteControl department={department} />
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}