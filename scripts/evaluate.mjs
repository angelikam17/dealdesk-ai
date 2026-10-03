// Evaluates PDF term extraction and its effect on review outcomes.
// 20 contract excerpts with hand-labeled ground truth. Missing clauses are labeled null;
// in the app a missing term keeps the new-deal default (standard terms), so the
// "true deal" fills nulls the same way before scoring flags, risk and routing.
// Run with: node scripts/evaluate.mjs
import { extractDealTerms } from '../src/lib/extractDealTerms.js';
import { BLANK_DEAL, reviewDeal } from '../src/lib/reviewEngine.js';

const C = [
  { text: `Customer: Northwind Logistics, Inc.\nContract value (list): $400,000\nDiscount: 25% off list price\nPayment terms: Net-90 from invoice date\nCustom implementation fee: $62,000\nExpected margin: 38%\nLimitation of liability: Provider's liability under this agreement shall be unlimited.\nUptime SLA: 99.99% monthly availability.`,
    truth: { customer: 'Northwind Logistics, Inc.', dealValue: 400000, discount: 25, paymentTerms: 'Net-90', implementationCost: 62000, liability: 'Unlimited liability', sla: '99.99', margin: 38, securityReview: false } },
  { text: `Customer: Contoso Health Partners\nTotal contract value: $250,000\nDiscount: 15% off list price\nPayment terms: Net-45 from invoice date\nImplementation fee: $18,500 (fixed fee)\nExpected margin: 44%\nUptime SLA: 99.9% monthly availability.\nEach party's total liability is limited to 1x the annual fees paid.\nCustomer requires a custom security addendum covering HIPAA safeguards and audit rights.`,
    truth: { customer: 'Contoso Health Partners', dealValue: 250000, discount: 15, paymentTerms: 'Net-45', implementationCost: 18500, liability: 'Capped at 1x annual fees', sla: '99.9', margin: 44, securityReview: true } },
  { text: `ORDER FORM\nClient - Fabrikam Retail Group\nSubscription price: $120,000 per year\nCustomer receives a 5% discount for a two-year commitment.\nInvoices are payable within 30 days.\nOnboarding: $8,000\nTarget margin 52%`,
    truth: { customer: 'Fabrikam Retail Group', dealValue: 120000, discount: 5, paymentTerms: 'Net-30', implementationCost: 8000, liability: null, sla: null, margin: 52, securityReview: false } },
  { text: `Account: Tailspin Toys LLC\nTotal order amount: $1.5M\nDiscount: 30%\nNet 60\nProfessional services: $210,000\nLiability is limited to 2x the annual fees paid.\nAvailability target of 99.95% per calendar month.\nGross margin: 29%`,
    truth: { customer: 'Tailspin Toys LLC', dealValue: 1500000, discount: 30, paymentTerms: 'Net-60', implementationCost: 210000, liability: 'Capped at 2x annual fees', sla: '99.95', margin: 29, securityReview: false } },
  { text: `Customer: Woodgrove Bank\nAnnual subscription fees: USD 180,000\nDiscount of 12 percent applied to list.\nPayment due within sixty (60) days of invoice.\nImplementation services fee: $24,000\nThe Provider shall maintain 99.99% uptime.\nCustomer requires data residency in the United States.\nExpected margin: 41%`,
    truth: { customer: 'Woodgrove Bank', dealValue: 180000, discount: 12, paymentTerms: 'Net-60', implementationCost: 24000, liability: null, sla: '99.99', margin: 41, securityReview: true } },
  { text: `Customer: Adventure Works Cycles\nContract value: $95,000\nNo discount applies.\nPayment terms: Net 30\nSetup fee: $2,500\nUptime SLA 99.5%\nLiability cap: 1x annual fees\nMargin: 61%`,
    truth: { customer: 'Adventure Works Cycles', dealValue: 95000, discount: 0, paymentTerms: 'Net-30', implementationCost: 2500, liability: 'Capped at 1x annual fees', sla: '99.5', margin: 61, securityReview: false } },
  { text: `Buyer: Litware Inc.\nLicense fees total $640,000.\nDiscount: 18% off list\nPayment terms: Net-120\nIntegration fee: $96,000\nProvider's liability shall not be capped for data breaches or any other claims.\nSLA: 99.9%\nExpected margin 36%`,
    truth: { customer: 'Litware Inc.', dealValue: 640000, discount: 18, paymentTerms: 'Net-120', implementationCost: 96000, liability: 'Unlimited liability', sla: '99.9', margin: 36, securityReview: false } },
  { text: `Customer: Proseware, Inc.\nDeal value: $75k\n8% discount\nNet-30\nThere is no implementation fee.\nUptime: 99.9%\nGross margin 47%`,
    truth: { customer: 'Proseware, Inc.', dealValue: 75000, discount: 8, paymentTerms: 'Net-30', implementationCost: 0, liability: null, sla: '99.9', margin: 47, securityReview: false } },
  { text: `Customer: Coho Winery\nContract price: $310,000\nThe customer is granted twenty percent off the list price.\nPayment within 45 days of invoice receipt.\nImplementation: $40,000\nLiability is capped at three times the annual fees.\nAvailability: 99.95%\nMargin: 39%`,
    truth: { customer: 'Coho Winery', dealValue: 310000, discount: 20, paymentTerms: 'Net-45', implementationCost: 40000, liability: 'Capped at 3x annual fees', sla: '99.95', margin: 39, securityReview: false } },
  { text: `Customer: Alpine Ski House\nSubscription value: $56,000\nDiscount: 10%\nPayment terms: Net-30\nOnboarding fee: $4,000\nUptime SLA: 99.9%\nLiability: limited to 1x fees paid in prior 12 months\nExpected margin: 40%`,
    truth: { customer: 'Alpine Ski House', dealValue: 56000, discount: 10, paymentTerms: 'Net-30', implementationCost: 4000, liability: 'Capped at 1x annual fees', sla: '99.9', margin: 40, securityReview: false } },
  { text: `Customer: Blue Yonder Airlines\nTotal contract value: $2,400,000\nDiscount: 22.5%\nPayment terms: Net 90\nCustom implementation: $350,000\nUnlimited liability for confidentiality breaches.\nUptime SLA: 99.999%\nPenetration testing reports to be provided annually.\nExpected margin: 33%`,
    truth: { customer: 'Blue Yonder Airlines', dealValue: 2400000, discount: 22.5, paymentTerms: 'Net-90', implementationCost: 350000, liability: 'Unlimited liability', sla: '99.999', margin: 33, securityReview: true } },
  { text: `Customer: Graphic Design Institute\nContract value: $42,000\nEducation discount: 35%\nPayment terms: Net-30\nUptime commitment of 99.9%\nMargin: 31%`,
    truth: { customer: 'Graphic Design Institute', dealValue: 42000, discount: 35, paymentTerms: 'Net-30', implementationCost: null, liability: null, sla: '99.9', margin: 31, securityReview: false } },
  { text: `Customer: Humongous Insurance\nList price: $880,000\nA discount of 14% applies.\nInvoices are due within 75 days.\nImplementation services: $70,000\nLiability limited to 2 times annual fees.\nSLA 99.95 percent monthly.\nGross margin: 42%`,
    truth: { customer: 'Humongous Insurance', dealValue: 880000, discount: 14, paymentTerms: 'Net-90', implementationCost: 70000, liability: 'Capped at 2x annual fees', sla: '99.95', margin: 42, securityReview: false } },
  { text: `Customer: Lucerne Publishing\nContract value: $130,000\nDiscount: 9%\nPayment terms: Net-30\nImplementation fee: $16,000\nUptime SLA: 99.9%\nLiability: 1x annual fees\nExpected margin: 45%\nStandard data processing agreement applies.`,
    truth: { customer: 'Lucerne Publishing', dealValue: 130000, discount: 9, paymentTerms: 'Net-30', implementationCost: 16000, liability: 'Capped at 1x annual fees', sla: '99.9', margin: 45, securityReview: false } },
  { text: `Customer: Margie's Travel\nTotal value $210,000.\nDiscount: 12%\nNet-45\nCustom integration: $30,000\nUptime 99.9%\nMargin 43%`,
    truth: { customer: "Margie's Travel", dealValue: 210000, discount: 12, paymentTerms: 'Net-45', implementationCost: 30000, liability: null, sla: '99.9', margin: 43, securityReview: false } },
  { text: `Customer: Northwind Traders\nContract value: $500,000\nDiscount: 25%\nPayment terms: Net 60\nImplementation: $55,000\nLiability: uncapped liability for IP infringement\nUptime SLA: 99.99%\nExpected margin: 35%\nCustomer requires audit rights over subprocessors.`,
    truth: { customer: 'Northwind Traders', dealValue: 500000, discount: 25, paymentTerms: 'Net-60', implementationCost: 55000, liability: 'Unlimited liability', sla: '99.99', margin: 35, securityReview: true } },
  { text: `Customer: School of Fine Art\nContract value: $28,000\nDiscount: 0%\nPayment terms: Net-30\nSLA: 99.5%\nGross margin: 58%`,
    truth: { customer: 'School of Fine Art', dealValue: 28000, discount: 0, paymentTerms: 'Net-30', implementationCost: null, liability: null, sla: '99.5', margin: 58, securityReview: false } },
  { text: `Customer: Trey Research\nContract value: $460,000\nDiscount: 16%\nPayment terms: Net-60\nImplementation fee: $58,000\nThe parties' aggregate liability shall not exceed 1x the fees paid in the twelve months before the claim.\nAvailability 99.9%\nExpected margin: 37%`,
    truth: { customer: 'Trey Research', dealValue: 460000, discount: 16, paymentTerms: 'Net-60', implementationCost: 58000, liability: 'Capped at 1x annual fees', sla: '99.9', margin: 37, securityReview: false } },
  { text: `Customer: Wide World Importers\nContract value: $340,000\nDiscount: 11%\nPayment terms: Net-30\nImplementation: $20,000\nUptime SLA: 99.9%\nCustom security requirements apply per Exhibit D.\nExpected margin: 48%`,
    truth: { customer: 'Wide World Importers', dealValue: 340000, discount: 11, paymentTerms: 'Net-30', implementationCost: 20000, liability: null, sla: '99.9', margin: 48, securityReview: true } },
  { text: `Customer: VanArsdel, Ltd.\nContract value: $150,000\nDiscount: 40%\nPayment terms: Net-30\nImplementation: $45,000\nLiability: unlimited\nUptime: 99.9%\nMargin: 22%`,
    truth: { customer: 'VanArsdel, Ltd.', dealValue: 150000, discount: 40, paymentTerms: 'Net-30', implementationCost: 45000, liability: 'Unlimited liability', sla: '99.9', margin: 22, securityReview: false } },
];

