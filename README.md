# Red Hand Research — website

Plain HTML/CSS/JS on GitHub Pages. No build step, no framework.

## The one rule

**No product, price or stock lives in this code.** All of it comes from the Google Sheet
**"Red Hand Research – Website Prices"**, tab **Website**. Every page (home, shop, product,
cart, checkout) reads that tab and draws itself from it.

- Change a price → edit the sheet. Done.
- Hide a product → set `Show` to `N`.
- Put a product on the home page → `Featured` = `Y`.
- Stock status is automatic (linked to the inventory sheet).
- `assets/products.fallback.csv` is a snapshot used only if the sheet can't be reached.
  Refresh it now and then: File → Download → CSV of the Website tab, save over that file.

Business numbers that aren't per-product (shipping rates, free-shipping threshold, multi-vial
discount, Zelle %, promo codes, emails) live in **`assets/config.js`**, nowhere else.

## Files

| File | What it is |
|---|---|
| `index.html` | Home: hero, trust points, featured products, categories |
| `shop.html` | All products, category filter, search |
| `product.html?p=slug` | One product: sizes, multi-vial pricing, stock, add to cart |
| `cart.html` | Cart + checkout form (card invoice or Zelle) |
| `order-confirmation.html` | After submit |
| `faqs.html`, `certificates.html`, `policies.html` | Static pages |
| `assets/config.js` | Settings (sheet URL, endpoint, shipping, discounts, contacts) |
| `assets/site.js` | All logic: sheet loader, cards, cart, checkout, header/footer |
| `assets/site.css` | All styles |
| `assets/products.fallback.csv` | Snapshot of the Website tab |
| `tools/check.sh` | Run before pushing: fails if a price is typed into HTML or a link is broken |
| `tools/apps-script-orders.gs` | Optional: Google Apps Script to write orders into the order sheet |
| `products.html`, `order.html`, `bpc-157.html`, `article-*.html`, … | Tiny stubs that redirect old URLs to the new pages |

## Connect the live sheet (one time)

1. Open the sheet → **File → Share → Publish to web**.
2. Under *Link*, choose the **Website** tab and **Comma-separated values (.csv)**. Click **Publish**.
3. Copy the link and paste it into `assets/config.js` as `SHEET_CSV_URL`.
4. Push. The site now refreshes prices and stock every few minutes.

## Sign-in (accounts)

Products and prices are hidden until the visitor signs in. `ACCESS.mode` in `assets/config.js`:

- `otp` (default) — the visitor enters an email, gets a 6-digit code by email, and is signed in for
  30 days. The email is the account; no passwords. Every address lands in an **Accounts** tab of the
  order sheet (first seen, last sign-in, count, Approved). Set `APPROVAL_REQUIRED = true` in the
  script to vet people before they get a code. In this mode the product list is served by the script
  only to a valid sign-in, so prices are genuinely private. **Delete `assets/products.fallback.csv`
  once this mode is live** — it is a public copy of the prices.
- `code` — one shared access code you hand out (starter: **RESEARCH2026**). Change it with
  `echo -n "NEWCODE" | shasum -a 256` → `codeHash`. Used automatically if the script isn't set up yet.
- `off` — everyone sees products.

"Sign out" is in the footer.

## Checkout

Every order requires the research-use agreement; the acceptance (with timestamp) is sent with the
order and written to the sheet. Orders POST to `ORDER_ENDPOINT` in `config.js`: the Apps Script web
app from `tools/apps-script-orders.gs` (the old Formspree address is only a placeholder until then).

## Before every push

```
bash tools/check.sh
```
