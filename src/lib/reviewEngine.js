// DealDesk AI review engine.
// Deterministic policy rules decide what gets flagged and who must approve.
// The "AI" explanations are mock, template-generated text so the app runs
// without any API key. Nothing here ever approves a deal; it only advises.

export const APPROVERS = {
  SALES: {
    id: 'SALES',
    title: 'Sales Manager',
    owner: 'Regional Sales Director',
    sla: '1 business day',
    icon: 'sales',
  },
  FINANCE: {
    id: 'FINANCE',
    title: 'Finance',
    owner: 'Revenue Operations & Finance',
    sla: '2 business days',
    icon: 'finance',
  },
  LEGAL: {
    id: 'LEGAL',
    title: 'Legal',
    owner: 'Commercial Counsel',
    sla: '3 business days',
    icon: 'legal',
  },
  RISK: {
    id: 'RISK',
    title: 'Risk / Security',
    owner: 'Security & Reliability Office',
    sla: '2 business days',
    icon: 'risk',
  },
};

export const PAYMENT_TERMS = ['Net-30', 'Net-45', 'Net-60', 'Net-90', 'Net-120'];

export const LIABILITY_TERMS = [
  'Capped at 1x annual fees',
  'Capped at 2x annual fees',
  'Capped at 3x annual fees',
  'Unlimited liability',
];

export const SLA_OPTIONS = ['99.5', '99.9', '99.95', '99.99', '99.999'];

export const DEFAULT_DEAL = {
  customer: 'Northwind Logistics, Inc.',
  dealValue: 400000,
  discount: 25,
  paymentTerms: 'Net-90',
  implementationCost: 62000,
  liability: 'Unlimited liability',
  sla: '99.99',
  margin: 38,
  securityReview: false,
};

// Starting point for a brand-new deal: standard terms, no customer yet.
export const BLANK_DEAL = {
  customer: '',
  dealValue: '',
  discount: 0,
  paymentTerms: 'Net-30',
  implementationCost: 0,
  liability: 'Capped at 1x annual fees',
  sla: '99.9',
  margin: 40,
  securityReview: false,
};

// Company standard terms the engine compares against.
export const STANDARDS = {
  discount: 'Up to 10%',
  paymentTerms: 'Net-30',
  implementationCost: 'Up to 10% of net value',
  liability: 'Capped at 1x annual fees',
  sla: '99.9%',
  margin: '40% or higher',
};

export const fmtUSD = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);

const paymentDays = (terms) => parseInt(String(terms).replace(/\D/g, ''), 10) || 30;

/** Validate raw form input. Returns a map of field -> error message. */
export function validateDeal(d) {
  const errors = {};
  if (!(d.dealValue > 0)) errors.dealValue = 'Enter a deal value greater than 0.';
  if (!(d.discount >= 0 && d.discount <= 100)) errors.discount = 'Discount must be between 0 and 100%.';
  if (!(d.implementationCost >= 0)) errors.implementationCost = 'Cost cannot be negative.';
  if (!(d.margin >= -100 && d.margin <= 100)) errors.margin = 'Margin must be between -100% and 100%.';
  return errors;
}

