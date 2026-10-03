import { ArrowLeft, Buildings, CheckCircle, EnvelopeSimple, Eye, EyeSlash, Key, UsersThree, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import BrandMark from '../components/BrandMark.jsx';
import SetupNotice from '../components/SetupNotice.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

const redirectBase = () => `${window.location.origin}/auth`;

// Turn Supabase error text into something a person can act on.
function friendly(error) {
  const m = error?.message ?? String(error);
  if (/invalid login credentials/i.test(m)) return 'That email and password do not match. Check them, or reset your password.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link we sent.';
  if (/already registered|already exists/i.test(m)) return 'An account with this email already exists. Sign in instead.';
  if (/password should be at least/i.test(m)) return 'Use a password with at least 8 characters.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  if (/database error saving new user/i.test(m)) return 'We could not create your account. Check the invite code, or make sure the database migration has been run.';
  if (/failed to fetch|network/i.test(m)) return 'Could not reach Supabase. Check your connection and the project URL.';
  return m;
}

export default function AuthPage() {
  const { configured, session, recovering, setRecovering } = useAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const mode = recovering ? 'reset' : (params.get('mode') ?? 'signin');
  const setMode = (m) => setParams(m === 'signin' ? {} : { mode: m }, { replace: true });

  if (!configured) return <SetupNotice />;
  if (session && mode !== 'reset') return <Navigate to={location.state?.from ?? '/deals'} replace />;

  return (
    <div className="auth-page">
      <div className="auth-side" aria-hidden="true">
        <BrandMark tone="dark" />
        <div className="auth-side-copy">
          <p className="auth-quote">Every flagged term gets a human answer.</p>
          <ul>
            <li><CheckCircle size={18} weight="fill" /> AI flags risky terms in seconds</li>
            <li><CheckCircle size={18} weight="fill" /> The right approvers, every time</li>
            <li><CheckCircle size={18} weight="fill" /> A full audit trail for your team</li>
          </ul>
        </div>
      </div>

      <main className="auth-main" id="main">
        <Link to="/how-it-works" className="back-link">
          <ArrowLeft size={14} aria-hidden="true" /> How it works
        </Link>
        <div className="auth-card">
          {mode === 'forgot' ? (
            <ForgotForm onBack={() => setMode('signin')} />
          ) : mode === 'reset' ? (
            <ResetForm onDone={() => setRecovering(false)} />
          ) : (
            <>
              <div className="tabs" role="group" aria-label="Choose log in or sign up">
                <button type="button" aria-pressed={mode === 'signin'} className="tab" onClick={() => setMode('signin')}>
                  Log in
                </button>
                <button type="button" aria-pressed={mode === 'signup'} className="tab" onClick={() => setMode('signup')}>
                  Sign up
                </button>
              </div>
              {mode === 'signup' ? <SignUpForm onSwitch={() => setMode('signin')} /> : <SignInForm onForgot={() => setMode('forgot')} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function SignInForm({ onForgot }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (err) setError(friendly(err));
    // On success the auth listener updates the session and AuthPage redirects.
  };

  return (
    <form onSubmit={submit} noValidate aria-describedby={error ? 'signin-error' : undefined}>
      <h1 className="auth-title">Welcome back</h1>
      <p className="muted auth-sub">Log in to see your organization's deals.</p>
      <TextField id="si-email" label="Work email" type="email" autoComplete="email" value={email} onChange={setEmail} required spellCheck={false} />
      <TextField id="si-password" label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} required />
      {error && <FormError id="signin-error">{error}</FormError>}
      <button type="submit" className="btn btn-primary btn-block" disabled={loading || !email || !password}>
        {loading ? <><span className="spinner" aria-hidden="true" /> Logging in…</> : 'Log in'}
      </button>
      <button type="button" className="link-btn forgot" onClick={onForgot}>
        Forgot password?
      </button>
    </form>
  );
}

function SignUpForm({ onSwitch }) {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', orgMode: 'create', orgName: '', inviteCode: '' });
  const [errors, setErrors] = useState({});
  const [invite, setInvite] = useState({ state: 'idle', org: '' }); // idle | checking | valid | invalid
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // Look up the invite code as the person types (debounced).
  useEffect(() => {
    const code = form.inviteCode.trim();
    if (form.orgMode !== 'join' || code.length < 6) {
      setInvite({ state: 'idle', org: '' });
      return;
    }
    setInvite({ state: 'checking', org: '' });
    const t = setTimeout(async () => {
      const { data, error: err } = await supabase.rpc('lookup_invite_code', { code });
      if (err) setInvite({ state: 'error', org: friendly(err) });
      else if (data?.length) setInvite({ state: 'valid', org: data[0].organization_name });
      else setInvite({ state: 'invalid', org: '' });
    }, 400);
    return () => clearTimeout(t);
  }, [form.inviteCode, form.orgMode]);

  const validate = () => {
    const e = {};
    if (!form.fullName.trim()) e.fullName = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (form.password.length < 8) e.password = 'Use at least 8 characters.';
    if (form.orgMode === 'create' && form.orgName.trim().length < 2) e.orgName = 'Enter your organization name.';
    if (form.orgMode === 'join' && invite.state !== 'valid') e.inviteCode = 'Enter a valid invite code from a teammate.';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById(`su-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    setLoading(true);
    setError('');
    const meta = { full_name: form.fullName.trim() };
    if (form.orgMode === 'create') meta.org_name = form.orgName.trim();
    else meta.invite_code = form.inviteCode.trim().toUpperCase();

    const { data, error: err } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: meta, emailRedirectTo: redirectBase() },
    });
    setLoading(false);
    if (err) return setError(friendly(err));
    // Supabase returns a user with no identities when the email is already taken.
    if (data.user && data.user.identities?.length === 0) return setError(friendly({ message: 'already registered' }));
    if (!data.session) setSentTo(form.email.trim());
    // With a session, the auth listener signs the user in and AuthPage redirects to /deals.
  };

  if (sentTo) return <CheckEmail email={sentTo} onSwitch={onSwitch} />;

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="auth-title">Create your account</h1>
      <p className="muted auth-sub">Takes a minute. Your deals stay private to your organization.</p>
      <TextField id="su-fullName" label="Full name" autoComplete="name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} />
      <TextField id="su-email" label="Work email" type="email" autoComplete="email" spellCheck={false} value={form.email} onChange={set('email')} error={errors.email} />
      <TextField
        id="su-password"
        label="Password"
        type="password"
        autoComplete="new-password"
        value={form.password}
        onChange={set('password')}
        error={errors.password}
        hint="At least 8 characters."
      />

      <fieldset className="org-choice">
        <legend>Organization</legend>
        <div className="seg">
          <label className={`seg-opt ${form.orgMode === 'create' ? 'on' : ''}`}>
            <input type="radio" name="orgMode" value="create" checked={form.orgMode === 'create'} onChange={() => set('orgMode')('create')} />
            <Buildings size={18} aria-hidden="true" /> Create new
          </label>
          <label className={`seg-opt ${form.orgMode === 'join' ? 'on' : ''}`}>
            <input type="radio" name="orgMode" value="join" checked={form.orgMode === 'join'} onChange={() => set('orgMode')('join')} />
            <UsersThree size={18} aria-hidden="true" /> Join with code
          </label>
        </div>
        {form.orgMode === 'create' ? (
          <TextField id="su-orgName" label="Organization name" autoComplete="organization" value={form.orgName} onChange={set('orgName')} error={errors.orgName} hint="You'll get an invite code to share with your team." />
        ) : (
          <TextField
            id="su-inviteCode"
            label="Invite code"
            autoComplete="off"
            spellCheck={false}
            value={form.inviteCode}
            onChange={(v) => set('inviteCode')(v.toUpperCase())}
            error={errors.inviteCode}
            hint={
              invite.state === 'checking'
                ? 'Checking code…'
                : invite.state === 'valid'
                  ? `You'll join ${invite.org}.`
                  : invite.state === 'invalid'
                    ? 'No organization uses this code.'
                    : invite.state === 'error'
                      ? invite.org
                      : 'Ask a teammate for the 8-character code on their Deals page.'
            }
            hintTone={invite.state === 'valid' ? 'good' : invite.state === 'invalid' || invite.state === 'error' ? 'bad' : undefined}
          />
        )}
      </fieldset>

      {error && <FormError>{error}</FormError>}
      <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
        {loading ? <><span className="spinner" aria-hidden="true" /> Creating account…</> : 'Create account'}
      </button>
      <p className="muted small center auth-switch">
        Already have an account?{' '}
        <button type="button" className="link-btn" onClick={onSwitch}>Log in</button>
      </p>
    </form>
  );
}

function CheckEmail({ email, onSwitch }) {
  const [state, setState] = useState('idle');
  const resend = async () => {
    setState('sending');
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectBase() } });
    setState(error ? 'error' : 'sent');
  };
  return (
    <div className="check-email" role="status">
      <EnvelopeSimple size={36} weight="duotone" aria-hidden="true" />
      <h1 className="auth-title">Check your inbox</h1>
      <p>
        We sent a confirmation link to <strong>{email}</strong>. Open it on this device to finish signing up, then you'll land on your deals.
      </p>
      <div className="row-gap center">
        <button type="button" className="btn btn-outline" onClick={resend} disabled={state === 'sending' || state === 'sent'}>
          {state === 'sent' ? 'Sent again' : state === 'sending' ? 'Sending…' : 'Resend email'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSwitch}>Back to log in</button>
      </div>
      {state === 'error' && <FormError>Could not resend yet. Wait a minute and try again.</FormError>}
    </div>
  );
}

