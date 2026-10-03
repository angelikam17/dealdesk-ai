import { ArrowLeft, FilePdf, Sparkle, Warning } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import DealForm from '../components/deal/DealForm.jsx';
import DecisionCard from '../components/deal/DecisionCard.jsx';
import PdfImport from '../components/deal/PdfImport.jsx';
import { AuditCard, FlagsCard, RoutingCard, SummaryCard } from '../components/deal/ResultCards.jsx';
import ReviewStepper from '../components/deal/ReviewStepper.jsx';
import SharePanel from '../components/deal/SharePanel.jsx';
import RiskBadge from '../components/RiskBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  DECISION_TO_STATUS,
  STATUS_LABELS,
  addEvent,
  attachPdf,
  deriveDealState,
  fromRow,
  getDeal,
  getPdfUrl,
  saveReview,
  setStatus,
} from '../lib/dealsApi.js';
import { applyExtracted } from '../lib/extractDealTerms.js';
import { BLANK_DEAL, DEFAULT_DEAL, reviewDeal, validateDeal } from '../lib/reviewEngine.js';
import { fmtDate, fmtDateTime } from '../lib/format.js';

const ANALYSIS_DELAY_MS = 800; // simulated model latency, so the review feels considered

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Field-by-field comparison so whitespace or number/string differences don't count as edits.
function sameTerms(a, b) {
  return Object.keys(BLANK_DEAL).every((k) => {
    const x = a[k];
    const y = b[k];
    if (typeof x === 'string' || typeof y === 'string') return String(x ?? '').trim() === String(y ?? '').trim();
    return x === y;
  });
}

function validate(form) {
  const errors = validateDeal(form);
  if (!String(form.customer ?? '').trim()) errors.customer = 'Enter the customer name.';
  return errors;
}

