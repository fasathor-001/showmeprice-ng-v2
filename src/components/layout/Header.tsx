import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui";
import { Container } from "./Container";
import { UserMenu } from "./UserMenu";

export async function Header() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "Account";
  }

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-neutral-200">
      <Container>
        <div className="flex items-center justify-between gap-4 h-16">
          <Link href="/" className="flex items-center text-lg font-medium shrink-0">
            <span className="text-ink">ShowMePrice</span>
            <span className="text-teal-600">.ng</span>
          </Link>

          {/* Global search — submits to /marketplace?q=. Phase D.5: a fresh
              search (state/category filters are reset). The marketplace page
              itself has a richer in-context form that preserves filters. */}
          <form
            action="/marketplace"
            method="get"
            className="hidden md:flex flex-1 max-w-md"
            role="search"
          >
            <label className="flex flex-1 items-stretch bg-neutral-50 border border-neutral-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-teal-400 focus-within:border-teal-600 focus-within:bg-white">
              <span className="pl-3 self-center text-neutral-400">
                <HeaderSearchIcon />
              </span>
              <span className="sr-only">Search marketplace</span>
              <input
                type="search"
                name="q"
                placeholder="Search verified sellers…"
                className="flex-1 bg-transparent border-0 outline-none text-sm text-ink placeholder:text-neutral-400 px-2.5 py-1.5 min-w-0"
              />
            </label>
          </form>

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
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user ? (
              <UserMenu displayName={displayName ?? "Account"} email={user.email ?? ""} />
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

function HeaderSearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
