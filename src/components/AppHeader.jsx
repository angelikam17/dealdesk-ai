import { Buildings, SignOut } from '@phosphor-icons/react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { isDemoMode } from '../lib/supabase.js';
import BrandMark from './BrandMark.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

export default function AppHeader() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  return (
    <header className="topbar no-print">
      <BrandMark to="/deals" sub="Commercial deal review" />
      <nav className="topnav" aria-label="App">
        <NavLink to="/deals" end>Deals</NavLink>
        <NavLink to="/deals/new">New deal</NavLink>
      </nav>
      <div className="topbar-right">
        {isDemoMode && (
          <span className="demo-chip" title="Demo mode: data lives only in this browser. Not connected to Supabase.">
            Demo data
          </span>
        )}
        {profile?.organization && (
          <span className="org-chip" title="Your organization">
            <Buildings size={16} aria-hidden="true" />
            <span className="org-name">{profile.organization.name}</span>
          </span>
        )}
        <span className="user-chip">
          <span className="avatar" aria-hidden="true">{initials(profile?.full_name)}</span>
          <span className="user-name">{profile?.full_name}</span>
        </span>
        <ThemeToggle onDark />
        <button type="button" className="btn btn-on-dark btn-sm" onClick={handleSignOut} aria-label="Sign out">
          <SignOut size={16} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </header>
  );
}
