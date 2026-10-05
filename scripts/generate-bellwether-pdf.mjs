// Generates public/samples/bellwether-order-form.pdf: a 2-page order form for a
// Low-risk deal (every term within standard policy).
// Run with: node scripts/generate-bellwether-pdf.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const doc = await PDFDocument.create();
doc.setTitle('Bellwether Analytics Co. - Software Subscription Order Form');
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
page.drawText('SOFTWARE SUBSCRIPTION ORDER FORM', { x: LEFT, y, size: 18, font: bold, color: INK });
y -= 20;
text('Order reference BWA-2026-0214  |  Effective date: November 15, 2026  |  Initial term: 12 months', {
  size: 9.5,
  color: MUTED,
  gap: 26,
});

heading('1. Parties');
row('Customer:', 'Bellwether Analytics Co.');
row('Customer address', '88 Penn Avenue, Pittsburgh, PA 15222');
row('Provider', 'DealDesk Demo Software LLC');
row('Customer contact', 'Priya Raman, Director of Operations');
y -= 6;

heading('2. Commercial Summary');
row('Total contract value:', '$180,000');
row('Discount:', '8% off list price');
row('Payment terms:', 'Net-30 from invoice date');
row('Implementation fee:', '$12,000 (fixed fee, one time)');
row('Expected margin:', '46%');
y -= 6;

heading('3. Products and Services');
text('Enterprise Platform license for up to 150 named users, including standard reporting, standard integrations, and business-hours support. Implementation covers account setup, single sign-on configuration, and one administrator training session.');
y -= 6;

heading('4. Billing');
text('Fees are invoiced annually in advance and are payable in US dollars. Undisputed invoices not paid when due may accrue interest after written notice.');

// ---------- Page 2 ----------
newPage();
heading('5. Service Levels');
text('Uptime SLA: 99.9% monthly availability, measured as described in the Provider service level policy. Service credits are the sole remedy for availability shortfalls.');
y -= 6;

heading('6. Limitation of Liability');
text("Each party's total liability under this agreement is limited to 1x the annual fees paid or payable in the twelve months before the claim, except for breach of confidentiality.");
y -= 6;

heading('7. Data Protection');
text("The Provider's standard data processing agreement applies without modification. No additional terms have been requested by the Customer.");
y -= 6;

heading('8. Renewal');
text('This order renews for successive 12-month terms unless either party gives written notice at least 30 days before the end of the current term.');
y -= 30;

page.drawLine({ start: { x: LEFT, y }, end: { x: LEFT + 220, y }, thickness: 0.75, color: INK });
page.drawLine({ start: { x: LEFT + 280, y }, end: { x: LEFT + WIDTH, y }, thickness: 0.75, color: INK });
y -= 14;
page.drawText('Bellwether Analytics Co.', { x: LEFT, y, size: 9.5, font, color: MUTED });
page.drawText('DealDesk Demo Software LLC', { x: LEFT + 280, y, size: 9.5, font, color: MUTED });
y -= 40;
text('Sample document generated for DealDesk AI demos. Not a real agreement.', { size: 8.5, color: MUTED });

mkdirSync('public/samples', { recursive: true });
writeFileSync('public/samples/bellwether-order-form.pdf', await doc.save());
console.log('Wrote public/samples/bellwether-order-form.pdf');
