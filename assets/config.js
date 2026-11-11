/* Red Hand Research — site settings.
   This is the ONLY place business numbers live in the code.
   Products, sizes, PRICES and STOCK are NOT here: they come from the Google Sheet
   "Red Hand Research – Website Prices" (Website tab). */

window.RH_CONFIG = {
  /* 1. Only used when ACCESS.mode is "code" or "off" (public catalog): the sheet's "Publish to web"
        CSV link for the Website tab. In "otp" mode the backend reads the sheet directly. */
  SHEET_CSV_URL: "",
  REFRESH_MINUTES: 5,            // how long a browser keeps the sheet data before re-fetching

  /* 2. The site's backend: the Google Apps Script web app attached to the "Red Hand Research – Orders"
        sheet (source: tools/apps-script-orders.gs). Handles sign-in codes, the product list, and orders.
        Deployed Nov 11, 2026 as "Red Hand site". To update the script: edit it in Apps Script, then
        Deploy → Manage deployments → pencil → New version → Deploy (the URL stays the same). */
  ORDER_ENDPOINT: "https://script.google.com/macros/s/AKfycby4UWtFrH0n0_796-GtHec0hya2D9KwReENeEIvQShwZhT2VegOFdl7aMyzHAbMtE-idw/exec",

  /* 3. Shipping */
  SHIPPING: [
    { id: "standard",  label: "Standard",  detail: "3–7 business days",                 price: 10 },
    { id: "expedited", label: "Expedited", detail: "2–3 business days",                 price: 25 },
    { id: "overnight", label: "Overnight", detail: "Next business day, order by 1 PM CT", price: 50 }
  ],
  FREE_SHIPPING_OVER: 150,       // subtotal (after discounts) that makes Standard shipping free

  /* 4. Discounts */
  MULTI_VIAL: { two: 5, threePlus: 10 },   // $ off EACH vial of the same product + size: 2 vials / 3 or more
  ZELLE_DISCOUNT_PCT: 5,
  PROMO_CODES: { HUNTER10: 10, JESKA10: 10, JOSH10: 10, BRE10: 10, MOOSE20: 20, MOOSE10: 10, BRAND10: 10, RACHEL10: 10 },

  /* 5. Sign-in — products and prices stay hidden until the visitor signs in.
        mode: "otp"  = email + 6-digit code (accounts). Needs ORDER_ENDPOINT to be the Apps Script URL;
                       until it is, the site quietly uses "code" instead.
              "code" = one shared access code you hand out (starter code: RESEARCH2026).
                       To change it run  echo -n "NEWCODE" | shasum -a 256  and paste the result as codeHash.
              "off"  = everyone sees products.
        days = how long a browser stays signed in. */
  ACCESS: { mode: "otp", codeHash: "d168dbe1a797315004064386553622509f98240a860639fc5a5e6dc396da9c4b", days: 30 },

  /* 6. Contact + wording */
  SITE_NAME: "Red Hand Research",
  SITE_URL: "https://redhandresearch.com",
  SUPPORT_EMAIL: "support@redhandresearch.com",
  ORDER_EMAIL: "team@redhandresearch.com",
  PHONE: "(636) 556-GLOW",
  PAYMENT_HOURS: "4 business hours",
  SHIP_CUTOFF: "3:00 PM CT"
};
