// Feature N slice 2 — discriminated-union result for the reveal server action.
//
// The seven first statuses mirror the public.reveal_seller_contact RPC sentinels
// (migration E.2.21.0). The four trailing statuses are wrapper-layer outcomes
// the UI also needs to discriminate against (auth + input + transport).
//
// CRITICAL: `whatsapp` is structurally present ONLY on the two reveal statuses.
// The narrower a status case, the fewer fields it carries — the UI cannot
// accidentally read a whatsapp value on (e.g.) no_reveals_remaining because
// the union variant simply has no such field. Defense-in-depth: the RPC
// already refuses to return whatsapp on non-reveal branches; this type
// statically prevents the wrapper from re-introducing a leak.

export type RevealContactResult =
  // ---- RPC sentinels (success paths that surface whatsapp) ----
  | {
      status: "revealed";
      whatsapp: string;
      freeRevealsRemaining: number;
    }
  | {
      status: "already_revealed";
      whatsapp: string;
      freeRevealsRemaining: number;
    }
  // ---- RPC sentinels (no whatsapp; counter still useful) ----
  | {
      status: "no_reveals_remaining";
      freeRevealsRemaining: number;
    }
  | {
      status: "listing_unavailable";
      freeRevealsRemaining: number;
    }
  // ---- RPC sentinels (no whatsapp, no counter) ----
  | { status: "self_reveal" }
  | { status: "seller_unavailable" }
  | { status: "seller_whatsapp_not_available" }
  // ---- Wrapper-layer outcomes ----
  | { status: "unauthenticated" }
  | { status: "suspended" }
  | { status: "invalid_input" }
  | { status: "unknown_error" };
