import { ArrowCounterClockwise, Check, X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog.jsx';
import { BlockerList } from './ResultCards.jsx';
import { fmtDateTime } from '../../lib/format.js';

const ACTION_LABEL = { Rejected: 'Reject', 'Changes Requested': 'Request changes' };

/**
 * The human decision. Approve stays locked until a named reviewer has
 * acknowledged every flag and every routed approver has signed off.
 * Reject and Request changes always need a written reason.
 */
export default function DecisionCard({ review, signoffs, decision, onDecide, onReopen, stale, busy, defaultReviewer }) {
  const [reviewer, setReviewer] = useState(defaultReviewer ?? '');
  const [comment, setComment] = useState('');
  const [ack, setAck] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(null); // 'Rejected' | 'Changes Requested'

  // A new review means new terms: the acknowledgement must be given again.
  useEffect(() => {
    setAck(false);
    setNotice('');
  }, [review]);

  const pending = review.approvers.filter((a) => !signoffs[a.id]);
  const blockers = [];
  if (stale) blockers.push('Re-run the review, the inputs have changed');
  if (!reviewer.trim()) blockers.push('Enter your name as the reviewer');
  if (review.flags.length && !ack) blockers.push('Acknowledge the flagged terms');
  if (pending.length) blockers.push(`Waiting on sign-off from ${pending.map((a) => a.title).join(', ')}`);

  const decide = (type) => {
    if (type !== 'Approved' && !comment.trim()) {
      setNotice(`Add a comment explaining why you chose “${ACTION_LABEL[type]}”.`);
      return;
    }
    if (!reviewer.trim()) {
      setNotice('Enter your name as the reviewer.');
      return;
    }
    setNotice('');
    if (type === 'Approved') onDecide(type, reviewer.trim(), comment.trim());
    else setConfirming(type);
  };

  const confirm = async () => {
    await onDecide(confirming, reviewer.trim(), comment.trim());
    setConfirming(null);
  };

  if (decision) {
    const cls = { Approved: 'approved', Rejected: 'rejected', 'Changes Requested': 'changes' }[decision.type];
    const Icon = decision.type === 'Approved' ? Check : decision.type === 'Rejected' ? X : ArrowCounterClockwise;
    return (
      <section className={`card decision-done ${cls}`} aria-live="polite">
        <div className="decision-result">
          <span className="decision-icon"><Icon size={22} weight="bold" aria-hidden="true" /></span>
          <div>
            <h2>Deal {decision.type.toLowerCase()}</h2>
            <p>
              By <strong>{decision.reviewer}</strong> on {fmtDateTime(decision.at)}
            </p>
            {decision.comment && <p className="decision-comment">“{decision.comment}”</p>}
          </div>
        </div>
        <button type="button" className="btn btn-outline no-print" onClick={onReopen} disabled={busy}>
          Reopen decision
        </button>
      </section>
    );
  }

  return (
    <section className="card decision" aria-labelledby="decision-h">
      <div className="card-head">
        <h2 id="decision-h">Human decision</h2>
        <span className="pending-pill">Waiting for a person</span>
      </div>
      <p className="muted small decision-intro">
        DealDesk AI only recommends. A named reviewer makes the final call, and approval unlocks only after every routed approver signs off.
      </p>

      <div className="decision-grid">
        <div className="field">
          <div className="field-label"><label htmlFor="reviewer">Reviewer name</label></div>
          <input
            id="reviewer"
            name="reviewer"
            autoComplete="name"
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            placeholder="e.g. Priya Raman…"
          />
        </div>
        <div className="field">
          <div className="field-label">
            <label htmlFor="comment">Comment</label>
            <span className="muted small" id="comment-hint">Required to reject or request changes</span>
          </div>
          <textarea
            id="comment"
            name="comment"
            rows="2"
            aria-describedby="comment-hint"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Reasoning, conditions, or the changes you need…"
          />
        </div>
      </div>

      {review.flags.length > 0 && (
        <label className="checkbox-row">
          <input type="checkbox" name="acknowledge" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>
            I have read all {review.flags.length} flagged term{review.flags.length > 1 ? 's' : ''} and the AI explanations.
          </span>
        </label>
      )}

      {notice && <p className="notice" role="alert">{notice}</p>}

      <div className="decision-buttons no-print">
        <button type="button" className="btn btn-success" onClick={() => decide('Approved')} disabled={busy || blockers.length > 0}>
          <Check size={16} weight="bold" aria-hidden="true" /> Approve
        </button>
        <button type="button" className="btn btn-warning" onClick={() => decide('Changes Requested')} disabled={busy || stale}>
          <ArrowCounterClockwise size={16} weight="bold" aria-hidden="true" /> Request changes
        </button>
        <button type="button" className="btn btn-danger" onClick={() => decide('Rejected')} disabled={busy || stale}>
          <X size={16} weight="bold" aria-hidden="true" /> Reject
        </button>
      </div>

      {blockers.length > 0 && <BlockerList items={blockers} />}

      <ConfirmDialog
        open={Boolean(confirming)}
        title={confirming === 'Rejected' ? 'Reject this deal?' : 'Send this deal back for changes?'}
        confirmLabel={confirming === 'Rejected' ? 'Yes, reject' : 'Yes, request changes'}
        tone={confirming === 'Rejected' ? 'danger' : 'warning'}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setConfirming(null)}
      >
        <p>
          This is recorded in the audit trail under <strong>{reviewer.trim()}</strong> and the sales owner will see your comment:
        </p>
        <blockquote>“{comment.trim()}”</blockquote>
      </ConfirmDialog>
    </section>
  );
}