/** Run the policy review. Pure function: same input -> same output. */
export function reviewDeal(d) {
  const netValue = d.dealValue * (1 - d.discount / 100);
  const discountAmount = d.dealValue - netValue;
  const implPct = netValue > 0 ? (d.implementationCost / netValue) * 100 : 0;
  const days = paymentDays(d.paymentTerms);
  const slaNum = parseFloat(d.sla);
  const downtimeMinPerMonth = ((100 - slaNum) / 100) * 30 * 24 * 60;

  const flags = [];

  // 1. Discount -> Sales Manager
  if (d.discount > 10) {
    const severity = d.discount >= 20 ? 'High' : 'Medium';
    flags.push({
      id: 'discount',
      term: 'Discount',
      value: `${d.discount}%`,
      standard: STANDARDS.discount,
      severity,
      approver: 'SALES',
      explanation:
        severity === 'High'
          ? `A ${d.discount}% discount is ${(d.discount / 10).toFixed(1)}x the standard ceiling and removes ${fmtUSD(discountAmount)} from list price. Discounts this deep tend to anchor renewal pricing and can set a precedent for the account. Recommend the Sales Manager confirm competitive justification or trade the discount for a longer term or prepayment.`
          : `A ${d.discount}% discount is above the 10% standard (${fmtUSD(discountAmount)} off list). This is within typical negotiation range but should be justified by deal size, term length, or a competitive situation.`,
    });
  }

  // 2. Payment terms -> Finance
  if (days > 30) {
    const severity = days >= 90 ? 'High' : 'Medium';
    const carry = netValue * 0.08 * ((days - 30) / 365); // ~8% cost of capital
    flags.push({
      id: 'payment',
      term: 'Payment terms',
      value: d.paymentTerms,
      standard: STANDARDS.paymentTerms,
      severity,
      approver: 'FINANCE',
      explanation: `${d.paymentTerms} delays cash collection by ${days - 30} days versus standard Net-30. At an assumed 8% cost of capital, that is roughly ${fmtUSD(carry)} in carrying cost and increases days-sales-outstanding and collection risk.${severity === 'High' ? ' Finance should verify customer credit and consider milestone billing.' : ''}`,
    });
  }

  // 3. Custom implementation -> Finance (margin/cost exposure)
  if (implPct > 10) {
    const severity = implPct >= 25 ? 'High' : 'Medium';
    flags.push({
      id: 'implementation',
      term: 'Custom implementation',
      value: `${fmtUSD(d.implementationCost)} (${implPct.toFixed(1)}% of net)`,
      standard: STANDARDS.implementationCost,
      severity,
      approver: 'FINANCE',
      explanation: `Custom implementation of ${fmtUSD(d.implementationCost)} equals ${implPct.toFixed(1)}% of net contract value. Bespoke work at this level often runs over scope and compresses delivery margin. Recommend a fixed statement of work with change-order controls before signature.`,
    });
  }

  // 4. Liability -> Legal
  if (d.liability !== 'Capped at 1x annual fees') {
    const unlimited = d.liability === 'Unlimited liability';
    flags.push({
      id: 'liability',
      term: 'Liability',
      value: d.liability,
      standard: STANDARDS.liability,
      severity: unlimited ? 'High' : 'Medium',
      approver: 'LEGAL',
      explanation: unlimited
        ? `Unlimited liability exposes the company to damages with no ceiling, potentially far beyond the ${fmtUSD(netValue)} contract value. This is a significant departure from the standard 1x annual fees cap and typically requires Legal sign-off and insurance review. Recommend negotiating a cap, with carve-outs limited to IP infringement and confidentiality.`
        : `${d.liability} exceeds the standard 1x cap, raising maximum exposure to about ${fmtUSD(netValue * parseInt(d.liability.match(/\d/)[0], 10))}. Legal should confirm the higher cap is covered by existing insurance.`,
    });
  }

  // 5. SLA -> Risk / Security
  if (slaNum > 99.9) {
    const severity = slaNum >= 99.99 ? 'High' : 'Medium';
    flags.push({
      id: 'sla',
      term: 'Uptime SLA',
      value: `${d.sla}%`,
      standard: STANDARDS.sla,
      severity,
      approver: 'RISK',
      explanation: `A ${d.sla}% SLA allows only ~${downtimeMinPerMonth.toFixed(1)} minutes of downtime per month (standard 99.9% allows ~43 min). ${severity === 'High' ? 'This likely exceeds current platform architecture guarantees and could trigger service credits. ' : ''}Risk/Security should confirm the commitment is operationally achievable and review the service-credit schedule.`,
    });
  }

  // 6. Security-related terms -> Risk / Security
  if (d.securityReview) {
    flags.push({
      id: 'security',
      term: 'Custom security terms',
      value: 'Requested by customer',
      standard: 'Standard DPA & security addendum',
      severity: 'Medium',
      approver: 'RISK',
      explanation:
        'The customer has requested non-standard security or data-handling terms. These may introduce audit rights, data-residency obligations, or breach-notification windows outside standard policy. Risk/Security should review before commitment.',
    });
  }

  // 7. Low margin -> Finance
  if (d.margin < 40) {
    const severity = d.margin < 30 ? 'High' : 'Medium';
    flags.push({
      id: 'margin',
      term: 'Expected margin',
      value: `${d.margin}%`,
      standard: STANDARDS.margin,
      severity,
      approver: 'FINANCE',
      explanation: `Expected margin of ${d.margin}% is below the 40% target${severity === 'High' ? ' and under the 30% floor' : ''}. Combined with the discount and implementation cost, profitability on this deal is ${severity === 'High' ? 'at risk' : 'thinner than usual'}. Finance should validate the cost model.`,
    });
  }

  // Overall risk scoring
  const score = flags.reduce((s, f) => s + (f.severity === 'High' ? 3 : 1), 0);
  const highs = flags.filter((f) => f.severity === 'High').length;
  let riskLevel = 'Low';
  if (highs > 0 || score >= 4) riskLevel = 'High';
  else if (flags.length > 0) riskLevel = 'Medium';

  // Approval routing
  const approverIds = [...new Set(flags.map((f) => f.approver))];
  const order = ['SALES', 'FINANCE', 'LEGAL', 'RISK'];
  const approvers = order
    .filter((id) => approverIds.includes(id))
    .map((id) => ({
      ...APPROVERS[id],
      reasons: flags.filter((f) => f.approver === id).map((f) => f.term),
      severity: flags.some((f) => f.approver === id && f.severity === 'High') ? 'High' : 'Medium',
    }));

  const summary = buildSummary(d, flags, riskLevel, approvers);

  return {
    netValue,
    discountAmount,
    implPct,
    downtimeMinPerMonth,
    flags,
    flaggedIds: new Set(flags.map((f) => f.id)),
    riskLevel,
    score,
    approvers,
    summary,
    reviewedAt: new Date(),
  };
}

function buildSummary(d, flags, riskLevel, approvers) {
  if (flags.length === 0) {
    return `This deal is within standard commercial terms. No nonstandard terms were detected. A human reviewer must still confirm and approve the deal. DealDesk AI never auto-approves.`;
  }
  const highs = flags.filter((f) => f.severity === 'High').map((f) => f.term.replace(/^\w/, (c) => c.toLowerCase()));
  const names = approvers.map((a) => a.title).join(', ');
  return `DealDesk AI found ${flags.length} nonstandard term${flags.length > 1 ? 's' : ''} on this ${fmtUSD(d.dealValue)} deal${highs.length ? `, including high-risk ${highs.join(', ')}` : ''}. Overall risk is assessed as ${riskLevel}. Routing to ${names} for review. This is a recommendation only. The final decision rests with a human approver.`;
}
