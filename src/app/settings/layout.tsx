import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { SettingsNav } from "./SettingsNav";

// Shared settings shell: auth gate + Container + breadcrumb + heading +
// horizontal tab strip. Every /settings/* page inherits this — child pages
// render their section content only (no need for re-fetching the user, no
// re-doing the auth check, no duplicate H1).
//
// Tradeoff accepted: deep-linking to /settings/X while signed out redirects
// to /sign-in?next=/settings (not the deep page). At private-beta scale this
// is acceptable; preserving the deep path would require usePathname() at
// the layout level which would make it a client component (losing the
// server-side auth gate).

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Settings · ShowMePrice",
  robots: { index: false, follow: false },
};

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in?next=/settings");
  }

  return (
    <Container size="narrow">
      <div className="py-8 sm:py-12 max-w-2xl mx-auto">
        <div className="mb-2 text-sm text-ink-600">
          <Link href="/dashboard" className="hover:text-ink">
            ← Dashboard
          </Link>
        </div>
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-6">
          Settings
        </h1>
        <SettingsNav />
        <div>{children}</div>
      </div>
    </Container>
  );
}
