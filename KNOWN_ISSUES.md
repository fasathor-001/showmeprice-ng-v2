# KNOWN_ISSUES.md

Tracked issues. Severity: critical, high, medium, low.

When fixing, move from `## Open` to `## Resolved` with commit hash and date.

## Open

### K-001 — admin role visible to all readers (low)

**Symptom:** `profiles_public_read` exposes the `role` column. Anyone reading any profile can see who's an admin.

**Severity:** low. `role` is `null` or `'admin'` — no secret value. The platform-wide admin list being technically discoverable is similar to public moderator lists on most platforms.

**Fix (when prioritized):** Replace `profiles_public_read` with column-level partitioning — public columns to all, `role` and `is_disabled` only to self + admins. Requires either a view-based RLS pattern or splitting profile-sensitive data into a separate `profiles_admin_data` table.

**Not blocking.** Revisit during Phase I (admin/polish) or sooner if reach for hardening pass.

## Resolved

(none yet)
