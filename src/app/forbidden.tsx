import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * App-wide 403.
 *
 * Rendered by `forbidden()` from `requirePagePermission`. Deliberately does not
 * say what permission was missing or what the resource is — the point is that
 * this account cannot see it, not that it exists.
 */
export default function Forbidden() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-c54-pad-lg">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-c54-4 py-c54-section text-center">
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-c54-full bg-c54-bg-danger text-c54-text-danger"
          >
            <ShieldCheck className="size-5" />
          </span>

          <div>
            <h1 className="text-c54-xl text-c54-text-primary">Not available to your role</h1>
            <p className="mt-c54-2 text-c54-sm text-c54-text-secondary">
              Your account does not have access to this area. If you need it, ask somebody who can
              change your role.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-c54-2">
            <Link href="/">
              <Button size="sm">
                <ArrowLeft className="size-3.5" />
                Back to dashboard
              </Button>
            </Link>
            <Link href="/assets">
              <Button variant="outline" size="sm">
                Browse assets
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}