function ForgotForm({ onBack }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setState('sending');
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${redirectBase()}?mode=reset` });
    if (err) {
      setError(friendly(err));
      setState('idle');
    } else setState('sent');
  };
  if (state === 'sent') {
    return (
      <div className="check-email" role="status">
        <EnvelopeSimple size={36} weight="duotone" aria-hidden="true" />
        <h1 className="auth-title">Reset link sent</h1>
        <p>If an account exists for <strong>{email}</strong>, you'll get an email with a link to choose a new password.</p>
        <button type="button" className="btn btn-outline" onClick={onBack}>Back to log in</button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate>
      <h1 className="auth-title">Reset your password</h1>
      <p className="muted auth-sub">Enter your email and we'll send you a reset link.</p>
      <TextField id="fp-email" label="Work email" type="email" autoComplete="email" spellCheck={false} value={email} onChange={setEmail} />
      {error && <FormError>{error}</FormError>}
      <button type="submit" className="btn btn-primary btn-block" disabled={state === 'sending' || !email}>
        {state === 'sending' ? <><span className="spinner" aria-hidden="true" /> Sending…</> : 'Send reset link'}
      </button>
      <button type="button" className="link-btn forgot" onClick={onBack}>Back to log in</button>
    </form>
  );
}

function ResetForm({ onDone }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  if (!session) {
    return (
      <div className="check-email">
        <Key size={36} weight="duotone" aria-hidden="true" />
        <h1 className="auth-title">Open the link from your email</h1>
        <p>This page works after you click the reset link we emailed you. Links expire after an hour.</p>
      </div>
    );
  }
  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) return setError(friendly(err));
    onDone();
    navigate('/deals', { replace: true });
  };
  return (
    <form onSubmit={submit} noValidate>
      <h1 className="auth-title">Choose a new password</h1>
      <TextField id="rp-password" label="New password" type="password" autoComplete="new-password" value={password} onChange={setPassword} hint="At least 8 characters." />
      {error && <FormError>{error}</FormError>}
      <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
        {loading ? <><span className="spinner" aria-hidden="true" /> Saving…</> : 'Save password'}
      </button>
    </form>
  );
}

function TextField({ id, label, value, onChange, error, hint, hintTone, type, ...rest }) {
  const descId = `${id}-desc`;
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const input = (
    <input
      id={id}
      name={id}
      type={isPassword && show ? 'text' : type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={Boolean(error)}
      aria-describedby={error || hint ? descId : undefined}
      {...rest}
    />
  );
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <div className="field-label"><label htmlFor={id}>{label}</label></div>
      {isPassword ? (
        <div className="password-wrap">
          {input}
          <button
            type="button"
            className="icon-btn password-eye"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
          >
            {show ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
      ) : (
        input
      )}
      {error ? (
        <div id={descId} className="field-error" role="alert">{error}</div>
      ) : (
        hint && <div id={descId} className={`field-hint ${hintTone ? `hint-${hintTone}` : ''}`} aria-live="polite">{hint}</div>
      )}
    </div>
  );
}

function FormError({ id, children }) {
  return (
    <p id={id} className="form-error" role="alert">
      <WarningCircle size={16} aria-hidden="true" /> {children}
    </p>
  );
}
