import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/messaging/actions";
import { isPhoneVerified } from "@/lib/auth";
import { getProductImagePublicUrl } from "@/lib/storage";
import { Container } from "@/components/layout";
import { MessageComposer } from "@/components/messaging/MessageComposer";
import { MessageThread } from "@/components/messaging/MessageThread";
import { ThreadHeader } from "@/components/messaging/ThreadHeader";

export const runtime = "edge";

// Stage 2.B Commit 3 — message thread page (`/messages/[conversationId]`).
// Composer wired in Commit 4; layout refactored to fixed-fullheight in 4.1.
//
// Server Component. Three parallel fetches:
//   1. `getMessages(conversationId, 50)` — Commit 1 server action; returns
//      messages + hasMore, and already marks unread → read on initial render.
//   2. Conversation context (other-party + listing + primary image) via a
//      single Supabase query with FK-name embeds. Used by ThreadHeader.
//   3. Current user's verification_status — drives the composer's D-114
//      phone-verified gate.
//
// Permission denied behavior (privacy hygiene): NotFound and Forbidden both
// map to `notFound()` so a malicious actor probing IDs can't distinguish
// "doesn't exist" from "exists but you can't see it." Defense-in-depth on
// top of the data-layer RLS check inside getMessages.
//
// ARCHITECTURAL SHIFT (Commit 4.1, 2026-05-23): this route uses a different
// scroll model from the rest of the app. The body is normal-flow (Header
// sticky-top, main flex-1, Footer at bottom), but the thread page returns a
// `position: fixed` container that covers the area below Header to the
// dynamic viewport bottom (`100dvh - 4rem`). Three consequences:
//   1. The Footer is NOT accessible from this route — it's hidden behind
//      the fixed container. Users navigate elsewhere to reach Footer content.
//   2. The body cannot scroll-to-reveal Footer (the fixed container has
//      no document-flow contribution; body height = Header + Footer ≈ viewport).
//   3. iOS Safari keyboard handling: `100dvh` shrinks when the virtual
//      keyboard appears, so the composer (bottom of the flex column) rises
//      with the keyboard automatically. Sticky/fixed-bottom alternatives
//      that reference layout viewport hide behind the keyboard.
//
// The header-height coupling (`top-16` + `calc(100dvh - 4rem)`) reflects
// Header's `h-16`. If Header height changes, update both here and consider
// extracting a CSS variable.

interface Props {
  params: { conversationId: string };
}

type EmbeddedProfile = {
  id: string;
  display_name: string | null;
  verification_status: string[] | null;
  last_seen_at: string | null;
};

type EmbeddedImage = {
  storage_path: string;
  position: number | null;
};

type EmbeddedListing = {
  id: string;
  title: string | null;
  price_kobo: number | null;
  status: string;
  product_images: EmbeddedImage[] | null;
};

type ConversationContextRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string | null;
  status: string;
  buyer: EmbeddedProfile | EmbeddedProfile[] | null;
  seller: EmbeddedProfile | EmbeddedProfile[] | null;
  listing: EmbeddedListing | EmbeddedListing[] | null;
};

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function MessageThreadPage({ params }: Props) {
  const { conversationId } = params;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/sign-in?next=/messages/${conversationId}`);
  }

  // Parallel: header-context query + messages + current user's verification
  // (drives the composer's phone-verified gate per D-114).
  const [ctxResult, msgResult, profileResult] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        `
        id, buyer_id, seller_id, listing_id, status,
        buyer:profiles!conversations_buyer_id_fkey(id, display_name, verification_status, last_seen_at),
        seller:profiles!conversations_seller_id_fkey(id, display_name, verification_status, last_seen_at),
        listing:products!conversations_listing_id_fkey(
          id, title, price_kobo, status,
          product_images(storage_path, position)
        )
      `,
      )
      .eq("id", conversationId)
      .maybeSingle(),
    getMessages(conversationId, 50),
    supabase
      .from("profiles")
      .select("verification_status")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const phoneVerified = isPhoneVerified(
    profileResult.data?.verification_status,
  );

  // getMessages errors first (it has the explicit participant check).
  if (msgResult.error === "Unauthorized") {
    redirect(`/sign-in?next=/messages/${conversationId}`);
  }
  if (msgResult.error === "NotFound" || msgResult.error === "Forbidden") {
    notFound(); // privacy hygiene — don't distinguish
  }
  if (msgResult.error) {
    return (
      <Container>
        <div className="py-10">
          <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-ink-600">
            Couldn&apos;t load this conversation. Refresh to retry.
          </div>
        </div>
      </Container>
    );
  }

  // If we got messages but no conversation context (RLS race or rare null),
  // fall through to notFound — page can't render without the header data.
  const ctx = ctxResult.data as ConversationContextRow | null;
  if (!ctx) notFound();

  const isBuyer = ctx.buyer_id === user.id;
  const otherParty = pickOne(isBuyer ? ctx.seller : ctx.buyer);
  if (!otherParty) notFound(); // defensive — embed should always populate

  const listing = pickOne(ctx.listing);
  let primaryImageUrl: string | null = null;
  if (listing && Array.isArray(listing.product_images) && listing.product_images.length > 0) {
    const sorted = [...listing.product_images].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );
    primaryImageUrl = getProductImagePublicUrl(sorted[0]!.storage_path);
  }

  return (
    // Fixed full-height container (Commit 4.1). See ARCHITECTURAL SHIFT note
    // at the top of this file. Inner middle div is the only scrollable region.
    <div className="fixed left-0 right-0 top-16 z-20 bg-white flex flex-col h-[calc(100dvh-4rem)]">
      <ThreadHeader
        otherParty={otherParty}
        listing={
          listing
            ? {
                id: listing.id,
                title: listing.title,
                price_kobo: listing.price_kobo,
                status: listing.status,
              }
            : null
        }
        primaryImageUrl={primaryImageUrl}
        conversationStatus={ctx.status}
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        <MessageThread
          messages={msgResult.messages ?? []}
          hasMore={msgResult.hasMore ?? false}
          currentUserId={user.id}
        />
      </div>
      <MessageComposer
        conversationId={conversationId}
        isPhoneVerified={phoneVerified}
      />
    </div>
  );
}
