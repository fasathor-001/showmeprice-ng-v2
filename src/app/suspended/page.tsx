import Link from "next/link";
import { Container } from "@/components/layout";
import { Card } from "@/components/ui";
import { SignOutButton } from "@/app/dashboard/SignOutButton";

// Feature J.4 — suspended-account notice page.
//
// Middleware redirects users with profiles.is_disabled=true to this
// route when they attempt any non-allowlisted page. The route itself
// is in SUSPENDED_ALLOWED_PREFIXES so it can render without triggering
// a redirect loop.
//
// Renders under the root layout — Header + Footer + Container — which
// is fine for suspended users because:
//   - The profiles_self_read RLS policy (E.2.20.0) lets the user read
//     their own row even when is_disabled=true, so the Header's
//     display_name + unread-count queries succeed.
//   - The Header's nav links (Browse / Categories / Sell) are visible.
//     Browse + Categories are in the suspended allowlist; clicking Sell
//     bounces back to this page via middleware. Mildly redundant but
//     not broken.
//
// Copy is locked per the J.4 directive — do not edit without re-approval.
//
// The page is server-rendered, no auth check needed in the page itself
// (middleware is the gate). An anonymous visitor who navigates here
// directly sees the same notice, which is harmless — it just reads as
// generic policy copy out of context.

export const runtime = "edge";

export default function SuspendedPage() {
  return (
    <Container>
      <div className="py-12 sm:py-20 max-w-xl mx-auto">
        <Card>
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-3">
              Account suspended
            </h1>
            <p className="text-sm text-ink-600 leading-relaxed mb-4">
              This account has been suspended by ShowMePrice. You cannot use
              seller, messaging, or account features while suspended.
            </p>
            <p className="text-sm text-ink-600 leading-relaxed mb-6">
              If you believe this is a mistake, contact support:{" "}
              <a
                href="mailto:admin@showmeprice.ng"
                className="text-teal-700 hover:text-teal-900 font-medium"
              >
                admin@showmeprice.ng
              </a>
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <SignOutButton />
              <Link
                href="/"
                className="text-sm text-teal-700 hover:text-teal-900 font-medium"
              >
                Back to homepage
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </Container>
  );
}
