import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { applyExtracted, extractDealTerms } from '../src/lib/extractDealTerms.js';
import { textFromItems } from '../src/lib/pdfText.js';
import { DEFAULT_DEAL } from '../src/lib/reviewEngine.js';

const values = (text) =>
  Object.fromEntries(Object.entries(extractDealTerms(text).fields).map(([k, v]) => [k, v.value]));

describe('extractDealTerms', () => {
  it('reads the bundled sample PDF and matches the default example deal', async () => {
    const data = new Uint8Array(readFileSync(new URL('../public/samples/sample-deal.pdf', import.meta.url)));
    const pdf = await getDocument({ data, useSystemFonts: true }).promise;
    const page = await pdf.getPage(1);
    const text = textFromItems((await page.getTextContent()).items);

    const { fields, foundCount } = extractDealTerms(text);
    expect(foundCount).toBe(8);
    expect(values(text)).toEqual({
      customer: DEFAULT_DEAL.customer,
      dealValue: DEFAULT_DEAL.dealValue,
      discount: DEFAULT_DEAL.discount,
      paymentTerms: DEFAULT_DEAL.paymentTerms,
      implementationCost: DEFAULT_DEAL.implementationCost,
      liability: DEFAULT_DEAL.liability,
      sla: DEFAULT_DEAL.sla,
      margin: DEFAULT_DEAL.margin,
      securityReview: false,
    });
    expect(fields.liability.snippet).toMatch(/unlimited/i);
  });

  it('handles alternate wording, shorthand amounts and capped liability', () => {
    const text = `
      Client - Contoso Health Partners
      Total contract price: $1.2M
      Customer receives 12.5 percent off.
      Invoices are payable within 45 days of receipt.
      Professional services: $85k
      Liability is limited to 2x the annual fees paid.
      Availability target of 99.95% per calendar month.
      Gross margin 41%
      Customer requires data residency in the EU.`;
    expect(values(text)).toEqual({
      customer: 'Contoso Health Partners',
      dealValue: 1_200_000,
      discount: 12.5,
      paymentTerms: 'Net-45',
      implementationCost: 85_000,
      liability: 'Capped at 2x annual fees',
      sla: '99.95',
      margin: 41,
      securityReview: true,
    });
  });

  it('rounds unsupported payment terms up and notes it, so risk is not understated', () => {
    const { fields } = extractDealTerms('Payment terms: Net 75');
    expect(fields.paymentTerms).toMatchObject({ found: true, value: 'Net-90' });
    expect(fields.paymentTerms.note).toMatch(/Net-75/);
  });

  it('reports missing fields instead of guessing', () => {
    const { fields, foundCount } = extractDealTerms('This letter confirms our meeting next Tuesday.');
    expect(foundCount).toBe(0);
    expect(fields.dealValue).toEqual({ found: false, value: null, snippet: null });
    expect(fields.securityReview.value).toBe(false);
  });

  it('handles empty input', () => {
    expect(extractDealTerms('').foundCount).toBe(0);
    expect(extractDealTerms(undefined).foundCount).toBe(0);
  });

  it('applyExtracted only overrides confirmed, non-empty values', () => {
    const merged = applyExtracted(DEFAULT_DEAL, { discount: 5, customer: '', margin: null });
    expect(merged).toEqual({ ...DEFAULT_DEAL, discount: 5 });
  });
});
