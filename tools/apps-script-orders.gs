/**
 * Red Hand Research — order intake. Replaces Formspree.
 *
 * What it does on every checkout:
 *   1. Appends the order to the "Mooses Peptide Empire" sheet (one row per line item).
 *   2. Emails you (NOTIFY) the full order.
 *   3. Emails the customer: Zelle instructions with the exact amount, or a
 *      "your card payment link is on the way" note. Signed Moose / Red Hand Research.
 *
 * SET UP (one time, about 5 minutes):
 *   1. Open the "Mooses Peptide Empire" sheet → Extensions → Apps Script.
 *   2. Delete what's there, paste this whole file. Fill in ZELLE_HANDLE below and check SHEET_NAME.
 *   3. Deploy → New deployment → gear icon → Web app.
 *      Execute as: Me.  Who has access: Anyone.  → Deploy. Approve the permissions when asked.
 *   4. Copy the Web app URL (ends in /exec) and paste it into assets/config.js as ORDER_ENDPOINT.
 *   To change the script later: edit, then Deploy → Manage deployments → pencil → New version → Deploy.
 */
var SHEET_NAME   = 'Sheet1';                       // tab in Mooses Peptide Empire that holds orders
var NOTIFY       = 'team@redhandresearch.com';     // where your copy of each order goes
var REPLY_TO     = 'team@redhandresearch.com';
var FROM_NAME    = 'Red Hand Research';
var ZELLE_HANDLE = 'FILL-IN-YOUR-ZELLE-EMAIL-OR-PHONE';
var ZELLE_NAME   = 'Red Hand Research';            // the name the customer will see in Zelle
var SHIP_CUTOFF  = '3:00 PM CT';

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Access-gate sign-ins (only when config.js ACCESS.mode is "email") go to an "Access" tab.
    if (d.type === 'access') {
      var acc = ss.getSheetByName('Access') || ss.insertSheet('Access');
      if (acc.getLastRow() === 0) acc.appendRow(['When', 'Email', 'Agreed research use', 'Page']);
      acc.appendRow([d.at, d.email, d.agreed, d.page]);
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    }

    var sh = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    var address = [d.address, d.city, d.state, d.zip].filter(String).join(', ');
    var lines = String(d.items || '').split('\n').filter(String);

    // 1. Sheet rows — same column order as your existing sheet, plus a few at the end.
    lines.forEach(function (line, i) {
      var m = line.match(/^(\d+)\s*×\s*(.+?)\s+(\S+)(?:\s+\(([^)]+)\))?\s+—\s+\$([\d,.]+)$/); // "2 × BPC-157 10mg (BP10) — $96.00"
      sh.appendRow([
        d.order_number, d.email, d.name, d.phone, address, d.shipping_method,
        m ? m[2] : line, m ? m[3] : '', m ? Number(m[1]) : '', m ? Number(m[5].replace(/,/g, '')) : '',
        i === 0 ? d.shipping : '', '', i === 0 ? d.total : '',
        d.payment_method, d.promo_code, d.notes, d.submitted_at, i === 0 ? d.ruo_agreement : ''
      ]);
    });

    // 2. Your copy
    var summary = [
      'Order ' + d.order_number, '', d.name, d.email, d.phone, address, '',
      'Ship: ' + d.shipping_method, 'Pay: ' + d.payment_method, d.promo_code ? 'Promo: ' + d.promo_code : '', '',
      d.items, '',
      'Subtotal ' + d.subtotal, 'Multi-vial −' + d.multi_vial_savings, 'Promo −' + d.promo_discount, 'Zelle −' + d.zelle_discount,
      'Shipping ' + d.shipping, 'TOTAL ' + d.total, '', d.notes ? 'Notes: ' + d.notes : '', '', 'Research use agreement: ' + (d.ruo_agreement || 'not recorded')
    ].join('\n');
    GmailApp.sendEmail(NOTIFY, 'Order ' + d.order_number + ' — ' + d.name + ' — ' + d.total, summary, { name: FROM_NAME, replyTo: d.email });

    // 3. Customer email
    var isZelle = /zelle/i.test(d.payment_method || '');
    var first = String(d.name || '').split(' ')[0] || 'there';
    var body;
    if (isZelle) {
      body = [
        'Hi ' + first + ',',
        '',
        'Thanks for your order. Here is how to pay by Zelle:',
        '',
        '  Send to:  ' + ZELLE_HANDLE + '  (' + ZELLE_NAME + ')',
        '  Amount:   ' + d.total,
        '  Memo:     ' + d.order_number,
        '',
        'Reply to this email once it\'s sent and we\'ll confirm and ship. Payments received by ' + SHIP_CUTOFF + ' on a business day ship the same day, and you\'ll get a tracking number by email.',
        '',
        'Your order:', d.items, '',
        'Reminder: everything we sell is for laboratory research use only and not for human consumption. You confirmed this at checkout.',
        '',
        'Thanks,', 'Moose', 'Red Hand Research'
      ].join('\n');
    } else {
      body = [
        'Hi ' + first + ',',
        '',
        'Thanks for your order. A secure card payment link for ' + d.total + ' is on its way to this address in a separate email. Pay with any credit or debit card.',
        '',
        'Once payment clears, your order ships (same day if received by ' + SHIP_CUTOFF + ' on a business day) and you\'ll get a tracking number by email.',
        '',
        'Your order:', d.items, '',
        'Reminder: everything we sell is for laboratory research use only and not for human consumption. You confirmed this at checkout.',
        '',
        'Thanks,', 'Moose', 'Red Hand Research'
      ].join('\n');
    }
    GmailApp.sendEmail(d.email, (isZelle ? 'Zelle instructions for order ' : 'Order received — ') + d.order_number, body, { name: FROM_NAME, replyTo: REPLY_TO });

    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Lets you open the /exec URL in a browser to confirm the deployment is alive.
function doGet() {
  return ContentService.createTextOutput('Red Hand Research order intake is running.');
}
