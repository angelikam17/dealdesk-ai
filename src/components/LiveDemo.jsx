import { ArrowRight, Sparkle } from '@phosphor-icons/react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_DEAL, LIABILITY_TERMS, PAYMENT_TERMS, SLA_OPTIONS, fmtUSD, reviewDeal } from '../lib/reviewEngine.js';
import ApproverIcon from './ApproverIcon.jsx';
import RiskBadge from './RiskBadge.jsx';

const START = { ...DEFAULT_DEAL, discount: 12, paymentTerms: 'Net-30', liability: 'Capped at 1x annual fees', sla: '99.9', margin: 42, implementationCost: 20000 };

/**
 * A hands-on preview of the real review engine. Move a few terms and watch the
 * risk level, flags and approvers change. Nothing here is saved.
 */
export default function LiveDemo() {
  const reduce = useReducedMotion();
  const [deal, setDeal] = useState(START);
  const review = useMemo(() => reviewDeal(deal), [deal]);
  const set = (k) => (e) => setDeal((d) => ({ ...d, [k]: e.target.type === 'range' ? Number(e.target.value) : e.target.value }));
  const spring = reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 24 };

  return (
    <div className="demo">
      <div className="demo-controls">
        <div className="demo-field">
          <div className="demo-label">
            <label htmlFor="demo-discount">Discount</label>
            <output htmlFor="demo-discount" className="num">{deal.discount}%</output>
          </div>
          <input id="demo-discount" type="range" min="0" max="40" step="1" value={deal.discount} onChange={set('discount')} style={{ '--fill': `${(deal.discount / 40) * 100}%` }} />
          <div className="demo-ticks" aria-hidden="true"><span>0%</span><span>Standard up to 10%</span><span>40%</span></div>
        </div>
        <div className="demo-field">
          <div className="demo-label">
            <label htmlFor="demo-margin">Expected margin</label>
            <output htmlFor="demo-margin" className="num">{deal.margin}%</output>
          </div>
          <input id="demo-margin" type="range" min="10" max="60" step="1" value={deal.margin} onChange={set('margin')} style={{ '--fill': `${((deal.margin - 10) / 50) * 100}%` }} />
          <div className="demo-ticks" aria-hidden="true"><span>10%</span><span>Target 40% or higher</span><span>60%</span></div>
        </div>
        <div className="demo-row">
          <div className="demo-field">
            <label htmlFor="demo-pay">Payment terms</label>
            <select id="demo-pay" value={deal.paymentTerms} onChange={set('paymentTerms')}>
              {PAYMENT_TERMS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="demo-field">
            <label htmlFor="demo-sla">Uptime SLA</label>
            <select id="demo-sla" value={deal.sla} onChange={set('sla')}>
              {SLA_OPTIONS.map((t) => <option key={t} value={t}>{t}%</option>)}
            </select>
          </div>
        </div>
        <div className="demo-field">
          <label htmlFor="demo-liab">Liability</label>
          <select id="demo-liab" value={deal.liability} onChange={set('liability')}>
            {LIABILITY_TERMS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="demo-result" aria-live="polite">
        <div className="demo-result-head">
          <div>
            <div className="muted small">{fmtUSD(deal.dealValue)} list, {fmtUSD(review.netValue)} net</div>
            <div className="demo-result-title">
              <Sparkle size={16} weight="fill" aria-hidden="true" /> Live review
            </div>
          </div>
          <motion.div key={review.riskLevel} initial={reduce ? false : { scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
            <RiskBadge level={review.riskLevel} />
          </motion.div>
        </div>

        <LayoutGroup>
          <div className="demo-section">
            <div className="demo-section-label">Flagged terms</div>
            <ul className="demo-flags">
              <AnimatePresence initial={false}>
                {review.flags.length === 0 && (
                  <motion.li key="none" className="demo-none" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    Everything is within standard policy.
                  </motion.li>
                )}
                {review.flags.map((f) => (
                  <motion.li
                    key={f.id}
                    layout
                    className={`demo-flag sev-${f.severity.toLowerCase()}`}
                    initial={reduce ? false : { opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: 12 }}
                    transition={spring}
                  >
                    <span className="demo-flag-term">{f.term}</span>
                    <span className="demo-flag-value">{f.value.replace(/ \(.*\)$/, '')}</span>
                    <RiskBadge level={f.severity} small />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>

          <div className="demo-section">
            <div className="demo-section-label">Needs approval from</div>
            <ul className="demo-approvers">
              <AnimatePresence initial={false}>
                {review.approvers.length === 0 && (
                  <motion.li key="none" className="demo-none" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    Only the deal desk reviewer.
                  </motion.li>
                )}
                {review.approvers.map((a) => (
                  <motion.li
                    key={a.id}
                    layout
                    className="demo-approver"
                    initial={reduce ? false : { opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                    transition={spring}
                  >
                    <ApproverIcon name={a.icon} size={16} /> {a.title}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </LayoutGroup>

        <p className="demo-foot">
          Even with no flags, a person still approves. <Link to="/how-it-works">See the full flow <ArrowRight size={14} aria-hidden="true" /></Link>
        </p>
      </div>
    </div>
  );
}
