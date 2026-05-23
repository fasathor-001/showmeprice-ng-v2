# RUNBOOK.md

Operational procedures.

## Local development

```bash
pnpm install
cp .dev.vars.example .dev.vars   # fill in Supabase credentials when Phase A lands
pnpm dev
```

## Build gate (run before every commit)

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Local preview of production build

To verify a deploy will work before pushing:

```bash
pnpm cf:build      # produces .vercel/output/static
pnpm cf:preview    # serves it locally
```

## Deploying

Cloudflare Pages auto-deploys on push to `main` via the GitHub connection set up in the Cloudflare dashboard. To deploy:

```bash
git push origin main
```

That's it. Check the Cloudflare Pages dashboard for build status.

## Adding a new Supabase migration (after Phase A)

1. Edit Drizzle schema files in `src/db/schema/`
2. Run `pnpm db:generate` to generate SQL in `supabase/migrations/`
3. Review the SQL by eye
4. Apply locally with `pnpm db:migrate`
5. Commit schema + SQL
6. Apply to production via Supabase dashboard SQL editor. Production migrations are owner-initiated, never agent-initiated.

## Rolling back a bad commit

For code:

```bash
git revert <hash>
git push
```

Cloudflare Pages will redeploy automatically.

For DDL: no automatic rollback. Migrations are forward-only. Write a new migration that reverses the bad one.

## When `pnpm build` fails on Cloudflare Pages but passes locally

1. Verify Node version on Cloudflare matches local (Node 20)
2. Verify pnpm version on Cloudflare matches local (pnpm 9)
3. Check `.dev.vars` has env vars that aren't yet set in Cloudflare dashboard
4. Check for `export const runtime = "edge"` missing on a dynamic route
5. Check for `unstable_cache` or `revalidateTag` that snuck in

## When you see a stale page after a mutation

1. Verify the server action called `revalidatePath()`
2. Verify it was called for the right path
3. Check the `runtime` export on the page

## When auth breaks after a Supabase change

1. Check Supabase Auth → URL Configuration → redirect URLs include all deploy URLs
2. Check the `@supabase/ssr` middleware is wired correctly

## Generating the payment-details encryption key (D-120)

`PAYMENT_DETAILS_ENCRYPTION_KEY` must be a Base64-encoded 32-byte value (AES-256). It encrypts seller bank-account numbers at rest via Web Crypto in `src/lib/crypto/payment-details.ts`.

Generate one (do this once per environment — local dev / staging / production):

```bash
openssl rand -base64 32
```

Where to put it:

- **Local dev:** add to `.dev.vars` (gitignored). The value never leaves the dev machine.
- **Production:** add to Cloudflare Pages → Project → Settings → Environment variables → Production. Mark as encrypted secret.
- **Staging:** same as production but in the Preview environment scope.

**Rotation:** rotating the key invalidates all stored ciphertext (existing rows become un-decryptable). At MVP scale this is acceptable — schedule rotation only with a planned re-share flow that re-encrypts under the new key. Track as a future K-issue if compromise is suspected.
