import { Check, Lock, Sparkle } from '@phosphor-icons/react';
import { fmtUSD } from '../../lib/reviewEngine.js';
import ApproverIcon from '../ApproverIcon.jsx';
import CountUp from '../CountUp.jsx';
import RiskBadge from '../RiskBadge.jsx';
import { fmtDateTime, fmtDateTimeShort } from '../../lib/format.js';

const ROUTE_NAMES = { SALES: 'Sales Manager', FINANCE: 'Finance', LEGAL: 'Legal', RISK: 'Risk / Security' };

export function AiChip({ children = 'AI explanation' }) {
  return (
    <span className="ai-chip">
      <Sparkle size={12} weight="fill" aria-hidden="true" />
      {children}
    </span>
  );
}

export function SummaryCard({ deal, review, reviewedAt }) {
  const rows = [
    ['Deal value (list)', fmtUSD(deal.dealValue), null],
    ['Discount', `${deal.discount}% (-${fmtUSD(review.discountAmount)})`, 'discount'],
    ['Payment terms', deal.paymentTerms, 'payment'],
    ['Custom implementation', fmtUSD(deal.implementationCost), 'implementation'],
    ['Liability', deal.liability, 'liability'],
    ['Uptime SLA', `${deal.sla}%`, 'sla'],
    ['Expected margin', `${deal.margin}%`, 'margin'],
  ];
  const highCount = review.flags.filter((f) => f.severity === 'High').length;

  return (
    <section className="card" aria-labelledby="summary-h">
      <div className="card-head">
        <h2 id="summary-h">Deal summary</h2>
        {reviewedAt && <span className="muted small">Reviewed {fmtDateTime(reviewedAt)}</span>}
      </div>

      <dl className="kpis">
        <div className="kpi">
          <dt>Net contract value</dt>
          <dd className="num"><CountUp value={review.netValue} format={fmtUSD} /></dd>
        </div>
        <div className="kpi">
          <dt>Overall risk</dt>
          <dd><RiskBadge level={review.riskLevel} /></dd>
        </div>
        <div className="kpi">
          <dt>Flags</dt>
          <dd className="num">
            <CountUp value={review.flags.length} /> <span className="kpi-sub">({highCount} high)</span>
          </dd>
        </div>
        <div className="kpi">
          <dt>Approvers required</dt>
          <dd className="num"><CountUp value={review.approvers.length} /></dd>
        </div>
      </dl>

      <div className="ai-summary">
        <AiChip>AI summary</AiChip>
        <p>{review.summary}</p>
      </div>

      <div className="table-wrap">
        <table className="terms-table">
          <thead>
            <tr>
              <th scope="col">Term</th>
              <th scope="col">This deal</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value, id]) => {
              const flag = id && review.flags.find((f) => f.id === id);
              return (
                <tr key={label} className={flag ? `row-flagged sev-${flag.severity.toLowerCase()}` : ''}>
                  <th scope="row">{label}</th>
                  <td className="num">{value}</td>
                  <td>
                    {flag ? (
                      <RiskBadge level={flag.severity} small />
                    ) : id ? (
                      <span className="ok"><Check size={14} weight="bold" aria-hidden="true" /> Standard</span>
                    ) : (
                      <span className="muted" aria-label="Not applicable">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function FlagItem({ flag }) {
  return (
    <li className={`flag sev-${flag.severity.toLowerCase()}`}>
      <div className="flag-top">
        <div>
          <h3 className="flag-term">{flag.term}</h3>
          <p className="flag-compare">
            <span className="flag-value">{flag.value}</span>
            <span className="muted"> vs. standard {flag.standard}</span>
          </p>
        </div>
        <div className="flag-meta">
          <RiskBadge level={flag.severity} small />
          <span className="route-pill">To {ROUTE_NAMES[flag.approver]}</span>
        </div>
      </div>
      <div className="flag-ai">
        <AiChip />
        <p>{flag.explanation}</p>
      </div>
    </li>
  );
}

export function FlagsCard({ review }) {
  return (
    <section className="card" aria-labelledby="flags-h">
      <div className="card-head">
        <h2 id="flags-h">Risk flags and AI explanations</h2>
        <RiskBadge level={review.riskLevel} />
      </div>
      {review.flags.length === 0 ? (
        <p className="empty-ok">
          <Check size={16} weight="bold" aria-hidden="true" /> No nonstandard terms found. A human reviewer must still approve this deal.
        </p>
      ) : (
        <ul className="flags">
          {review.flags.map((f) => (
            <FlagItem key={f.id} flag={f} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function RouteCard({ approver, signed, onToggle, disabled }) {
  return (
    <div className={`route-card ${signed ? 'done' : ''} sev-${approver.severity.toLowerCase()}`}>
      <div className="route-head">
        <span className="route-icon"><ApproverIcon name={approver.icon} /></span>
        <div>
          <h3 className="route-title">{approver.title}</h3>
          <div className="muted small">{approver.owner}</div>
        </div>
      </div>
      <div className="route-reasons">
        {approver.reasons.map((r) => (
          <span key={r} className="reason">{r}</span>
        ))}
      </div>
      <div className="route-foot">
        <span className="muted small">Target: {approver.sla}</span>
        {onToggle && (
          <button
            type="button"
            className={`btn btn-sm ${signed ? 'btn-success' : 'btn-outline'}`}
            onClick={onToggle}
            disabled={disabled}
            aria-pressed={signed}
          >
            {signed ? <><Check size={14} weight="bold" aria-hidden="true" /> Signed off</> : 'Record sign-off'}
          </button>
        )}
      </div>
    </div>
  );
}

export function RoutingCard({ review, signoffs, onToggle, disabled }) {
  const done = review.approvers.filter((a) => signoffs[a.id]).length;
  return (
    <section className="card" aria-labelledby="routing-h">
      <div className="card-head">
        <h2 id="routing-h">Approval routing</h2>
        <span className="muted small" aria-live="polite">
          {done} of {review.approvers.length} signed off
        </span>
      </div>
      {review.approvers.length === 0 ? (
        <p className="empty-ok">No specialist approvals needed. The deal desk reviewer makes the call.</p>
      ) : (
        <div className="routing-grid">
          {review.approvers.map((a) => (
            <RouteCard key={a.id} approver={a} signed={!!signoffs[a.id]} onToggle={() => onToggle(a)} disabled={disabled} />
          ))}
        </div>
      )}
    </section>
  );
}

export function AuditCard({ events }) {
  return (
    <section className="card audit-card" aria-labelledby="audit-h">
      <div className="card-head">
        <h2 id="audit-h">Audit trail</h2>
        <span className="muted small">
          {events.length} event{events.length === 1 ? '' : 's'}
        </span>
      </div>
      {events.length === 0 ? (
        <p className="muted small">Nothing recorded yet. Run a review to start the trail.</p>
      ) : (
        <ol className="audit">
          {[...events].reverse().map((e) => (
            <li key={e.id} className={`audit-${e.kind}`}>
              <time className="audit-time" dateTime={e.created_at}>
                {fmtDateTimeShort(e.created_at)}
              </time>
              <span className="audit-actor">{e.actor_label}</span>
              <span className="audit-text">{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function BlockerList({ items }) {
  return (
    <ul className="blockers">
      {items.map((b) => (
        <li key={b}>
          <Lock size={14} aria-hidden="true" /> {b}
        </li>
      ))}
    </ul>
  );
}
