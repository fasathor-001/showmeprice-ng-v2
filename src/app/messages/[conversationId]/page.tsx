import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/messaging/actions";
import { isPhoneVerified } from "@/lib/auth";
import { getProductImagePublicUrl } from "@/lib/storage";
import { MessageComposer } from "@/components/messaging/MessageComposer";
import { MessageThread } from "@/components/messaging/MessageThread";
import { ThreadHeader } from "@/components/messaging/ThreadHeader";
import { ThreadSkeleton } from "@/components/messaging/skeletons/ThreadSkeleton";

export const runtime = "edge";

// Stage 2.B Commit 3 (Commit 6 K-043: Suspense + skeleton).
//
// Thread page wraps the data-fetching async work in a Suspense boundary so
// users see ThreadSkeleton while the conversation context + messages +
// profile fetches complete. Once data resolves, the real ThreadHeader +
// MessageThread + MessageComposer stream in.
//
// MessageThread now owns its own `flex-1 overflow-y-auto min-h-0` (moved
// from this page's wrapping div in Commit 6) so it can hold a ref to its
// own scroll container for "Load earlier messages" scroll preservation.

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

export default function MessageThreadPage({ params }: Props) {
  return (
    <Suspense fallback={<ThreadSkeleton />}>
      <ThreadContent conversationId={params.conversationId} />
    </Suspense>
  );
}

async function ThreadContent({ conversationId }: { conversationId: string }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/sign-in?next=/messages/${conversationId}`);
  }

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

  if (msgResult.error === "Unauthorized") {
    redirect(`/sign-in?next=/messages/${conversationId}`);
  }
  if (msgResult.error === "NotFound" || msgResult.error === "Forbidden") {
    notFound();
  }
  if (msgResult.error) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-ink-600 max-w-md text-center">
          Couldn&apos;t load this conversation. Refresh to retry.
        </div>
      </div>
    );
  }

  const ctx = ctxResult.data as ConversationContextRow | null;
  if (!ctx) notFound();

  const isBuyer = ctx.buyer_id === user.id;
  const otherParty = pickOne(isBuyer ? ctx.seller : ctx.buyer);
  if (!otherParty) notFound();

  const listing = pickOne(ctx.listing);
  let primaryImageUrl: string | null = null;
  if (
    listing &&
    Array.isArray(listing.product_images) &&
    listing.product_images.length > 0
  ) {
    const sorted = [...listing.product_images].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );
    primaryImageUrl = getProductImagePublicUrl(sorted[0]!.storage_path);
  }

  return (
    <>
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
      <MessageThread
        conversationId={conversationId}
        initialMessages={msgResult.messages ?? []}
        hasMore={msgResult.hasMore ?? false}
        currentUserId={user.id}
      />
      <MessageComposer
        conversationId={conversationId}
        isPhoneVerified={phoneVerified}
        currentUserId={user.id}
      />
    </>
  );
}
