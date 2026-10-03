// Generates public/samples/sample-deal.pdf: an order form matching the
// default example deal. Run with: npm run sample:pdf
import { writeFileSync, mkdirSync } from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const doc = await PDFDocument.create();
doc.setTitle('Northwind Logistics - Order Form');
const page = doc.addPage([612, 792]);
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);

let y = 740;
const line = (text, { f = font, size = 11, gap = 18, color = rgb(0.1, 0.12, 0.2) } = {}) => {
  page.drawText(text, { x: 56, y, size, font: f, color });
  y -= gap;
};

line('ENTERPRISE PLATFORM ORDER FORM', { f: bold, size: 16, gap: 26 });
line('Order reference: NW-2026-0418    Term: 3 years', { size: 10, gap: 28, color: rgb(0.4, 0.43, 0.5) });

line('1. Parties', { f: bold, gap: 20 });
line('Customer: Northwind Logistics, Inc.');
line('Provider: DealDesk Demo Software LLC', { gap: 28 });

line('2. Commercial Terms', { f: bold, gap: 20 });
line('Contract value (list): $400,000');
line('Discount: 25% off list price');
line('Payment terms: Net-90 from invoice date');
line('Custom implementation fee: $62,000');
line('Expected margin: 38%', { gap: 28 });

line('3. Legal', { f: bold, gap: 20 });
line("Limitation of liability: Provider's liability under this agreement shall be unlimited.", { gap: 28 });

line('4. Service Levels', { f: bold, gap: 20 });
line('Uptime SLA: 99.99% monthly availability, with service credits for any shortfall.', { gap: 28 });

line('5. Security', { f: bold, gap: 20 });
line('Standard data processing agreement applies.', { gap: 40 });

line('Signatures pending. This document is a sample for DealDesk AI demos.', {
  size: 9,
  color: rgb(0.45, 0.48, 0.55),
});

mkdirSync('public/samples', { recursive: true });
writeFileSync('public/samples/sample-deal.pdf', await doc.save());
console.log('Wrote public/samples/sample-deal.pdf');