export default function DealReviewPage() {
  const { id: routeId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isNew = routeId === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');
  const [row, setRow] = useState(null); // deals row from Supabase
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(BLANK_DEAL);
  const [showImport, setShowImport] = useState(isNew && search.get('source') === 'pdf');
  const [pendingPdf, setPendingPdf] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [pdfUrl, setPdfUrl] = useState(null);
  const [touched, setTouched] = useState(false);
  const skipLoadFor = useRef(null); // id we just created; its data is already in state

  // Load an existing deal (or reset for a new one) whenever the route changes.
  useEffect(() => {
    if (isNew) {
      setRow(null);
      setEvents([]);
      setForm(BLANK_DEAL);
      setLoading(false);
      setShowImport(search.get('source') === 'pdf');
      setTouched(false);
      return;
    }
    if (skipLoadFor.current === routeId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    getDeal(routeId)
      .then(({ deal, events: evs }) => {
        if (cancelled) return;
        if (!deal) {
          setLoadError('This deal does not exist, or it belongs to another organization.');
          return;
        }
        setRow(deal);
        setEvents(evs);
        setForm(fromRow(deal));
      })
      .catch((e) => !cancelled && setLoadError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [routeId, isNew, search]);

  // Signed link to the stored contract PDF.
  useEffect(() => {
    setPdfUrl(null);
    if (row?.pdf_path) getPdfUrl(row.pdf_path).then(setPdfUrl).catch(() => setPdfUrl(null));
  }, [row?.pdf_path]);

  const reviewedDeal = useMemo(() => (row ? fromRow(row) : null), [row]);
  const review = useMemo(() => (reviewedDeal ? reviewDeal(reviewedDeal) : null), [reviewedDeal]);
  const { signoffs, decision, lastReview } = useMemo(() => deriveDealState(events), [events]);

  const errors = validate(form);
  const hasErrors = Object.keys(errors).length > 0;
  const stale = Boolean(reviewedDeal) && !sameTerms(reviewedDeal, form);

  // Warn before leaving with edits that haven't been reviewed (and so aren't saved).
  const unsaved = !analyzing && (stale || Boolean(pendingPdf) || (!row && !sameTerms(form, BLANK_DEAL)));
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const runReview = async () => {
    setTouched(true);
    if (hasErrors) return;
    setAnalyzing(true);
    setActionError('');
    try {
      const nextReview = reviewDeal(form);
      const [{ row: saved, event }] = await Promise.all([
        saveReview({
          dealId: row?.id,
          orgId: profile.organization.id,
          userId: user.id,
          deal: form,
          review: nextReview,
          source: pendingPdf ? 'pdf' : 'manual',
        }),
        wait(ANALYSIS_DELAY_MS),
      ]);
      let finalRow = saved;
      const newEvents = [event];
      if (pendingPdf) {
        try {
          finalRow = await attachPdf({ orgId: profile.organization.id, dealId: saved.id, file: pendingPdf });
          newEvents.push(
            await addEvent({
              dealId: saved.id,
              userId: user.id,
              actorLabel: profile.full_name,
              kind: 'system',
              eventType: 'pdf_attached',
              text: `Attached source contract ${pendingPdf.name}.`,
            })
          );
          setPendingPdf(null);
        } catch (e) {
          setActionError(`The deal was saved, but the PDF upload failed: ${e.message}`);
        }
      }
      toast.success(`Review saved: ${nextReview.riskLevel} risk, ${nextReview.flags.length} flag${nextReview.flags.length === 1 ? '' : 's'}`);
      setRow(finalRow);
      setEvents((evs) => (row ? [...evs, ...newEvents] : newEvents));
      if (!row) {
        skipLoadFor.current = saved.id;
        navigate(`/deals/${saved.id}`, { replace: true });
      }
    } catch (e) {
      setActionError(`Could not save the review: ${e.message}`);
      toast.error('Could not save the review');
    } finally {
      setAnalyzing(false);
    }
  };

  const record = useCallback(
    async (fn) => {
      setBusy(true);
      setActionError('');
      try {
        await fn();
      } catch (e) {
        setActionError(e.message);
        toast.error('That change was not saved. Try again.');
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const toggleSignoff = (approver) =>
    record(async () => {
      const signed = !signoffs[approver.id];
      const ev = await addEvent({
        dealId: row.id,
        userId: user.id,
        actorLabel: `${profile.full_name} for ${approver.title}`,
        kind: 'human',
        eventType: signed ? 'signoff' : 'signoff_withdrawn',
        text: signed ? `${approver.title} sign-off recorded.` : `${approver.title} sign-off withdrawn.`,
        meta: { approverId: approver.id },
      });
      setEvents((evs) => [...evs, ev]);
      toast(signed ? `${approver.title} signed off` : `${approver.title} sign-off withdrawn`);
    });

  const makeDecision = (type, reviewer, comment) =>
    record(async () => {
      const ev = await addEvent({
        dealId: row.id,
        userId: user.id,
        actorLabel: reviewer,
        kind: 'human',
        eventType: 'decision',
        text: `${type}${comment ? `: “${comment}”` : ''}`,
        meta: { type, reviewer, comment },
      });
      const updated = await setStatus(row.id, DECISION_TO_STATUS[type]);
      setEvents((evs) => [...evs, ev]);
      setRow(updated);
      toast.success(`Deal ${type.toLowerCase()} by ${reviewer}`);
    });

  const reopen = () =>
    record(async () => {
      const ev = await addEvent({
        dealId: row.id,
        userId: user.id,
        actorLabel: profile.full_name,
        kind: 'system',
        eventType: 'reopened',
        text: 'Decision reopened for review.',
      });
      const updated = await setStatus(row.id, 'pending');
      setEvents((evs) => [...evs, ev]);
      setRow(updated);
    });

  const applyPdf = (values, file) => {
    setForm((f) => applyExtracted(f, values));
    setPendingPdf(file);
    setShowImport(false);
  };

  if (loading) {
    return (
      <div className="page" aria-busy="true">
        <div className="skeleton-page" role="status">
          <span className="sr-only">Loading deal…</span>
          <div className="skeleton tall" />
          <div className="skeleton tall" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page">
        <div className="card empty-state">
          <Warning size={28} weight="duotone" aria-hidden="true" />
          <h1>We couldn't open this deal</h1>
          <p className="muted">{loadError}</p>
          <Link className="btn btn-primary" to="/deals">Back to deals</Link>
        </div>
      </div>
    );
  }

  const status = row?.status ?? 'pending';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link to="/deals" className="back-link no-print">
            <ArrowLeft size={14} aria-hidden="true" /> All deals
          </Link>
          <h1>{row?.customer || form.customer || 'New deal'}</h1>
          <p className="muted small page-meta">
            {row ? (
              <>
                <span className={`status-pill status-${status}`}>{STATUS_LABELS[status]}</span>
                {row.source === 'pdf' && (
                  <span className="meta-item"><FilePdf size={14} aria-hidden="true" /> From PDF</span>
                )}
                <span className="meta-item">Created {fmtDate(row.created_at)}</span>
              </>
            ) : (
              'Enter the terms or upload a contract, then run the AI review.'
            )}
          </p>
        </div>
        <p className="hitl-banner">
          <strong>People decide, not the AI.</strong> <span>Flags are advice. Deals are never approved automatically.</span>
        </p>
      </div>

      <div className="layout">
        <aside className="panel form-panel no-print" aria-label="Deal terms">
          {showImport ? (
            <PdfImport onApply={applyPdf} onCancel={() => setShowImport(false)} />
          ) : (
            <>
              <div className="panel-head">
                <h2>Deal terms</h2>
                <button type="button" className="link-btn" onClick={() => setShowImport(true)}>
                  <FilePdf size={16} aria-hidden="true" /> Import PDF
                </button>
              </div>
              {pendingPdf && (
                <p className="pdf-pending">
                  <FilePdf size={16} aria-hidden="true" /> Values from <strong>{pendingPdf.name}</strong>. The file is attached when you run the review.
                </p>
              )}
              <DealForm
                form={form}
                errors={touched ? errors : {}}
                update={update}
                flags={review && !stale ? review.flags : []}
                disabled={analyzing}
              />
              <div className="form-actions">
                <button type="button" className="btn btn-primary btn-block" onClick={runReview} disabled={analyzing}>
                  {analyzing ? (
                    <>
                      <span className="spinner" aria-hidden="true" /> Reviewing deal…
                    </>
                  ) : (
                    <>
                      <Sparkle size={16} weight="fill" aria-hidden="true" /> {row ? 'Re-run AI review' : 'Run AI review'}
                    </>
                  )}
                </button>
                {isNew && (
                  <button type="button" className="btn btn-ghost btn-block" onClick={() => setForm(DEFAULT_DEAL)} disabled={analyzing}>
                    Fill with example deal
                  </button>
                )}
                {touched && hasErrors && (
                  <p className="field-error" role="alert">Fix the highlighted fields to run the review.</p>
                )}
              </div>
            </>
          )}
        </aside>

        <section className="results" aria-label="Review results" aria-busy={analyzing}>
          {actionError && (
            <p className="error-banner" role="alert">
              <Warning size={16} aria-hidden="true" /> {actionError}
            </p>
          )}
          {stale && !analyzing && (
            <div className="stale-banner no-print" role="status">
              <span><Warning size={16} aria-hidden="true" /> The terms changed since the last review, so these results may be out of date.</span>
              <button type="button" className="btn btn-sm btn-primary" onClick={runReview}>Re-run review</button>
            </div>
          )}

          {analyzing ? (
            <AnalyzingState />
          ) : !review ? (
            <EmptyResults />
          ) : (
            <>
              <div className="print-only print-header">
                <h1>DealDesk AI review: {reviewedDeal.customer}</h1>
                <p>
                  Status: {STATUS_LABELS[status]} · Printed {fmtDateTime(new Date())}
                </p>
              </div>
              <ReviewStepper review={review} signoffs={signoffs} decision={decision} stale={stale} />
              <SharePanel deal={reviewedDeal} review={review} status={status} decision={decision} pdfUrl={pdfUrl} />
              <SummaryCard deal={reviewedDeal} review={review} reviewedAt={lastReview} />
              <FlagsCard review={review} />
              <RoutingCard review={review} signoffs={signoffs} onToggle={toggleSignoff} disabled={busy || !!decision || stale} />
              <DecisionCard
                review={review}
                signoffs={signoffs}
                decision={decision}
                onDecide={makeDecision}
                onReopen={reopen}
                stale={stale}
                busy={busy}
                defaultReviewer={profile.full_name}
              />
              <AuditCard events={events} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function AnalyzingState() {
  return (
    <div className="card analyzing" role="status">
      <Sparkle className="ai-pulse" size={30} weight="duotone" aria-hidden="true" />
      <h2>Reviewing this deal…</h2>
      <p className="muted">Comparing each term with your commercial policy and working out who needs to approve it.</p>
      <div className="skeleton" />
      <div className="skeleton short" />
      <div className="skeleton" />
    </div>
  );
}

function EmptyResults() {
  return (
    <div className="card empty-state">
      <div className="empty-art" aria-hidden="true">
        <RiskBadge level="Low" small />
        <RiskBadge level="Medium" small />
        <RiskBadge level="High" small />
      </div>
      <h2>Your review shows up here</h2>
      <p className="muted">
        Fill in the terms on the left, or import a contract PDF, then select <strong>Run AI review</strong>. Nothing is saved until you run it.
      </p>
    </div>
  );
}
