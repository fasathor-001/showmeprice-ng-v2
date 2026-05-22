import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Container } from "@/components/layout";
import { Card } from "@/components/ui";
import { isPhoneVerified } from "@/lib/auth";
import { SmokeForms } from "./SmokeForms";

export const runtime = "edge";

// Stage 2.B dev smoke harness (Commit 1.5 / K-031). Exercises the messaging
// server actions in a real authenticated request context. **Dev-only**:
// returns 404 in production (NODE_ENV==='production'). On the deployed site this
// route does not exist; run it via `pnpm dev` on localhost (which talks to the
// same Supabase instance). REMOVE or admin-gate before public beta (K-031).
export default async function MessagingSmokePage() {
  if (process.env.NODE_ENV === "production") notFound();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let actorPanel: {
    displayName: string;
    tier: string;
    phoneVerified: boolean;
    lastSeenAt: string | null;
  } | null = null;
  let recentLog: Array<Record<string, unknown>> = [];

  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name, tier, verification_status, last_seen_at")
      .eq("id", user.id)
      .maybeSingle();
    actorPanel = {
      displayName: prof?.display_name ?? "—",
      tier: (prof?.tier as string) ?? "free",
      phoneVerified: isPhoneVerified(prof?.verification_status),
      lastSeenAt: (prof?.last_seen_at as string | null) ?? null,
    };
    // filter_actions_log read via admin client (dev tool; RLS unknown — K-028).
    const admin = createAdminClient();
    const { data: logs } = await admin
      .from("filter_actions_log")
      .select("created_at, context, rule_action, user_proceeded, original_content")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    recentLog = (logs ?? []) as Array<Record<string, unknown>>;
  }

  return (
    <Container>
      <div className="py-8 sm:py-12 space-y-6">
        <div>
          <h1 className="text-2xl font-medium text-ink mb-1">Messaging smoke harness</h1>
          <p className="text-sm text-ink-600">
            Dev-only (404 in production). Exercises the Stage 2.B server actions.
            Reload the page to refresh the actor + filter-log panels after running
            an action.
          </p>
        </div>

        {!user ? (
          <Card>
            <p className="py-6 text-center text-sm text-ink-600">
              Not signed in. Sign in as a phone-verified buyer to run the actions.
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <h2 className="text-sm font-medium text-ink mb-2">Actor</h2>
              <pre className="text-xs bg-neutral-100 text-ink rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify({ userId: user.id, ...actorPanel }, null, 2)}
              </pre>
              <p className="text-xs text-ink-400 mt-2">
                Bonus: <code>last_seen_at</code> should advance after each action.
              </p>
            </Card>

            <SmokeForms />

            <Card>
              <h2 className="text-sm font-medium text-ink mb-2">
                Recent filter_actions_log (this user, newest first)
              </h2>
              {recentLog.length === 0 ? (
                <p className="text-xs text-ink-600">
                  No rows yet (block/warn sends create rows; best-effort).
                </p>
              ) : (
                <pre className="text-xs bg-neutral-100 text-ink rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(recentLog, null, 2)}
                </pre>
              )}
            </Card>
          </>
        )}
      </div>
    </Container>
  );
}
