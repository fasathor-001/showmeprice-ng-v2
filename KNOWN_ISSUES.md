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

## Resolved

(none yet)
