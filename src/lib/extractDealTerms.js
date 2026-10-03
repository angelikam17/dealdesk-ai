// Pull deal terms out of contract / order-form text.
// Pure function: text in, structured fields out. No network, no AI key.
// Every field reports what was found plus the source snippet, so a human
// can confirm or correct it before anything fills the deal form.

import { LIABILITY_TERMS, PAYMENT_TERMS, SLA_OPTIONS } from './reviewEngine.js';

export const EXTRACT_FIELDS = [
  { key: 'customer', label: 'Customer' },
  { key: 'dealValue', label: 'Deal value (list)' },
  { key: 'discount', label: 'Discount' },
  { key: 'paymentTerms', label: 'Payment terms' },
  { key: 'implementationCost', label: 'Implementation cost' },
  { key: 'liability', label: 'Liability' },
  { key: 'sla', label: 'Uptime SLA' },
  { key: 'margin', label: 'Expected margin' },
  { key: 'securityReview', label: 'Custom security terms' },
];

const MONEY = String.raw`\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|m|thousand|million)?\b`;
const PCT = String.raw`(-?\d{1,3}(?:\.\d+)?)\s*(?:%|percent)`;

function toNumber(raw, unit) {
  let n = parseFloat(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const u = (unit || '').toLowerCase();
  if (u === 'k' || u === 'thousand') n *= 1_000;
  if (u === 'm' || u === 'million') n *= 1_000_000;
  return n;
}

function snippetAround(text, index, length) {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length + 40);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

/** Try each regex in order; return the first match with its snippet. */
function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return { m, snippet: snippetAround(text, m.index, m[0].length) };
  }
  return null;
}

const found = (value, snippet, note) => ({ found: true, value, snippet, ...(note ? { note } : {}) });
const missing = () => ({ found: false, value: null, snippet: null });

function closestOption(options, n) {
  return options.reduce((best, o) => (Math.abs(parseFloat(o) - n) < Math.abs(parseFloat(best) - n) ? o : best));
}

