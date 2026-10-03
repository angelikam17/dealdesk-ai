import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AppHeader from './AppHeader.jsx';
import SetupNotice from './SetupNotice.jsx';

export default function ProtectedRoute() {
  const { configured, session, profile, profileLoading, profileError, reloadProfile, signOut } = useAuth();
  const location = useLocation();

  if (!configured) return <SetupNotice />;
  if (session === undefined || profileLoading) {
    return (
      <div className="center-page" aria-busy="true">
        <div className="loading-block" role="status">Loading your workspace…</div>
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;

  if (!profile?.organization) {
    return (
      <div className="center-page">
        <div className="setup-card">
          <h1>We couldn't load your organization</h1>
          <p>
            {profileError
              ? `Supabase returned: ${profileError}`
              : 'Your account is not linked to an organization yet. This usually means the database migration was not run before you signed up.'}
          </p>
          <div className="row-gap">
            <button type="button" className="btn btn-primary" onClick={reloadProfile}>Try again</button>
            <button type="button" className="btn btn-outline" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <AppHeader />
      <main id="main">
        <Outlet />
      </main>
    </div>
  );
}
