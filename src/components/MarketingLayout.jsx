import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BrandMark from './BrandMark.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export default function MarketingLayout({ children }) {
  const { session } = useAuth();
  return (
    <div className="mk">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="mk-nav">
        <div className="mk-nav-inner">
          <BrandMark tone="light" />
          <nav aria-label="Main" className="mk-links">
            <NavLink to="/how-it-works">How it works</NavLink>
            <ThemeToggle />
            {session ? (
              <Link className="btn btn-primary btn-sm" to="/deals">Open deals</Link>
            ) : (
              <Link className="btn btn-outline btn-sm" to="/auth">Sign in</Link>
            )}
          </nav>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="mk-footer">
        <BrandMark tone="light" />
        <p>Built for the Carnegie Mellon AI Methods final project. AI explanations are simulated; no model API keys required.</p>
      </footer>
    </div>
  );
}
