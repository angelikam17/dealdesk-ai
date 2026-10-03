// Plain-text deal summary for email / clipboard. No email backend: the
// mailto: link opens the user's own mail client with the text filled in.
import { fmtUSD } from './reviewEngine.js';
import { STATUS_LABELS } from './dealsApi.js';

export function buildShareText({ deal, review, status, decision, url }) {
  const lines = [
    `Deal review: ${deal.customer}`,
    `Status: ${STATUS_LABELS[status] ?? status}${decision ? ` (by ${decision.reviewer})` : ''}`,
    `Overall risk: ${review.riskLevel}`,
    '',
    'KEY TERMS',
    `- Deal value (list): ${fmtUSD(deal.dealValue)}`,
    `- Net contract value: ${fmtUSD(review.netValue)}`,
    `- Discount: ${deal.discount}%`,
    `- Payment terms: ${deal.paymentTerms}`,
    `- Custom implementation: ${fmtUSD(deal.implementationCost)}`,
    `- Liability: ${deal.liability}`,
    `- Uptime SLA: ${deal.sla}%`,
    `- Expected margin: ${deal.margin}%`,
    '',
  ];

  if (review.flags.length) {
    lines.push(`FLAGGED TERMS (${review.flags.length})`);
    review.flags.forEach((f) => {
      lines.push(`- [${f.severity}] ${f.term}: ${f.value} (standard: ${f.standard})`);
      lines.push(`  ${f.explanation}`);
    });
  } else {
    lines.push('FLAGGED TERMS: none. All terms are within standard policy.');
  }

  lines.push('', 'REQUIRED APPROVERS');
  lines.push(review.approvers.length ? review.approvers.map((a) => `- ${a.title}`).join('\n') : '- None beyond the deal desk reviewer');

  if (decision?.comment) lines.push('', `Reviewer comment: “${decision.comment}”`);
  lines.push('', `Open in DealDesk AI: ${url}`, '', 'AI flags are advisory. A human made or will make the final decision.');
  return lines.join('\n');
}

export function buildMailto({ deal, review, ...rest }) {
  const subject = `Deal review: ${deal.customer} (${review.riskLevel} risk)`;
  const body = buildShareText({ deal, review, ...rest });
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
