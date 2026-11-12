/**
 * Red Hand Research — site backend (Google Apps Script). A STANDALONE script owned by
 * team@redhandresearch.com; it writes to the "Red Hand Research – Orders" sheet by ID.
 *
 * Handles, all in one web app:
 *   • Sign-in by email code (OTP): sends a 6-digit code, verifies it, issues a 30-day token.
 *   • Clients: one row per email in the "Clients" tab of the orders sheet (name, phone, address,
 *     orders, total spent, last sign-in, Approved). Set APPROVAL_REQUIRED = true to vet people first.
 *   • Products: serves the Website tab of the price sheet, only to a valid token.
 *   • Orders: appends to the Orders tab (one row per line), emails you, emails the customer
 *     (Zelle instructions with the exact amount, or a "card link coming" note), signed Moose.
 *     Product Cost / Shipping Cost / Total Order Cost are left BLANK: those are John's cost columns,
 *     filled in by hand. What the customer paid goes in "Customer Total".
 *
 * SET UP (one time, about 5 minutes), signed in as team@redhandresearch.com:
 *   1. Go to script.google.com → New project (standalone — NOT Extensions → Apps Script from the
 *      sheet: a script bound to a sheet owned by another account can't be deployed from a Workspace user).
 *   2. Delete what's there, paste this whole file. Fill in ZELLE_HANDLE. Check ORDERS_SHEET_ID.
 *   3. Deploy → New deployment → gear icon → Web app.
 *      Execute as: Me.  Who has access: Anyone.  → Deploy. Approve the permissions when asked.
 *   4. Copy the Web app URL (ends in /exec) and paste it into assets/config.js as ORDER_ENDPOINT.
 *   To change the script later: edit, then Deploy → Manage deployments → pencil → New version → Deploy.
 */
var ORDERS_SHEET_ID   = '1By-3fDm4lcg0Oexamev9JF8hJoiz4CbFOYZ7P3i4Um8'; // "Red Hand Research – Orders" (team@ must be an editor)
var SHEET_NAME        = 'Orders';                                   // orders tab in that spreadsheet
var PRICES_SHEET_ID   = '1xEx46CoxdRinn2vvEW5rS6swFII-oFrHnwtxgCpSWhQ'; // "Red Hand Research – Website Prices"
var PRICES_TAB        = 'Website';
var NOTIFY            = 'team@redhandresearch.com';                 // your copy of orders + new sign-ups
var REPLY_TO          = 'team@redhandresearch.com';
var FROM_NAME         = 'Red Hand Research';
var ZELLE_HANDLE      = 'FILL-IN-YOUR-ZELLE-EMAIL-OR-PHONE';
var ZELLE_NAME        = 'Red Hand Research';
var SHIP_CUTOFF       = '3:00 PM CT';
var APPROVAL_REQUIRED = false;   // true = only emails marked Approved = Y in the Clients tab get a code
var NOTIFY_SIGNUPS    = true;    // email you when a new address signs in for the first time
var TOKEN_DAYS        = 30;      // how long a sign-in lasts
var CODE_MINUTES      = 10;      // how long a 6-digit code is valid

