# Customer support agent setup

DealDesk's support widget (bottom-right on every page) talks to customers by **voice or text** through an **ElevenLabs** agent, and hands real work to **n8n**.

```
Customer ──voice/text──▶ ElevenLabs agent ──tool call──▶ DealDesk browser
                                                                         │
                         deal lookups (as the signed-in user, RLS) ◀─────┤
                                                                         │
                         tickets + escalations ─────────▶ n8n webhook ──▶ Supabase create_support_ticket()
                                                                     └──▶ Gmail alert to your team (urgent only)
```

Why this split:
- **Deal data never leaves the browser.** The agent's deal tools run in the customer's own browser using their own Supabase session, so row level security applies exactly as in the app.
- **n8n gets no secret keys.** It forwards the customer's own login token to Supabase, which verifies who they are. Visitors (not signed in) can only create tickets, and must leave an email.

Without an agent id, the widget still works as a plain "leave a message" form through n8n.

---

## 1. Supabase: add the tickets table (2 min)

In the Supabase **SQL Editor**, run [`supabase/migrations/002_support.sql`](../supabase/migrations/002_support.sql). It adds `support_tickets` and the `create_support_ticket()` function.

## 2. n8n: import the support workflow (5 min)

1. Fill in your Supabase URL and publishable key (read from `.env.local`):
   ```bash
   node scripts/build-n8n-workflow.mjs --from-env
   ```
   This writes `n8n/dealdesk-support-workflow.local.json` (git-ignored). In n8n Cloud: **Workflows → ⋯ → Import from File**, and choose that file. (The committed [`n8n/dealdesk-support-workflow.json`](../n8n/dealdesk-support-workflow.json) has placeholders; you can also import it and edit the two values at the top of the **Save ticket in Supabase** node.)
2. Open the **Email support team** node: connect your Gmail account (Credential → Create new → Sign in with Google), and change **To** from `support@yourcompany.com` to your team's address.
3. Click **Publish** (or toggle **Active**) so the production webhook works.
4. Open the **Support request** node and copy the **Production URL**. It looks like `https://YOURNAME.app.n8n.cloud/webhook/dealdesk-support`.
5. Optional: in the workflow **Settings**, turn on **Available in MCP** so Claude can test-run it for you.

## 3. ElevenLabs: create the agent (10 min)

1. Sign up at [elevenlabs.io](https://elevenlabs.io) (the free tier is enough to test), then open **Agents** (Conversational AI) and click **Create agent → Blank template**. Name it `DealDesk Support`.
2. **Agent tab**
   - **First message:** `Hi {{user_name}}! I'm DealDesk Support. How can I help?`
   - **System prompt:** paste all of [`docs/support-agent-prompt.md`](support-agent-prompt.md).
   - **LLM:** any model ElevenLabs offers works. This project uses the default (Qwen 3.5); Claude models are also available in the dropdown.
   - **Voice:** pick any voice you like.
3. **Dynamic variables.** The prompt uses `user_name`, `signed_in`, `organization`, `current_page`. The app sends real values each time. In ElevenLabs, give them placeholder defaults if asked (`there`, `no`, `none`, `/`).
4. **Tools → Add tool → Client tool**, five times. For every tool turn on **Wait for response**. Names must match exactly.

   | Name | Description | Parameters |
   |---|---|---|
   | `get_deal_status` | Look up a signed-in user's deal by customer name | `customer` (string, required): the customer name the person mentioned |
   | `list_recent_deals` | List the signed-in user's five most recently updated deals | none |
   | `open_page` | Open a page in the app for the person | `page` (string, required): one of `home`, `how_it_works`, `sign_up`, `log_in`, `deals`, `new_deal`, `upload_pdf`, `deal`. `customer` (string, optional): only when page is `deal` |
   | `create_support_ticket` | Create a support ticket for a problem you cannot solve | `subject` (string, required), `description` (string, required), `priority` (string, optional: low/normal/high), `contact_name` (string, optional), `contact_email` (string, optional, required for visitors) |
   | `escalate_to_human` | Hand the conversation to a person on the support team | `summary` (string, required): what the person needs. `contact_name` (string, optional), `contact_email` (string, optional, required for visitors) |

5. **Security tab**
   - Leave **Enable authentication** off for local testing (a public agent; the agent id alone can start a session).
   - Under **Allowlist**, add `localhost` (hostname only, no port; ElevenLabs rejects `localhost:5173`), and your real domain later, so only your site can use the agent.
   - Under **Overrides**, enable **Text only** so the widget can run typed chats without audio.
6. Copy the **Agent ID** (starts with `agent_`) from the agent's page.

## 4. Connect the app

Add these to `.env.local` (see `.env.example`), then restart `npm run dev`:

```bash
VITE_ELEVENLABS_AGENT_ID=agent_xxxxxxxxxxxxxxxx
VITE_N8N_SUPPORT_WEBHOOK_URL=https://YOURNAME.app.n8n.cloud/webhook/dealdesk-support
```

Both values are public by design. Never put an ElevenLabs API key or a Supabase secret key in this file.

## 5. Try it

- **Visitor:** sign out, open Support on the landing page, ask "What does DealDesk do?", then "I want to talk to sales" and give an email. A `DD-10xx` ticket appears in Supabase (`support_tickets`, source `visitor`) and your team gets an email.
- **Signed in:** ask "Where does the Contoso deal stand?" and "Open my deals". Then click the phone button and ask the same things by voice.
- Check **n8n → Executions** for each ticket, and **ElevenLabs → Agents → Conversations** for transcripts.

## Going to production

- Turn on **Enable authentication** in ElevenLabs and have a small server (a Supabase Edge Function or an n8n webhook) mint a signed URL with your ElevenLabs API key; pass it to `startSession({ signedUrl })` instead of `agentId`.
- Restrict the n8n webhook's **Allowed origins** to your domain, and consider rate limiting visitor tickets.
- Turn email confirmation and the Gmail alert on for real users.
