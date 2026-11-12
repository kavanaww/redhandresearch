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
- The product list is served by the Apps Script backend to signed-in visitors only; there is no
  public copy of the prices anywhere in this repo.

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
| `tools/check.sh` | Run before pushing: fails if a price is typed into HTML or a link is broken |
| `tools/apps-script-orders.gs` | The backend: a standalone Google Apps Script owned by team@ (sign-in codes, product list, orders → "Red Hand Research – Orders" sheet) |
| `products.html`, `order.html`, `bpc-157.html`, `article-*.html`, … | Tiny stubs that redirect old URLs to the new pages |

## How the sheet reaches the site

In `otp` mode (the default) the Apps Script reads the Website tab directly and hands it to
signed-in visitors; nothing to publish. `SHEET_CSV_URL` is only needed for `code`/`off` modes
(File → Share → Publish to web → Website tab → CSV, paste the link into config.js).

## Sign-in (accounts)

Products and prices are hidden until the visitor signs in. `ACCESS.mode` in `assets/config.js`:

- `otp` (default) — the visitor enters an email, gets a 6-digit code by email, and is signed in for
  30 days. The email is the account; no passwords. Every address lands in the **Clients** tab of the
  order sheet (name, phone, address, orders, total spent, last sign-in, Approved); each order updates
  that row. Set `APPROVAL_REQUIRED = true` in the script to vet people before they get a code. In this
  mode the product list is served by the script only to a valid sign-in, so prices are genuinely private.
- `code` — one shared access code you hand out (starter: **RESEARCH2026**). Change it with
  `echo -n "NEWCODE" | shasum -a 256` → `codeHash`. Used automatically if the script isn't set up yet.
- `off` — everyone sees products.

"Sign out" is in the footer.

## Checkout

Every order requires the research-use agreement; the acceptance (with timestamp) is sent with the
order and written to the sheet. In the Orders tab, **Product Cost / Shipping Cost / Tracking / Total
Order Cost are left blank** on purpose: those are John's cost columns, filled in by hand. What the
customer paid is in **Customer Total** (column T). Orders POST to `ORDER_ENDPOINT` in `config.js`: the Apps Script web
app from `tools/apps-script-orders.gs`, deployed Nov 11, 2026. Formspree is gone.

## Backend (where emails come from)

The script runs as **team@redhandresearch.com**, so sign-in codes and order emails come from that
address. It is a *standalone* script at script.google.com (owner team@), not one attached to the
sheet: Google Workspace won't deploy a sheet-bound script when the sheet is owned by an outside
account. It writes to "Red Hand Research – Orders" by ID (team@ is an editor) and reads
"Red Hand Research – Website Prices" by ID. To change it: open script.google.com as team@ →
"Red Hand site backend" → edit → Deploy → Manage deployments → pencil → New version → Deploy.
The URL doesn't change.

## Before every push

```
bash tools/check.sh
```
