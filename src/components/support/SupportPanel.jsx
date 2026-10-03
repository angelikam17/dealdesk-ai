import {
  ArrowUp,
  CheckCircle,
  Microphone,
  MicrophoneSlash,
  PhoneDisconnect,
  PhoneCall,
  Sparkle,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext.jsx';
import { supabase } from '../../lib/supabase.js';
import { createSupportTools } from '../../lib/supportTools.js';

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID;
const WEBHOOK_URL = import.meta.env.VITE_N8N_SUPPORT_WEBHOOK_URL;

const SUGGESTIONS = {
  member: ['Where does my latest deal stand?', 'Why was a deal flagged High risk?', 'How do I upload a contract?', 'I need to talk to a person'],
  visitor: ['What does DealDesk AI do?', 'How does approval routing work?', 'Is my deal data private?', 'I want to talk to sales'],
};

export default function SupportPanel({ onClose }) {
  return (
    <ConversationProvider>
      {AGENT_ID ? <AgentChat onClose={onClose} /> : <TicketFallback onClose={onClose} />}
    </ConversationProvider>
  );
}

/* ------------------------------------------------------------------------ */
/* Live agent: one ElevenLabs agent for both typed chat and voice calls.    */
/* ------------------------------------------------------------------------ */

function AgentChat({ onClose }) {
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState('idle'); // idle | text | voice
  const [awaiting, setAwaiting] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(null); // text typed before the session finished connecting
  const modeRef = useRef('idle');
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const orbRef = useRef(null);
  const nextId = useRef(0);

  const signedIn = Boolean(session && profile);
  const push = useCallback((m) => setMessages((ms) => [...ms, { id: nextId.current++, ...m }]), []);

  const conversation = useConversation({
    onConnect: () => {
      setError('');
      if (pending.current) {
        conversation.sendUserMessage(pending.current);
        pending.current = null;
      }
    },
    onDisconnect: () => {
      modeRef.current = 'idle';
      setMode('idle');
      setAwaiting(false);
    },
    onMessage: ({ message, role, source }) => {
      const who = role ?? (source === 'ai' ? 'agent' : 'user');
      // Typed messages are added locally when sent; only voice transcripts come back for the user.
      if (who === 'user' && modeRef.current === 'text') return;
      if (!message?.trim()) return;
      push({ role: who, text: message });
      if (who === 'agent') setAwaiting(false);
    },
    onError: (message) => {
      const text = typeof message === 'string' ? message : 'Something went wrong with the connection.';
      setError(/microphone|permission|notallowed/i.test(text) ? 'Allow microphone access in your browser to talk, or type instead.' : text);
      setAwaiting(false);
    },
  });
  const { status, isSpeaking } = conversation;
  const connected = status === 'connected';
  const connecting = status === 'connecting';

  const tools = useMemo(
    () =>
      createSupportTools({
        supabase,
        getAccessToken: async () => (supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null),
        navigate,
        webhookUrl: WEBHOOK_URL,
        getChannel: () => (modeRef.current === 'voice' ? 'voice' : 'chat'),
        getConversationId: () => {
          try {
            return conversation.getId();
          } catch {
            return undefined;
          }
        },
        onActivity: ({ label, ok }) => {
          push({ role: 'activity', text: label, ok });
          if (/ticket|escalat/i.test(label) && ok) toast.success(label);
        },
      }),
    // conversation.getId is stable; navigate is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, push]
  );

  const start = (nextMode) => {
    setError('');
    modeRef.current = nextMode;
    setMode(nextMode);
    conversation.startSession({
      agentId: AGENT_ID,
      connectionType: nextMode === 'voice' ? 'webrtc' : 'websocket',
      ...(nextMode === 'text' ? { textOnly: true, overrides: { conversation: { textOnly: true } } } : {}),
      dynamicVariables: {
        user_name: profile?.full_name ?? 'there',
        organization: profile?.organization?.name ?? 'none',
        signed_in: signedIn ? 'yes' : 'no',
        current_page: location.pathname,
      },
      clientTools: tools,
    });
  };

  const send = (text) => {
    const t = text.trim();
    if (!t) return;
    push({ role: 'user', text: t });
    setDraft('');
    setAwaiting(true);
    if (connected) conversation.sendUserMessage(t);
    else {
      pending.current = t;
      if (!connecting) start(mode === 'voice' ? 'voice' : 'text');
    }
  };

  const startCall = () => {
    if (connected || connecting) conversation.endSession();
    // Give the previous session a beat to close before opening the mic.
    setTimeout(() => start('voice'), connected ? 250 : 0);
  };

  const endCall = () => conversation.endSession();

  // Tell the agent when the person moves to another page mid-conversation.
  useEffect(() => {
    if (connected) conversation.sendContextualUpdate(`The user is now on the page ${location.pathname}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Close: end any live session. Escape also closes.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    inputRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      conversation.endSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, awaiting]);

  // Voice orb: drive its size from live audio levels without re-rendering React.
  useEffect(() => {
    if (mode !== 'voice' || !connected) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf;
    const tick = () => {
      const level = isSpeaking ? conversation.getOutputVolume() : conversation.getInputVolume();
      orbRef.current?.style.setProperty('--level', Math.min(1, level * 1.6).toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, connected, isSpeaking, conversation]);

  const statusLabel =
    connecting ? 'Connecting…' : connected ? (mode === 'voice' ? (isSpeaking ? 'Speaking' : 'Listening') : 'Online') : 'Ready';
  const suggestions = signedIn ? SUGGESTIONS.member : SUGGESTIONS.visitor;
  const inCall = mode === 'voice' && (connected || connecting);

  return (
    <section id="support-panel" className="support-panel" role="dialog" aria-modal="false" aria-labelledby="support-title">
      <header className="support-head">
        <div className="support-agent">
          <span className={`support-avatar ${connected ? 'is-live' : ''}`} aria-hidden="true">
            <Sparkle size={18} weight="fill" />
          </span>
          <div>
            <h2 id="support-title">DealDesk Support</h2>
            <p className="support-status" aria-live="polite">
              {statusLabel}
              {signedIn ? ` · ${profile.organization?.name}` : ''}
            </p>
          </div>
        </div>
        <button type="button" className="icon-btn icon-btn-on-dark" onClick={onClose} aria-label="Close support">
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      {inCall && (
        <div className="support-call">
          <div ref={orbRef} className={`voice-orb ${isSpeaking ? 'is-speaking' : 'is-listening'} ${connecting ? 'is-connecting' : ''}`} aria-hidden="true">
            <span />
          </div>
          <p className="support-call-label">{connecting ? 'Connecting your call…' : isSpeaking ? 'Support is talking' : 'Listening. Go ahead.'}</p>
          <div className="support-call-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={() => conversation.setMuted(!conversation.isMuted)}
              aria-pressed={conversation.isMuted}
              aria-label={conversation.isMuted ? 'Unmute microphone' : 'Mute microphone'}
              disabled={!connected}
            >
              {conversation.isMuted ? <MicrophoneSlash size={18} aria-hidden="true" /> : <Microphone size={18} aria-hidden="true" />}
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={endCall}>
              <PhoneDisconnect size={16} weight="fill" aria-hidden="true" /> End call
            </button>
          </div>
        </div>
      )}

      <div className="support-body" ref={listRef}>
        {messages.length === 0 ? (
          <div className="support-welcome">
            <p className="support-hello">
              Hi{signedIn ? ` ${profile.full_name.split(' ')[0]}` : ''}! Ask anything about DealDesk{signedIn ? ' or your deals' : ''}. You can type, or start a voice call.
            </p>
            <ul className="support-suggestions" aria-label="Suggested questions">
              {suggestions.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => send(s)}>{s}</button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="support-messages" aria-live="polite" aria-relevant="additions">
            {messages.map((m) =>
              m.role === 'activity' ? (
                <li key={m.id} className={`msg-activity ${m.ok ? '' : 'is-bad'}`}>
                  {m.ok ? <CheckCircle size={14} weight="fill" aria-hidden="true" /> : <WarningCircle size={14} weight="fill" aria-hidden="true" />}
                  {m.text}
                </li>
              ) : (
                <li key={m.id} className={`msg msg-${m.role}`}>
                  <span className="sr-only">{m.role === 'user' ? 'You said' : 'Support said'}: </span>
                  {m.text}
                </li>
              )
            )}
            {awaiting && (
              <li className="msg msg-agent msg-typing" aria-label="Support is typing">
                <span /><span /><span />
              </li>
            )}
          </ol>
        )}
        {error && (
          <p className="support-error" role="alert">
            <WarningCircle size={16} aria-hidden="true" /> {error}
          </p>
        )}
      </div>

      <form
        className="support-compose"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <label htmlFor="support-input" className="sr-only">Message support</label>
        <input
          ref={inputRef}
          id="support-input"
          name="support-message"
          autoComplete="off"
          placeholder={inCall ? 'Type while you talk…' : 'Type your question…'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {draft.trim() ? (
          <button type="submit" className="compose-btn compose-send" aria-label="Send message">
            <ArrowUp size={18} weight="bold" aria-hidden="true" />
          </button>
        ) : (
          !inCall && (
            <button type="button" className="compose-btn compose-call" onClick={startCall} aria-label="Start a voice call">
              <PhoneCall size={18} weight="fill" aria-hidden="true" />
            </button>
          )
        )}
      </form>
      <p className="support-foot">Voice by ElevenLabs. Conversations may be recorded to improve support.</p>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* No agent configured yet: a plain ticket form that still goes through n8n. */
/* ------------------------------------------------------------------------ */

function TicketFallback({ onClose }) {
  const { session, profile } = useAuth();
  const [form, setForm] = useState({ subject: '', description: '', email: '', name: '' });
  const [state, setState] = useState({ busy: false, done: '', error: '' });
  const signedIn = Boolean(session && profile);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tools = useMemo(
    () =>
      createSupportTools({
        supabase,
        getAccessToken: async () => (supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null),
        navigate: () => {},
        webhookUrl: WEBHOOK_URL,
        getChannel: () => 'form',
        getConversationId: () => undefined,
      }),
    []
  );

  const submit = async (e) => {
    e.preventDefault();
    if (!form.description.trim() || (!signedIn && !form.email.trim())) {
      setState({ busy: false, done: '', error: signedIn ? 'Describe the problem first.' : 'Add your email and describe the problem.' });
      return;
    }
    setState({ busy: true, done: '', error: '' });
    const reply = await tools.create_support_ticket({
      subject: form.subject || 'Support request',
      description: form.description,
      contact_email: form.email || undefined,
      contact_name: form.name || undefined,
    });
    const ok = /^Ticket DD-\d+/.test(reply);
    setState({ busy: false, done: ok ? reply : '', error: ok ? '' : reply });
    if (ok) toast.success(reply.split('.')[0]);
  };

  return (
    <section id="support-panel" className="support-panel" role="dialog" aria-modal="false" aria-labelledby="support-title">
      <header className="support-head">
        <div className="support-agent">
          <span className="support-avatar" aria-hidden="true"><Sparkle size={18} weight="fill" /></span>
          <div>
            <h2 id="support-title">DealDesk Support</h2>
            <p className="support-status">Leave a message</p>
          </div>
        </div>
        <button type="button" className="icon-btn icon-btn-on-dark" onClick={onClose} aria-label="Close support">
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="support-body">
        {state.done ? (
          <div className="support-done" role="status">
            <CheckCircle size={36} weight="duotone" aria-hidden="true" />
            <p>{state.done}</p>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setState({ busy: false, done: '', error: '' })}>
              Send another
            </button>
          </div>
        ) : (
          <form className="support-form" onSubmit={submit} noValidate>
            <p className="muted small">
              {WEBHOOK_URL
                ? 'The live voice agent is not set up yet. Send a message and the team will reply by email.'
                : 'Support is not connected yet. See docs/SUPPORT_SETUP.md to add the ElevenLabs agent and n8n webhook.'}
            </p>
            {!signedIn && (
              <>
                <div className="field">
                  <div className="field-label"><label htmlFor="sf-name">Your name</label></div>
                  <input id="sf-name" name="name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="field">
                  <div className="field-label"><label htmlFor="sf-email">Email</label></div>
                  <input id="sf-email" name="email" type="email" autoComplete="email" spellCheck={false} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </>
            )}
            <div className="field">
              <div className="field-label"><label htmlFor="sf-subject">Subject</label></div>
              <input id="sf-subject" name="subject" autoComplete="off" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. PDF upload is stuck…" />
            </div>
            <div className="field">
              <div className="field-label"><label htmlFor="sf-desc">How can we help?</label></div>
              <textarea id="sf-desc" name="description" rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            {state.error && <p className="form-error" role="alert"><WarningCircle size={16} aria-hidden="true" /> {state.error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={state.busy || !WEBHOOK_URL}>
              {state.busy ? <><span className="spinner" aria-hidden="true" /> Sending…</> : 'Send message'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