/* ------------------------------------------------------------------ entry */
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents || '{}');
    var type = d.type || 'order';
    if (type === 'otp_request') return out(otpRequest(d));
    if (type === 'otp_verify')  return out(otpVerify(d));
    if (type === 'products')    return out(products(d));
    if (type === 'ping')        return out({ ok: true });
    return out(order(d));
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
function doGet() { return ContentService.createTextOutput('Red Hand Research backend is running.'); }
function out(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function ordersBook() { return SpreadsheetApp.openById(ORDERS_SHEET_ID); }

/* ------------------------------------------------------------- sign-in */
function otpRequest(d) {
  var email = cleanEmail(d.email);
  if (!email) return { ok: false, error: 'Enter a valid email address.' };
  var cache = CacheService.getScriptCache();
  var rl = Number(cache.get('rl:' + email) || 0);
  if (rl >= 3) return { ok: false, error: 'Too many codes requested. Try again in 10 minutes.' };
  var acct = upsertAccount(email, false);
  if (APPROVAL_REQUIRED && String(acct.approved).toUpperCase() !== 'Y') {
    return { ok: false, error: 'pending', message: 'Thanks. Your access request is in. We review new researchers by hand and will email you when you are approved.' };
  }
  var code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('otp:' + email, sha256(code + '|' + email), CODE_MINUTES * 60);
  cache.put('att:' + email, '0', CODE_MINUTES * 60);
  cache.put('rl:' + email, String(rl + 1), 600);
  sendCodeEmail(email, code);
  return { ok: true };
}

function otpVerify(d) {
  var email = cleanEmail(d.email), code = String(d.code || '').replace(/\D/g, '');
  if (!email || code.length !== 6) return { ok: false, error: 'Enter the 6-digit code from your email.' };
  var cache = CacheService.getScriptCache();
  var want = cache.get('otp:' + email);
  if (!want) return { ok: false, error: 'That code expired. Request a new one.' };
  var att = Number(cache.get('att:' + email) || 0) + 1;
  cache.put('att:' + email, String(att), CODE_MINUTES * 60);
  if (att > 5) { cache.remove('otp:' + email); return { ok: false, error: 'Too many attempts. Request a new code.' }; }
  if (sha256(code + '|' + email) !== want) return { ok: false, error: 'That code isn\'t right.' };
  cache.remove('otp:' + email);
  upsertAccount(email, true);
  return { ok: true, token: makeToken(email), email: email, days: TOKEN_DAYS };
}

function makeToken(email) {
  var exp = Date.now() + TOKEN_DAYS * 864e5;
  var body = Utilities.base64EncodeWebSafe(email + '|' + exp);
  return body + '.' + hmac(body);
}
function verifyToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  var parts = token.split('.');
  if (hmac(parts[0]) !== parts[1]) return null;
  var raw = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  var email = raw.split('|')[0], exp = Number(raw.split('|')[1]);
  if (!(exp > Date.now())) return null;
  return email;
}
function secret() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SECRET', s); }
  return s;
}
function hmac(s) { return bytesToHex(Utilities.computeHmacSha256Signature(s, secret())); }
function sha256(s) { return bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s)); }
function bytesToHex(b) { return b.map(function (x) { x = (x + 256) % 256; return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
function cleanEmail(s) { s = String(s || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : ''; }

/* ------------------------------------------------------------- clients */
// Clients tab columns (1-based): 1 Email, 2 Name, 3 Phone, 4 Address, 5 Orders, 6 First order,
// 7 Last order, 8 Total spent, 9 Last sign-in, 10 Sign-ins, 11 Approved, 12 Notes
var CLIENT_HEADER = ['Email', 'Name', 'Phone', 'Address', 'Orders', 'First order', 'Last order', 'Total spent', 'Last sign-in', 'Sign-ins', 'Approved', 'Notes'];
function clientsSheet() {
  var ss = ordersBook(), sh = ss.getSheetByName('Clients');
  if (!sh) { sh = ss.insertSheet('Clients'); sh.appendRow(CLIENT_HEADER); sh.setFrozenRows(1); }
  return sh;
}
// Row number for an email; or, when the email is new, a row with the same name and no email yet (old customers).
function findClient(sh, email, name) {
  var vals = sh.getDataRange().getValues(), byName = 0;
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][0]).trim().toLowerCase() === email) return r + 1;
    if (name && !byName && !String(vals[r][0]).trim() && String(vals[r][1]).trim().toLowerCase() === name.toLowerCase()) byName = r + 1;
  }
  return byName;
}
function upsertAccount(email, signedIn) {
  var sh = clientsSheet(), now = new Date(), row = findClient(sh, email, '');
  if (row) {
    if (signedIn) { sh.getRange(row, 9).setValue(now); sh.getRange(row, 10).setValue(Number(sh.getRange(row, 10).getValue() || 0) + 1); }
    return { approved: sh.getRange(row, 11).getValue() };
  }
  sh.appendRow([email, '', '', '', 0, '', '', 0, signedIn ? now : '', signedIn ? 1 : 0, APPROVAL_REQUIRED ? 'N' : 'Y', '']);
  if (NOTIFY_SIGNUPS) GmailApp.sendEmail(NOTIFY, 'New sign-up: ' + email, email + ' just requested a sign-in code.' + (APPROVAL_REQUIRED ? '\n\nThey are waiting for approval: set Approved = Y on their row in the Clients tab.' : ''), { name: FROM_NAME });
  return { approved: APPROVAL_REQUIRED ? 'N' : 'Y' };
}
function upsertClient(d, who) {
  var sh = clientsSheet(), now = new Date();
  var email = cleanEmail(d.email) || who, name = String(d.name || '').trim();
  var address = [d.address, d.city, d.state, d.zip].filter(String).join(', ');
  var total = Number(String(d.total || '').replace(/[^\d.]/g, '')) || 0;
  var row = findClient(sh, email, name);
  if (!row) { sh.appendRow([email, name, d.phone || '', address, 0, '', '', 0, '', 0, APPROVAL_REQUIRED ? 'N' : 'Y', '']); row = sh.getLastRow(); }
  var cur = sh.getRange(row, 1, 1, 12).getValues()[0];
  sh.getRange(row, 1, 1, 8).setValues([[
    cur[0] || email, name || cur[1], d.phone || cur[2], address || cur[3],
    Number(cur[4] || 0) + 1, cur[5] || now, now, Number(cur[7] || 0) + total
  ]]);
}

