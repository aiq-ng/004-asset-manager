import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, DetailRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { StaffRoleBadge } from "@/features/staff/staff-role-badge";
import { SettingsPanels } from "@/features/settings/settings-panels";
import { rolePresentation } from "@/features/staff/role-presentation";
import { hasPassword } from "@/lib/services/auth";
import { requirePageActor } from "@/lib/server/guard";

/**
 * Settings.
 *
 * Only the things a signed-in user can actually change: appearance (per browser)
 * and their own password (per account). Server-side configuration — the database
 * URL, the storage bucket, the signing secret — is deliberately absent from this
 * page; it is not a preference, and exposing it would be an information leak.
 */
export default async function SettingsPage() {
  const actor = await requirePageActor();

  // Decides whether the current-password field is required, so an account
  // created without one is not asked to prove something it never set.
  const passwordSet = await hasPassword(actor.id);
  const presentation = rolePresentation(actor.role);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your account and how this browser renders the register."
      />

      <div className="flex flex-col gap-c54-section">
        <SettingsPanels email={actor.email} hasPassword={passwordSet} />

        <Card>
          <CardHeader>
            <CardTitle>Your account</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList>
              <DetailRow term="Name">{actor.name}</DetailRow>
              <DetailRow term="Email">{actor.email}</DetailRow>
              <DetailRow term="Department">{actor.department}</DetailRow>
              <DetailRow term="Role">
                <StaffRoleBadge role={actor.role} />
              </DetailRow>
              <DetailRow term="What you can do">
                <span className="text-c54-xs text-c54-text-secondary">{presentation.summary}</span>
              </DetailRow>
              <DetailRow term="Password">
                {passwordSet ? (
                  "Set — you can change it above"
                ) : (
                  <span className="text-c54-text-warning">
                    Not set — set one above to be able to sign in again later
                  </span>
                )}
              </DetailRow>
            </DescriptionList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions reference</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList>
              <PermissionRow
                label="View assets, staff and asset types"
                roles="Every signed-in user"
              />
              <PermissionRow
                label="Assign and return assets, change asset status"
                roles="Assigner and above"
              />
              <PermissionRow label="Register, edit and retire assets" roles="Admin and above" />
              <PermissionRow label="Manage staff" roles="Super admin" />
              <PermissionRow label="Manage asset types and departments" roles="Super admin" />
              <PermissionRow label="Read the audit trail" roles="Super admin" />
            </DescriptionList>
            <p className="mt-c54-4 text-c54-2xs text-c54-text-muted">
              You are signed in as{" "}
              <span className="font-c54-medium text-c54-text-secondary">{actor.role}</span>. The
              buttons above only show what your role can actually do.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function PermissionRow({ label, roles }: { label: string; roles: string }) {
  return (
    <DetailRow term={roles}>
      <span className="text-c54-sm">{label}</span>
    </DetailRow>
  );
}