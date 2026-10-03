import { ArrowLeft, ArrowRight, Check, CheckCircle, EnvelopeSimple, Printer, X, ArrowCounterClockwise } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from '../components/MarketingLayout.jsx';
import RiskBadge from '../components/RiskBadge.jsx';
import { BlockerList, FlagItem, RouteCard } from '../components/deal/ResultCards.jsx';
import { EXTRACT_FIELDS, extractDealTerms } from '../lib/extractDealTerms.js';
import { DEFAULT_DEAL, fmtUSD, reviewDeal } from '../lib/reviewEngine.js';

// Same wording as public/samples/sample-deal.pdf, run through the real parser.
const SAMPLE_TEXT = `Customer: Northwind Logistics, Inc.
Contract value (list): $400,000
Discount: 25% off list price
Payment terms: Net-90 from invoice date
Custom implementation fee: $62,000
Expected margin: 38%
Limitation of liability: Provider's liability under this agreement shall be unlimited.
Uptime SLA: 99.99% monthly availability, with service credits for any shortfall.`;

const extracted = extractDealTerms(SAMPLE_TEXT).fields;
const example = reviewDeal(DEFAULT_DEAL);
const fmtExtracted = (key, v) =>
  key === 'dealValue' || key === 'implementationCost' ? fmtUSD(v)
    : key === 'discount' || key === 'margin' || key === 'sla' ? `${v}%`
      : key === 'securityReview' ? (v ? 'Yes' : 'No') : v;

const STEPS = [
  {
    key: 'add',
    label: 'Add the deal',
    title: 'Drop in a contract, or type the terms',
    body: 'Upload a PDF and DealDesk AI reads the key terms for you: value, discount, payment terms, liability, SLA, and margin. You check every value before it is used.',
    helps: 'Saves you from retyping contracts, and nothing goes in without your OK.',
    Preview: () => (
      <ul className="hiw-extract">
        {EXTRACT_FIELDS.filter((f) => f.key !== 'securityReview').map(({ key, label }) => (
          <li key={key}>
            <span className="muted">{label}</span>
            <strong>{fmtExtracted(key, extracted[key].value)}</strong>
            <CheckCircle size={16} weight="fill" className="hiw-found" aria-label="Found in PDF" />
          </li>
        ))}
      </ul>
    ),
  },
  {
    key: 'flags',
    label: 'Spot the risks',
    title: 'See what is unusual, and why it matters',
    body: 'Each term is compared with your standard policy. Unusual terms get a Low, Medium, or High badge and a short explanation in plain English.',
    helps: 'Catches risky terms in seconds instead of a line-by-line read.',
    Preview: () => (
      <div className="hiw-stack">
        <div className="hiw-row">
          <span className="muted small">Overall</span>
          <RiskBadge level={example.riskLevel} />
        </div>
        <ul className="flags">
          <FlagItem flag={example.flags.find((f) => f.id === 'discount')} />
        </ul>
      </div>
    ),
  },
  {
    key: 'route',
    label: 'Route to approvers',
    title: 'The right people get asked, automatically',
    body: 'Deep discounts go to the Sales Manager, slow payment to Finance, uncapped liability to Legal, and demanding SLAs to Risk and Security.',
    helps: 'No more guessing who needs to sign off, and no one gets skipped.',
    Preview: () => (
      <div className="hiw-routes">
        {example.approvers
          .filter((a) => a.id === 'LEGAL' || a.id === 'RISK')
          .map((a) => (
            <RouteCard key={a.id} approver={a} signed={a.id === 'LEGAL'} />
          ))}
      </div>
    ),
  },
  {
    key: 'decide',
    label: 'A person decides',
    title: 'You make the final call',
    body: 'Approve stays locked until a named reviewer reads the flags and every approver signs off. Rejecting or asking for changes needs a short reason.',
    helps: 'The AI advises. Accountability stays with your team.',
    Preview: () => (
      <div className="hiw-stack">
        <div className="decision-buttons" aria-hidden="true">
          <span className="btn btn-success is-disabled"><Check size={16} weight="bold" /> Approve</span>
          <span className="btn btn-warning"><ArrowCounterClockwise size={16} weight="bold" /> Request changes</span>
          <span className="btn btn-danger"><X size={16} weight="bold" /> Reject</span>
        </div>
        <BlockerList items={['Acknowledge the flagged terms', 'Waiting on sign-off from Finance, Risk / Security']} />
      </div>
    ),
  },
  {
    key: 'share',
    label: 'Share the outcome',
    title: 'Email it, print it, find it later',
    body: 'Send a summary by email, print a clean report, or save it as a PDF. Every review, sign-off, and comment is kept in your deal history.',
    helps: 'Everyone stays informed, and you have an audit trail when someone asks.',
    Preview: () => (
      <div className="hiw-stack">
        <div className="hiw-email">
          <div className="muted small">Subject</div>
          <strong>Deal review: {DEFAULT_DEAL.customer} ({example.riskLevel} risk)</strong>
        </div>
        <div className="row-gap" aria-hidden="true">
          <span className="btn btn-outline btn-sm"><EnvelopeSimple size={16} /> Email summary</span>
          <span className="btn btn-outline btn-sm"><Printer size={16} /> Print or save as PDF</span>
        </div>
      </div>
    ),
  },
];