const extractors = {
  customer(text) {
    const hit = firstMatch(text, [
      /\b(?:customer|client|buyer|account)(?:\s+name)?\s*[:\-]\s*([^\n]{2,80})/i,
      /\bbetween\b[\s\S]{0,80}?\band\s+([A-Z][\w&.,' -]{2,60}?)\s*\(\s*["“]?(?:customer|client)/i,
    ]);
    if (!hit) return missing();
    const name = hit.m[1].replace(/\s{2,}.*/, '').replace(/[;,\s]+$/, '').trim();
    return name ? found(name, hit.snippet) : missing();
  },

  dealValue(text) {
    const hit = firstMatch(text, [
      new RegExp(String.raw`\b(?:total\s+)?(?:deal|contract|list|subscription|order|license)\s+(?:value|price|amount|fees?|total)\b[^\n\d$]{0,30}` + MONEY, 'i'),
      new RegExp(String.raw`\btotal\s+(?:value|price|amount)\b[^\n\d$]{0,30}` + MONEY, 'i'),
    ]);
    if (!hit) return missing();
    const n = toNumber(hit.m[1], hit.m[2]);
    return n > 0 ? found(n, hit.snippet) : missing();
  },

  discount(text) {
    const hit = firstMatch(text, [
      new RegExp(String.raw`\bdiscount\b[^\n\d]{0,40}` + PCT, 'i'),
      new RegExp(PCT + String.raw`\s*(?:off|discount)\b`, 'i'),
    ]);
    if (!hit) return missing();
    const n = parseFloat(hit.m[1]);
    return n >= 0 && n <= 100 ? found(n, hit.snippet) : missing();
  },

  paymentTerms(text) {
    const hit = firstMatch(text, [
      /\bnet[\s-]?(\d{2,3})\b/i,
      /\b(?:payment|invoices?)\b[^\n]{0,60}?\bwithin\s+(\d{2,3})\s+days\b/i,
    ]);
    if (!hit) return missing();
    const days = parseInt(hit.m[1], 10);
    const exact = `Net-${days}`;
    if (PAYMENT_TERMS.includes(exact)) return found(exact, hit.snippet);
    // Round up to the next supported term so risk is never understated.
    const next = PAYMENT_TERMS.find((t) => parseInt(t.slice(4), 10) >= days) ?? PAYMENT_TERMS.at(-1);
    return found(next, hit.snippet, `Contract says ${exact}; rounded up to ${next}.`);
  },

  implementationCost(text) {
    const hit = firstMatch(text, [
      new RegExp(String.raw`\b(?:custom\s+)?(?:implementation|professional\s+services|onboarding|setup|integration)\b[^\n\d$]{0,40}` + MONEY, 'i'),
    ]);
    if (!hit) return missing();
    const n = toNumber(hit.m[1], hit.m[2]);
    return n >= 0 ? found(n, hit.snippet) : missing();
  },

  liability(text) {
    const unlimited = firstMatch(text, [
      /\b(?:unlimited|uncapped)\s+liability\b/i,
      /\bliability\b[^\n.]{0,80}\b(?:unlimited|uncapped|shall not be (?:capped|limited)|no (?:cap|limit))\b/i,
    ]);
    if (unlimited) return found('Unlimited liability', unlimited.snippet);
    const capped = firstMatch(text, [
      /\bliability\b[^\n.]{0,100}?\b(\d(?:\.\d)?)\s*(?:x|×|times)\b/i,
      /\b(\d(?:\.\d)?)\s*(?:x|×|times)\s+(?:the\s+)?(?:annual|total|fees)[^\n.]{0,60}\bliability\b/i,
    ]);
    if (!capped) return missing();
    const mult = parseFloat(capped.m[1]);
    const opt = Math.min(3, Math.max(1, Math.ceil(mult)));
    const value = LIABILITY_TERMS[opt - 1];
    return found(value, capped.snippet, mult > 3 ? `Contract cap is ${mult}x; closest option is 3x.` : undefined);
  },

  sla(text) {
    const hit = firstMatch(text, [
      /\b(?:uptime|availability|sla)\b[^\n\d]{0,40}(\d{2}(?:\.\d{1,3})?)\s*%/i,
      /(\d{2}(?:\.\d{1,3})?)\s*%[^\n]{0,30}\b(?:uptime|availability)\b/i,
    ]);
    if (!hit) return missing();
    const n = parseFloat(hit.m[1]);
    if (!(n >= 90 && n <= 100)) return missing();
    const opt = closestOption(SLA_OPTIONS, n);
    return found(opt, hit.snippet, String(n) !== opt ? `Contract says ${n}%; closest option is ${opt}%.` : undefined);
  },

  margin(text) {
    const hit = firstMatch(text, [new RegExp(String.raw`\b(?:expected\s+|gross\s+|target\s+)?margin\b[^\n\d-]{0,30}` + PCT, 'i')]);
    if (!hit) return missing();
    const n = parseFloat(hit.m[1]);
    return n >= -100 && n <= 100 ? found(n, hit.snippet) : missing();
  },

  securityReview(text) {
    const hit = firstMatch(text, [
      /\b(?:custom\s+)?security\s+(?:addendum|requirements|terms|review)\b/i,
      /\b(?:data\s+residency|audit\s+rights|penetration\s+test(?:ing)?|on-?prem(?:ises)?\s+data)\b/i,
    ]);
    return hit ? found(true, hit.snippet) : { found: false, value: false, snippet: null };
  },
};

/**
 * Extract deal terms from raw text.
 * @returns {{ fields: Record<string, {found:boolean, value:any, snippet:string|null, note?:string}>, foundCount: number }}
 */
export function extractDealTerms(text) {
  const clean = String(text ?? '').replace(/\r/g, '');
  const fields = {};
  for (const { key } of EXTRACT_FIELDS) fields[key] = extractors[key](clean);
  const foundCount = EXTRACT_FIELDS.filter(({ key }) => key !== 'securityReview' && fields[key].found).length;
  return { fields, foundCount };
}

/** Merge confirmed extracted values onto a base deal. */
export function applyExtracted(base, values) {
  const next = { ...base };
  for (const [key, v] of Object.entries(values)) {
    if (v !== null && v !== undefined && v !== '') next[key] = v;
  }
  return next;
}
