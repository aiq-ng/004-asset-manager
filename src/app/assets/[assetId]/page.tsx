import { notFound, redirect } from "next/navigation";

import { AssetDetailView } from "@/features/assets/asset-detail-view";
import { AssetPublicCard } from "@/features/assets/asset-public-card";
import { AppShell } from "@/components/layout/app-shell";
import { readPageActor } from "@/lib/server/guard";
import { getPublicAsset } from "@/lib/services/assets";
import { wantsRegisteredPrompt } from "@/features/assets/registered-prompt-param";
import { superadminExists } from "@/lib/services/staff-bootstrap";

/**
 * Asset detail — public, and the destination of the QR on a printed tag.
 *
 * The route sits outside the `(app)` group because the gate that group installs
 * is exactly what a scan cannot satisfy: the QR on a physical label resolves to
 * `/assets/{assetId}` with no cookie attached, and a guard there answered `/login`
 * to whoever was holding the device. A tag is meant to be readable by whoever
 * has the tag, so an anonymous visitor with a valid id gets the asset card and a
 * signed-in one gets the full page.
 *
 * `readPageActor` rather than `requirePageActor`: the difference between the
 * two branches is the whole point of this file. The invited-user interstitial is
 * still honoured — a temporary-password session is sent to change it before it
 * sees anything, so the public branch cannot become a way around it.
 *
 * The public branch is deliberately reached *after* the session check, so a
 * signed-in user never sees the reduced card: they get the real page, with its
 * shell, its controls and its history.
 */
export default async function AssetPage({
  params,
  searchParams,
}: PageProps<"/assets/[assetId]">) {
  const actor = await readPageActor();
  const { assetId } = await params;

  if (actor?.mustChangePassword) redirect("/change-password");

  if (actor) {
    // Same unbootstrapped-install redirect the authenticated shell applies. Only
    // reachable with a session, so an anonymous scan of an empty register is left
    // to answer 404 from the query below rather than being bounced to /setup.
    if (!(await superadminExists())) redirect("/setup");

    return (
      <AppShell
        actor={{
          id: actor.id,
          name: actor.name,
          email: actor.email,
          department: actor.department,
          role: actor.role,
        }}
      >
        <AssetDetailView
          assetId={assetId}
          actor={actor}
          justRegistered={wantsRegisteredPrompt(await searchParams)}
        />
      </AppShell>
    );
  }

  // Unknown id is a 404, not a 403 and not a redirect: a scanner that guessed
  // or a tag for a deleted asset should learn the asset is not there, which is
  // the same answer the authenticated page gives.
  const asset = await getPublicAsset(assetId);
  if (!asset) notFound();

  return <AssetPublicCard asset={asset} />;
}