const FIELDS = ['customer', 'dealValue', 'discount', 'paymentTerms', 'implementationCost', 'liability', 'sla', 'margin', 'securityReview'];
const same = (a, b) => (typeof a === 'number' || typeof b === 'number' ? Number(a) === Number(b) : String(a ?? '').trim() === String(b ?? '').trim());
const fillDefaults = (vals) => {
  const d = { ...BLANK_DEAL };
  for (const k of FIELDS) if (vals[k] !== null && vals[k] !== undefined && vals[k] !== '') d[k] = vals[k];
  return d;
};

const perField = Object.fromEntries(FIELDS.map((f) => [f, { tp: 0, fp: 0, fn: 0, tn: 0, wrong: 0, n: 0, correct: 0 }]));
let flagTp = 0, flagFp = 0, flagFn = 0, riskOk = 0, routeOk = 0, allFieldsOk = 0;
const misses = [];

C.forEach(({ text, truth }, i) => {
  const { fields } = extractDealTerms(text);
  let allOk = true;
  for (const f of FIELDS) {
    const s = perField[f];
    s.n++;
    const t = truth[f];
    const presentT = f === 'securityReview' ? t === true : t !== null;
    const p = fields[f];
    const presentP = f === 'securityReview' ? p.value === true : p.found;
    const valueOk = f === 'securityReview' ? Boolean(p.value) === Boolean(t) : presentT ? presentP && same(p.value, t) : !presentP;
    if (valueOk) s.correct++;
    else {
      allOk = false;
      misses.push(`#${i + 1} ${f}: expected ${JSON.stringify(t)}, got ${JSON.stringify(p.value)}`);
    }
    // Detection counts: is the field present and was it captured with the right value?
    if (presentT && presentP && valueOk) s.tp++;
    else if (presentT && presentP && !valueOk) { s.wrong++; s.fp++; s.fn++; }
    else if (presentT && !presentP) s.fn++;
    else if (!presentT && presentP) s.fp++;
    else s.tn++;
  }
  if (allOk) allFieldsOk++;

  const extracted = fillDefaults(Object.fromEntries(FIELDS.map((f) => [f, fields[f].value])));
  extracted.customer = extracted.customer || 'x';
  extracted.dealValue = extracted.dealValue || 1;
  const trueDeal = fillDefaults(truth);
  const rp = reviewDeal(extracted);
  const rt = reviewDeal(trueDeal);
  const fp = new Set(rp.flags.map((f) => `${f.id}:${f.severity}`));
  const ft = new Set(rt.flags.map((f) => `${f.id}:${f.severity}`));
  for (const x of fp) (ft.has(x) ? flagTp++ : flagFp++);
  for (const x of ft) if (!fp.has(x)) flagFn++;
  if (rp.riskLevel === rt.riskLevel) riskOk++;
  if (rp.approvers.map((a) => a.id).join() === rt.approvers.map((a) => a.id).join()) routeOk++;
});

