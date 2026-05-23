import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui";
import { Container } from "./Container";
import { HeaderSearch } from "./HeaderSearch";
import { UserMenu } from "./UserMenu";

export async function Header() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, role")
      .eq("id", user.id)
      .single();
    displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "Account";
    isAdmin = profile?.role === "admin";
  }

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-neutral-200">
      <Container>
        <div className="flex items-center justify-between gap-4 h-16">
          <Link href="/" className="flex items-center text-lg font-medium shrink-0">
            <span className="text-ink">ShowMePrice</span>
            <span className="text-teal-600">.ng</span>
          </Link>

          {/* Global search. HeaderSearch is a client component so it can
              own the mobile-overlay open/close state. Desktop (>=md) shows
              an inline form; mobile (<md) shows a magnifying-glass icon
              that opens a top-anchored overlay. Submits to /marketplace?q=
              — same contract as the rest of the app's global search. */}
          <HeaderSearch />

          <nav className="hidden lg:flex items-center gap-6 text-sm text-ink-600 shrink-0">
            <Link href="/marketplace" className="hover:text-ink transition-colors">
              Browse
            </Link>
            <Link href="/categories" className="hover:text-ink transition-colors">
              Categories
            </Link>
            <Link href="/sell" className="hover:text-ink transition-colors">
              Sell
            </Link>
            {/* Stage 2.B Commit 5: the inline "Messages" text link was DROPPED
                in favour of the icon button below (matches WhatsApp Web /
                Messenger pattern under D-121 — header has only the chat icon,
                no text). The icon is the primary entry; UserMenu has a
                textual backup. */}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {user && (
              // Stage 2.B Commit 5 — Messages icon button. 44×44 tap target,
              // visible at all viewports (mobile + desktop). K-040 (unread
              // presence dot) wires in here in Commit 6 polish.
              <Link
                href="/messages"
                aria-label="Messages"
                className="inline-flex items-center justify-center w-11 h-11 rounded-full text-ink-600 hover:bg-neutral-100 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </Link>
            )}
            {user ? (
              <UserMenu displayName={displayName ?? "Account"} email={user.email ?? ""} isAdmin={isAdmin} />
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="hidden sm:inline-flex items-center text-sm text-ink-600 hover:text-ink h-9 px-3 transition-colors"
                >
                  Sign in
                </Link>
                <Link href="/sign-up">
                  <Button variant="primary" size="sm">
                    Get started
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </Container>
    </header>
  );
}
