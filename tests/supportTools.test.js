import { describe, expect, it, vi } from 'vitest';
import { SUPPORT_TOOL_NAMES, createSupportTools } from '../src/lib/supportTools.js';

// Minimal chainable Supabase query stub that records the filters used.
function fakeSupabase(rows) {
  const calls = [];
  const q = {
    select: () => q,
    ilike: (col, pattern) => (calls.push({ ilike: [col, pattern] }), q),
    order: () => q,
    limit: (n) => (calls.push({ limit: n }), Promise.resolve({ data: rows, error: null })),
  };
  return { from: (t) => (calls.push({ from: t }), q), calls };
}

const deal = {
  id: 'd1',
  customer: 'Northwind Logistics, Inc.',
  deal_value: 400000,
  risk_level: 'High',
  status: 'pending',
  flags: [{ term: 'Discount', severity: 'High' }, { term: 'Liability', severity: 'High' }],
  approvers: [{ title: 'Sales Manager' }, { title: 'Legal' }],
  updated_at: '2026-10-02T20:00:00Z',
};

function setup({ token = 'jwt', rows = [deal], webhookUrl = 'https://x.app.n8n.cloud/webhook/dealdesk-support', fetchReply } = {}) {
  const supabase = fakeSupabase(rows);
  const navigate = vi.fn();
  const activity = [];
  const fetchImpl = vi.fn(async () => ({ json: async () => fetchReply ?? { ok: true, ticket: 'DD-1042', message: 'Ticket DD-1042 is open.' } }));
  const tools = createSupportTools({
    supabase,
    getAccessToken: async () => token,
    navigate,
    webhookUrl,
    getChannel: () => 'voice',
    getConversationId: () => 'conv_123',
    onActivity: (a) => activity.push(a),
    fetchImpl,
  });
  return { tools, supabase, navigate, activity, fetchImpl };
}

describe('support agent client tools', () => {
  it('exposes exactly the tools configured on the agent', () => {
    expect(Object.keys(setup().tools).sort()).toEqual([...SUPPORT_TOOL_NAMES].sort());
  });

  it('get_deal_status describes the deal in plain words', async () => {
    const { tools, supabase } = setup();
    const out = await tools.get_deal_status({ customer: 'northwind' });
    expect(supabase.calls).toContainEqual({ ilike: ['customer', '%northwind%'] });
    expect(out).toMatch(/Northwind Logistics, Inc\.: \$400,000 list, High risk, waiting for a decision\./);
    expect(out).toMatch(/Flagged terms: Discount \(High\), Liability \(High\)/);
    expect(out).toMatch(/Needs sign-off from: Sales Manager, Legal/);
  });

  it('strips LIKE wildcards from the search', async () => {
    const { tools, supabase } = setup();
    await tools.get_deal_status({ customer: '%_%' });
    expect(supabase.calls.find((c) => c.ilike)).toBeUndefined(); // empty after stripping -> asks which customer
  });

  it('refuses deal data to visitors and offers sign-in instead', async () => {
    const { tools, supabase } = setup({ token: null });
    expect(await tools.get_deal_status({ customer: 'x' })).toMatch(/not signed in/);
    expect(await tools.list_recent_deals()).toMatch(/not signed in/);
    expect(supabase.calls).toEqual([]);
  });

  it('open_page navigates, and sends visitors to sign in for app pages', async () => {
    const a = setup();
    await a.tools.open_page({ page: 'upload_pdf' });
    expect(a.navigate).toHaveBeenCalledWith('/deals/new?source=pdf');
    await a.tools.open_page({ page: 'deal', customer: 'north' });
    expect(a.navigate).toHaveBeenCalledWith('/deals/d1');

    const v = setup({ token: null });
    expect(await v.tools.open_page({ page: 'deals' })).toMatch(/sign-in page/);
    expect(v.navigate).toHaveBeenCalledWith('/auth');
    await v.tools.open_page({ page: 'how_it_works' });
    expect(v.navigate).toHaveBeenCalledWith('/how-it-works');
  });

  it('create_support_ticket posts to n8n with the user token, channel and conversation id', async () => {
    const { tools, fetchImpl, activity } = setup();
    const out = await tools.create_support_ticket({ subject: 'PDF stuck', description: 'Spins forever' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toMatch(/webhook\/dealdesk-support$/);
    expect(init.headers.Authorization).toBe('Bearer jwt');
    expect(JSON.parse(init.body)).toMatchObject({ action: 'create_ticket', subject: 'PDF stuck', channel: 'voice', conversation_id: 'conv_123' });
    expect(out).toBe('Ticket DD-1042 is open.');
    expect(activity.at(-1)).toMatchObject({ ok: true, label: 'Created support ticket: DD-1042' });
  });

  it('escalate_to_human sends action=escalate without a token for visitors', async () => {
    const { tools, fetchImpl } = setup({ token: null });
    await tools.escalate_to_human({ summary: 'Wants a call about pricing', contact_email: 'lee@p.test' });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body)).toMatchObject({ action: 'escalate', description: 'Wants a call about pricing', contact_email: 'lee@p.test' });
  });

  it('degrades gracefully when n8n is not configured or unreachable', async () => {
    const none = setup({ webhookUrl: null });
    expect(await none.tools.create_support_ticket({ description: 'x' })).toMatch(/not connected yet/);
    const down = setup();
    down.fetchImpl.mockRejectedValueOnce(new Error('offline'));
    expect(await down.tools.escalate_to_human({ summary: 'x' })).toMatch(/could not be reached/);
  });
});
