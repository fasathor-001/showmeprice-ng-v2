import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { ConversationList } from "@/components/messaging/ConversationList";
import { listConversations } from "@/lib/messaging/actions";

export const runtime = "edge";

// Stage 2.B Commit 2 — conversation list page (`/messages`).
//
// Server Component. Fetches conversations via the `listConversations` action
// (which RLS-scopes to the signed-in user). No client realtime at this commit
// — Commit 5 wires that on top.
//
// Phone-verification gate: NOT enforced here per Commit 2 spec. Users can
// view their conversation history regardless of phone-verification status;
// composer/send paths are gated separately.
//
// Pagination (`Load more`) deferred to Commit 6 polish. First page (up to
// 20 conversations) covers >99% of users at private beta volume.
export default async function MessagesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/messages");

  const result = await listConversations("all", 20);

  if (result.error === "Unauthorized") {
    redirect("/sign-in?next=/messages");
  }

  return (
    <Container>
      <div className="py-8 sm:py-10 max-w-3xl">
        <div className="mb-5 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-medium text-ink">Messages</h1>
          <p className="text-sm text-ink-600 mt-1">
            Conversations with buyers and sellers.
          </p>
        </div>

        {result.error ? (
          // The Unauthorized branch already redirected above, so any error
          // reaching this point is a non-auth failure ("Unknown" etc.).
          <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-ink-600">
            Couldn&apos;t load conversations. Refresh to retry.
          </div>
        ) : (
          <ConversationList conversations={result.conversations ?? []} />
        )}
      </div>
    </Container>
  );
}
