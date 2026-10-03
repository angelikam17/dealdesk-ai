# DealDesk AI

AI-assisted B2B deal review for the Carnegie Mellon AI Methods final project.
Upload a contract or type in the terms. DealDesk AI flags nonstandard terms, explains why they matter, and routes them to the right approvers. **People always make the final call: deals are never auto-approved.**

- React 18 + Vite, React Router, Motion (animation), Phosphor icons, Sonner (toasts)
- Supabase for auth, Postgres (with row level security) and file storage
- PDF text extraction in the browser with pdf.js
- Mock AI explanations: no LLM API key needed

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173

Without Supabase keys, the landing and "How it works" pages work, and sign-in shows a setup screen. Follow the steps below to connect Supabase.

### Demo mode (no Supabase)

```bash
npm run dev:demo
```

This runs the whole app against an in-browser stand-in for Supabase (`demo/mockSupabase.js`), with data stored in this browser's localStorage. It's meant for presenting or testing the flow when you're offline. It is **not secure** and is never included in `npm run build`. A "Demo data" badge appears in the header so you always know which mode you're in.

## Supabase setup (about 5 minutes)

1. **Create a project.** Go to [supabase.com/dashboard](https://supabase.com/dashboard), click **New project**, and choose a name, password and region. The free tier is fine.
2. **Run the migration.** Open **SQL Editor > New query**, paste the whole of [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql), and click **Run**. This creates:
   - tables `organizations`, `profiles`, `deals`, `deal_events`
   - a trigger that creates the profile and creates or joins the organization when someone signs up
   - row level security, so every user only sees their own organization's data
   - the private storage bucket `deal-pdfs` and its policies
3. **Check the bucket.** Open **Storage** and confirm `deal-pdfs` exists and is **private**. If it's missing, create it by hand: name `deal-pdfs`, Public off, 10 MB file limit, allowed type `application/pdf`. Then run the migration again so the storage policies are added.
4. **Add your keys.** In **Project Settings > API**, copy the **Project URL** and the **anon public** key. Then:
   ```bash
   cp .env.example .env.local
   ```
   Paste both values into `.env.local`. Never use the `service_role` key in this app.
5. **Set the redirect URL.** In **Authentication > URL Configuration**, set **Site URL** to `http://localhost:5173` and add `http://localhost:5173/auth` under **Redirect URLs**. Confirmation and password-reset emails link back here.
6. **Optional, for local testing:** under **Authentication > Sign In / Providers > Email**, turn off **Confirm email** so new accounts can sign in right away. Leave it on for anything real. Supabase's built-in email service also only sends a few emails per hour.
7. **Restart** `npm run dev`.

## How it works

| Route | What it does |
| --- | --- |
| `/` | Landing page |
| `/how-it-works` | 5-step walkthrough, ending in "Get started" |
| `/auth` | Log in / sign up (create an org, or join one with an invite code), forgot password |
| `/deals` | Deal history for your org, with search and filters by status and risk, plus your invite code |
| `/deals/new` | New deal, typed in by hand or imported from a PDF (`?source=pdf` opens the upload) |
| `/deals/:id` | Review dashboard: summary, risk flags, routing, human decision, audit trail, email and print |

### Human in the loop

- The AI only recommends. Approve stays locked until a named reviewer acknowledges every flag and every routed approver has signed off.
- Reject and Request changes need a written reason.
- Editing the terms and re-running the review resets the deal to Pending, because earlier sign-offs applied to different terms.
- Extracted PDF values are shown for review and editing. Nothing fills the form, runs a review, or saves until a person confirms.
- Every review, sign-off, decision and reopen is stored in `deal_events` (append-only) and shown as the audit trail.

### Routing rules (`src/lib/reviewEngine.js`)

| Condition | Severity | Routed to |
| --- | --- | --- |
| Discount above 10% (High at 20% or more) | Medium / High | Sales Manager |
| Payment later than Net-30 (High at Net-90 or later) | Medium / High | Finance |
| Implementation cost above 10% of net value (High at 25% or more) | Medium / High | Finance |
| Margin below 40% (High below 30%) | Medium / High | Finance |
| Liability cap above 1x (High if unlimited) | Medium / High | Legal |
| SLA above 99.9% (High at 99.99% or more) | Medium / High | Risk / Security |
| Custom security terms requested | Medium | Risk / Security |

Overall risk is **High** if any flag is High or there are 4 or more Medium flags, **Medium** if anything is flagged, and **Low** otherwise.

### Interface

- **Light, dark or system theme.** The toggle in the header cycles through the three; the choice is saved in the browser and applied before the first paint, so there is no flash.
- **Live demo on the landing page.** Sliders and selects run the real review engine, so visitors can see risk, flags and approvers change before signing up.
- **Progress stepper** on every reviewed deal: terms, AI review, sign-offs, decision.
- **Confirmation** before Reject or Request changes, and toast notifications for saves, sign-offs and decisions.
- **Pipeline summary** on the Deals page: count, total list value, deals waiting, and the risk mix.

### Customer support agent

A **Support** button on every page opens a chat and voice assistant. It's powered by an **ElevenLabs** agent and an **n8n** workflow for tickets and escalation. Setup: [docs/SUPPORT_SETUP.md](docs/SUPPORT_SETUP.md).

- Visitors get product answers and can leave a ticket (an email is required).
- Signed-in users can also ask about their own deals, which are looked up in the browser with row level security, and open pages by voice.
- Without an agent configured, the button falls back to a plain message form through n8n.

### Share

- **Email summary** opens your mail app through a `mailto:` link with the subject and summary filled in. There's no email server. Very long summaries may be cut off by some desktop mail clients; **Copy summary** always works.
- **Print or save as PDF** uses a print stylesheet that hides navigation and buttons.

## Project layout

```
src/
  pages/        Landing, HowItWorks, Auth, Deals, DealReview, NotFound
  components/   Layout, header, badges; deal/ holds the form, result cards, decision, PDF import, share
  context/      AuthContext (session, profile, organization)
  lib/          reviewEngine, extractDealTerms, pdfText, dealsApi, share, format, supabase
  styles/       tokens (light + dark), base, marketing, app, print
supabase/migrations/001_init.sql
scripts/generate-*.mjs            -> public/samples/sample-deal.pdf (High risk), contoso-order-form.pdf (Medium risk); npm run sample:pdf
demo/mockSupabase.js              (demo mode only)
tests/                            vitest: review engine, PDF extraction, database migration
```

## Tests

```bash
npm test
```

- `reviewEngine.test.js`: every routing rule, the severity thresholds and boundaries, and risk scoring.
- `extractDealTerms.test.js`: reads the real sample PDF with pdf.js, plus alternate wording, shorthand amounts and missing fields.
- `supportMigration.test.js`, `n8nWorkflow.test.js`, `supportTools.test.js`: support tickets (database security, the n8n workflow's code, and the agent's browser tools).
- `migration.test.js`: runs `001_init.sql` in PGlite (Postgres compiled to WASM) and checks the sign-up trigger, invite codes and row level security. It confirms that one organization can't read or write another's deals, events or files.
