// Builds the n8n support workflow (import it in n8n: Workflows > Import from File).
//
//   node scripts/build-n8n-workflow.mjs             -> n8n/dealdesk-support-workflow.json (placeholders, committed)
//   node scripts/build-n8n-workflow.mjs --from-env  -> n8n/dealdesk-support-workflow.local.json (your Supabase
//                                                      URL + publishable key from .env.local; git-ignored)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const fromEnv = process.argv.includes('--from-env');
const env = fromEnv && existsSync('.env.local')
  ? Object.fromEntries(
      readFileSync('.env.local', 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
    )
  : {};
const SUPABASE_URL = env.VITE_SUPABASE_URL ?? 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? 'YOUR_PUBLISHABLE_KEY';

const code = `// DealDesk AI support desk.
// 1. Uses the caller's own Supabase session (if signed in) so identity is verified by Supabase.
// 2. Saves the ticket through create_support_ticket() (row level security still applies).
// 3. Returns a short reply the voice/chat agent reads back to the customer.
const SUPABASE_URL = '${SUPABASE_URL}';
const SUPABASE_KEY = '${SUPABASE_KEY}'; // public publishable key, safe to keep here

const req = $input.first().json;
const body = req.body ?? {};
const auth = (req.headers?.authorization ?? '').trim();
const escalate = body.action === 'escalate';

const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
if (/^Bearer\\s+\\S+/.test(auth)) headers.Authorization = auth;

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const args = {
  p_subject: text(body.subject, 200) || (escalate ? 'Customer asked for a person' : 'Support request'),
  p_description: text(body.description ?? body.summary, 5000),
  p_priority: ['low', 'normal', 'high', 'urgent'].includes(body.priority) ? body.priority : 'normal',
  p_escalate: escalate,
  p_channel: ['chat', 'voice', 'form'].includes(body.channel) ? body.channel : 'chat',
  p_contact_name: text(body.contact_name, 120) || null,
  p_contact_email: text(body.contact_email, 200) || null,
  p_deal_id: /^[0-9a-f-]{36}$/i.test(body.deal_id ?? '') ? body.deal_id : null,
  p_conversation_id: text(body.conversation_id, 200) || null,
};
if (args.p_subject.length < 3) args.p_subject = 'Support request';

if (!args.p_description) {
  return [{ json: { ok: false, status: 400, message: 'Please describe the problem so the team can help.' } }];
}

const res = await this.helpers.httpRequest({
  method: 'POST',
  url: SUPABASE_URL + '/rest/v1/rpc/create_support_ticket',
  headers,
  body: args,
  json: true,
  returnFullResponse: true,
  ignoreHttpStatusErrors: true,
});

if (res.statusCode >= 300) {
  const detail = typeof res.body === 'object' ? res.body?.message ?? JSON.stringify(res.body) : String(res.body);
  const message =
    res.statusCode === 401 ? 'Your session has expired. Sign in again, then try once more.'
    : /contact email/i.test(detail) ? 'Please share an email address so the support team can reply to you.'
    : 'The ticket could not be saved right now. Please try again in a moment.';
  return [{ json: { ok: false, status: res.statusCode, message, detail } }];
}

const t = Array.isArray(res.body) ? res.body[0] : res.body;
const ref = 'DD-' + t.ticket_number;
const escalated = t.status === 'escalated';
return [{
  json: {
    ok: true,
    ticket: ref,
    ticket_number: t.ticket_number,
    status: t.status,
    priority: t.priority,
    escalated,
    organization: t.organization_name ?? 'Website visitor',
    contact_name: t.contact_name ?? 'Unknown',
    contact_email: t.contact_email ?? 'not provided',
    subject: args.p_subject,
    description: args.p_description,
    channel: args.p_channel,
    message: escalated
      ? 'Ticket ' + ref + ' is now with the support team as urgent. A person will contact you shortly.'
      : 'Ticket ' + ref + ' is open. The support team will follow up by email.',
  },
}];`;

const workflow = {
  name: 'DealDesk AI - Support Desk',
  nodes: [
    {
      parameters: {
        httpMethod: 'POST',
        path: 'dealdesk-support',
        responseMode: 'responseNode',
        options: { allowedOrigins: '*' },
      },
      id: '0d1f5c1e-6a3b-4f7e-9a51-2b8d7e3f1a01',
      name: 'Support request',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: '5f0c3b2a-8d4e-4c1f-9b6a-dealdesk0001',
    },
    {
      parameters: { jsCode: code },
      id: '0d1f5c1e-6a3b-4f7e-9a51-2b8d7e3f1a02',
      name: 'Save ticket in Supabase',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [240, 0],
    },
    {
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} },
      id: '0d1f5c1e-6a3b-4f7e-9a51-2b8d7e3f1a03',
      name: 'Reply to agent',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [480, 0],
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
          conditions: [
            {
              id: '7b1d1a40-3c2e-4b8a-9f00-escalated0001',
              leftValue: '={{ $json.escalated }}',
              rightValue: '',
              operator: { type: 'boolean', operation: 'true', singleValue: true },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
      id: '0d1f5c1e-6a3b-4f7e-9a51-2b8d7e3f1a04',
      name: 'Needs a person?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [720, 0],
    },
    {
      parameters: {
        sendTo: 'support@yourcompany.com',
        subject: '=[DealDesk urgent] {{ $json.ticket }}: {{ $json.subject }}',
        emailType: 'text',
        message:
          '=A customer asked to speak to a person.\n\nTicket: {{ $json.ticket }}\nFrom: {{ $json.contact_name }} <{{ $json.contact_email }}>\nOrganization: {{ $json.organization }}\nChannel: {{ $json.channel }}\n\nSummary:\n{{ $json.description }}\n\nReply to the customer within one business hour.',
        options: { appendAttribution: false },
      },
      id: '0d1f5c1e-6a3b-4f7e-9a51-2b8d7e3f1a05',
      name: 'Email support team',
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2.1,
      position: [960, -100],
    },
  ],
  connections: {
    'Support request': { main: [[{ node: 'Save ticket in Supabase', type: 'main', index: 0 }]] },
    'Save ticket in Supabase': { main: [[{ node: 'Reply to agent', type: 'main', index: 0 }]] },
    'Reply to agent': { main: [[{ node: 'Needs a person?', type: 'main', index: 0 }]] },
    'Needs a person?': { main: [[{ node: 'Email support team', type: 'main', index: 0 }], []] },
  },
  settings: { executionOrder: 'v1' },
  pinData: {},
};

const out = fromEnv ? 'n8n/dealdesk-support-workflow.local.json' : 'n8n/dealdesk-support-workflow.json';
writeFileSync(out, JSON.stringify(workflow, null, 2) + '\n');
console.log('Wrote', out);
console.log('Supabase URL:', SUPABASE_URL);
