/**
 * Red Hand Research — site backend (Google Apps Script). Replaces Formspree.
 *
 * Handles, all in one web app:
 *   • Sign-in by email code (OTP): sends a 6-digit code, verifies it, issues a 30-day token.
 *   • Accounts: every email that signs in gets a row in an "Accounts" tab (first seen, last sign-in,
 *     count, Approved). Set APPROVAL_REQUIRED = true to vet people before they can see prices.
 *   • Products: serves the Website tab of the price sheet, only to a valid token.
 *   • Orders: appends to this sheet (one row per line), emails you, emails the customer
 *     (Zelle instructions with the exact amount, or a "card link coming" note), signed Moose.
 *
 * SET UP (one time, about 5 minutes):
 *   1. Open the "Mooses Peptide Empire" sheet → Extensions → Apps Script.
 *   2. Delete what's there, paste this whole file. Fill in ZELLE_HANDLE. Check SHEET_NAME.
 *   3. Deploy → New deployment → gear icon → Web app.
 *      Execute as: Me.  Who has access: Anyone.  → Deploy. Approve the permissions when asked.
 *   4. Copy the Web app URL (ends in /exec) and paste it into assets/config.js as ORDER_ENDPOINT.
 *   To change the script later: edit, then Deploy → Manage deployments → pencil → New version → Deploy.
 */
var SHEET_NAME        = 'Sheet1';                                   // orders tab in this spreadsheet
var PRICES_SHEET_ID   = '1xEx46CoxdRinn2vvEW5rS6swFII-oFrHnwtxgCpSWhQ'; // "Red Hand Research – Website Prices"
var PRICES_TAB        = 'Website';
var NOTIFY            = 'team@redhandresearch.com';                 // your copy of orders + new sign-ups
var REPLY_TO          = 'team@redhandresearch.com';
var FROM_NAME         = 'Red Hand Research';
var ZELLE_HANDLE      = 'FILL-IN-YOUR-ZELLE-EMAIL-OR-PHONE';
var ZELLE_NAME        = 'Red Hand Research';
var SHIP_CUTOFF       = '3:00 PM CT';
var APPROVAL_REQUIRED = false;   // true = only emails marked Approved = Y in the Accounts tab get a code
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
  GmailApp.sendEmail(email, code + ' is your Red Hand Research sign-in code',
    ['Your sign-in code is:', '', '    ' + code, '', 'It works for ' + CODE_MINUTES + ' minutes. If you didn\'t request it, ignore this email.', '', 'Red Hand Research'].join('\n'),
    { name: FROM_NAME, replyTo: REPLY_TO });
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

/* ------------------------------------------------------------ accounts */
function accountsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Accounts');
  if (!sh) { sh = ss.insertSheet('Accounts'); sh.appendRow(['Email', 'First seen', 'Last sign-in', 'Sign-ins', 'Approved', 'Notes']); sh.setFrozenRows(1); }
  return sh;
}
function upsertAccount(email, signedIn) {
  var sh = accountsSheet(), vals = sh.getDataRange().getValues(), now = new Date();
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][0]).toLowerCase() === email) {
      if (signedIn) { sh.getRange(r + 1, 3).setValue(now); sh.getRange(r + 1, 4).setValue(Number(vals[r][3] || 0) + 1); }
      return { approved: vals[r][4] };
    }
  }
  sh.appendRow([email, now, signedIn ? now : '', signedIn ? 1 : 0, APPROVAL_REQUIRED ? 'N' : 'Y', '']);
  if (NOTIFY_SIGNUPS) GmailApp.sendEmail(NOTIFY, 'New sign-up: ' + email, email + ' just requested a sign-in code.' + (APPROVAL_REQUIRED ? '\n\nThey are waiting for approval: set Approved = Y on their row in the Accounts tab.' : ''), { name: FROM_NAME });
  return { approved: APPROVAL_REQUIRED ? 'N' : 'Y' };
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  var address = [d.address, d.city, d.state, d.zip].filter(String).join(', ');
  var lines = String(d.items || '').split('\n').filter(String);

  lines.forEach(function (line, i) {
    var m = line.match(/^(\d+)\s*×\s*(.+?)\s+(\S+)(?:\s+\(([^)]+)\))?\s+—\s+\$([\d,.]+)$/); // "2 × BPC-157 10mg (BP10) — $96.00"
    sh.appendRow([
      d.order_number, d.email, d.name, d.phone, address, d.shipping_method,
      m ? m[2] : line, m ? m[3] : '', m ? Number(m[1]) : '', m ? Number(m[5].replace(/,/g, '')) : '',
      i === 0 ? d.shipping : '', '', i === 0 ? d.total : '',
      d.payment_method, d.promo_code, d.notes, d.submitted_at, i === 0 ? d.ruo_agreement : '', who
    ]);
  });

  var summary = [
    'Order ' + d.order_number, '', d.name, d.email + (who !== cleanEmail(d.email) ? ' (signed in as ' + who + ')' : ''), d.phone, address, '',
    'Ship: ' + d.shipping_method, 'Pay: ' + d.payment_method, d.promo_code ? 'Promo: ' + d.promo_code : '', '',
    d.items, '',
    'Subtotal ' + d.subtotal, 'Multi-vial −' + d.multi_vial_savings, 'Promo −' + d.promo_discount, 'Zelle −' + d.zelle_discount,
    'Shipping ' + d.shipping, 'TOTAL ' + d.total, '', d.notes ? 'Notes: ' + d.notes : '', '',
    'Research use agreement: ' + (d.ruo_agreement || 'not recorded')
  ].join('\n');
  GmailApp.sendEmail(NOTIFY, 'Order ' + d.order_number + ' — ' + d.name + ' — ' + d.total, summary, { name: FROM_NAME, replyTo: d.email });

  var isZelle = /zelle/i.test(d.payment_method || '');
  var first = String(d.name || '').split(' ')[0] || 'there';
  var body = isZelle ? [
    'Hi ' + first + ',', '',
    'Thanks for your order. Here is how to pay by Zelle:', '',
    '  Send to:  ' + ZELLE_HANDLE + '  (' + ZELLE_NAME + ')',
    '  Amount:   ' + d.total,
    '  Memo:     ' + d.order_number, '',
    'Reply to this email once it\'s sent and we\'ll confirm and ship. Payments received by ' + SHIP_CUTOFF + ' on a business day ship the same day, and you\'ll get a tracking number by email.'
  ] : [
    'Hi ' + first + ',', '',
    'Thanks for your order. A secure card payment link for ' + d.total + ' is on its way to this address in a separate email. Pay with any credit or debit card.', '',
    'Once payment clears, your order ships (same day if received by ' + SHIP_CUTOFF + ' on a business day) and you\'ll get a tracking number by email.'
  ];
  body = body.concat(['', 'Your order:', d.items, '',
    'Reminder: everything we sell is for laboratory research use only and not for human consumption. You confirmed this at checkout.', '',
    'Thanks,', 'Moose', 'Red Hand Research']).join('\n');
  GmailApp.sendEmail(d.email, (isZelle ? 'Zelle instructions for order ' : 'Order received — ') + d.order_number, body, { name: FROM_NAME, replyTo: REPLY_TO });
  return { ok: true };
}
