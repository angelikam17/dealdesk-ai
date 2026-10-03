// Executes the n8n Code node from n8n/dealdesk-support-workflow.json the way n8n
// does ($input + this.helpers.httpRequest), with Supabase's RPC stubbed out.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wf = JSON.parse(readFileSync(new URL('../n8n/dealdesk-support-workflow.json', import.meta.url), 'utf8'));
const code = wf.nodes.find((n) => n.type === 'n8n-nodes-base.code').parameters.jsCode;

async function run({ body = {}, headers = {}, reply = { statusCode: 200, body: [] } } = {}) {
  const calls = [];
  const ctx = {
    helpers: {
      httpRequest: async (opts) => {
        calls.push(opts);
        return typeof reply === 'function' ? reply(opts) : reply;
      },
    },
  };
  const $input = { first: () => ({ json: { body, headers } }) };
  const fn = new Function('$input', `return (async function () { ${code} }).call(this);`);
  const out = await fn.call(ctx, $input);
  return { out: out[0].json, calls };
}

const ticketRow = (over = {}) => ({
  statusCode: 200,
  body: [{ ticket_number: 1042, status: 'open', priority: 'normal', organization_name: 'Arma_AI', contact_name: 'Ana', contact_email: 'ana@x.test', ...over }],
});

describe('n8n support workflow', () => {
  it('wires webhook -> code -> respond -> if -> gmail', () => {
    expect(wf.connections['Support request'].main[0][0].node).toBe('Save ticket in Supabase');
    expect(wf.connections['Needs a person?'].main[0][0].node).toBe('Email support team');
    const hook = wf.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
    expect(hook.parameters).toMatchObject({ httpMethod: 'POST', path: 'dealdesk-support', responseMode: 'responseNode' });
  });

  it('forwards the signed-in user token so Supabase verifies identity', async () => {
    const { out, calls } = await run({
      headers: { authorization: 'Bearer user.jwt.token' },
      body: { subject: 'PDF stuck', description: 'Upload never finishes', channel: 'voice' },
      reply: ticketRow(),
    });
    expect(calls[0].url).toMatch(/\/rest\/v1\/rpc\/create_support_ticket$/);
    expect(calls[0].headers.Authorization).toBe('Bearer user.jwt.token');
    expect(calls[0].body).toMatchObject({ p_subject: 'PDF stuck', p_escalate: false, p_channel: 'voice' });
    expect(out).toMatchObject({ ok: true, ticket: 'DD-1042', escalated: false });
    expect(out.message).toMatch(/DD-1042 is open/);
  });

  it('visitors call without a token and escalation sets the flag', async () => {
    const { out, calls } = await run({
      body: { action: 'escalate', summary: 'Wants a demo call', contact_email: 'lead@p.test' },
      reply: ticketRow({ status: 'escalated', priority: 'urgent', organization_name: null }),
    });
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(calls[0].body).toMatchObject({ p_escalate: true, p_contact_email: 'lead@p.test', p_subject: 'Customer asked for a person' });
    expect(out).toMatchObject({ ok: true, escalated: true, organization: 'Website visitor' });
    expect(out.message).toMatch(/a person will contact you/i);
  });

  it('asks for a description instead of calling Supabase when it is empty', async () => {
    const { out, calls } = await run({ body: { subject: 'Help' } });
    expect(calls).toHaveLength(0);
    expect(out).toMatchObject({ ok: false, status: 400 });
  });

  it('turns Supabase errors into plain replies the agent can say', async () => {
    const expired = await run({ headers: { authorization: 'Bearer old' }, body: { description: 'x' }, reply: { statusCode: 401, body: { message: 'JWT expired' } } });
    expect(expired.out.message).toMatch(/session has expired/i);
    const noEmail = await run({ body: { description: 'x' }, reply: { statusCode: 400, body: { message: 'A contact email is required' } } });
    expect(noEmail.out.message).toMatch(/share an email/i);
  });

  it('ignores junk deal ids and priorities', async () => {
    const { calls } = await run({ body: { description: 'x', deal_id: "1; drop table", priority: 'mega' }, reply: ticketRow() });
    expect(calls[0].body).toMatchObject({ p_deal_id: null, p_priority: 'normal' });
  });
});
