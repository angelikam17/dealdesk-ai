import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// Each page loads on demand so the landing page stays light.
const LandingPage = lazy(() => import('./pages/LandingPage.jsx'));
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage.jsx'));
const AuthPage = lazy(() => import('./pages/AuthPage.jsx'));
const DealsPage = lazy(() => import('./pages/DealsPage.jsx'));
const DealReviewPage = lazy(() => import('./pages/DealReviewPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));

function PageFallback() {
  return (
    <div className="center-page" role="status">
      <span className="spinner spinner-accent" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/deals" element={<DealsPage />} />
          {/* "new" and real ids share one element so creating a deal doesn't remount the page */}
          <Route path="/deals/:id" element={<DealReviewPage />} />
        </Route>
        <Route path="/login" element={<Navigate to="/auth" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
