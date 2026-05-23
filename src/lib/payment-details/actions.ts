"use server";

// D-120 payment-details — server actions.
//
// Auth model: every action requires a phone-verified actor (D-114 gate —
// money-adjacent flow, same standard as the messaging write paths).
//
// Client choice: authenticated createClient() throughout — payment data is
// owner-data, RLS is defense-in-depth on top of explicit checks. The
// service-role admin client is NOT used.
//
// Race handling: re-share is INSERT-new-share-first THEN UPDATE-old-share-
// superseded. If the UPDATE fails, the buyer briefly sees two non-superseded
// rows; getPaymentDetailsForConversation orders by shared_at DESC and returns
// the freshest, so the buyer sees the new one regardless. The next re-share
// call sweeps any orphans.

import { createClient } from "@/lib/supabase/server";
import { isPhoneVerified } from "@/lib/auth";
import {
  encryptAccountNumber,
  decryptAccountNumber,
} from "@/lib/crypto/payment-details";
import type {
  SetSellerPaymentDetailsResult,
  SharePaymentDetailsResult,
  GetPaymentDetailsForConversationResult,
  MarkPaymentDetailsViewedResult,
  AcceptPaymentDetailsWarningResult,
  PaymentDetailShareSnapshot,
} from "./types";

const BANK_NAME_MAX = 200;
const ACCOUNT_NAME_MAX = 200;
const ACCOUNT_NUMBER_MAX = 50; // generous — NUBAN is 10 but some banks differ.

/** Resolve the signed-in user + their phone-verified status. */
async function resolveActor(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null as null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("verification_status")
    .eq("id", user.id)
    .maybeSingle();
  return {
    user,
    phoneVerified: isPhoneVerified(profile?.verification_status),
  };
}

// --- Action 1: setSellerPaymentDetails -------------------------------------

