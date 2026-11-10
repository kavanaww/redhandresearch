/**
 * Red Hand Research — order intake (optional, replaces Formspree)
 *
 * Writes each checkout submission to the "Mooses Peptide Empire" sheet and emails you.
 *
 * SET UP (about 5 minutes):
 * 1. Open the "Mooses Peptide Empire" sheet → Extensions → Apps Script.
 * 2. Delete whatever is there, paste this whole file, and set SHEET_NAME below if your tab isn't "Sheet1".
 * 3. Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone → Deploy.
 *    Approve the permissions when asked.
 * 4. Copy the web app URL and paste it into assets/config.js as ORDER_ENDPOINT. Push.
 *
 * One row per order line is appended with columns:
 * Order # | Customer Email | Client Name | Phone | Shipping Address | Shipping Method | Product | Variant | Qty | Product Cost | Shipping Cost | Tracking | Total Order Cost | Payment | Promo | Notes | Submitted
 */
var SHEET_NAME = 'Sheet1';
var NOTIFY = 'team@redhandresearch.com';

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    var address = [d.address, d.city, d.state, d.zip].filter(String).join(', ');
    var lines = String(d.items || '').split('\n').filter(String);
    lines.forEach(function (line, i) {
      // "2 × BPC-157 10mg (BP10) — $120.00"
      var m = line.match(/^(\d+)\s*×\s*(.+?)\s+(\S+)(?:\s+\(([^)]+)\))?\s+—\s+\$([\d,.]+)$/);
      sh.appendRow([
        d.order_number, d.email, d.name, d.phone, address, d.shipping_method,
        m ? m[2] : line, m ? m[3] : '', m ? Number(m[1]) : '', m ? Number(m[5].replace(/,/g, '')) : '',
        i === 0 ? d.shipping : '', '', i === 0 ? d.total : '',
        d.payment_method, d.promo_code, d.notes, d.submitted_at
      ]);
    });
    MailApp.sendEmail({
      to: NOTIFY,
      replyTo: d.email,
      subject: 'Order ' + d.order_number + ' — ' + d.name + ' — ' + d.total,
      body: [
        'Order ' + d.order_number, '', d.name, d.email, d.phone, address, '',
        'Ship: ' + d.shipping_method, 'Pay: ' + d.payment_method, d.promo_code ? 'Promo: ' + d.promo_code : '', '',
        d.items, '',
        'Subtotal ' + d.subtotal, 'Multi-vial −' + d.multi_vial_savings, 'Promo −' + d.promo_discount, 'Zelle −' + d.zelle_discount,
        'Shipping ' + d.shipping, 'TOTAL ' + d.total, '', d.notes ? 'Notes: ' + d.notes : ''
      ].join('\n')
    });
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}
