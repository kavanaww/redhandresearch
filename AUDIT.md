# Site Audit — Red Hand Research

**Date:** 2026-05-06
**Scope:** All 27 HTML pages, `pricing.js`, `sitemap.xml`, `robots.txt`, image assets
**Method:** Static analysis — no runtime testing. Every finding cites file + line. No code was changed.

---

## Executive Summary

| Severity | Count | Categories Hit |
|---|---|---|
| **HIGH** | 6 | Money-path, performance, DRY |
| **MEDIUM** | 15 | SEO/trust, broken features, mobile, consistency, money-path |
| **LOW** | 8 | Polish, code quality |

The single most urgent finding is **HIGH-1** below: bundle pricing advertised on the catalog page is not actually applied at checkout, causing customer overcharges of up to $116 per order on certain products.

---

## HIGH severity (block ad spend / money-path / customer-facing)

### HIGH-1 — Advertised bundle pricing is never applied at checkout
- **Files:** [products.html:957-1012](products.html#L957) (`handleAddToCart`); affects callouts on lines 444 (DSIP), 454 (GHK-CU), 591 (KLOW 80), 527 (Glow 70), 654 (NA Selank), 773 (TA1), 812 (VIP), 396 (BPC-157/TB-500 Blend)
- **Why it matters:** Cards advertise "Buy 2 — 2 vials for $75 (save $55)" on DSIP, "$150" on GHK-CU, "$264" on KLOW 80, etc. `handleAddToCart` never reads the card's `data-bundle="..."` attribute and never sets `bundlePrice` on the cart item, so `itemEffectiveTotal` in pricing.js falls through to the generic non-bundled formula `(price-5)*qty`. Concrete impact: a customer adding 2 DSIP vials sees "$75" advertised but actually pays $120 at checkout — **overcharged $45**. KLOW 80 overcharges by **$116** (advertised $264, actual $380). NA Selank goes the other way (under-charged by $4 vs the bundle).
- **Fix:** In `handleAddToCart`, read `card.dataset.bundle` and include `bundlePrice: parseFloat(card.dataset.bundle) || null` in the cart item shape. Same fix in `index.html` `addToCart` ([index.html:788](index.html#L788)) and the 7 detail-page `handleDetailAddToCart` functions.

### HIGH-2 — TB-500 dropdown multi-vial selection mis-prices in cart
- **Files:** [products.html:783-797](products.html#L783) (qty-select with total prices), pricing.js's `itemEffectiveTotal` (no hardcoded TB-500 rule equivalent to BPC-157's)
- **Why it matters:** Same shape as the BPC-157 bug we patched. If a user picks "2 vials — $140" from TB-500's qty-select, the cart stores `{price: 140, qty: 2}` and `itemEffectiveTotal` computes `(140-5)*2 = $270` — overcharging by $130. BPC-157 has a hardcoded special case (lines 86-90 of pricing.js) that fixes this; TB-500 does not.
- **Fix:** Add a TB-500 special case to `itemEffectiveTotal`: `if (item.name === 'TB-500') { qty=1→75, qty=2→140, qty>=3→65*qty; }`. Or refactor the qty-select to store per-vial price like BPC-157 effectively does.

### HIGH-3 — Logo images are render-blocking and 350+ KB each
- **Files:** `logo.png` (365 KB), `logo_card.png` (360 KB) — referenced in nav of all 27 pages
- **Why it matters:** Both are small visual marks (40×40 in nav) but ship as ~360 KB PNGs on every page load, blocking First Contentful Paint. On 4G this is ~700ms wasted per page; on slow networks much worse. Likely tanking Lighthouse mobile score below ad-platform thresholds.
- **Fix:** Convert to WebP (typically 60-80% smaller for same quality) and resize source PNGs to 2× nav size (80×80) or use SVG. Target <20 KB total for the logo asset.

### HIGH-4 — Massive HTML duplication: nav, footer, age-gate, :root vars
- **Files:** All 27 HTML pages
- **Why it matters:** Identical ~18-line `<nav>` block, age-verification overlay, `:root` color block (`--red:#c0392b` etc.), and Google Fonts link copied verbatim across all 27 pages. Footer is duplicated across 19 pages (8 product detail pages have a stripped-down footer — see MEDIUM-9). Updating one menu item, one disclaimer line, or one color value requires 27 edits, and every drift becomes a separate finding (this audit caught several). Adding a new page silently inherits stale snapshots.
- **Fix:** Extract shared CSS (`:root`, nav styles, footer styles, age-gate, banner) to a single external `styles.css`. Either inline-include the nav/footer/age-gate via a small JS template (e.g., `<script src="layout.js">` that injects them on load), or migrate to a static-site generator that supports partials. Either approach makes future drift impossible.

### HIGH-5 — All 27 pages still have placeholder Google Search Console code
- **Files:** All 27 HTML pages — search for `REPLACE_WITH_VERIFICATION_CODE`
- **Why it matters:** Until you paste the real verification token from Search Console, Google cannot verify ownership, you can't submit your sitemap, and you have zero indexing/impression/CTR insights. This blocks any data-driven SEO and ad-spend ROI tracking.
- **Fix:** Paste the real verification code (one find-and-replace across the repo). If you intend to keep the placeholder until launch, demote this to MEDIUM — but right now the site is invisible to Search Console.

### HIGH-6 — Inline CSS duplicated ~300 lines × 27 pages
- **Files:** All 27 HTML pages
- **Why it matters:** Each page ships a ~300+ line `<style>` block with mostly identical rules. That's roughly 8,000 lines of duplicate CSS across the site, all render-blocking, none cacheable across pages. Real impact compounds with HIGH-3 (slow images) to push mobile load times past ad-platform quality thresholds.
- **Fix:** Same fix as HIGH-4 — extract a shared `styles.css`. Each page then keeps only page-specific styles inline (typically <50 lines).

---

## MEDIUM severity (fix this week)

### MEDIUM-1 — Newsletter "Subscribe" button does nothing on 19 pages
- **Files:** Every page with `<div class="footer-newsletter">` *except* `index.html` — that's 19 of 20 pages with newsletter UI ([cart.html:264](cart.html#L264), [order.html:313](order.html#L313), [products.html:854](products.html#L854), all 7 articles, all 4 legal pages, [about.html:465](about.html#L465), [research.html:278](research.html#L278), [certificates.html](certificates.html), [faqs.html:566](faqs.html#L566))
- **Why it matters:** Only [index.html:707](index.html#L707) wraps the input + button in a real `<form action="...mailchimp...">`. All other pages render the input + button but have no form wrapper, so the button submits nothing. Customers who try to subscribe are silently ignored.
- **Fix:** Replace the placeholder div on the 19 pages with the same `<form>` block from index.html (or extract to shared layout, see HIGH-4).

### MEDIUM-2 — Missing meta descriptions on all 27 pages
- **Files:** All 27 HTML pages
- **Why it matters:** No `<meta name="description">` anywhere in the repo. Google generates its own snippets, often poorly. Hurts CTR from search and from social shares with no preview text.
- **Fix:** Add a unique 150-160 character description to every page's `<head>`. Product pages should include the compound name and "research use only".

### MEDIUM-3 — Missing Open Graph / Twitter card tags on all 27 pages
- **Files:** All 27 HTML pages
- **Why it matters:** Sharing any URL on X, Facebook, Discord, iMessage etc. produces no preview card — just a bare URL. Reduces social CTR and looks unprofessional.
- **Fix:** Add `og:title`, `og:description`, `og:image` (using `logo_card.png` after MEDIUM-3.5 it's optimized), `og:url`, plus the Twitter equivalents, to every page's `<head>`.

### MEDIUM-4 — No Product schema (JSON-LD) on any product page
- **Files:** [products.html](products.html), all 8 product detail pages
- **Why it matters:** Without schema.org `Product` markup, Google can't show price/availability rich snippets, can't surface in Google Shopping, and can't display product info in voice/AI search. Direct competitive disadvantage for an ecommerce site.
- **Fix:** Add a `<script type="application/ld+json">` block on each product detail page with `@type: "Product"`, `name`, `description`, `image`, `offers.price`, `offers.priceCurrency`, `offers.availability`. Drive the price from `PRICING` in pricing.js if you template the pages.

### MEDIUM-5 — Promo + Zelle discount stack multiplicatively
- **Files:** [order.html:405](order.html#L405) (promo applied to subtotal), [order.html:444-445](order.html#L444) (Zelle 5% applied to `_finalTotal` which already includes promo)
- **Why it matters:** A customer using `MOOSE20` (20% off) and selecting Zelle gets 20% × 5% stacked = 24% effective discount. Verify intent — Zelle's 5% is offered to offset card processing fees, which the customer isn't using anyway, so stacking with promo codes was likely not designed for.
- **Fix:** Decide intent. If stacking is unintended: when `payMethod === 'zelle' && activePromo`, either skip the promo or skip the Zelle discount (whichever is larger). Surface the choice to the customer. If stacking is intended: add a comment in pricing.js documenting the policy.

### MEDIUM-6 — `rhr_promo` and `rhr_shipping` localStorage stay alive across cart-empty events
- **Files:** [cart.html:510-513](cart.html#L510) (`removeItem`), [cart.html:319-321](cart.html#L319) (`saveCart`)
- **Why it matters:** When a customer empties the cart, `rhr_promo` persists in localStorage. They open the site fresh later, add items, and a previously-applied promo code is silently re-applied without indication. Same for `rhr_shipping`. This can lead to confusing customer-support cases ("why did I get 20% off this order?") and unintended discount leakage.
- **Fix:** In `saveCart`, when the cart becomes empty, also `localStorage.removeItem('rhr_promo')` and `localStorage.removeItem('rhr_shipping')`. Or: on cart load, if the promo is silently re-applied, show a banner ("Promo XYZ from previous session is still active — clear?").

### MEDIUM-7 — BAC Water price drift between sidebar and catalog
- **Files:** [cart.html:212](cart.html#L212) passes `price=25`; [pricing.js:72](pricing.js#L72) and [products.html:829](products.html#L829) use `24.99`
- **Why it matters:** A customer adding BAC Water from the cart sidebar's quick-add button is charged $25.00 for one vial; from products.html they're charged $24.99. The 2+ vial price floors at $19.99/vial regardless (handled by hardcoded rule), so it only affects the qty=1 case. Functionally a $0.01 inconsistency, but it's the kind of drift that leaks into invoices and accounting.
- **Fix:** Change [cart.html:212](cart.html#L212) to `quickAdd('Hospira BAC Water','Standard',24.99,20)` and update the button text from `+ Add $25` to `+ Add $24.99` (or update pricing.js to $25 — pick one).

### MEDIUM-8 — `handleDetailAddToCart` defined separately on every product detail page
- **Files:** [bpc-157.html:326](bpc-157.html#L326), [tb-500.html:160](tb-500.html#L160), [glp-1s.html](glp-1s.html), [glp-2t.html](glp-2t.html), [glp-3r.html](glp-3r.html), [glow-70.html](glow-70.html), [nad-plus.html](nad-plus.html), [bpc-tb500-blend.html](bpc-tb500-blend.html)
- **Why it matters:** Eight near-identical copies of the same function, each hardcoding the product name. Already drifted: bpc-157.html version is formatted, the other 7 are minified one-liners. Means HIGH-1's bundlePrice fix has to be applied 8 times — exactly the same anti-pattern this audit was commissioned to find.
- **Fix:** Move to a shared `cart-add.js` that reads product name + price from `data-*` attributes on the page, and references PRICING from pricing.js for bundle setup.

### MEDIUM-9 — Footer drift: 8 product detail pages have stripped-down footer
- **Files:** [bpc-157.html](bpc-157.html), [tb-500.html](tb-500.html), [glp-1s.html](glp-1s.html), [glp-2t.html](glp-2t.html), [glp-3r.html](glp-3r.html), [glow-70.html](glow-70.html), [nad-plus.html](nad-plus.html), [bpc-tb500-blend.html](bpc-tb500-blend.html) — all use minimal footer (just `.footer-bottom`); the other 19 pages have full footer with newsletter form and link columns
- **Why it matters:** Customers landing on a product detail page from search lose access to the newsletter signup, the support links, and the legal/policy column links. Also a brand-consistency issue.
- **Fix:** Standardize footer across all pages (after fixing MEDIUM-1 so the form actually works).

### MEDIUM-10 — `--light-gray` CSS variable missing from 6 product detail pages
- **Files:** [glp-1s.html:9](glp-1s.html#L9), [glp-2t.html:9](glp-2t.html#L9), [glp-3r.html:9](glp-3r.html#L9), [glow-70.html:9](glow-70.html#L9), [bpc-tb500-blend.html:9](bpc-tb500-blend.html#L9), [nad-plus.html:9](nad-plus.html#L9)
- **Why it matters:** The `:root` block on these 6 pages omits `--light-gray:#f0eeeb;`. Any rule referencing `var(--light-gray)` silently falls through to `inherit`/`initial`, producing visible color drift on those pages. Other pages define it.
- **Fix:** Add `--light-gray:#f0eeeb;` to the `:root` block in all 6 files. (Or eliminate the issue with HIGH-4's shared stylesheet.)

### MEDIUM-11 — Class name drift: `.price-tier.best-value` vs `.price-tier.bundle`
- **Files:** [bpc-157.html:83](bpc-157.html#L83) and tb-500.html use `.best-value`; the other 6 detail pages use `.bundle`
- **Why it matters:** Same visual treatment, two different class names. JavaScript or future automation has to handle both. Clear sign of copy-paste drift.
- **Fix:** Pick one (`.best-value` reads more clearly), update the other 6 pages.

### MEDIUM-12 — Quantity +/- buttons are 34×34px (under touch-target standard)
- **Files:** [cart.html:71](cart.html#L71) (`.qty-btn { width:34px; height:34px; }`)
- **Why it matters:** Apple's HIG specifies 44×44px minimum, Material recommends 48×48px. At 34px, mobile users mis-tap and accidentally change quantities — a high-friction failure right at checkout.
- **Fix:** Bump to 44×44 baseline; 48×48 at the 540px breakpoint with extra spacing between the +/- buttons.

### MEDIUM-13 — order.html form inputs trigger iOS zoom on focus
- **Files:** [order.html:60-65](order.html#L60) (`.form-group input { ... font-size:14px; ... }`)
- **Why it matters:** iOS Safari zooms the page when a user taps any input with `font-size < 16px`. Every form field on the checkout page triggers this. Users have to pinch-zoom back out to continue, often abandoning checkout.
- **Fix:** Set form input `font-size` to `16px` minimum (visual size can be controlled with line-height/padding).

### MEDIUM-14 — `console.error` left in production
- **Files:** [order.html:573](order.html#L573)
- **Why it matters:** `console.error('Bankful error:', err)` ships to production. Logs server-error details to the customer's browser console, which can leak implementation details and helps anyone trying to probe the payment flow.
- **Fix:** Remove the `console.error` line, or replace with a generic log (and keep the user-facing error message that's already there).

### MEDIUM-15 — Render-blocking Google Fonts on every page
- **Files:** All 27 HTML pages — `<link href="https://fonts.googleapis.com/css2?...">` in `<head>`
- **Why it matters:** Without `&display=swap`, the browser blocks text rendering until fonts load (FOIT). On slow networks customers see a blank page for 1-2 seconds. Compounds with HIGH-3 and HIGH-6.
- **Fix:** Append `&display=swap` to the URL on every page (or once in shared layout). Also consider self-hosting the two font families to eliminate the third-party request entirely.

---

## LOW severity (polish / backlog)

### LOW-1 — Page titles are generic
- **Files:** All 27 — e.g., [index.html](index.html) is just "Red Hand Research"
- **Why:** Misses easy SEO keywords. **Fix:** Append a tagline like "| Research Peptides & Analytical Standards" to every page title.

### LOW-2 — `#fff` vs `#ffffff` notation drift
- **Files:** 6 minified product detail pages use `#fff`; 21 others use `#ffffff`
- **Why:** Equivalent but inconsistent — harder to grep/replace. **Fix:** Standardize during HIGH-4 cleanup.

### LOW-3 — Inconsistent media query breakpoints
- **Files:** index.html (900/540), cart.html (1024/900/540), products.html (900/540/380), order.html (1024/900/540)
- **Why:** Tablet sizes render differently per page. **Fix:** Standardize on 1024/768/540 across all pages.

### LOW-4 — Carousel and product-grid images missing `loading="lazy"`
- **Files:** [index.html](index.html) carousel cards, [products.html](products.html) grid
- **Why:** All product images load immediately even when off-screen. **Fix:** Add `loading="lazy"` to every below-fold `<img>`.

### LOW-5 — Dead `href="#"` link in catalog banner
- **Files:** [products.html:268](products.html#L268)
- **Why:** "Free shipping over $150" link goes nowhere. **Fix:** Remove the `<a>` wrapper or point to `shipping-policy.html`.

### LOW-6 — products.html top banner copy inconsistent with other pages
- **Files:** [products.html:268](products.html#L268) advertises "Volume pricing available — buy 3+ vials and save"; cart.html:161 and other pages advertise "Bulk Pricing Available on 2+ Units"
- **Why:** "3+" vs "2+" is materially different. **Fix:** Pick one and make consistent.

### LOW-7 — Carousel doesn't respect `prefers-reduced-motion`
- **Files:** [index.html](index.html) carousel JS
- **Why:** Users with vestibular sensitivity preference will still see auto-rotation. **Fix:** Wrap the auto-rotate `setInterval` in a `prefers-reduced-motion: no-preference` check.

### LOW-8 — Spec value font size drift on product detail pages
- **Files:** bpc-157.html / tb-500.html use `.spec-value { font-size:14px }`; the other 6 detail pages use `13px`
- **Why:** Spec rows render at slightly different sizes across the catalog. **Fix:** Standardize during HIGH-4 cleanup.

---

## Verified safe / not-bugs

These look like findings but are intentional or already correct. Documenting so they don't get re-flagged:

- **Cloudflare Worker URL exposed in client JS** ([order.html:332](order.html#L332)) — by design; clients must call it. Bankful credentials live server-side in the Worker.
- **Mailchimp list ID and audience ID in `<form action>`** ([index.html:707](index.html#L707)) — by Mailchimp's design; this is a public submission endpoint, not a credential.
- **Formspree form ID exposed** ([order.html:333](order.html#L333)) — by Formspree's design; analogous to a public webhook URL.
- **No API keys, secrets, or credentials found anywhere in client code.** Verified via grep for `api.?key|secret|password|token|bearer|sk_|pk_live|pk_test`.
- **Free-shipping copy `$150` matches `FREE_SHIPPING_THRESHOLD = 150` in [pricing.js:83](pricing.js#L83).** No drift.
- **Zelle discount fix from prior task verified safe:** [order.html:510](order.html#L510) `bankfulAmount` is pre-Zelle and only used in the Bankful body; `amountDue` is payment-method-aware and only used for Formspree. Card customers cannot be undercharged.
- **`google-site-verification` placeholder is consistent across all 27 pages** — not drifted, just unset. (Listed as HIGH-5 because it blocks Search Console, not because of drift.)
- **Inline `onclick` handlers** are present throughout but all call internal JS functions with static or DOM-derived parameters — no user-input flow. Low XSS risk.
- **`itemEffectiveTotal`'s BAC Water `indexOf` check** is fragile (would match any product with "BAC Water" in the name) but no current product collides, and BPC-157 / GLP-3 R rules use exact equality.

---

## Recommended sequencing

If you fix top-down by severity:

1. **HIGH-1** (advertised bundles not applied) — money-path bug, do first. Touches `handleAddToCart` in products.html, `addToCart` in index.html, and 8 `handleDetailAddToCart` functions. Fix opportunity for MEDIUM-8 simultaneously by extracting to shared file.
2. **HIGH-2** (TB-500 dropdown bug) — small targeted fix to pricing.js.
3. **HIGH-3** (logo image weight) — convert to WebP or SVG once, deploy.
4. **HIGH-5** (Google verification placeholder) — paste the real code.
5. **HIGH-4 + HIGH-6 + MEDIUM-9 + MEDIUM-10 + LOW-2 + LOW-8** — single big DRY refactor: extract shared CSS, nav, footer, age-gate. Resolves ~30% of this audit in one pass.
6. **MEDIUM-1, MEDIUM-2, MEDIUM-3, MEDIUM-4** — SEO/conversion battery; can land in one week.
7. Everything else as backlog.

Issues not fixed: this audit, by design, did not touch any code.
