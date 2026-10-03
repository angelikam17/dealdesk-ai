import { Link } from 'react-router-dom';

// Simple geometric wordmark: a "D" stroke with a spark dot.
export default function BrandMark({ to = '/', sub, tone = 'dark' }) {
  return (
    <Link to={to} className={`brand brand-${tone}`} aria-label="DealDesk AI home">
      <svg className="brand-logo" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M9 9h7a7 7 0 0 1 0 14H9z" fill="none" stroke="#fff" strokeWidth="3" />
        <circle cx="23.5" cy="9.5" r="3" fill="var(--brand-spark)" />
      </svg>
      <span className="brand-text">
        <span className="brand-name" translate="no">
          DealDesk <span className="brand-ai">AI</span>
        </span>
        {sub && <span className="brand-sub">{sub}</span>}
      </span>
    </Link>
  );
}
