# AGENT.md — Working discipline rules

These rules apply to every session. They are non-negotiable.

## Build gate

Before every commit:
- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors
- `pnpm build` — clean exit

If any fails, fix it before committing.

## Commit discipline

- One commit per logical change
- Conventional commit prefix: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- Subject under 72 characters
- Body explains *why*, not *what*

## Next.js + Cloudflare Pages traps

1. **No `unstable_cache` or `revalidateTag`** on Cloudflare Edge. Use `revalidatePath` only. The edge runtime doesn't persist `unstable_cache` between requests, causing silent staleness.

2. **Server Components cannot have event handlers on native elements.** `onClick`, `onChange`, etc. require `"use client"`.

3. **Inline styles beat class styles for CSS specificity** when working around Tailwind cascade quirks.

4. **Routes deploying to Cloudflare must use `export const runtime = "edge"`** in their `page.tsx` or layout where appropriate. `@cloudflare/next-on-pages` requires this — without it, the build fails or pages don't render.

5. **Server Actions need explicit revalidation.** After a mutation, call `revalidatePath()` for every page affected.

## Database discipline

1. **Truth lives in the database, not the migrations folder.** Verify column existence with `information_schema.columns` queries against the live database.

2. **No new migrations without the planner's explicit go-ahead.**

3. **RLS first, not RLS later.** Every new table gets RLS enabled in the same migration that creates it.

4. **Defense in depth for data isolation.** Page-level queries explicitly filter by current user's ID even when RLS would enforce it.

## Role and identity discipline

1. **Never cache role in localStorage.** A previous attempt's `smp:role_hint` caused weeks of subtle bugs. Server reads role from the database, passes it to client components as props.

2. **`user_type` is the canonical user kind.** Values: `buyer`, `seller`. `seller` is a superset of `buyer`.

3. **`role` is reserved for admin elevation only.** `null` for regular users, `'admin'` for admins.

4. **Verification status lives on `businesses.verification_status`**, not on `profiles`.

## Scope discipline

If you notice a bug or smell while working on something else: **note it in `KNOWN_ISSUES.md`, do not fix it**. Scope creep is how phases blow up.

## Hard stops

Every phase ends with a hard stop. The agent reports. The planner reviews. The next phase starts only when the owner says it does.
