// Drizzle schema mirror — central re-export.
// Production state verified post-E.1.6 (Phase E Stage 1 complete).
// 42 tables in `public` schema; admin_audit_log dropped E.1.3.1 (D-081).

// Enums (12 total — 3 added Phase E.1.0; 2 deprecated post-E.1.1)
export * from "./enums";

// Phase A / C.5 / D — existing tables (with E.1.0 column augmentations
// folded into the same files)
export * from "./profiles";
export * from "./businesses";
export * from "./nigerian_states";
export * from "./categories";
export * from "./products";
export * from "./product_images";
export * from "./message_images";
export * from "./seller_verifications";
export * from "./escrow_orders";

// Phase A tables reshaped in E.1.1 (D-055 ALTER-in-place)
export * from "./subscriptions";
export * from "./contact_reveals";

// Phase E.1.1 — Pro-tier core tables
export * from "./payments";
export * from "./credit_balances";
export * from "./tier_features";
export * from "./conversations";
export * from "./messages";
export * from "./notification_preferences";
export * from "./notification_log";
export * from "./user_tier_history";
export * from "./filter_rules";

// Phase E.1.2 — Moderation + observability
export * from "./admins";
export * from "./admin_action_log";
export * from "./admin_emails";
// Phase E Stage 2.A.1 — admin role provisioning audit (D-105, migration E.2.2.0)
export * from "./admin_role_changes";

// Phase E Stage 2.B Commit 1.6 — D-120 registered payment details (migration E.2.7.0)
export * from "./seller_payout_accounts";
export * from "./payment_detail_shares";
export * from "./reports";
export * from "./blocks";
export * from "./filter_actions_log";
export * from "./search_query_log";
export * from "./saved_listings";
export * from "./price_history";

// Phase E.1.3 — Empty schemas for deferred Phase F+/G+/H+ features
export * from "./message_reactions";
export * from "./message_image_analysis";
export * from "./push_subscriptions";
export * from "./saved_searches";
export * from "./seller_auto_reply";
export * from "./restricted_categories";
export * from "./shipping_addresses";
export * from "./delivery_partners";
export * from "./orders";
export * from "./order_status_history";
export * from "./shipping_quotes";
export * from "./escrow_transactions";
export * from "./institution_accounts";
export * from "./kyc_documents";
