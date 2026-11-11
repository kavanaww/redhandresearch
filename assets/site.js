/* Red Hand Research — shared site code.
   Loads products + prices + stock from the Google Sheet (or the fallback CSV),
   draws product cards, runs the cart and checkout, and injects header/footer.
   There are no prices in this file. Business numbers live in config.js. */
(function () {
  'use strict';
  const C = window.RH_CONFIG || {};
  const RH = (window.RH = {});

  /* ---------- small utilities ---------- */
  RH.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  RH.slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  RH.qs = (sel, root) => (root || document).querySelector(sel);
  RH.qsa = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  RH.param = k => new URLSearchParams(location.search).get(k);
  RH.money = n => { n = Math.round(n * 100) / 100; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }); };
  RH.money2 = n => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  RH.stockLabel = s => (s === 'Low' ? 'Low stock' : s);
  RH.stockClass = s => ({ 'In stock': 'stock-in', 'Low': 'stock-low', 'Sold out': 'stock-out' })[s] || 'stock-out';

  /* ---------- CSV → product rows ---------- */
  RH.parseCSV = function (text) {
    const rows = []; let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim().toLowerCase());
    return rows.slice(1).filter(r => r.some(v => String(v).trim() !== '')).map(r => { const o = {}; head.forEach((h, i) => { o[h] = (r[i] || '').trim(); }); return o; });
  };

  function normStock(s) {
    s = String(s || '').toLowerCase();
    if (s.indexOf('sold') === 0) return 'Sold out';
    if (s.indexOf('low') === 0) return 'Low';
    if (s === 'check' || s === 'err') console.warn('Stock formula needs attention in the sheet');
    return 'In stock';
  }

  RH.normalize = rows => rows.map(r => {
    const price = parseFloat(String(r.price || '').replace(/[^0-9.]/g, ''));
    const codes = String(r.codes || '').trim();
    return {
      category: r.category || 'Other',
      product: r.product || '',
      size: r.size || '',
      price: isFinite(price) ? price : null,
      code: codes.split(',')[0].trim(),
      stock: normStock(r.stock),
      show: String(r.show || '').trim().toUpperCase() === 'Y',
      featured: String(r.featured || '').trim().toUpperCase() === 'Y',
      blurb: r.blurb || '',
      slug: RH.slug(r.product || '')
    };
  }).filter(v => v.product && v.show && v.price !== null && v.price > 0);

  /* ---------- load from the sheet, with cache + fallback ---------- */
  RH.loadProducts = async function () {
    if (RH._items) return RH._items;
    const KEY = 'rh_products_v1', ttl = (C.REFRESH_MINUTES || 5) * 60 * 1000;
    try {
      const c = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (c && Date.now() - c.t < ttl && Array.isArray(c.items) && c.items.length) { RH._items = c.items; RH._source = c.src; return c.items; }
    } catch (e) { /* storage unavailable */ }
    let items = null, src = '';
    if (RH.access.mode() === 'otp') {
      /* Signed-in mode: the backend serves the Website tab only to a valid token. Nothing public to fall back to. */
      if (!RH.access.token()) return [];
      const j = await RH.api({ type: 'products', token: RH.access.token() });
      if (!j.ok) { if (j.error === 'auth') { RH.access.lock(); return []; } throw new Error(j.error || 'Could not load products'); }
      const head = (j.header || []).map(h => String(h).trim().toLowerCase());
      items = RH.normalize((j.rows || []).map(r => { const o = {}; head.forEach((h, i) => { o[h] = String(r[i] == null ? '' : r[i]).trim(); }); return o; }));
      src = 'backend';
    } else {
      if (C.SHEET_CSV_URL) {
        try {
          const url = C.SHEET_CSV_URL + (C.SHEET_CSV_URL.indexOf('?') > -1 ? '&' : '?') + 'v=' + Math.floor(Date.now() / 60000);
          const r = await fetch(url, { cache: 'no-store' });
          if (r.ok) { items = RH.normalize(RH.parseCSV(await r.text())); src = 'sheet'; }
        } catch (e) { console.warn('Could not reach the price sheet.', e); }
      }
      if (!items || !items.length) {
        try { const r = await fetch('assets/products.fallback.csv', { cache: 'no-store' }); if (r.ok) { items = RH.normalize(RH.parseCSV(await r.text())); src = 'fallback'; } }
        catch (e) { /* no fallback file */ }
      }
      items = items || [];
    }
    RH._items = items; RH._source = src;
    try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), items: items, src: src })); } catch (e) { /* ignore */ }
    if (src === 'fallback') console.info('Products loaded from assets/products.fallback.csv' + (C.SHEET_CSV_URL ? ' (sheet unreachable)' : ' (SHEET_CSV_URL not set yet)'));
    return items;
  };

  RH.groupProducts = items => {
    const map = new Map();
    items.forEach(v => {
      if (!map.has(v.slug)) map.set(v.slug, { name: v.product, slug: v.slug, category: v.category, blurb: v.blurb, featured: false, variants: [] });
      const g = map.get(v.slug); g.variants.push(v);
      if (v.featured) g.featured = true;
      if (!g.blurb && v.blurb) g.blurb = v.blurb;
    });
    map.forEach(g => { g.soldOut = g.variants.every(v => v.stock === 'Sold out'); g.minPrice = Math.min.apply(null, g.variants.map(v => v.price)); });
    return Array.from(map.values());
  };

  /* ---------- pricing rules (numbers come from config.js) ---------- */
  RH.unitPrice = (price, qty) => {
    const m = C.MULTI_VIAL || {};
    if (qty >= 3) return Math.max(0, price - (m.threePlus || 0));
    if (qty === 2) return Math.max(0, price - (m.two || 0));
    return price;
  };
  RH.lineTotal = (price, qty) => RH.unitPrice(price, qty) * qty;
  RH.lineSavings = (price, qty) => price * qty - RH.lineTotal(price, qty);

  /* ---------- cart (browser storage) ---------- */
  const CART_KEY = 'rh_cart_v2';
  RH.cart = {
    get() { try { const c = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(c) ? c : []; } catch (e) { return []; } },
    set(c) { try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch (e) { /* ignore */ } RH.updateCartBadge(); },
    key: v => v.slug + '|' + v.size,
    add(v, qty) {
      const c = RH.cart.get(), k = RH.cart.key(v), ex = c.find(l => l.key === k);
      if (ex) ex.qty = Math.min(99, ex.qty + (qty || 1));
      else c.push({ key: k, slug: v.slug, product: v.product, size: v.size, code: v.code, price: v.price, qty: qty || 1 });
      RH.cart.set(c);
    },
    setQty(k, qty) { let c = RH.cart.get(); const l = c.find(x => x.key === k); if (!l) return; l.qty = Math.max(0, Math.min(99, qty | 0)); if (!l.qty) c = c.filter(x => x !== l); RH.cart.set(c); },
    remove(k) { RH.cart.set(RH.cart.get().filter(x => x.key !== k)); },
    clear() { RH.cart.set([]); },
    count() { return RH.cart.get().reduce((n, l) => n + l.qty, 0); }
  };
  RH.updateCartBadge = () => { const n = RH.cart.count(); RH.qsa('[data-cart-count]').forEach(el => { el.textContent = n; }); };

  /* ---------- the vial illustration (drawn, so every product gets one) ---------- */
  let vialN = 0;
  RH.vialSVG = function (name, size) {
    const id = 'v' + (++vialN), n = RH.esc(name), s = RH.esc(size);
    const short = RH.esc(name.length > 13 ? name.slice(0, 12) + '…' : name);
    return '<svg viewBox="0 0 170 320" role="img" aria-label="' + n + ' ' + s + ' research vial"><defs>' +
      '<linearGradient id="g' + id + '"><stop stop-color="#c2c7c9"/><stop offset=".17" stop-color="#fff"/><stop offset=".43" stop-color="#d4dadd"/><stop offset=".7" stop-color="#f9fbfc"/><stop offset="1" stop-color="#9da6ab"/></linearGradient>' +
      '<linearGradient id="m' + id + '"><stop stop-color="#74777b"/><stop offset=".22" stop-color="#eee"/><stop offset=".52" stop-color="#a4a7ab"/><stop offset=".8" stop-color="#f6f6f6"/><stop offset="1" stop-color="#74777b"/></linearGradient>' +
      '<linearGradient id="r' + id + '"><stop stop-color="#711717"/><stop offset=".45" stop-color="#d84b3b"/><stop offset="1" stop-color="#791c1b"/></linearGradient></defs>' +
      '<rect x="48" y="51" width="74" height="43" rx="11" fill="url(#g' + id + ')" stroke="#a7afb1"/>' +
      '<rect x="14" y="82" width="142" height="229" rx="29" fill="url(#g' + id + ')" fill-opacity=".53" stroke="#aab3b6" stroke-width="2"/>' +
      '<path d="M26 112 V280" stroke="white" stroke-width="8" opacity=".7"/><path d="M145 110 V280" stroke="#8c989e" stroke-width="5" opacity=".28"/>' +
      '<rect x="28" y="118" width="114" height="156" rx="3" fill="white" stroke="#e5e5e5"/><rect x="28" y="118" width="114" height="5" fill="#7a1f1f"/>' +
      '<image href="assets/logo.png" x="68" y="130" width="34" height="34"/>' +
      '<text x="85" y="174" text-anchor="middle" font-size="10" font-weight="800" fill="#171313">RED HAND</text>' +
      '<text x="85" y="184" text-anchor="middle" font-size="5.8" letter-spacing="2" fill="#171313">RESEARCH</text>' +
      '<path d="M39 192 H131" stroke="#a22d28" stroke-width="1"/>' +
      '<text x="85" y="216" text-anchor="middle" font-size="12" font-weight="800" fill="#111">' + short + '</text>' +
      '<rect x="54" y="226" width="62" height="22" rx="4" fill="#7a1f1f"/><text x="85" y="241" text-anchor="middle" font-size="12" font-weight="800" fill="white">' + s + '</text>' +
      '<text x="85" y="263" text-anchor="middle" font-size="7" font-weight="700" fill="#333">RESEARCH ONLY</text>' +
      '<rect x="24" y="36" width="122" height="39" rx="8" fill="url(#m' + id + ')" stroke="#a6a6a6"/>' +
      '<ellipse cx="85" cy="36" rx="61" ry="11" fill="url(#r' + id + ')"/><rect x="24" y="19" width="122" height="18" rx="7" fill="url(#r' + id + ')"/><ellipse cx="85" cy="19" rx="61" ry="9" fill="#a82925"/>' +
      '<ellipse cx="85" cy="298" rx="55" ry="9" fill="none" stroke="#aab3b6" stroke-width="2" opacity=".8"/></svg>';
  };

  /* ---------- product card (approved design) ---------- */
  RH.renderCard = function (g) {
    const variants = g.variants;
    let current = variants.find(v => v.stock !== 'Sold out') || variants[0];
    const card = document.createElement('article');
    card.className = 'card'; card.dataset.slug = g.slug;
    const href = 'product.html?p=' + encodeURIComponent(g.slug);
    card.innerHTML =
      '<div class="card-inner">' +
      '<div class="brand"><img src="assets/logo.png" alt=""><div class="brand-rule"></div><div><div class="brand-name">RED HAND</div><div class="brand-sub">RESEARCH</div></div></div>' +
      '<div class="details">' +
      '<div class="ref" data-refrow><strong>REF</strong><span data-ref></span></div>' +
      '<h2 class="product-name"><a href="' + href + '">' + RH.esc(g.name) + '</a></h2>' +
      '<div class="red-rule"></div><div class="size-title">Size</div>' +
      '<div class="sizes" role="group" aria-label="Select size for ' + RH.esc(g.name) + '"></div>' +
      '<div class="price" data-price></div>' +
      '<div class="chips"><span class="chip ruo">Research use only</span><span class="chip" data-stock></span></div>' +
      '<p class="warning">Not for human consumption.</p>' +
      '<button class="btn buy" type="button" data-buy></button>' +
      '</div><div class="vial" data-vial></div></div>';
    const sizes = RH.qs('.sizes', card);
    variants.forEach(v => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'size-btn' + (v.stock === 'Sold out' ? ' is-out' : ''); b.textContent = v.size;
      b.addEventListener('click', () => update(v)); sizes.appendChild(b);
    });
    function update(v) {
      current = v;
      RH.qs('[data-refrow]', card).hidden = !v.code;
      RH.qs('[data-ref]', card).textContent = v.code;
      RH.qs('[data-price]', card).textContent = RH.money(v.price);
      const st = RH.qs('[data-stock]', card); st.textContent = RH.stockLabel(v.stock); st.className = 'chip ' + RH.stockClass(v.stock);
      Array.prototype.forEach.call(sizes.children, (b, i) => b.setAttribute('aria-pressed', String(variants[i] === v)));
      const vial = RH.qs('[data-vial]', card); vial.innerHTML = RH.vialSVG(g.name, v.size); vial.classList.toggle('faded', v.stock === 'Sold out');
      const buy = RH.qs('[data-buy]', card); buy.disabled = v.stock === 'Sold out'; buy.textContent = buy.disabled ? 'Sold out' : 'Add to cart';
      buy.setAttribute('aria-label', buy.disabled ? g.name + ' ' + v.size + ' sold out' : 'Add ' + g.name + ' ' + v.size + ' to cart');
    }
    RH.qs('[data-buy]', card).addEventListener('click', () => { RH.cart.add(current, 1); RH.toast(g.name + ' ' + current.size + ' added to cart', { href: 'cart.html', label: 'View cart' }); });
    update(current);
    return card;
  };

  /* ---------- header, footer, age gate, toast ---------- */
  RH.chrome = function () {
    const page = document.body.dataset.page || '';
    const header = RH.qs('#site-header');
    if (header) {
      header.className = 'site-header';
      const links = [['shop', 'shop.html', 'Shop'], ['faq', 'faqs.html', 'FAQ'], ['coa', 'certificates.html', 'Testing']];
      header.innerHTML =
        '<div class="ruo-strip">For laboratory research use only · Not for human consumption</div>' +
        '<div class="wrap bar"><a class="logo-link" href="index.html"><img src="assets/logo.png" alt=""><div><div class="brand-name">RED HAND</div><div class="brand-sub">RESEARCH</div></div></a>' +
        '<nav class="nav" aria-label="Main">' + links.map(l => '<a href="' + l[1] + '"' + (page === l[0] ? ' aria-current="page"' : '') + '>' + l[2] + '</a>').join('') +
        '<a class="cart-link" href="cart.html"' + (page === 'cart' ? ' aria-current="page"' : '') + '>Cart <span class="count" data-cart-count>0</span></a></nav></div>';
    }
    const footer = RH.qs('#site-footer');
    if (footer) {
      footer.className = 'site-footer';
      footer.innerHTML =
        '<div class="wrap"><div class="cols">' +
        '<div><div class="logo-link" style="margin-bottom:10px"><img src="assets/logo.png" alt=""><div><div class="brand-name">RED HAND</div><div class="brand-sub">RESEARCH</div></div></div>' +
        '<p>Research peptides and reference compounds, third-party tested per lot. Sold strictly for laboratory research use. Not for human consumption.</p></div>' +
        '<div><h4>Shop</h4><a href="shop.html">All products</a><a href="shop.html#glp">GLP</a><a href="shop.html#healing">Healing</a><a href="shop.html#growth-hormone">Growth hormone</a><a href="shop.html#skin-hair">Skin &amp; hair</a></div>' +
        '<div><h4>Help</h4><a href="faqs.html">FAQ</a><a href="certificates.html">Testing &amp; CoAs</a><a href="policies.html#shipping">Shipping policy</a><a href="policies.html#returns">Return policy</a><a href="cart.html">Cart</a></div>' +
        '<div><h4>Contact</h4><a href="mailto:' + C.SUPPORT_EMAIL + '">' + C.SUPPORT_EMAIL + '</a><a href="mailto:' + C.ORDER_EMAIL + '">' + C.ORDER_EMAIL + '</a><a href="tel:+16365564569">' + RH.esc(C.PHONE || '') + '</a><a href="policies.html#privacy">Privacy policy</a><a href="policies.html#terms">Terms of service</a></div>' +
        '</div><div class="legal"><span>© ' + new Date().getFullYear() + ' ' + RH.esc(C.SITE_NAME || '') + '. All rights reserved. <a href="#" data-signout hidden style="display:inline;padding:0 0 0 8px;color:var(--muted);text-decoration:underline">Sign out</a></span><span>All products are for research use only. Not for diagnostic, therapeutic, or human use.</span></div></div>';
      const so = RH.qs('[data-signout]', footer);
      so.hidden = !(RH.access.mode() !== 'off' && RH.access.unlocked());
      so.addEventListener('click', e => { e.preventDefault(); RH.access.lock(); });
    }
    let ok = false; try { ok = localStorage.getItem('rh_age_ok') === '1'; } catch (e) { /* ignore */ }
    if (!ok && document.body.dataset.gate !== 'off') {
      const g = document.createElement('div'); g.className = 'gate';
      g.innerHTML = '<div class="gate-box" role="dialog" aria-modal="true" aria-labelledby="gate-h"><img src="assets/logo.png" alt=""><h2 id="gate-h">Are you 21 or older?</h2>' +
        '<p>Products on this site are sold for laboratory research use only and are not for human consumption. By entering you confirm you are at least 21 and agree to the <a href="policies.html#terms">Terms of Service</a>.</p>' +
        '<div class="gate-actions"><button class="btn secondary" type="button" data-no>No</button><button class="btn" type="button" data-yes>Yes, enter</button></div></div>';
      document.body.appendChild(g); document.body.classList.add('gated');
      RH.qs('[data-yes]', g).addEventListener('click', () => { try { localStorage.setItem('rh_age_ok', '1'); } catch (e) { /* ignore */ } g.remove(); document.body.classList.remove('gated'); });
      RH.qs('[data-no]', g).addEventListener('click', () => { location.href = 'https://www.google.com'; });
      RH.qs('[data-yes]', g).focus();
    }
  };

  RH.toast = function (msg, link) {
    let t = RH.qs('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.innerHTML = RH.esc(msg) + (link ? ' <a href="' + link.href + '">' + RH.esc(link.label) + '</a>' : '');
    t.classList.add('show'); clearTimeout(RH._tt); RH._tt = setTimeout(() => t.classList.remove('show'), 3500);
  };

  /* ---------- backend calls (the Apps Script web app) ---------- */
  RH.isBackend = () => /script\.google\.com/.test(C.ORDER_ENDPOINT || '');
  RH.api = async function (payload) {
    const r = await fetch(C.ORDER_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let j = null; try { j = JSON.parse(await r.text()); } catch (e) { throw new Error('Unexpected reply from the server'); }
    return j || {};
  };

  /* ---------- access: sign in to see products + prices ---------- */
  RH.access = {
    key: 'rh_access_v2',
    /* "otp" needs the Apps Script backend; without it the site quietly falls back to the access code. */
    mode() { const m = (C.ACCESS && C.ACCESS.mode) || 'off'; return m === 'otp' && !RH.isBackend() ? 'code' : m; },
    state() { try { return JSON.parse(localStorage.getItem(RH.access.key) || 'null'); } catch (e) { return null; } },
    unlocked() { if (RH.access.mode() === 'off') return true; const a = RH.access.state(); return !!(a && a.until > Date.now() && (RH.access.mode() !== 'otp' || a.token)); },
    token() { const a = RH.access.state(); return a && a.token; },
    email() { const a = RH.access.state(); return (a && a.email) || ''; },
    unlock(data) {
      const days = (data && data.days) || (C.ACCESS && C.ACCESS.days) || 30;
      try { localStorage.setItem(RH.access.key, JSON.stringify(Object.assign({ until: Date.now() + days * 864e5 }, data || {}))); } catch (e) { /* ignore */ }
      RH.qsa('[data-signout]').forEach(el => { el.hidden = false; });
    },
    lock() { try { localStorage.removeItem(RH.access.key); sessionStorage.removeItem('rh_products_v1'); } catch (e) { /* ignore */ } location.reload(); }
  };
  async function sha256(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  /* Renders the sign-in panel into `container` unless already unlocked; runs `then()` once unlocked. */
  RH.requireAccess = function (container, then) {
    if (RH.access.unlocked()) { then(); return; }
    const otp = RH.access.mode() === 'otp';
    container.innerHTML =
      '<div class="lock"><img src="assets/logo.png" alt=""><div>' +
      '<div class="eyebrow">Researchers only</div><h2>Sign in to view products and pricing</h2>' +
      '<p data-lk-intro>' + (otp
        ? 'Enter your email and we\'ll send you a 6-digit sign-in code. No password needed.'
        : 'Enter the access code we gave you to unlock the catalog. Don\'t have one? Email <a href="mailto:' + C.SUPPORT_EMAIL + '">' + C.SUPPORT_EMAIL + '</a>.') + '</p>' +
      '<form class="lock-form" novalidate>' +
      (otp
        ? '<div data-step="1"><label for="lk-email">Email</label><input id="lk-email" type="email" required autocomplete="email" inputmode="email" placeholder="you@lab.edu"></div>' +
          '<label class="check" data-step="1"><input id="lk-agree" type="checkbox" required><span>I am 21 or older and a qualified researcher. Products are for laboratory research use only and will not be administered to humans or animals.</span></label>' +
          '<div data-step="2" hidden><label for="lk-otp">6-digit code from your email</label><input id="lk-otp" type="text" inputmode="numeric" pattern="\\d{6}" maxlength="6" autocomplete="one-time-code" placeholder="123456"></div>'
        : '<div><label for="lk-code">Access code</label><input id="lk-code" type="password" required autocomplete="off" autocapitalize="characters"></div>') +
      '<div class="lock-actions"><button class="btn" type="submit" data-lk-submit>' + (otp ? 'Send code' : 'Unlock') + '</button>' +
      (otp ? '<button class="btn secondary small" type="button" data-lk-back hidden>Use a different email</button>' : '') +
      '<span class="lock-msg" aria-live="polite"></span></div>' +
      '</form></div></div>';
    const form = RH.qs('form', container), msg = RH.qs('.lock-msg', container), submit = RH.qs('[data-lk-submit]', container);
    let step = 1, pendingEmail = '';
    const show = n => { step = n; RH.qsa('[data-step]', container).forEach(el => { el.hidden = el.dataset.step !== String(n); }); RH.qs('[data-lk-back]', container).hidden = n === 1; submit.textContent = n === 1 ? 'Send code' : 'Verify and sign in'; msg.style.color = ''; };
    if (otp) RH.qs('[data-lk-back]', container).addEventListener('click', () => { show(1); msg.textContent = ''; });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.style.color = '';
      if (!otp) {
        if (!form.reportValidity()) return;
        const code = RH.qs('#lk-code', container).value.trim().toUpperCase();
        let hash = ''; try { hash = await sha256(code); } catch (err) { msg.textContent = 'This browser can\'t verify the code. Try a different browser.'; return; }
        if (hash === (C.ACCESS && C.ACCESS.codeHash)) { RH.access.unlock({ how: 'code' }); then(); }
        else { msg.textContent = 'That code isn\'t right.'; RH.qs('#lk-code', container).select(); }
        return;
      }
      if (step === 1) {
        const emailEl = RH.qs('#lk-email', container), agree = RH.qs('#lk-agree', container);
        if (!emailEl.checkValidity()) { emailEl.reportValidity(); return; }
        if (!agree.checked) { agree.reportValidity(); return; }
        pendingEmail = emailEl.value.trim().toLowerCase();
        submit.disabled = true; msg.textContent = 'Sending…';
        try {
          const j = await RH.api({ type: 'otp_request', email: pendingEmail });
          if (j.ok) { show(2); msg.style.color = 'var(--green)'; msg.textContent = 'Code sent to ' + pendingEmail + '. Check spam if it\'s not there in a minute.'; RH.qs('#lk-otp', container).focus(); }
          else if (j.error === 'pending') { msg.textContent = j.message || 'Your access request is pending approval.'; }
          else { msg.textContent = j.error || 'Could not send a code.'; }
        } catch (err) { msg.textContent = 'Can\'t reach the sign-in server right now. Try again in a moment.'; }
        submit.disabled = false;
        return;
      }
      const otpEl = RH.qs('#lk-otp', container), code = otpEl.value.replace(/\D/g, '');
      if (code.length !== 6) { msg.textContent = 'Enter the 6-digit code.'; otpEl.focus(); return; }
      submit.disabled = true; msg.textContent = 'Checking…';
      try {
        const j = await RH.api({ type: 'otp_verify', email: pendingEmail, code: code });
        if (j.ok && j.token) { RH.access.unlock({ how: 'otp', token: j.token, email: j.email || pendingEmail, days: j.days }); then(); return; }
        msg.textContent = j.error || 'That code isn\'t right.'; otpEl.select();
      } catch (err) { msg.textContent = 'Can\'t reach the sign-in server right now. Try again in a moment.'; }
      submit.disabled = false;
    });
    if (otp) show(1);
  };

  /* fills [data-cfg="KEY"] with values from config.js so no number is typed into HTML */
  RH.bindConfig = function () {
    RH.qsa('[data-cfg]').forEach(el => {
      const v = C[el.dataset.cfg];
      if (v == null) return;
      el.textContent = typeof v === 'number' ? RH.money(v) : String(v);
    });
    RH.qsa('[data-cfg-mail]').forEach(el => { const v = C[el.dataset.cfgMail]; if (!v) return; el.textContent = v; el.setAttribute('href', 'mailto:' + v + (el.dataset.subject ? '?subject=' + encodeURIComponent(el.dataset.subject) : '')); });
  };

  /* ---------- pages ---------- */
  const pages = (RH.pages = {});

  RH.unavailable = el => { el.innerHTML = '<div class="empty" style="grid-column:1/-1">The catalog is temporarily unavailable. Please refresh in a minute, or email <a href="mailto:' + C.SUPPORT_EMAIL + '">' + C.SUPPORT_EMAIL + '</a>.</div>'; };

  pages.home = async function () {
    const grid = RH.qs('#featured'), catsSection = RH.qs('#cats').closest('section');
    catsSection.hidden = !RH.access.unlocked();
    RH.requireAccess(grid, async () => {
      try {
        const groups = RH.groupProducts(await RH.loadProducts());
        if (!groups.length) { RH.unavailable(grid); return; }
        const cats = Array.from(new Set(groups.map(g => g.category)));
        const el = RH.qs('#cats'); el.innerHTML = '';
        cats.forEach(c => { const n = groups.filter(g => g.category === c).length; const a = document.createElement('a'); a.href = 'shop.html#' + RH.slug(c); a.innerHTML = RH.esc(c) + '<small>' + n + ' product' + (n === 1 ? '' : 's') + '</small>'; el.appendChild(a); });
        catsSection.hidden = false;
        RH.qsa('[data-count-products]').forEach(e => { e.textContent = groups.length; });
        grid.innerHTML = '';
        const feat = groups.filter(g => g.featured && !g.soldOut).slice(0, 6);
        (feat.length ? feat : groups.filter(g => !g.soldOut).slice(0, 6)).forEach(g => grid.appendChild(RH.renderCard(g)));
      } catch (err) { console.error(err); RH.unavailable(grid); }
    });
  };

  pages.shop = async function () {
    const grid = RH.qs('#grid'), filters = RH.qs('.filters'), status = RH.qs('#status');
    filters.hidden = true;
    RH.requireAccess(grid, () => { shopInner(grid, status, filters).catch(err => { console.error(err); RH.unavailable(grid); }); });
  };
  async function shopInner(grid, status, filters) {
    const groups = RH.groupProducts(await RH.loadProducts());
    if (!groups.length) { RH.unavailable(grid); return; }
    filters.hidden = false;
    const cats = Array.from(new Set(groups.map(g => g.category)));
    const bar = RH.qs('#cats'), q = RH.qs('#q');
    let active = (location.hash || '').slice(1) || 'all';
    if (active !== 'all' && !cats.some(c => RH.slug(c) === active)) active = 'all';
    const mk = (label, val) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.val = val; b.setAttribute('aria-pressed', String(val === active)); b.addEventListener('click', () => { active = val; history.replaceState(null, '', val === 'all' ? location.pathname : '#' + val); Array.prototype.forEach.call(bar.children, x => x.setAttribute('aria-pressed', String(x.dataset.val === active))); draw(); }); return b; };
    bar.appendChild(mk('All', 'all')); cats.forEach(c => bar.appendChild(mk(c, RH.slug(c))));
    q.addEventListener('input', draw);
    function draw() {
      const term = q.value.trim().toLowerCase();
      let list = groups.filter(g => (active === 'all' || RH.slug(g.category) === active) && (!term || g.name.toLowerCase().indexOf(term) > -1 || g.variants.some(v => v.code.toLowerCase() === term)));
      list = list.filter(g => !g.soldOut).concat(list.filter(g => g.soldOut));
      grid.innerHTML = '';
      if (!list.length) grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No products match. Try another search, or <a href="mailto:' + C.SUPPORT_EMAIL + '">email us</a> if you are looking for something specific.</div>';
      else list.forEach(g => grid.appendChild(RH.renderCard(g)));
      status.textContent = list.length + ' product' + (list.length === 1 ? '' : 's') + (term ? ' matching “' + term + '”' : '') + (active !== 'all' ? ' in ' + (cats.find(c => RH.slug(c) === active) || '') : '');
    }
    draw();
  }

  pages.product = async function () {
    const root = RH.qs('#pdp');
    RH.requireAccess(root, () => { productInner(root).catch(err => { console.error(err); root.innerHTML = '<div class="empty" style="grid-column:1/-1">This product could not be loaded. Please refresh.</div>'; }); });
  };
  async function productInner(root) {
    const slug = RH.param('p');
    const groups = RH.groupProducts(await RH.loadProducts());
    const g = groups.find(x => x.slug === slug);
    if (!groups.length) { RH.unavailable(root); return; }
    if (!g) { root.innerHTML = '<div class="empty" style="grid-column:1/-1">We couldn\'t find that product. <a href="shop.html">Browse the shop</a>.</div>'; document.title = 'Product not found — ' + C.SITE_NAME; return; }
    document.title = g.name + ' — ' + C.SITE_NAME;
    RH.qs('#crumb-cat').textContent = g.category; RH.qs('#crumb-cat').href = 'shop.html#' + RH.slug(g.category);
    RH.qs('#crumb-name').textContent = g.name;
    const isLiquid = /water/i.test(g.name);
    let current = g.variants.find(v => v.stock !== 'Sold out') || g.variants[0];
    root.innerHTML =
      '<div class="pdp-art"><div class="vial" data-vial></div></div>' +
      '<div class="pdp-info"><div class="eyebrow">' + RH.esc(g.category) + '</div><h1>' + RH.esc(g.name) + '</h1>' +
      '<div class="ref" data-refrow><strong>REF</strong><span data-ref></span></div>' +
      (g.blurb ? '<p class="blurb">' + RH.esc(g.blurb) + '</p>' : '') +
      '<div class="size-title">Size</div><div class="sizes" role="group" aria-label="Size"></div>' +
      '<div class="price"><span data-price></span><small class="chip" data-stock></small></div>' +
      '<div class="buy-row"><div class="qty"><button type="button" data-dec aria-label="Decrease quantity">−</button><input id="qty" type="number" min="1" max="99" value="1" inputmode="numeric" aria-label="Quantity"><button type="button" data-inc aria-label="Increase quantity">+</button></div>' +
      '<button class="btn" type="button" data-buy></button><span class="chip ruo">Research use only</span></div>' +
      '<table class="tiers" aria-label="Multi-vial pricing"><thead><tr><th>Quantity</th><th>Each</th><th>Total</th></tr></thead><tbody data-tiers></tbody></table>' +
      '<dl class="specs"><dt>Form</dt><dd>' + (isLiquid ? 'Sterile liquid vial' : 'Lyophilized powder, sterile vial') + '</dd>' +
      '<dt>Storage</dt><dd>' + (isLiquid ? 'Room temperature, away from light' : '−20°C lyophilized · 2–8°C reconstituted') + '</dd>' +
      '<dt>Classification</dt><dd>Research use only. Not for human consumption.</dd>' +
      '<dt>Documentation</dt><dd><a href="certificates.html">Certificate of Analysis on request</a></dd></dl></div>';
    const sizes = RH.qs('.sizes', root), qtyEl = RH.qs('#qty', root);
    g.variants.forEach(v => { const b = document.createElement('button'); b.type = 'button'; b.className = 'size-btn' + (v.stock === 'Sold out' ? ' is-out' : ''); b.textContent = v.size; b.addEventListener('click', () => update(v)); sizes.appendChild(b); });
    const qty = () => Math.max(1, Math.min(99, parseInt(qtyEl.value, 10) || 1));
    function update(v) {
      current = v;
      RH.qs('[data-refrow]', root).hidden = !v.code; RH.qs('[data-ref]', root).textContent = v.code;
      Array.prototype.forEach.call(sizes.children, (b, i) => b.setAttribute('aria-pressed', String(g.variants[i] === v)));
      const st = RH.qs('[data-stock]', root); st.textContent = RH.stockLabel(v.stock); st.className = 'chip ' + RH.stockClass(v.stock);
      const vial = RH.qs('[data-vial]', root); vial.innerHTML = RH.vialSVG(g.name, v.size); vial.classList.toggle('faded', v.stock === 'Sold out');
      const m = C.MULTI_VIAL || {};
      RH.qs('[data-tiers]', root).innerHTML = [[1, '1 vial'], [2, '2 vials'], [3, '3 or more']].map(t => '<tr><td>' + t[1] + '</td><td>' + RH.money(RH.unitPrice(v.price, t[0])) + (t[0] > 1 && RH.unitPrice(v.price, t[0]) < v.price ? ' <span style="color:var(--green);font-weight:700">save ' + RH.money(v.price - RH.unitPrice(v.price, t[0])) + ' each</span>' : '') + '</td><td>' + (t[0] === 3 ? RH.money(RH.lineTotal(v.price, 3)) + '+' : RH.money(RH.lineTotal(v.price, t[0]))) + '</td></tr>').join('');
      if (!m.two && !m.threePlus) RH.qs('.tiers', root).hidden = true;
      refreshPrice();
    }
    function refreshPrice() {
      const n = qty(), total = RH.lineTotal(current.price, n);
      RH.qs('[data-price]', root).innerHTML = RH.money(total) + (n > 1 ? '<small>' + RH.money(RH.unitPrice(current.price, n)) + ' each × ' + n + '</small>' : '');
      const buy = RH.qs('[data-buy]', root); buy.disabled = current.stock === 'Sold out'; buy.textContent = buy.disabled ? 'Sold out' : 'Add ' + n + ' to cart';
    }
    RH.qs('[data-dec]', root).addEventListener('click', () => { qtyEl.value = Math.max(1, qty() - 1); refreshPrice(); });
    RH.qs('[data-inc]', root).addEventListener('click', () => { qtyEl.value = Math.min(99, qty() + 1); refreshPrice(); });
    qtyEl.addEventListener('input', refreshPrice);
    RH.qs('[data-buy]', root).addEventListener('click', () => { RH.cart.add(current, qty()); RH.toast(qty() + ' × ' + g.name + ' ' + current.size + ' added to cart', { href: 'cart.html', label: 'View cart' }); });
    update(current);
    const rel = groups.filter(x => x.category === g.category && x.slug !== g.slug && !x.soldOut).slice(0, 3);
    const relGrid = RH.qs('#related');
    if (rel.length) { rel.forEach(x => relGrid.appendChild(RH.renderCard(x))); } else RH.qs('#related-section').hidden = true;
  }

  pages.cart = async function () {
    const layout = RH.qs('.cart-layout'), original = layout.innerHTML;
    RH.qs('.steps').hidden = !RH.access.unlocked();
    RH.requireAccess(layout, () => { layout.innerHTML = original; RH.qs('.steps').hidden = false; RH.bindConfig(); cartInner().catch(err => { console.error(err); RH.qs('#alerts').innerHTML = '<div class="alert err">The cart could not be loaded. Please refresh.</div>'; }); });
  };
  async function cartInner() {
    const items = await RH.loadProducts();
    const live = new Map(items.map(v => [v.slug + '|' + v.size, v]));
    const linesEl = RH.qs('#lines'), sumEl = RH.qs('#summary'), form = RH.qs('#checkout'), alerts = RH.qs('#alerts');
    const shipSel = RH.qs('#ship'), promoIn = RH.qs('#promo'), promoBtn = RH.qs('#promo-apply'), promoMsg = RH.qs('#promo-msg');
    let promo = null; try { promo = JSON.parse(sessionStorage.getItem('rh_promo') || 'null'); } catch (e) { /* ignore */ }
    (C.SHIPPING || []).forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.label + ' — ' + s.detail; shipSel.appendChild(o); });

    function reconcile() {
      const cart = RH.cart.get(), notes = [];
      cart.forEach(l => {
        const v = live.get(l.key);
        if (!v) { l.problem = 'No longer available'; return; }
        if (v.price !== l.price) { notes.push(l.product + ' ' + l.size + ' price updated to ' + RH.money(v.price)); l.price = v.price; }
        l.code = v.code; l.problem = v.stock === 'Sold out' ? 'Sold out' : '';
      });
      RH.cart.set(cart);
      if (notes.length) alerts.innerHTML = '<div class="alert info">' + RH.esc(notes.join('. ')) + '.</div>';
      return cart;
    }

    function totals(cart) {
      const good = cart.filter(l => !l.problem);
      const list = good.reduce((s, l) => s + l.price * l.qty, 0);
      const subtotal = good.reduce((s, l) => s + RH.lineTotal(l.price, l.qty), 0);
      const promoAmt = promo ? subtotal * promo.pct / 100 : 0;
      const pm = (form.elements.payment && form.elements.payment.value) || 'card';
      const afterPromo = subtotal - promoAmt;
      const zelleAmt = pm === 'zelle' ? afterPromo * (C.ZELLE_DISCOUNT_PCT || 0) / 100 : 0;
      const afterDisc = afterPromo - zelleAmt;
      const ship = (C.SHIPPING || []).find(s => s.id === shipSel.value) || (C.SHIPPING || [])[0] || { price: 0, label: '' };
      const freeShip = ship.id === 'standard' && afterDisc >= (C.FREE_SHIPPING_OVER || Infinity) && afterDisc > 0;
      const shipping = freeShip ? 0 : ship.price;
      return { good, list, subtotal, multiSavings: list - subtotal, promoAmt, zelleAmt, afterDisc, ship, shipping, freeShip, total: afterDisc + shipping, pm };
    }

    function draw() {
      const cart = reconcile();
      if (!cart.length) {
        linesEl.innerHTML = '<div class="empty">Your cart is empty. <a href="shop.html">Browse the shop</a>.</div>';
        RH.qs('#checkout-panel').hidden = true; sumEl.innerHTML = ''; return;
      }
      RH.qs('#checkout-panel').hidden = false;
      linesEl.innerHTML = cart.map(l => {
        const n = l.qty, each = RH.unitPrice(l.price, n), save = RH.lineSavings(l.price, n);
        return '<div class="line" data-key="' + RH.esc(l.key) + '">' +
          '<div><div class="name"><a href="product.html?p=' + encodeURIComponent(l.slug) + '" style="color:inherit;text-decoration:none">' + RH.esc(l.product) + '</a> · ' + RH.esc(l.size) + '</div>' +
          (l.problem ? '<div class="problem">' + RH.esc(l.problem) + ' — remove to continue</div>' : '<div class="sub">' + RH.money(each) + ' each' + (save > 0 ? ' · <span class="save">saving ' + RH.money(save) + '</span>' : '') + (l.code ? ' · REF ' + RH.esc(l.code) : '') + '</div>') +
          '<button class="remove" type="button" data-remove>Remove</button></div>' +
          '<div class="qty"><button type="button" data-dec aria-label="Decrease">−</button><input type="number" min="0" max="99" value="' + n + '" aria-label="Quantity" data-qty><button type="button" data-inc aria-label="Increase">+</button></div>' +
          '<div class="total">' + (l.problem ? '—' : RH.money2(RH.lineTotal(l.price, n))) + '</div></div>';
      }).join('');
      RH.qsa('.line', linesEl).forEach(row => {
        const k = row.dataset.key, inp = RH.qs('[data-qty]', row);
        RH.qs('[data-dec]', row).addEventListener('click', () => { RH.cart.setQty(k, (parseInt(inp.value, 10) || 1) - 1); draw(); });
        RH.qs('[data-inc]', row).addEventListener('click', () => { RH.cart.setQty(k, (parseInt(inp.value, 10) || 0) + 1); draw(); });
        inp.addEventListener('change', () => { RH.cart.setQty(k, parseInt(inp.value, 10) || 0); draw(); });
        RH.qs('[data-remove]', row).addEventListener('click', () => { RH.cart.remove(k); draw(); });
      });
      drawSummary();
    }

    function drawSummary() {
      const cart = RH.cart.get(), t = totals(cart);
      const blocked = cart.some(l => l.problem);
      const remaining = Math.max(0, (C.FREE_SHIPPING_OVER || 0) - t.afterDisc);
      sumEl.innerHTML =
        '<div class="row"><span>Subtotal</span><span>' + RH.money2(t.list) + '</span></div>' +
        (t.multiSavings > 0 ? '<div class="row"><span>Multi-vial savings</span><span class="good">−' + RH.money2(t.multiSavings) + '</span></div>' : '') +
        (promo ? '<div class="row"><span>Promo ' + RH.esc(promo.code) + ' (' + promo.pct + '%)</span><span class="good">−' + RH.money2(t.promoAmt) + '</span></div>' : '') +
        (t.zelleAmt > 0 ? '<div class="row"><span>Zelle discount (' + C.ZELLE_DISCOUNT_PCT + '%)</span><span class="good">−' + RH.money2(t.zelleAmt) + '</span></div>' : '') +
        '<div class="row"><span>Shipping · ' + RH.esc(t.ship.label) + '</span><span>' + (t.freeShip ? '<span class="good">Free</span>' : RH.money2(t.shipping)) + '</span></div>' +
        '<div class="row total"><span>Total</span><span>' + RH.money2(t.total) + '</span></div>' +
        (C.FREE_SHIPPING_OVER && !t.freeShip && remaining > 0 && t.ship.id === 'standard' ? '<p class="hint">Add ' + RH.money(remaining) + ' more for free standard shipping.</p>' : '') +
        '<p class="hint">Nothing is charged on this site. After you submit, we email ' + (t.pm === 'zelle' ? 'Zelle instructions' : 'a secure card payment link') + ' within ' + RH.esc(C.PAYMENT_HOURS) + '. Orders ship once payment is received.</p>';
      const agreed = !!(form.elements.agree && form.elements.agree.checked);
      const submit = RH.qs('#submit'); submit.disabled = blocked || !t.good.length || !agreed;
      submit.textContent = blocked ? 'Remove unavailable items to continue' : !agreed ? 'Accept the research use agreement to continue' : 'Submit order · ' + RH.money2(t.total);
      RH.qsa('[data-zelle-pct]').forEach(e => { e.textContent = C.ZELLE_DISCOUNT_PCT + '%'; });
    }

    promoBtn.addEventListener('click', () => {
      const code = promoIn.value.trim().toUpperCase(); const pct = (C.PROMO_CODES || {})[code];
      if (!code) { promo = null; promoMsg.textContent = ''; }
      else if (pct) { promo = { code: code, pct: pct }; promoMsg.textContent = code + ' applied: ' + pct + '% off.'; promoMsg.style.color = 'var(--green)'; }
      else { promo = null; promoMsg.textContent = 'That code isn\'t valid.'; promoMsg.style.color = 'var(--red)'; }
      try { sessionStorage.setItem('rh_promo', JSON.stringify(promo)); } catch (e) { /* ignore */ }
      drawSummary();
    });
    if (promo) { promoIn.value = promo.code; promoMsg.textContent = promo.code + ' applied: ' + promo.pct + '% off.'; promoMsg.style.color = 'var(--green)'; const w = RH.qs('#promo-wrap'); if (w) w.open = true; }
    shipSel.addEventListener('change', drawSummary);
    RH.qsa('input[name=payment]', form).forEach(r => r.addEventListener('change', drawSummary));

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const cart = RH.cart.get(), t = totals(cart);
      if (!t.good.length || cart.some(l => l.problem)) return;
      const f = form.elements, d = new Date();
      const orderNo = 'RH-' + d.toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      const name = f.first.value.trim() + ' ' + f.last.value.trim();
      const itemsText = t.good.map(l => l.qty + ' × ' + l.product + ' ' + l.size + (l.code ? ' (' + l.code + ')' : '') + ' — ' + RH.money2(RH.lineTotal(l.price, l.qty))).join('\n');
      const payload = {
        _subject: 'Order ' + orderNo + ' — ' + name + ' — ' + RH.money2(t.total), _replyto: f.email.value.trim(),
        order_number: orderNo, name: name, email: f.email.value.trim(), phone: f.phone.value.trim(),
        address: [f.address1.value.trim(), f.address2.value.trim()].filter(Boolean).join(', '), city: f.city.value.trim(), state: f.state.value, zip: f.zip.value.trim(),
        shipping_method: t.ship.label + (t.freeShip ? ' (free)' : ''), payment_method: t.pm === 'zelle' ? 'Zelle' : 'Card (invoice link)',
        promo_code: promo ? promo.code : '', items: itemsText,
        subtotal: RH.money2(t.list), multi_vial_savings: RH.money2(t.multiSavings), promo_discount: RH.money2(t.promoAmt), zelle_discount: RH.money2(t.zelleAmt), shipping: RH.money2(t.shipping), total: RH.money2(t.total),
        notes: f.notes.value.trim(), newsletter: f.newsletter.checked ? 'yes' : 'no',
        ruo_agreement: 'ACCEPTED ' + d.toISOString() + ' — research use only; no human or animal administration; 21+ qualified researcher; not for diagnostic/therapeutic use; Terms + Privacy accepted',
        submitted_at: d.toISOString(),
        token: RH.access.token() || '', account_email: RH.access.email() || ''
      };
      const btn = RH.qs('#submit'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        if (!C.ORDER_ENDPOINT) throw new Error('ORDER_ENDPOINT is not set in assets/config.js');
        // text/plain keeps this a "simple" request, which the Apps Script backend accepts cross-origin.
        const r = await fetch(C.ORDER_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        let j = null; try { j = JSON.parse(await r.text()); } catch (ignore) { /* non-JSON reply still counts as sent */ }
        if (j && j.ok === false && j.error === 'auth') { RH.access.lock(); return; }
        if (j && j.ok === false) throw new Error(j.error || 'Endpoint reported failure');
        try { sessionStorage.setItem('rh_last_order', JSON.stringify({ order: orderNo, pm: t.pm, total: t.total, email: payload.email })); sessionStorage.removeItem('rh_promo'); } catch (err) { /* ignore */ }
        RH.cart.clear();
        location.href = 'order-confirmation.html?o=' + encodeURIComponent(orderNo) + '&pm=' + t.pm;
      } catch (err) {
        console.error(err);
        alerts.innerHTML = '<div class="alert err">We couldn\'t send your order just now. Please try again, or email your cart to <a href="mailto:' + C.ORDER_EMAIL + '?subject=' + encodeURIComponent('Order ' + orderNo) + '&body=' + encodeURIComponent(itemsText + '\n\nTotal: ' + RH.money2(t.total)) + '">' + C.ORDER_EMAIL + '</a>.</div>';
        alerts.scrollIntoView({ behavior: 'smooth', block: 'center' });
        drawSummary();
      }
    });
    const agree = RH.qs('#agree', form); if (agree) agree.addEventListener('change', drawSummary);
    if (RH.access.email() && form.elements.email && !form.elements.email.value) form.elements.email.value = RH.access.email();
    draw();
  }

  pages.confirmation = async function () {
    let o = null; try { o = JSON.parse(sessionStorage.getItem('rh_last_order') || 'null'); } catch (e) { /* ignore */ }
    const orderNo = (o && o.order) || RH.param('o') || '—';
    const pm = (o && o.pm) || RH.param('pm') || 'card';
    RH.qs('#order-no').textContent = orderNo;
    RH.qs('#pay-method').textContent = pm === 'zelle' ? 'Zelle (' + (C.ZELLE_DISCOUNT_PCT || 0) + '% discount applied)' : 'Card, via secure invoice link';
    RH.qs('#order-total').textContent = o && o.total != null ? RH.money2(o.total) : 'See your confirmation email';
    RH.qs('#order-email').textContent = (o && o.email) || 'the address you entered';
    RH.qs('#next-card').hidden = pm === 'zelle'; RH.qs('#next-zelle').hidden = pm !== 'zelle';
  };

  /* ---------- boot ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    RH.chrome(); RH.bindConfig(); RH.updateCartBadge();
    const p = document.body.dataset.page;
    if (pages[p]) pages[p]().catch(err => {
      console.error(err);
      const m = RH.qs('main'); if (m) m.insertAdjacentHTML('afterbegin', '<div class="wrap"><div class="alert err">Something went wrong loading products. Please refresh, or email <a href="mailto:' + C.SUPPORT_EMAIL + '">' + C.SUPPORT_EMAIL + '</a>.</div></div>');
    });
  });
})();