export default function HowItWorksPage() {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const tabs = useRef([]);
  const step = STEPS[active];
  const last = active === STEPS.length - 1;

  const go = (i) => {
    const next = (i + STEPS.length) % STEPS.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(active + 1); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(active - 1); }
    if (e.key === 'Home') { e.preventDefault(); go(0); }
    if (e.key === 'End') { e.preventDefault(); go(STEPS.length - 1); }
  };

  return (
    <MarketingLayout>
      <section className="hiw-hero">
        <h1 className="display">How DealDesk AI works</h1>
        <p className="hero-sub">Five steps from contract to a decision your whole team can stand behind.</p>
      </section>

      <section className="hiw" aria-label="Walkthrough">
        <div className="hiw-tabs" role="tablist" aria-orientation="vertical" aria-label="Steps" onKeyDown={onKeyDown}>
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              ref={(el) => (tabs.current[i] = el)}
              type="button"
              role="tab"
              id={`tab-${s.key}`}
              aria-selected={i === active}
              aria-controls={`panel-${s.key}`}
              tabIndex={i === active ? 0 : -1}
              className={`hiw-tab ${i === active ? 'on' : ''} ${i < active ? 'done' : ''}`}
              onClick={() => setActive(i)}
            >
              <span className="hiw-num" aria-hidden="true">{i < active ? <Check size={14} weight="bold" /> : i + 1}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        <div className="hiw-panel-wrap">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step.key}
              role="tabpanel"
              id={`panel-${step.key}`}
              aria-labelledby={`tab-${step.key}`}
              className="hiw-panel"
              initial={reduce ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="hiw-text">
                <h2 className="display">{step.title}</h2>
                <p>{step.body}</p>
                <p className="hiw-helps">
                  <strong>How this helps you:</strong> {step.helps}
                </p>
              </div>
              <div className="hiw-preview" aria-hidden="true">
                <step.Preview />
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="hiw-nav">
            <button type="button" className="btn btn-ghost" onClick={() => setActive(active - 1)} disabled={active === 0}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            <div className="hiw-dots" aria-hidden="true">
              {STEPS.map((s, i) => (
                <span key={s.key} className={i === active ? 'on' : ''} />
              ))}
            </div>
            {last ? (
              <Link className="btn btn-primary" to="/auth?mode=signup">
                Get started <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Link>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setActive(active + 1)}>
                Next <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="cta-band" aria-labelledby="hiw-cta-h">
        <h2 className="display" id="hiw-cta-h">Ready to review your first deal?</h2>
        <p>Create a free account for your team. You can join a teammate's organization with an invite code.</p>
        <Link className="btn btn-light btn-lg" to="/auth?mode=signup">
          Get started <ArrowRight size={18} weight="bold" aria-hidden="true" />
        </Link>
      </section>
    </MarketingLayout>
  );
}