/* ------------------------------------------------------------ products */
function products(d) {
  if (!verifyToken(d.token)) return { ok: false, error: 'auth' };
  var cache = CacheService.getScriptCache(), hit = cache.get('products');
  if (hit) return JSON.parse(hit);
  var sh = SpreadsheetApp.openById(PRICES_SHEET_ID).getSheetByName(PRICES_TAB);
  var vals = sh.getDataRange().getDisplayValues();
  var header = vals[0].map(function (h) { return String(h).trim(); });
  var keep = ['Category', 'Product', 'Size', 'Price', 'Codes', 'Stock', 'Show', 'Featured', 'Blurb']; // never Vials or Notes
  var idx = keep.map(function (k) { return header.indexOf(k); });
  var rows = vals.slice(1).filter(function (r) { return r[idx[1]] && String(r[idx[6]]).toUpperCase() === 'Y'; })
    .map(function (r) { return idx.map(function (i) { return i < 0 ? '' : r[i]; }); });
  var res = { ok: true, header: keep, rows: rows, at: new Date().toISOString() };
  cache.put('products', JSON.stringify(res), 120);
  return res;
}

/* --------------------------------------------------------------- orders */
function order(d) {
  var who = verifyToken(d.token);
  if (!who) return { ok: false, error: 'auth' };
  var ss = ordersBook();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  var address = [d.address, d.city, d.state, d.zip].filter(String).join(', ');
  var lines = String(d.items || '').split('\n').filter(String);

  lines.forEach(function (line, i) {
    var m = line.match(/^(\d+)\s*×\s*(.+?)\s+(\S+)(?:\s+\(([^)]+)\))?\s+—\s+\$([\d,.]+)$/); // "2 × BPC-157 10mg (BP10) — $96.00"
    sh.appendRow([
      d.order_number, d.email, d.name, d.phone, address, d.shipping_method,
      m ? m[2] : line, m ? m[3] : '', m ? Number(m[1]) : '',
      '', '', '', '',                       // Product Cost, Shipping Cost, Tracking, Total Order Cost: John fills these in
      d.payment_method, d.promo_code, d.notes, d.submitted_at, i === 0 ? d.ruo_agreement : '', who,
      i === 0 ? d.total : ''                // T: Customer Total (what the customer pays, incl. shipping)
    ]);
  });

  upsertClient(d, who);

  var totals = orderTotals(d);
  var where = [d.name, address, d.phone].filter(String).join('\n');

  // your copy (plain text, only the lines that matter)
  var mine = [
    'Order ' + d.order_number + '  ·  ' + d.total + '  ·  ' + d.payment_method, '',
    d.name, d.email + (who !== cleanEmail(d.email) ? '  (signed in as ' + who + ')' : ''), d.phone, address, '',
    'Ship: ' + d.shipping_method, d.promo_code ? 'Promo: ' + d.promo_code : '', '',
    d.items, ''
  ].concat(totals.map(function (t) { return t.label + '  ' + t.value; }))
   .concat(['', d.notes ? 'Notes: ' + d.notes : '', '', 'Research use agreement: ' + (d.ruo_agreement || 'not recorded')])
   .filter(function (l, i, a) { return !(l === '' && a[i - 1] === ''); }).join('\n');
  GmailApp.sendEmail(NOTIFY, 'Order ' + d.order_number + ' — ' + d.name + ' — ' + d.total, mine, { name: FROM_NAME, replyTo: d.email });

  // the customer's copy
  var isZelle = /zelle/i.test(d.payment_method || '');
  var first = String(d.name || '').trim().split(' ')[0] || 'there';
  var subject = isZelle ? 'Thanks, ' + first + ' — Zelle details for order ' + d.order_number
                        : 'Thanks, ' + first + ' — order ' + d.order_number + ' received';
  var intro = isZelle
    ? 'We have your order and we\'re glad you\'re here. Here is everything you need to send payment by Zelle:'
    : 'We have your order and we\'re glad you\'re here. A secure card payment link for <strong>' + esc(d.total) + '</strong> will follow in a separate email within 4 business hours — any credit or debit card works.';
  var payBox = isZelle
    ? kv('Send to', esc(ZELLE_HANDLE) + ' <span style="color:#8a7f78;">(' + esc(ZELLE_NAME) + ')</span>') + kv('Amount', esc(d.total), true) + kv('Memo', esc(d.order_number))
    : kv('Order', esc(d.order_number)) + kv('Amount due', esc(d.total), true) + kv('How to pay', 'Secure card link, arriving within 4 business hours');
  var next = isZelle
    ? 'Once it\'s sent, just reply to this email and we\'ll confirm and get your order packed. Payments received by ' + esc(SHIP_CUTOFF) + ' on a business day ship the same day, and you\'ll get a tracking number the moment it\'s on its way.'
    : 'Once payment clears, your order ships — same day if it clears by ' + esc(SHIP_CUTOFF) + ' on a business day — and you\'ll get a tracking number the moment it\'s on its way.';
  var html = emailShell(
    h1('Thank you, ' + esc(first) + '.') +
    para(intro) +
    box(payBox) +
    para(next) +
    h2('Your order') +
    itemsTable(d.items, totals) +
    (where ? h2('Shipping to') + para(esc(where).replace(/\n/g, '<br>') + '<br><span style="color:#8a7f78;">' + esc(d.shipping_method) + '</span>') : '') +
    para('Questions? Just reply to this email — it comes straight to me.') +
    para('Moose<br><span style="color:#8a7f78;">Red Hand Research</span>') +
    small('A reminder: everything we sell is for laboratory research use only and not for human consumption. You confirmed this at checkout.'),
    (isZelle ? 'Zelle: send ' + d.total + ' to ' + ZELLE_HANDLE + ', memo ' + d.order_number : 'Your card payment link is on its way'));
  var text = ['Hi ' + first + ',', '', stripTags(intro), '']
    .concat(isZelle ? ['  Send to:  ' + ZELLE_HANDLE + '  (' + ZELLE_NAME + ')', '  Amount:   ' + d.total, '  Memo:     ' + d.order_number] : ['  Order:       ' + d.order_number, '  Amount due:  ' + d.total])
    .concat(['', stripTags(next), '', 'Your order:', d.items, ''])
    .concat(totals.map(function (t) { return '  ' + t.label + '  ' + t.value; }))
    .concat(['', 'Questions? Just reply to this email — it comes straight to me.', '', 'Moose', 'Red Hand Research', '',
             'A reminder: everything we sell is for laboratory research use only and not for human consumption. You confirmed this at checkout.']).join('\n');
  GmailApp.sendEmail(d.email, subject, text, { name: FROM_NAME, replyTo: REPLY_TO, htmlBody: html });
  return { ok: true };
}

