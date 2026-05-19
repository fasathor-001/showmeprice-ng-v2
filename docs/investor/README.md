# Investor Materials

Three documents for pre-seed fundraising, plus a shared stylesheet. All HTML, print-optimized to produce clean PDFs via browser print.

## Files

| File | Purpose | Length |
|---|---|---|
| `one-pager.html` | Single-page investor introduction. Send as the first touch. | 1 page |
| `pitch-deck.html` | 16-slide presentation. The meeting deck. | 16 slides |
| `business-plan.html` | Long-form business plan. The follow-up after a good meeting. | ~14–18 pages |
| `styles.css` | Shared design system (typography, colors, print rules). | — |

## How to view

Open any `.html` file directly in a browser (Chrome / Safari / Edge):

```
file:///C:/Users/fasat/showmeprice-ng-v2/docs/investor/one-pager.html
```

Or serve the directory locally with any static server.

## How to export to PDF

The HTML is print-optimized. Browser print produces clean PDFs:

1. Open the file in **Chrome** (best print fidelity)
2. `Ctrl+P` (Cmd+P on Mac) → **Print**
3. **Destination:** Save as PDF
4. **Layout:**
   - `one-pager.html` → **Portrait**, **Letter**
   - `business-plan.html` → **Portrait**, **Letter**
   - `pitch-deck.html` → **Landscape**, **Letter**
5. **Margins:** Default (the CSS handles internal margins via `@page`)
6. **Options:** ✅ "Background graphics" — important; the colored callouts and slide backgrounds rely on this
7. Save as `ShowMePrice-OnePager.pdf` / `ShowMePrice-PitchDeck.pdf` / `ShowMePrice-BusinessPlan.pdf`

Safari and Edge also work but produce slightly different spacing. **Chrome is the reference.**

## Owner TODOs before sending to any investor

Every placeholder in the documents is marked in one of two ways:

- **`[OWNER: ...]`** — bracketed plain-text placeholder (founder bio fields, date, contact info)
- **Rose-bordered "OWNER TODO" callout boxes** — larger blocks that need owner content

Searchable list of `[OWNER: ...]` placeholders:

- **`[OWNER: NAME]`** — your full name (appears in all 3 documents)
- **`[OWNER: Date]`** — pitch date (appears on cover slides and business-plan footer)
- **`[OWNER: email]`** / **`[OWNER: email@showmeprice.ng]`** — investor-facing email
- **`[OWNER: phone]`** — investor-facing phone number
- **`[OWNER: Location]`** — your current location (Lagos, Cape Town, etc.)
- **`[OWNER: ONE-LINE BIO ...]`** — short founder bio (one-pager)
- **`[OWNER: 2–3 sentence bio. ...]`** — longer founder bio (deck slide 14, business plan §15)

Grep across the directory:

```bash
grep -rn "\[OWNER:" docs/investor/
```

Larger TODO callouts in the business plan:
- §15 Team — founder bio block (rose-bordered callout)
- §15 Team — advisors block (rose-bordered callout)

## Editing

Plain HTML and CSS. No build step, no JS, no framework dependencies. Edit in any text editor. Save, reload the browser tab.

If you want to change brand color:
- Open `styles.css`
- Search for `--teal-` variables in the `:root` block
- Replace with your preferred palette
- Re-export PDFs

If you want to add or remove slides:
- Open `pitch-deck.html`
- Each slide is `<section class="slide">...</section>`
- Update slide numbers in the `.footnote` divs

## Investor send order

Recommended workflow for warm intros:

1. **First touch:** one-pager PDF (1 page, scannable in 2 minutes)
2. **If interested:** pitch-deck PDF (16 slides, 10-minute read)
3. **If they ask for more:** business-plan PDF (full doc, 20-minute read)

The deck is designed to stand alone in a presentation — you can present the HTML directly in a browser fullscreen (F11) without exporting to PDF if you're meeting on screen-share.

## Sources cited

Market figures in the documents reference:

- **Mordor Intelligence** — Nigerian e-commerce market sizing (2025–2031)
- **ResearchAndMarkets** — Nigerian B2C e-commerce (2025–2029)
- **2025 social commerce market report** — Nigerian social commerce (2025–2030)
- **Jiji** — public app listing + industry coverage on classifieds scale

Before sending to investors, **verify each market figure against its current source** — these reports update annually and a figure that was accurate at draft time may be stale by pitch date. The directional story (large, growing, mobile-first, trust-bottlenecked) is robust regardless.

## Version control

These files are committed to the main repository alongside the application code. Every edit to investor materials gets a git commit so you can roll back to a prior pitch version if needed.
