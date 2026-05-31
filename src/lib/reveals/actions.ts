"use server";

// Feature N slice 2 — server-action wrapper for the reveal_seller_contact RPC
// (migration E.2.21.0, slice 1).
//
// SECURITY CONTRACT (the reason this wrapper exists):
//   - The RPC does NOT verify p_buyer_id against auth.uid(); the RPC comment
//     explicitly defers that bind to this wrapper. The buyer_id passed to the
//     RPC is taken from the AUTHENTICATED SESSION, never from a client-supplied
//     argument. The client of this action passes only sellerId + listingId.
//   - requireActiveUser() rejects suspended buyers (J.4 defense-in-depth) BEFORE
//     the RPC fires, so a suspended buyer cannot consume a free reveal nor
//     surface a whatsapp number even if middleware was bypassed.
//   - whatsapp is structurally returned only on revealed / already_revealed
//     statuses. The switch below re-strips on every other branch as belt-and-
//     braces against any future RPC drift.
//
// Patterned after:
//   - src/lib/payment-details/actions.ts        — file layout, "use server" shape
//   - src/app/admin/users/actions.ts:122-127    — RPC-call shape via auth.supabase
//   - src/lib/auth/require-active-user.ts       — session+suspension guard
//
// Mounting (slice 3): UI calls revealSellerContactAction(sellerId, listingId).

import { requireActiveUser } from "@/lib/auth/require-active-user";
import type { RevealContactResult } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function revealSellerContactAction(
  sellerId: string,
  listingId: string,
): Promise<RevealContactResult> {
  // 1. Cheap input validation. Fail fast before auth + DB round-trip.
  if (!sellerId || !UUID_RE.test(sellerId)) return { status: "invalid_input" };
  if (!listingId || !UUID_RE.test(listingId)) return { status: "invalid_input" };

  // 2. Auth gate. buyer_id below binds to auth.userId — NEVER to a client
  // argument. Suspended buyers get short-circuited here.
  const auth = await requireActiveUser();
  if (!auth.ok) return { status: auth.reason };

  // 3. RPC call. Note p_buyer_id = auth.userId (session-derived). The RPC
  // is the load-bearing guard: it checks verified-seller, verified-whatsapp,
  // self-reveal, dedup, exhaustion, and atomically rolls back the decrement
  // on listing FK violation.
  const { data, error } = await auth.supabase.rpc("reveal_seller_contact", {
    p_buyer_id: auth.userId,
    p_seller_id: sellerId,
    p_listing_id: listingId,
  });

  if (error) {
    console.error(
      "[revealSellerContactAction] RPC failed",
      error.message,
      { sellerId, listingId, buyerId: auth.userId },
    );
    return { status: "unknown_error" };
  }

  // RETURNS TABLE → supabase-js delivers an array of rows. Defend against
  // shape drift; the function returns exactly one row by construction.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    console.error(
      "[revealSellerContactAction] unexpected RPC shape",
      { row, sellerId, listingId },
    );
    return { status: "unknown_error" };
  }

  const rpcStatus = (row as { status?: unknown }).status;
  const rpcWhatsapp = (row as { whatsapp?: unknown }).whatsapp;
  const rpcRemainingRaw = (row as { free_reveals_remaining?: unknown })
    .free_reveals_remaining;
  const rpcRemaining =
    typeof rpcRemainingRaw === "number" ? rpcRemainingRaw : 0;

  // 4. Map RPC sentinels → typed discriminated union. The wrapper RE-STRIPS
  // whatsapp on every non-reveal branch so a future change to the RPC can
  // never accidentally leak a number through this surface.
  switch (rpcStatus) {
    case "revealed":
    case "already_revealed":
      if (typeof rpcWhatsapp !== "string" || rpcWhatsapp.length === 0) {
        // RPC returned a reveal status but no whatsapp — invariant violation.
        // Refuse rather than surface an empty string to the UI.
        console.error(
          "[revealSellerContactAction] reveal status without whatsapp",
          { rpcStatus, sellerId, buyerId: auth.userId },
        );
        return { status: "unknown_error" };
      }
      return {
        status: rpcStatus,
        whatsapp: rpcWhatsapp,
        freeRevealsRemaining: rpcRemaining,
      };

    case "no_reveals_remaining":
    case "listing_unavailable":
      return {
        status: rpcStatus,
        freeRevealsRemaining: rpcRemaining,
      };

    case "self_reveal":
    case "seller_unavailable":
    case "seller_whatsapp_not_available":
      return { status: rpcStatus };

    default:
      console.error(
        "[revealSellerContactAction] unexpected RPC status",
        { rpcStatus, sellerId, buyerId: auth.userId },
      );
      return { status: "unknown_error" };
  }
}
