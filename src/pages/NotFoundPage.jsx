import { Link } from 'react-router-dom';
import MarketingLayout from '../components/MarketingLayout.jsx';

export default function NotFoundPage() {
  return (
    <MarketingLayout>
      <section className="hiw-hero">
        <h1 className="display">Page not found</h1>
        <p className="hero-sub">The link may be old, or the page moved.</p>
        <Link className="btn btn-primary" to="/">Go to the home page</Link>
      </section>
    </MarketingLayout>
  );
}
