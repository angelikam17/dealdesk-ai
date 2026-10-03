// Client tools for the ElevenLabs support agent.
//
// ElevenLabs runs the conversation; when the agent decides to use a tool it asks
// the browser to run it, and reads back whatever string we return. Tool names and
// parameters here must match the agent's tool settings in ElevenLabs
// (see docs/SUPPORT_SETUP.md).
//
// - Deal lookups run against Supabase as the signed-in user, so row level
//   security applies and the user's token never leaves the browser.
// - Tickets and escalations go to the n8n support webhook, which saves them via
//   Supabase (verifying the user's token) and alerts the team.

import { fmtUSD } from './reviewEngine.js';

export const SUPPORT_TOOL_NAMES = [
  'get_deal_status',
  'list_recent_deals',
  'open_page',
  'create_support_ticket',
  'escalate_to_human',
];

const STATUS_WORDS = {
  pending: 'waiting for a decision',
  approved: 'approved',
  rejected: 'rejected',
  changes_requested: 'sent back for changes',
};

export const PAGES = {
  home: '/',
  how_it_works: '/how-it-works',
  sign_up: '/auth?mode=signup',
  log_in: '/auth',
  deals: '/deals',
  new_deal: '/deals/new',
  upload_pdf: '/deals/new?source=pdf',
};

const describeDeal = (d) => {
  const flags = (d.flags ?? []).map((f) => `${f.term} (${f.severity})`).join(', ');
  const approvers = (d.approvers ?? []).map((a) => a.title).join(', ');
  return [
    `${d.customer}: ${fmtUSD(Number(d.deal_value))} list, ${d.risk_level ?? 'not yet reviewed'} risk, ${STATUS_WORDS[d.status] ?? d.status}.`,
    flags ? `Flagged terms: ${flags}.` : 'No flagged terms.',
    approvers ? `Needs sign-off from: ${approvers}.` : '',
    `Last updated ${new Date(d.updated_at ?? d.created_at).toDateString()}.`,
  ]
    .filter(Boolean)
    .join(' ');
};

/**
 * Build the tool handlers. Everything external is injected so the tools can be
 * unit-tested and so they always read the latest session at call time.
 *
 * @param {object} deps
 * @param {object|null} deps.supabase       Supabase client (or null if not configured)
 * @param {() => Promise<string|null>} deps.getAccessToken  current user's JWT, or null for visitors
 * @param {(path: string) => void} deps.navigate
 * @param {string|undefined} deps.webhookUrl  n8n production webhook URL
 * @param {() => string} deps.getChannel      'voice' | 'chat'
 * @param {() => string|undefined} deps.getConversationId
 * @param {(entry: {tool: string, label: string, ok: boolean}) => void} [deps.onActivity]
 * @param {typeof fetch} [deps.fetchImpl]
 */
export function createSupportTools({
  supabase,
  getAccessToken,
  navigate,
  webhookUrl,
  getChannel,
  getConversationId,
  onActivity = () => {},
  fetchImpl = (...a) => fetch(...a),
}) {
  const needsSignIn =
    'The person is not signed in, so you cannot see their deals. Offer to open the sign-in page with open_page, or answer general questions.';

  async function signedIn() {
    return Boolean(supabase && (await getAccessToken()));
  }

  async function callN8n(payload, label) {
    if (!webhookUrl) {
      onActivity({ tool: payload.action, label: `${label} (support desk not connected)`, ok: false });
      return 'The ticketing system is not connected yet. Apologize, and tell the person they can email the team directly.';
    }
    const token = await getAccessToken();
    try {
      const res = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ...payload, channel: getChannel(), conversation_id: getConversationId() }),
      });
      const data = await res.json().catch(() => ({}));
      onActivity({ tool: payload.action, label: data.ok ? `${label}: ${data.ticket}` : label, ok: Boolean(data.ok) });
      return data.message ?? (data.ok ? `Done. Reference ${data.ticket}.` : 'That did not work. Please try again.');
    } catch {
      onActivity({ tool: payload.action, label: `${label} failed`, ok: false });
      return 'The support desk could not be reached. Apologize and suggest trying again in a minute.';
    }
  }

  return {
    async get_deal_status({ customer } = {}) {
      if (!(await signedIn())) return needsSignIn;
      // Strip LIKE wildcards first so input like "%" can't match every deal.
      const name = String(customer ?? '').replace(/[%_\\]/g, '').trim();
      if (!name) return 'Ask which customer the deal is for.';
      const { data, error } = await supabase
        .from('deals')
        .select('id, customer, deal_value, risk_level, status, flags, approvers, created_at, updated_at')
        .ilike('customer', `%${name}%`)
        .order('updated_at', { ascending: false })
        .limit(3);
      if (error) return `The deal lookup failed: ${error.message}`;
      onActivity({ tool: 'get_deal_status', label: `Looked up “${name}”`, ok: true });
      if (!data.length) return `No deal matching "${name}" in this organization. Ask them to check the customer name, or offer list_recent_deals.`;
      return data.map(describeDeal).join('\n');
    },

    async list_recent_deals() {
      if (!(await signedIn())) return needsSignIn;
      const { data, error } = await supabase
        .from('deals')
        .select('id, customer, deal_value, risk_level, status, flags, approvers, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(5);
      if (error) return `The lookup failed: ${error.message}`;
      onActivity({ tool: 'list_recent_deals', label: 'Checked recent deals', ok: true });
      if (!data.length) return 'This organization has no deals yet. Offer to open the upload_pdf or new_deal page.';
      return data.map(describeDeal).join('\n');
    },

    async open_page({ page, customer } = {}) {
      if (page === 'deal') {
        if (!(await signedIn())) return needsSignIn;
        const name = String(customer ?? '').replace(/[%_\\]/g, '').trim();
        if (!name) return 'Ask which customer the deal is for.';
        const { data } = await supabase
          .from('deals')
          .select('id, customer')
          .ilike('customer', `%${name}%`)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (!data?.length) return `No deal found for "${customer}".`;
        navigate(`/deals/${data[0].id}`);
        onActivity({ tool: 'open_page', label: `Opened ${data[0].customer}`, ok: true });
        return `Opened the ${data[0].customer} deal.`;
      }
      const path = PAGES[page];
      if (!path) return `Unknown page. Valid pages: ${[...Object.keys(PAGES), 'deal'].join(', ')}.`;
      if (['deals', 'new_deal', 'upload_pdf'].includes(page) && !(await signedIn())) {
        navigate(PAGES.log_in);
        return 'That page needs an account, so the sign-in page is open instead.';
      }
      navigate(path);
      onActivity({ tool: 'open_page', label: `Opened ${page.replace(/_/g, ' ')}`, ok: true });
      return `Opened the ${page.replace(/_/g, ' ')} page.`;
    },

    async create_support_ticket({ subject, description, priority, contact_name, contact_email } = {}) {
      return callN8n(
        { action: 'create_ticket', subject, description, priority, contact_name, contact_email },
        'Created support ticket'
      );
    },

    async escalate_to_human({ summary, reason, contact_name, contact_email } = {}) {
      return callN8n(
        { action: 'escalate', subject: reason, description: summary ?? reason, contact_name, contact_email },
        'Escalated to the support team'
      );
    },
  };
}
