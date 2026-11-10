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

## Checkout

Orders POST to `ORDER_ENDPOINT` in `config.js` (Formspree today). To write orders straight
into the "Mooses Peptide Empire" sheet instead, deploy `tools/apps-script-orders.gs` as a web
app and paste its URL as `ORDER_ENDPOINT`.

## Before every push

```
bash tools/check.sh
```
