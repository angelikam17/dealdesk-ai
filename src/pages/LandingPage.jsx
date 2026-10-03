import { ArrowRight, Bank, Briefcase, Lock, ListChecks, Scales, ShieldCheck } from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import MarketingLayout from '../components/MarketingLayout.jsx';
import LiveDemo from '../components/LiveDemo.jsx';
import Reveal from '../components/Reveal.jsx';
import RiskBadge from '../components/RiskBadge.jsx';
import { FlagItem, RouteCard } from '../components/deal/ResultCards.jsx';
import { DEFAULT_DEAL, fmtUSD, reviewDeal } from '../lib/reviewEngine.js';

// Real engine output for the example deal powers every preview on this page.
const example = reviewDeal(DEFAULT_DEAL);
const flag = (id) => example.flags.find((f) => f.id === id);

const ROUTES = [
  { icon: Briefcase, when: 'Discount above 10%', who: 'Sales Manager' },
  { icon: Bank, when: 'Payment later than Net-30, heavy custom work, or thin margin', who: 'Finance' },
  { icon: Scales, when: 'Liability above the standard 1x cap', who: 'Legal' },
  { icon: ShieldCheck, when: 'SLA above 99.9% or custom security terms', who: 'Risk / Security' },
];

export default function LandingPage() {
  const reduce = useReducedMotion();
  const enter = (delay) =>
    reduce ? {} : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] } };

  return (
    <MarketingLayout>
      <section className="hero">
        <div className="hero-copy">
          <motion.h1 className="display hero-title" {...enter(0)}>
            Review B2B deals in minutes, with humans always in control
          </motion.h1>
          <motion.p className="hero-sub" {...enter(0.1)}>
            Upload a contract or type in the terms. DealDesk AI flags the risky ones and sends them to the right approver.
          </motion.p>
          <motion.div {...enter(0.2)}>
            <Link className="btn btn-primary btn-lg" to="/how-it-works">
              See how it works <ArrowRight size={18} weight="bold" aria-hidden="true" />
            </Link>
          </motion.div>
        </div>

        <motion.div
          className="hero-preview"
          aria-label="Example review of a $400,000 deal"
          role="img"
          initial={reduce ? false : { opacity: 0, y: 30, rotate: 0 }}
          animate={{ opacity: 1, y: 0, rotate: reduce ? 0 : -1.5 }}
          transition={{ type: 'spring', stiffness: 90, damping: 18, delay: 0.15 }}
        >
          <div className="preview-card" aria-hidden="true">
            <div className="preview-head">
              <div>
                <div className="preview-customer">{DEFAULT_DEAL.customer}</div>
                <div className="muted small">{fmtUSD(DEFAULT_DEAL.dealValue)} list · {example.flags.length} terms flagged</div>
              </div>
              <RiskBadge level={example.riskLevel} />
            </div>
            <ul className="flags">
              <FlagItem flag={flag('liability')} />
            </ul>
          </div>
          <div className="preview-route" aria-hidden="true">
            <RouteCard approver={example.approvers.find((a) => a.id === 'LEGAL')} signed={false} />
          </div>
        </motion.div>
      </section>

      <section className="bento-section" aria-labelledby="bento-h">
        <Reveal as="h2" className="display section-title" id="bento-h">
          What DealDesk AI does for you
        </Reveal>
        <div className="bento">
          <Reveal className="bento-cell cell-catch">
            <h3>Catches the terms that cause trouble later</h3>
            <p>Every term is compared with your standard policy. Anything unusual gets a plain-English explanation.</p>
            <ul className="term-chips" aria-label="Terms flagged on the example deal">
              {example.flags.map((f) => (
                <li key={f.id} className={`term-chip sev-${f.severity.toLowerCase()}`}>
                  <span>{f.term}</span>
                  <strong>{f.value.replace(/ \(.*\)$/, '')}</strong>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="bento-cell cell-route" delay={0.05}>
            <h3>Sends each issue to the right person</h3>
            <p>Sales, Finance, Legal, and Security only see what needs them.</p>
            <div className="icon-row" aria-hidden="true">
              <Briefcase size={26} weight="duotone" />
              <Bank size={26} weight="duotone" />
              <Scales size={26} weight="duotone" />
              <ShieldCheck size={26} weight="duotone" />
            </div>
          </Reveal>
          <Reveal className="bento-cell cell-human" delay={0.1}>
            <Lock size={28} weight="duotone" aria-hidden="true" />
            <h3>A person always makes the call</h3>
            <p>Approve stays locked until a named reviewer signs off on every flag. Nothing is approved automatically.</p>
          </Reveal>
          <Reveal className="bento-cell cell-audit" delay={0.15}>
            <ListChecks size={28} weight="duotone" aria-hidden="true" />
            <h3>A record of every decision</h3>
            <p>Reviews, sign-offs, and comments are saved for your whole team, so you always know who agreed to what.</p>
          </Reveal>
        </div>
      </section>

      <section className="demo-section-wrap" aria-labelledby="demo-h">
        <Reveal className="demo-intro">
          <h2 className="display section-title" id="demo-h">Try it on a $400,000 deal</h2>
          <p>Move a few terms. The same rules that run in the app rate the risk and pick the approvers as you go.</p>
        </Reveal>
        <Reveal delay={0.05}>
          <LiveDemo />
        </Reveal>
      </section>

      <section className="routes-section" aria-labelledby="routes-h">
        <Reveal as="h2" className="display section-title" id="routes-h">
          Who gets asked, and why
        </Reveal>
        <ol className="route-rules">
          {ROUTES.map(({ icon: Icon, when, who }, i) => (
            <Reveal as="li" key={who} delay={i * 0.06} className="route-rule">
              <Icon size={24} weight="duotone" aria-hidden="true" />
              <span className="rule-when">{when}</span>
              <ArrowRight size={18} className="rule-arrow" aria-hidden="true" />
              <strong className="rule-who">{who}</strong>
            </Reveal>
          ))}
        </ol>
      </section>

      <Reveal as="section" className="cta-band" aria-labelledby="cta-h">
        <h2 className="display" id="cta-h">Two minutes to see the whole flow</h2>
        <p>Walk through a real review of a $400,000 deal, from contract to decision.</p>
        <Link className="btn btn-light btn-lg" to="/how-it-works">
          See how it works <ArrowRight size={18} weight="bold" aria-hidden="true" />
        </Link>
      </Reveal>
    </MarketingLayout>
  );
}