export async function setSellerPaymentDetails(
  bankName: string,
  accountNumber: string,
  accountName: string,
): Promise<SetSellerPaymentDetailsResult> {
  const supabase = createClient();
  const actor = await resolveActor(supabase);
  if (!actor.user) return { error: "Unauthorized" };
  if (!actor.phoneVerified) return { error: "PhoneVerificationRequired" };

  const bank = bankName.trim();
  const num = accountNumber.trim();
  const name = accountName.trim();
  if (
    bank.length === 0 ||
    bank.length > BANK_NAME_MAX ||
    num.length === 0 ||
    num.length > ACCOUNT_NUMBER_MAX ||
    name.length === 0 ||
    name.length > ACCOUNT_NAME_MAX
  ) {
    return { error: "ValidationError" };
  }

  let encrypted: string;
  try {
    encrypted = await encryptAccountNumber(num);
  } catch (err) {
    console.error("[setSellerPaymentDetails] encryption failed", err);
    return { error: "Unknown" };
  }

  // Check existing row → UPSERT manually (UNIQUE on seller_id; we want
  // last_changed_at populated only on UPDATE, not on first INSERT).
  const { data: existing } = await supabase
    .from("seller_payout_accounts")
    .select("id")
    .eq("seller_id", actor.user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("seller_payout_accounts")
      .update({
        bank_name: bank,
        account_number_encrypted: encrypted,
        account_name: name,
        last_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("seller_id", actor.user.id);
    if (error) {
      console.error("[setSellerPaymentDetails] update failed", error.message);
      return { error: "Unknown" };
    }
    return { ok: true, created: false };
  }

  const { error } = await supabase.from("seller_payout_accounts").insert({
    seller_id: actor.user.id,
    bank_name: bank,
    account_number_encrypted: encrypted,
    account_name: name,
  });
  if (error) {
    console.error("[setSellerPaymentDetails] insert failed", error.message);
    return { error: "Unknown" };
  }
  return { ok: true, created: true };
}

// --- Action 2: sharePaymentDetailsWithBuyer --------------------------------

export async function sharePaymentDetailsWithBuyer(
  conversationId: string,
): Promise<SharePaymentDetailsResult> {
  const supabase = createClient();
  const actor = await resolveActor(supabase);
  if (!actor.user) return { error: "Unauthorized" };
  if (!actor.phoneVerified) return { error: "PhoneVerificationRequired" };

  // Conversation must exist + actor must be the seller in it.
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { error: "NotFound" };
  if (conv.seller_id !== actor.user.id) return { error: "Forbidden" };

  // Seller must have a registered payout account.
  const { data: payout } = await supabase
    .from("seller_payout_accounts")
    .select("bank_name, account_name, account_number_encrypted")
    .eq("seller_id", actor.user.id)
    .maybeSingle();
  if (!payout) return { error: "PaymentDetailsNotRegistered" };

  // D-113 prerequisite — buyer must have revealed seller's contact at least
  // once. Per-seller match (not per-listing): once a buyer has paid the
  // reveal credit for a seller, they're in the trust hierarchy.
  // contact_reveals RLS allows the seller to SELECT rows where seller_id =
  // auth.uid() (see ACTUAL_SCHEMA: contact_reveals seller_read policy).
  const { data: reveal } = await supabase
    .from("contact_reveals")
    .select("id")
    .eq("buyer_id", conv.buyer_id)
    .eq("seller_id", actor.user.id)
    .limit(1)
    .maybeSingle();
  if (!reveal) return { error: "ContactRevealRequired" };

  const snapshot: PaymentDetailShareSnapshot = {
    bank_name: payout.bank_name as string,
    account_name: payout.account_name as string,
    account_number_encrypted: payout.account_number_encrypted as string,
  };

  // INSERT new share first (so the buyer always sees the newest details), then
  // sweep older non-superseded shares for this conversation.
  const { data: inserted, error: insertErr } = await supabase
    .from("payment_detail_shares")
    .insert({
      conversation_id: conversationId,
      seller_id: actor.user.id,
      buyer_id: conv.buyer_id,
      account_snapshot: snapshot,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    console.error("[sharePaymentDetailsWithBuyer] insert failed", insertErr?.message);
    return { error: "Unknown" };
  }

  // Best-effort supersession sweep — never blocks the share.
  const { error: supErr } = await supabase
    .from("payment_detail_shares")
    .update({ superseded_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("id", inserted.id)
    .is("superseded_at", null);
  if (supErr) {
    console.error(
      "[sharePaymentDetailsWithBuyer] supersession sweep failed (non-fatal)",
      supErr.message,
    );
  }

  return { shareId: inserted.id as string };
}

// --- Action 3: getPaymentDetailsForConversation ----------------------------

export async function getPaymentDetailsForConversation(
  conversationId: string,
): Promise<GetPaymentDetailsForConversationResult> {
  const supabase = createClient();
  const actor = await resolveActor(supabase);
  if (!actor.user) return { error: "Unauthorized" };
  if (!actor.phoneVerified) return { error: "PhoneVerificationRequired" };

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { error: "NotFound" };
  if (conv.buyer_id !== actor.user.id) return { error: "Forbidden" };

  // Newest non-superseded share for this conversation. Buyer-RLS allows
  // SELECT WHERE buyer_id = auth.uid().
  const { data: share, error } = await supabase
    .from("payment_detail_shares")
    .select(
      "id, conversation_id, seller_id, buyer_id, account_snapshot, shared_at, buyer_viewed_at, buyer_warning_accepted_at, superseded_at",
    )
    .eq("conversation_id", conversationId)
    .is("superseded_at", null)
    .order("shared_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[getPaymentDetailsForConversation] query failed", error.message);
    return { error: "Unknown" };
  }
  if (!share) return { hasShare: false };

  const snap = share.account_snapshot as PaymentDetailShareSnapshot;
  let plaintext: string;
  try {
    plaintext = await decryptAccountNumber(snap.account_number_encrypted);
  } catch (err) {
    console.error("[getPaymentDetailsForConversation] decrypt failed", err);
    return { error: "Unknown" };
  }

  return {
    hasShare: true,
    share: {
      shareId: share.id as string,
      conversationId: share.conversation_id as string,
      sellerId: share.seller_id as string,
      buyerId: share.buyer_id as string,
      bankName: snap.bank_name,
      accountName: snap.account_name,
      accountNumber: plaintext,
      sharedAt: share.shared_at as string,
      buyerViewedAt: (share.buyer_viewed_at as string | null) ?? null,
      buyerWarningAcceptedAt:
        (share.buyer_warning_accepted_at as string | null) ?? null,
      superseded: false, // we filtered to non-superseded; superseded view in UI
    },
  };
}

// --- Action 4: markPaymentDetailsViewed ------------------------------------

export async function markPaymentDetailsViewed(
  shareId: string,
): Promise<MarkPaymentDetailsViewedResult> {
  const supabase = createClient();
  const actor = await resolveActor(supabase);
  if (!actor.user) return { error: "Unauthorized" };
  if (!actor.phoneVerified) return { error: "PhoneVerificationRequired" };

  // Locate the share and confirm the actor is the buyer.
  const { data: share } = await supabase
    .from("payment_detail_shares")
    .select("id, buyer_id, buyer_viewed_at")
    .eq("id", shareId)
    .maybeSingle();
  if (!share) return { error: "NotFound" };
  if (share.buyer_id !== actor.user.id) return { error: "Forbidden" };

  // Idempotent — don't overwrite an existing viewed_at.
  if (share.buyer_viewed_at) return { ok: true };

  const { error } = await supabase
    .from("payment_detail_shares")
    .update({ buyer_viewed_at: new Date().toISOString() })
    .eq("id", shareId);
  if (error) {
    console.error("[markPaymentDetailsViewed] update failed", error.message);
    return { error: "Unknown" };
  }
  return { ok: true };
}

// --- Action 5: acceptPaymentDetailsWarning ---------------------------------

export async function acceptPaymentDetailsWarning(
  shareId: string,
): Promise<AcceptPaymentDetailsWarningResult> {
  const supabase = createClient();
  const actor = await resolveActor(supabase);
  if (!actor.user) return { error: "Unauthorized" };
  if (!actor.phoneVerified) return { error: "PhoneVerificationRequired" };

  const { data: share } = await supabase
    .from("payment_detail_shares")
    .select("id, buyer_id, buyer_warning_accepted_at")
    .eq("id", shareId)
    .maybeSingle();
  if (!share) return { error: "NotFound" };
  if (share.buyer_id !== actor.user.id) return { error: "Forbidden" };

  if (share.buyer_warning_accepted_at) return { ok: true }; // idempotent

  const { error } = await supabase
    .from("payment_detail_shares")
    .update({ buyer_warning_accepted_at: new Date().toISOString() })
    .eq("id", shareId);
  if (error) {
    console.error("[acceptPaymentDetailsWarning] update failed", error.message);
    return { error: "Unknown" };
  }
  return { ok: true };
}
