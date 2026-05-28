import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge, Card } from "@/components/ui";
import { formatNigerianPhone, isPhoneVerified } from "@/lib/auth";

// /settings/account — read-only display of the user's own profile fields.
// All editable fields are gated behind "Contact support to change" today
// (post E.2.14.0 freeze trigger). Avatar is initials-only — upload UI is a
// separate follow-up stage.
//
// Auth gate inherited from layout.tsx, but we re-fetch user here because
// the layout doesn't pass it down (avoids React Context for a single value)
// and we need it for email + the profile-fetch key.

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Account · Settings · ShowMePrice",
  robots: { index: false, follow: false },
};

interface ProfileRow {
  display_name: string;
  phone: string;
  state_id: string | null;
  verification_status: string[];
  tier: string;
  signup_free_reveals_remaining: number;
  // Supabase embed for the nigerian_states FK. PostgREST + supabase-js may
  // return this as either a single object or a one-element array depending
  // on inferred relationships — code below normalizes both.
  nigerian_states: { name: string } | { name: string }[] | null;
}

// Copied verbatim from UserMenu.tsx:42-49 (per the investigation finding).
// Keeps initials consistent across surfaces.
function computeInitials(displayName: string): string {
  return (
    displayName
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function AccountSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Layout already gated; this is defensive (also satisfies TS narrowing
  // on user being non-null for the rest of the function).
  if (!user) redirect("/sign-in?next=/settings/account");

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select(
      `display_name, phone, state_id, verification_status, tier,
       signup_free_reveals_remaining,
       nigerian_states ( name )`,
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profileRaw) {
    // Shouldn't happen for an authenticated user (handle_new_user trigger
    // creates the row at signup), but render a calm fallback rather than
    // crashing the page.
    return (
      <Card className="bg-warning-bg border-warning/30">
        <p className="text-sm text-warning-text">
          We couldn&apos;t load your account details. Please refresh and try
          again.
        </p>
      </Card>
    );
  }

  const profile = profileRaw as unknown as ProfileRow;

  const stateName = Array.isArray(profile.nigerian_states)
    ? (profile.nigerian_states[0]?.name ?? null)
    : (profile.nigerian_states?.name ?? null);

  const initials = computeInitials(profile.display_name);
  const formattedPhone = formatNigerianPhone(profile.phone);
  const phoneVerified = isPhoneVerified(profile.verification_status);
  const tierDisplay = capitalize(profile.tier);
  const verifBadges: React.ReactNode[] = [];
  if (profile.verification_status.includes("phone_verified")) {
    verifBadges.push(
      <Badge key="phone" variant="verified">
        Phone verified
      </Badge>,
    );
  }
  if (profile.verification_status.includes("email_verified")) {
    verifBadges.push(
      <Badge key="email" variant="verified">
        Email verified
      </Badge>,
    );
  }
  // Future Phase F+ adds 'bvn_verified' / 'nin_verified' /
  // 'google_verified' / 'facebook_verified' — extend here when those land.

  return (
    <div className="space-y-4">
      {/* Avatar + display name header */}
      <Card>
        <div className="flex items-center gap-4">
          <Avatar
            initials={initials}
            alt={profile.display_name}
            size="lg"
          />
          <div>
            <p className="text-base font-medium text-ink">
              {profile.display_name}
            </p>
            <p className="text-xs text-ink-400 mt-0.5">
              Profile photo upload coming soon
            </p>
          </div>
        </div>
      </Card>

      {/* Profile fields — all locked, all signpost to support */}
      <Card>
        <h2 className="text-sm font-medium text-ink mb-4">Profile</h2>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-ink-600 text-xs">Display name</dt>
            <dd className="text-ink">{profile.display_name}</dd>
            <p className="text-xs text-ink-400 mt-1">
              Set at signup; cannot be changed.
            </p>
          </div>

          <div>
            <dt className="text-ink-600 text-xs">Email</dt>
            <dd className="text-ink break-all">{user.email ?? "—"}</dd>
            <p className="text-xs text-ink-400 mt-1">
              Contact support to change your email address.
            </p>
          </div>

          <div>
            <dt className="text-ink-600 text-xs">Phone</dt>
            <dd className="flex items-center gap-2 flex-wrap">
              <span className="text-ink tabular-nums">{formattedPhone}</span>
              {phoneVerified ? (
                <Badge variant="verified">Verified</Badge>
              ) : (
                <Link
                  href="/verify-phone?next=/settings/account"
                  className="text-teal-700 hover:text-teal-900 font-medium text-xs"
                >
                  Verify →
                </Link>
              )}
            </dd>
            <p className="text-xs text-ink-400 mt-1">
              Contact support to change your phone number.
            </p>
          </div>

          <div>
            <dt className="text-ink-600 text-xs">Location</dt>
            <dd className="text-ink">{stateName ?? "Not set"}</dd>
            <p className="text-xs text-ink-400 mt-1">
              Contact support to update your location.
            </p>
          </div>
        </dl>
      </Card>

      {/* Verification + plan — informational */}
      <Card>
        <h2 className="text-sm font-medium text-ink mb-4">
          Verification &amp; plan
        </h2>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-ink-600 text-xs">Verifications</dt>
            <dd className="flex items-center gap-2 flex-wrap mt-1">
              {verifBadges.length > 0 ? (
                verifBadges
              ) : (
                <span className="text-ink-600 text-xs">
                  No verifications yet
                </span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-ink-600 text-xs">Plan</dt>
            <dd className="text-ink">{tierDisplay}</dd>
          </div>

          <div>
            <dt className="text-ink-600 text-xs">
              Free contact reveals remaining
            </dt>
            <dd className="text-ink tabular-nums">
              {profile.signup_free_reveals_remaining}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
