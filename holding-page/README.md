# ShowMePrice — Holding Page

Minimal trust holding page for `showmeprice.ng` during private early access.

## What this is

A static HTML page communicating that ShowMePrice is in private early access,
onboarding verified Nigerian sellers first. Single CTA to invited users:
"Open the app" → `app.showmeprice.ng`.

No forms. No waitlist. No public launch messaging.

## Files

- `index.html` — Single self-contained holding page (HTML + inline CSS, fonts via Google Fonts CDN)
- `_redirects` — Cloudflare Pages routing (www → root redirect)
- `robots.txt` — Discourage search indexing during private beta

## Deployment to Cloudflare Pages

### Step 1: Create a new Cloudflare Pages project

1. Log into Cloudflare dashboard
2. Workers & Pages → Create application → Pages → Upload assets
3. Project name: `showmeprice-holding` (or whatever you prefer)
4. Upload all three files from this directory
5. Click "Deploy site"

The project should be live at something like `showmeprice-holding.pages.dev` within ~1 minute.

### Step 2: Add custom domain

1. In the new Pages project → Custom domains → Set up a custom domain
2. Add `showmeprice.ng`
3. Cloudflare will check DNS and prompt for configuration

### Step 3: DNS configuration

In your DNS provider (or Cloudflare DNS if showmeprice.ng is on Cloudflare):

- Update the existing A or CNAME record for `showmeprice.ng` root (apex)
  to point to the new Cloudflare Pages project
- Add a CNAME for `www.showmeprice.ng` pointing to `showmeprice.ng` (the `_redirects` file handles the redirect)

If showmeprice.ng is already on Cloudflare's nameservers, this is automatic
once you add the custom domain in Step 2.

### Step 4: Verify

After DNS propagation (usually minutes, can take up to a few hours):

- Visit `https://showmeprice.ng` → should show the holding page
- Visit `https://www.showmeprice.ng` → should redirect to `https://showmeprice.ng`
- Click "Open the app" → should attempt to navigate to `https://app.showmeprice.ng`
  (will fail until `app.showmeprice.ng` subdomain is configured separately)

## Separately: app.showmeprice.ng configuration

This is a separate piece of work, not part of this project.

1. In your existing ShowMePrice product Cloudflare Pages project (`showmeprice-ng-v2`):
   - Custom domains → Set up a custom domain
   - Add `app.showmeprice.ng`
2. In DNS:
   - Add CNAME for `app` → `showmeprice-ng-v2.pages.dev` (or auto-managed if Cloudflare DNS)
3. Verify HTTPS provisions and product loads at `https://app.showmeprice.ng`

## Future: migration to Path A

When the private beta concludes and you want the product accessible at the
root domain:

1. Update the product Cloudflare Pages project to add `showmeprice.ng` custom domain
2. Remove `showmeprice.ng` custom domain from this holding page project
3. Either delete this holding page project entirely OR keep as a redirect from
   `app.showmeprice.ng` → `showmeprice.ng`

## Editing the holding page

The entire page is in `index.html`. Inline CSS, no build step.

To update text:
- Hero headline: search for `Buy and sell with`
- Lead paragraphs: search for `class="lead"`
- Footer signature: search for `signature-name`

To redeploy after edits:
- Upload modified `index.html` to the Cloudflare Pages project
- (Or set up Git integration so future pushes auto-deploy)

## Design notes

- **Typography:** Crimson Pro (serif, for editorial gravitas) + JetBrains Mono (system/technical feel)
- **Color:** Warm off-white background, deep ink text, single accent of restrained teal
- **Motion:** One quiet entrance animation, single pulsing status indicator
- **No emojis. No gradients. No marketing energy.**

The aesthetic is editorial restraint, not startup landing page.
