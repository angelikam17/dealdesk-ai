import { Database } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import BrandMark from './BrandMark.jsx';

// Shown instead of auth / deal screens when Supabase env vars are missing.
export default function SetupNotice() {
  return (
    <div className="center-page">
      <div className="setup-card">
        <BrandMark tone="light" />
        <div className="setup-icon"><Database size={28} weight="duotone" aria-hidden="true" /></div>
        <h1>Connect Supabase to continue</h1>
        <p>
          Sign-in and saved deals need a Supabase project. It takes about five minutes and the free tier is enough.
        </p>
        <ol className="setup-steps">
          <li>Create a project at <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">supabase.com/dashboard</a>.</li>
          <li>In the SQL Editor, run <code>supabase/migrations/001_init.sql</code>.</li>
          <li>Copy <code>.env.example</code> to <code>.env.local</code> and paste your project URL and anon key from Project Settings &gt; API.</li>
          <li>Restart <code>npm run dev</code>.</li>
        </ol>
        <p className="muted small">Full steps are in the README.</p>
        <Link className="btn btn-outline" to="/">Back to home</Link>
      </div>
    </div>
  );
}