/* ---------------------------------------------------------------- email look */
var LOGO_URL = 'https://redhandresearch.com/assets/logo.png';
var SITE_URL = 'https://redhandresearch.com';
var INK = '#1f1a17', MUTED = '#8a7f78', RED = '#7a1f1f', PAGE = '#f2f0ed', LINE = '#e6e2dc', TINT = '#faf7f4';

function sendCodeEmail(email, code) {
  var html = emailShell(
    h1('Here\'s your sign-in code') +
    para('Welcome in. Enter this code on the site to see the catalog and pricing:') +
    '<div style="margin:18px 0;padding:22px 16px;background:' + TINT + ';border:1px solid ' + LINE + ';border-radius:8px;text-align:center;font-family:Georgia,\'Times New Roman\',serif;font-size:38px;letter-spacing:.22em;color:' + RED + ';">' + code + '</div>' +
    para('It works for the next ' + CODE_MINUTES + ' minutes. If you didn\'t ask for it, you can ignore this email — nothing happens without the code.') +
    para('Glad you\'re here,<br>Moose<br><span style="color:' + MUTED + ';">Red Hand Research</span>'),
    'Your code: ' + code + ' (good for ' + CODE_MINUTES + ' minutes)');
  var text = ['Welcome in. Enter this code on the site to see the catalog and pricing:', '', '    ' + code, '',
    'It works for the next ' + CODE_MINUTES + ' minutes. If you didn\'t ask for it, you can ignore this email — nothing happens without the code.', '',
    'Glad you\'re here,', 'Moose', 'Red Hand Research'].join('\n');
  GmailApp.sendEmail(email, code + ' is your Red Hand Research sign-in code', text, { name: FROM_NAME, replyTo: REPLY_TO, htmlBody: html });
}

