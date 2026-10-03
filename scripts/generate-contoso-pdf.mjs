// Generates public/samples/contoso-order-form.pdf: a 2-page order form for a
// Medium-risk deal (moderate discount, Net-45, custom security addendum).
// Run with: node scripts/generate-contoso-pdf.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const doc = await PDFDocument.create();
doc.setTitle('Contoso Health Partners - Master Order Form');
doc.setAuthor('DealDesk Demo Software LLC');
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);

const INK = rgb(0.09, 0.11, 0.18);
const MUTED = rgb(0.4, 0.43, 0.5);
const ACCENT = rgb(0.15, 0.39, 0.92);
const RULE = rgb(0.85, 0.87, 0.9);
const LEFT = 56;
const WIDTH = 500;

let page;
let y;
function newPage() {
  page = doc.addPage([612, 792]);
  y = 736;
}

function wrap(text, f, size) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (f.widthOfTextAtSize(test, size) > WIDTH) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function text(str, { f = font, size = 10.5, color = INK, gap = 15, indent = 0 } = {}) {
  for (const l of wrap(str, f, size)) {
    page.drawText(l, { x: LEFT + indent, y, size, font: f, color });
    y -= gap;
  }
}

function heading(str) {
  y -= 6;
  page.drawText(str, { x: LEFT, y, size: 12, font: bold, color: ACCENT });
  y -= 6;
  page.drawLine({ start: { x: LEFT, y }, end: { x: LEFT + WIDTH, y }, thickness: 0.75, color: RULE });
  y -= 16;
}

function row(label, value) {
  page.drawText(label, { x: LEFT, y, size: 10.5, font, color: MUTED });
  page.drawText(value, { x: LEFT + 220, y, size: 10.5, font: bold, color: INK });
  y -= 17;
}

// ---------- Page 1 ----------
newPage();
page.drawText('MASTER ORDER FORM', { x: LEFT, y, size: 18, font: bold, color: INK });
y -= 20;
text('Order reference CHP-2026-1107  |  Effective date: November 1, 2026  |  Initial term: 24 months', {
  size: 9.5,
  color: MUTED,
  gap: 26,
});

heading('1. Parties');
row('Customer:', 'Contoso Health Partners');
row('Customer address', '1400 Harbor Street, Pittsburgh, PA 15222');
row('Provider', 'DealDesk Demo Software LLC');
row('Customer contact', 'Maya Lindqvist, VP Procurement');
y -= 6;

heading('2. Commercial Summary');
row('Total contract value:', '$250,000');
row('Discount:', '15% off list price');
row('Payment terms:', 'Net-45 from invoice date');
row('Implementation fee:', '$18,500 (fixed fee, one time)');
row('Expected margin:', '44%');
y -= 6;

heading('3. Products and Services');
text('Enterprise Platform license for up to 400 named users, including the analytics module, standard integrations, and business-hours support. Implementation covers data migration from the existing vendor, SSO setup, and two administrator training sessions.');
y -= 6;

heading('4. Billing');
text('Fees are invoiced annually in advance. Invoices are payable in US dollars. Late balances may accrue interest at 1% per month after a 10-day notice period.');

// ---------- Page 2 ----------
newPage();
heading('5. Service Levels');
text('Uptime SLA: 99.9% monthly availability, measured as described in the Provider service level policy. Service credits are the sole remedy for availability shortfalls.');
y -= 6;

heading('6. Limitation of Liability');
text("Each party's total liability under this agreement is limited to 1x the annual fees paid or payable in the twelve months before the claim. This cap does not apply to breach of confidentiality or a party's indemnification obligations.");
y -= 6;

heading('7. Security and Data Protection');
text("Customer requires a custom security addendum covering HIPAA safeguards, data residency in the United States, and annual third-party audit rights. The addendum is attached as Exhibit C and takes precedence over the Provider's standard data processing terms where they conflict.");
y -= 6;

heading('8. Renewal');
text('This order renews for successive 12-month terms unless either party gives written notice at least 60 days before the end of the current term. Renewal pricing may increase by no more than 5% per year.');
y -= 30;

page.drawLine({ start: { x: LEFT, y }, end: { x: LEFT + 220, y }, thickness: 0.75, color: INK });
page.drawLine({ start: { x: LEFT + 280, y }, end: { x: LEFT + WIDTH, y }, thickness: 0.75, color: INK });
y -= 14;
page.drawText('Contoso Health Partners', { x: LEFT, y, size: 9.5, font, color: MUTED });
page.drawText('DealDesk Demo Software LLC', { x: LEFT + 280, y, size: 9.5, font, color: MUTED });
y -= 40;
text('Sample document generated for DealDesk AI demos. Not a real agreement.', { size: 8.5, color: MUTED });

mkdirSync('public/samples', { recursive: true });
writeFileSync('public/samples/contoso-order-form.pdf', await doc.save());
console.log('Wrote public/samples/contoso-order-form.pdf');
