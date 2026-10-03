import { describe, expect, it } from 'vitest';
import { BLANK_DEAL, DEFAULT_DEAL, reviewDeal, validateDeal } from '../src/lib/reviewEngine.js';

const STANDARD = { ...BLANK_DEAL, customer: 'Std Co', dealValue: 100000, implementationCost: 5000, margin: 45 };
const ids = (r) => r.flags.map((f) => f.id);
const approverIds = (r) => r.approvers.map((a) => a.id);

describe('reviewDeal', () => {
  it('flags the default example deal as High risk and routes to all four approvers', () => {
    const r = reviewDeal(DEFAULT_DEAL);
    expect(r.riskLevel).toBe('High');
    expect(r.netValue).toBe(300000);
    expect(ids(r)).toEqual(['discount', 'payment', 'implementation', 'liability', 'sla', 'margin']);
    expect(r.flags.filter((f) => f.severity === 'High').map((f) => f.id)).toEqual([
      'discount',
      'payment',
      'liability',
      'sla',
    ]);
    expect(approverIds(r)).toEqual(['SALES', 'FINANCE', 'LEGAL', 'RISK']);
  });

  it('a standard deal is Low risk with no flags and no specialist approvers', () => {
    const r = reviewDeal(STANDARD);
    expect(r.riskLevel).toBe('Low');
    expect(r.flags).toEqual([]);
    expect(r.approvers).toEqual([]);
    expect(r.summary).toMatch(/never auto-approves/i);
  });

  it.each([
    [{ discount: 15 }, 'discount', 'Medium', 'SALES'],
    [{ discount: 20 }, 'discount', 'High', 'SALES'],
    [{ paymentTerms: 'Net-60' }, 'payment', 'Medium', 'FINANCE'],
    [{ paymentTerms: 'Net-120' }, 'payment', 'High', 'FINANCE'],
    [{ liability: 'Capped at 2x annual fees' }, 'liability', 'Medium', 'LEGAL'],
    [{ liability: 'Unlimited liability' }, 'liability', 'High', 'LEGAL'],
    [{ sla: '99.95' }, 'sla', 'Medium', 'RISK'],
    [{ sla: '99.999' }, 'sla', 'High', 'RISK'],
    [{ securityReview: true }, 'security', 'Medium', 'RISK'],
    [{ margin: 35 }, 'margin', 'Medium', 'FINANCE'],
    [{ margin: 25 }, 'margin', 'High', 'FINANCE'],
    [{ implementationCost: 30000 }, 'implementation', 'High', 'FINANCE'],
  ])('%o -> %s flag (%s) routed to %s', (change, id, severity, approver) => {
    const r = reviewDeal({ ...STANDARD, ...change });
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0]).toMatchObject({ id, severity, approver });
    expect(approverIds(r)).toEqual([approver]);
  });

  it('one Medium flag is Medium risk; four Medium flags escalate to High', () => {
    expect(reviewDeal({ ...STANDARD, discount: 15 }).riskLevel).toBe('Medium');
    const many = reviewDeal({ ...STANDARD, discount: 15, paymentTerms: 'Net-60', sla: '99.95', margin: 35 });
    expect(many.flags.every((f) => f.severity === 'Medium')).toBe(true);
    expect(many.riskLevel).toBe('High');
  });

  it('boundary values at the standard are not flagged', () => {
    const r = reviewDeal({ ...STANDARD, discount: 10, paymentTerms: 'Net-30', sla: '99.9', margin: 40, implementationCost: 9000 }); // 10% of the $90k net
    expect(r.flags).toEqual([]);
  });

  it('never returns an approved status or decision', () => {
    const r = reviewDeal(STANDARD);
    expect(r).not.toHaveProperty('status');
    expect(r).not.toHaveProperty('decision');
  });

  it('visible text contains no em or en dashes', () => {
    const r = reviewDeal({ ...DEFAULT_DEAL, securityReview: true, liability: 'Capped at 3x annual fees' });
    const text = [r.summary, ...r.flags.map((f) => f.explanation)].join(' ');
    expect(text).not.toMatch(/[—–]/);
  });
});

describe('validateDeal', () => {
  it('requires a positive deal value and sane percentages', () => {
    expect(validateDeal(DEFAULT_DEAL)).toEqual({});
    const errs = validateDeal({ ...DEFAULT_DEAL, dealValue: '', discount: 120, implementationCost: -1, margin: 200 });
    expect(Object.keys(errs).sort()).toEqual(['dealValue', 'discount', 'implementationCost', 'margin']);
  });
});