// Only the money lines that actually apply (no "Promo −$0.00" when no code was used).
function orderTotals(d) {
  var rows = [['Subtotal', d.subtotal]];
  if (nz(d.multi_vial_savings)) rows.push(['Multi-vial savings', '−' + d.multi_vial_savings]);
  if (nz(d.promo_discount)) rows.push(['Promo' + (d.promo_code ? ' ' + d.promo_code : ''), '−' + d.promo_discount]);
  if (nz(d.zelle_discount)) rows.push(['Zelle discount', '−' + d.zelle_discount]);
  rows.push(['Shipping', nz(d.shipping) ? d.shipping : 'Free']);
  rows.push(['Total', d.total]);
  return rows.map(function (r) { return { label: r[0], value: r[1] }; });
}
function nz(v) { v = String(v == null ? '' : v).replace(/[^\d.]/g, ''); return v !== '' && Number(v) > 0; }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function stripTags(s) { return String(s).replace(/<[^>]+>/g, ''); }
var FONT = 'font-family:Helvetica,Arial,sans-serif;';
var SERIF = 'font-family:Georgia,\'Times New Roman\',serif;';
function h1(t) { return '<h1 style="margin:14px 0 10px;' + SERIF + 'font-weight:400;font-size:26px;line-height:1.2;color:' + INK + ';">' + t + '</h1>'; }
function h2(t) { return '<h2 style="margin:26px 0 8px;' + FONT + 'font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:' + RED + ';">' + t + '</h2>'; }
function para(t) { return '<p style="margin:0 0 14px;">' + t + '</p>'; }
function small(t) { return '<p style="margin:22px 0 0;padding-top:14px;border-top:1px solid ' + LINE + ';font-size:12px;line-height:1.5;color:' + MUTED + ';">' + t + '</p>'; }
function box(inner) { return '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;background:' + TINT + ';border:1px solid ' + LINE + ';border-radius:8px;"><tr><td style="padding:14px 18px;">' + inner + '</td></tr></table>'; }
function kv(k, v, strong) {
  return '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>' +
    '<td style="padding:5px 0;' + FONT + 'font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:' + MUTED + ';width:34%;vertical-align:top;">' + k + '</td>' +
    '<td style="padding:5px 0;' + FONT + 'font-size:' + (strong ? '20px' : '15px') + ';font-weight:' + (strong ? '700' : '400') + ';color:' + INK + ';">' + v + '</td></tr></table>';
}
function itemsTable(items, totals) {
  var rows = String(items || '').split('\n').filter(String).map(function (line) {
    var m = line.match(/^(\d+)\s*×\s*(.+?)\s+(\S+)(?:\s+\(([^)]+)\))?\s+—\s+(\$[\d,.]+)$/);
    var left = m ? esc(m[2]) + ' <span style="color:' + MUTED + ';">' + esc(m[3]) + (m[4] ? ' · REF ' + esc(m[4]) : '') + '</span>' : esc(line);
    var qty = m ? m[1] : '', price = m ? m[5] : '';
    return '<tr><td style="padding:9px 0;border-bottom:1px solid ' + LINE + ';' + FONT + 'font-size:15px;color:' + INK + ';">' + left + '</td>' +
      '<td style="padding:9px 8px;border-bottom:1px solid ' + LINE + ';' + FONT + 'font-size:14px;color:' + MUTED + ';text-align:center;white-space:nowrap;">' + (qty ? '× ' + qty : '') + '</td>' +
      '<td style="padding:9px 0;border-bottom:1px solid ' + LINE + ';' + FONT + 'font-size:15px;color:' + INK + ';text-align:right;white-space:nowrap;">' + esc(price) + '</td></tr>';
  }).join('');
  var sums = totals.map(function (t, i) {
    var last = i === totals.length - 1;
    return '<tr><td colspan="2" style="padding:' + (last ? '10px 0 0' : '4px 0') + ';' + FONT + 'font-size:' + (last ? '16px' : '14px') + ';color:' + (last ? INK : MUTED) + ';' + (last ? 'font-weight:700;' : '') + '">' + esc(t.label) + '</td>' +
      '<td style="padding:' + (last ? '10px 0 0' : '4px 0') + ';' + FONT + 'font-size:' + (last ? '18px' : '14px') + ';color:' + INK + ';text-align:right;white-space:nowrap;' + (last ? 'font-weight:700;' : '') + '">' + esc(t.value) + '</td></tr>';
  }).join('');
  return '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:4px 0 6px;">' + rows + '<tr><td colspan="3" style="height:6px;"></td></tr>' + sums + '</table>';
}
function emailShell(inner, preheader) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>' +
    '<body style="margin:0;padding:0;background:' + PAGE + ';">' +
    (preheader ? '<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:' + PAGE + ';">' + esc(preheader) + '</div>' : '') +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:' + PAGE + ';"><tr><td align="center" style="padding:28px 12px;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid ' + LINE + ';border-top:4px solid ' + RED + ';border-radius:8px;">' +
    '<tr><td style="padding:26px 32px 4px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr>' +
    '<td style="vertical-align:middle;padding-right:12px;"><img src="' + LOGO_URL + '" width="44" height="43" alt="" style="display:block;border:0;"></td>' +
    '<td style="vertical-align:middle;' + SERIF + 'font-size:19px;letter-spacing:.14em;color:' + INK + ';line-height:1.05;">RED HAND<br><span style="font-size:9px;letter-spacing:.34em;color:' + RED + ';">RESEARCH</span></td>' +
    '</tr></table></td></tr>' +
    '<tr><td style="padding:10px 32px 30px;' + FONT + 'font-size:16px;line-height:1.55;color:' + INK + ';">' + inner + '</td></tr>' +
    '</table>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;"><tr><td style="padding:16px 12px 0;' + FONT + 'font-size:12px;line-height:1.6;color:' + MUTED + ';text-align:center;">' +
    '<a href="' + SITE_URL + '" style="color:' + MUTED + ';">redhandresearch.com</a> &nbsp;·&nbsp; <a href="mailto:' + REPLY_TO + '" style="color:' + MUTED + ';">' + REPLY_TO + '</a><br>' +
    'For laboratory research use only. Not for human consumption.' +
    '</td></tr></table></td></tr></table></body></html>';
}
