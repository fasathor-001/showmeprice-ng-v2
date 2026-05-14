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
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center text-lg font-medium">
            <span className="text-ink">ShowMePrice</span>
            <span className="text-teal-600">.ng</span>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm text-ink-600">
            <Link href="/marketplace" className="hover:text-ink transition-colors">
              Browse
            </Link>
            <Link href="/categories" className="hover:text-ink transition-colors">
              Categories
            </Link>
            <Link href="/sell" className="hover:text-ink transition-colors">
              Sell on ShowMePrice
            </Link>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
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