const pct = (x) => Math.round(x * 1000) / 10;
const prf = (tp, fp, fn) => {
  const p = tp / (tp + fp || 1), r = tp / (tp + fn || 1);
  return { precision: pct(p), recall: pct(r), f1: pct((2 * p * r) / (p + r || 1)) };
};
let T = { tp: 0, fp: 0, fn: 0, correct: 0, n: 0 };
const rows = FIELDS.map((f) => {
  const s = perField[f];
  T.tp += s.tp; T.fp += s.fp; T.fn += s.fn; T.correct += s.correct; T.n += s.n;
  return { field: f, accuracy: pct(s.correct / s.n), ...prf(s.tp, s.fp, s.fn), present: s.tp + s.fn };
});
console.log(JSON.stringify({
  contracts: C.length,
  fieldValues: T.n,
  fieldAccuracy: pct(T.correct / T.n),
  extractionMicro: prf(T.tp, T.fp, T.fn),
  contractsAllFieldsCorrect: `${allFieldsOk}/${C.length}`,
  flags: { ...prf(flagTp, flagFp, flagFn), tp: flagTp, fp: flagFp, fn: flagFn },
  riskLevelAccuracy: `${riskOk}/${C.length}`,
  approverRoutingExactMatch: `${routeOk}/${C.length}`,
  perField: rows,
  misses,
}, null, 2));
