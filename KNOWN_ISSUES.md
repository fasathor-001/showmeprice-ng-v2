# KNOWN_ISSUES.md

Tracked issues. Severity: critical, high, medium, low.

When fixing, move from `## Open` to `## Resolved` with commit hash and date.

## Open

### K-001 — admin role visible to all readers (low)

**Symptom:** `profiles_public_read` exposes the `role` column. Anyone reading any profile can see who's an admin.

**Severity:** low. `role` is `null` or `'admin'` — no secret value. The platform-wide admin list being technically discoverable is similar to public moderator lists on most platforms.

**Fix (when prioritized):** Replace `profiles_public_read` with column-level partitioning — public columns to all, `role` and `is_disabled` only to self + admins. Requires either a view-based RLS pattern or splitting profile-sensitive data into a separate `profiles_admin_data` table.

**Not blocking.** Revisit during Phase I (admin/polish) or sooner if reach for hardening pass.

### K-002 — Accessibility pass needed before launch (medium)

Phase A.5 set up the foundation (focus rings via `focus-visible`, semantic HTML, ARIA labels on icon buttons) but a full accessibility audit hasn't been done. Things to check before launch (Phase J):
- Color contrast ratios on teal-on-white and verified-green-on-bg (WCAG AA 4.5:1)
- Keyboard navigation order through hero / categories / featured listings
- Screen reader pass-through on the search bar (location chip + submit button in same form)
- Image alt text once real product images are wired (Phase D)
- Reduced-motion preferences (currently `group-hover:scale-105` ignores `prefers-reduced-motion`)

Not blocking for Phase B onward. Owner / planner can add this to Phase J's scope.

### K-003 — Spam signups possible (email confirmation OFF)

Per D-023, email confirmation is off at launch. This means anyone with a working SMTP-deliverable email can create a profile without proving they own the email. Risks:
- Bots creating mass accounts to abuse contact-reveal (Phase F)
- Spam profiles muddying the verified-seller signal
- Email-typo signups that can't recover their account

Not blocking for Phase B. Mitigations available if abuse surfaces:
- Flip email confirmation ON (1-line Supabase Dashboard change)
- Add rate-limiting to signups by IP (Cloudflare Pages can do this via Workers config)
- Require email verification before seller upgrade (Phase D could enforce this even if buyer signups don't)

### K-004 — No "delete account" flow

Phase B creates accounts but provides no way to delete one. RLS policies + cascade rules in Phase A's schema would technically allow it, but there's no UI. Buyers should be able to self-delete; sellers may need admin-mediated deletion to handle pending escrow/disputes (Phase H).

Not blocking for Phase B. Add in Phase I (admin/polish) or sooner if requested.

### K-006 — Recovery session doesn't sign out other sessions after password change

When a user resets their password via the recovery flow, their other active sessions (on other devices or browsers) remain signed in until their session tokens naturally expire (typically 1 hour for the access token, longer for refresh tokens).

If the password reset was triggered because someone else had access to the account (account compromise), the attacker's session stays valid until token expiry.

**Severity:** medium. Real security concern but with bounded blast radius (existing sessions can't refresh once the refresh token expires, and Supabase invalidates refresh tokens on password change in newer versions — needs verification for the version we're on).

**Fix when prioritized:** After successful password update, call `supabase.auth.signOut({ scope: "others" })` to invalidate all other sessions for that user. This is a single line addition to `updatePasswordAction` after `updateUser` succeeds.

**Not blocking for Phase B.7.** Add to Phase I (polish) or sooner if abuse surfaces.

### K-007 — Two `/categories` links currently 404 (low)

Phase C ships with two UI links pointing at `/categories` (no slug):

1. Home page "Popular categories" section, "View all →" link
2. Category page breadcrumb, "← All categories" link

Both return 404 (the Phase B.6.1 explicit not-found page). A user clicking either gets a "Page not found / Go home" interstitial rather than a category overview.

**Severity:** low. Both links are secondary navigation; primary discovery is via the home page Popular Categories tiles (which work) and the marketplace browse (which works). A buyer hitting the 404 can click "Go home" or use the header nav to recover.

**Fix:** build a `/categories` index page that lists all 14 top-level categories with their icons (similar to home page Popular Categories but showing all 14, not the truncated 7). About 20 minutes of work.

**Scheduled:** Phase C.5 (next phase). Not blocking Phase C launch.

## Resolved

(none yet)
