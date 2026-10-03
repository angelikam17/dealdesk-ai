import { Check, Copy, FilePdf, MagnifyingGlass, Plus, UploadSimple, Warning } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CountUp from '../components/CountUp.jsx';
import RiskBadge from '../components/RiskBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { STATUS_LABELS, listDeals } from '../lib/dealsApi.js';
import { fmtUSD } from '../lib/reviewEngine.js';
import { fmtDate } from '../lib/format.js';

export default function DealsPage() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [deals, setDeals] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Filters live in the URL so they survive reloads and can be shared.
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? 'all';
  const risk = params.get('risk') ?? 'all';
  // React Router's functional setter doesn't queue like setState, so track the
  // latest params ourselves; otherwise two quick filter changes overwrite each other.
  const latestParams = useRef(params);
  latestParams.current = params;
  const setParam = (key, value) => {
    const next = new URLSearchParams(latestParams.current);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    latestParams.current = next;
    setParams(next, { replace: true });
  };

  useEffect(() => {
    listDeals()
      .then(setDeals)
      .catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!deals) return [];
    const needle = q.trim().toLowerCase();
    return deals.filter(
      (d) =>
        (!needle || d.customer.toLowerCase().includes(needle) || d.creator?.full_name?.toLowerCase().includes(needle)) &&
        (status === 'all' || d.status === status) &&
        (risk === 'all' || d.risk_level === risk)
    );
  }, [deals, q, status, risk]);

  const counts = useMemo(() => {
    const c = { total: deals?.length ?? 0, pending: 0, high: 0, medium: 0, low: 0, value: 0 };
    deals?.forEach((d) => {
      if (d.status === 'pending') c.pending++;
      if (d.risk_level === 'High') c.high++;
      if (d.risk_level === 'Medium') c.medium++;
      if (d.risk_level === 'Low') c.low++;
      c.value += Number(d.deal_value) || 0;
    });
    return c;
  }, [deals]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(profile.organization.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable; the code is visible anyway */
    }
  };

  const filtersActive = q || status !== 'all' || risk !== 'all';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Deals</h1>
          <p className="muted page-meta">
            {profile.organization.name}
            {deals && (
              <>
                {' '}· {counts.total} deal{counts.total === 1 ? '' : 's'}, {counts.pending} waiting for a decision
              </>
            )}
          </p>
        </div>
        <div className="row-gap">
          <Link className="btn btn-outline" to="/deals/new?source=pdf">
            <UploadSimple size={16} aria-hidden="true" /> Upload PDF
          </Link>
          <Link className="btn btn-primary" to="/deals/new">
            <Plus size={16} weight="bold" aria-hidden="true" /> New deal
          </Link>
        </div>
      </div>

      {deals && deals.length > 0 && (
        <section className="stats" aria-label="Pipeline summary">
          <div className="stat">
            <div className="stat-label">Deals</div>
            <div className="stat-value"><CountUp value={counts.total} /></div>
          </div>
          <div className="stat">
            <div className="stat-label">Total list value</div>
            <div className="stat-value"><CountUp value={counts.value} format={fmtUSD} /></div>
          </div>
          <div className="stat">
            <div className="stat-label">Waiting for a decision</div>
            <div className="stat-value"><CountUp value={counts.pending} /></div>
          </div>
          <div className="stat stat-wide">
            <div className="stat-label">Risk mix</div>
            <div className="riskbar" role="img" aria-label={`${counts.high} high, ${counts.medium} medium, ${counts.low} low risk`}>
              {[['high', counts.high], ['medium', counts.medium], ['low', counts.low]].map(([k, n]) =>
                n > 0 ? <span key={k} className={`riskbar-seg seg-${k}`} style={{ flexGrow: n }} /> : null
              )}
            </div>
            <ul className="riskbar-legend">
              <li><RiskBadge level="High" small suffix={false} /> {counts.high}</li>
              <li><RiskBadge level="Medium" small suffix={false} /> {counts.medium}</li>
              <li><RiskBadge level="Low" small suffix={false} /> {counts.low}</li>
            </ul>
          </div>
        </section>
      )}

      <div className="deals-shell">
        <section className="card deals-card" aria-labelledby="history-h">
          <h2 id="history-h" className="sr-only">Deal history</h2>
          <div className="filters" role="search">
            <label className="search-box">
              <MagnifyingGlass size={16} aria-hidden="true" />
              <span className="sr-only">Search deals</span>
              <input
                type="search"
                name="q"
                autoComplete="off"
                placeholder="Search customer or owner…"
                value={q}
                onChange={(e) => setParam('q', e.target.value)}
              />
            </label>
            <label className="filter">
              <span className="sr-only">Filter by status</span>
              <select name="status" value={status} onChange={(e) => setParam('status', e.target.value)}>
                <option value="all">All statuses</option>
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <label className="filter">
              <span className="sr-only">Filter by risk</span>
              <select name="risk" value={risk} onChange={(e) => setParam('risk', e.target.value)}>
                <option value="all">All risk levels</option>
                <option value="High">High risk</option>
                <option value="Medium">Medium risk</option>
                <option value="Low">Low risk</option>
              </select>
            </label>
          </div>

          {error ? (
            <p className="error-banner" role="alert">
              <Warning size={16} aria-hidden="true" /> Could not load deals: {error}
            </p>
          ) : deals === null ? (
            <div role="status" className="table-skeleton">
              <span className="sr-only">Loading deals…</span>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton row" />
              ))}
            </div>
          ) : deals.length === 0 ? (
            <div className="empty-state">
              <h3>No deals yet</h3>
              <p className="muted">
                Start with a contract PDF or type the terms in. Every review you run is saved here for your whole organization.
              </p>
              <div className="row-gap center">
                <Link className="btn btn-primary" to="/deals/new?source=pdf">
                  <UploadSimple size={16} aria-hidden="true" /> Upload PDF
                </Link>
                <Link className="btn btn-outline" to="/deals/new">
                  <Plus size={16} aria-hidden="true" /> New deal
                </Link>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <h3>No deals match these filters</h3>
              <button type="button" className="btn btn-outline" onClick={() => setParams({}, { replace: true })}>
                Clear filters
              </button>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="deals-table">
                <thead>
                  <tr>
                    <th scope="col">Customer</th>
                    <th scope="col" className="num">Value</th>
                    <th scope="col">Risk</th>
                    <th scope="col">Status</th>
                    <th scope="col">Created by</th>
                    <th scope="col">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr key={d.id}>
                      <th scope="row">
                        <Link to={`/deals/${d.id}`} className="row-link">
                          {d.customer}
                        </Link>
                        {d.source === 'pdf' && (
                          <FilePdf size={14} className="row-icon" aria-label="Imported from PDF" />
                        )}
                      </th>
                      <td className="num">{fmtUSD(Number(d.deal_value))}</td>
                      <td><RiskBadge level={d.risk_level} small /></td>
                      <td><span className={`status-pill status-${d.status}`}>{STATUS_LABELS[d.status]}</span></td>
                      <td>{d.creator?.full_name ?? 'Former member'}</td>
                      <td>
                        <time dateTime={d.created_at}>{fmtDate(d.created_at)}</time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtersActive && (
                <p className="muted small table-foot">
                  Showing {filtered.length} of {deals.length}.{' '}
                  <button type="button" className="link-btn" onClick={() => setParams({}, { replace: true })}>
                    Clear filters
                  </button>
                </p>
              )}
            </div>
          )}
        </section>

        <aside className="card invite-card" aria-labelledby="invite-h">
          <h2 id="invite-h">Invite your team</h2>
          <p className="muted small">
            Teammates choose <strong>Join with invite code</strong> when they sign up. They will see every deal in {profile.organization.name}.
          </p>
          <div className="invite-code">
            <code translate="no">{profile.organization.invite_code}</code>
            <button type="button" className="btn btn-outline btn-sm" onClick={copyInvite}>
              {copied ? <Check size={14} weight="bold" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

        </aside>
      </div>
    </div>
  );
}
