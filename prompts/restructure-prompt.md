Restructure DealDesk AI (the React + Vite app in this folder) into a multi-page product with onboarding, Supabase auth and storage, saved deal history, and PDF upload with value extraction.

## Skills to use
Use these installed skills for this task. Load each one with the Skill tool before the work it applies to, and follow its guidance:

1. **design-taste-frontend**: load it before designing or building any UI (landing, how-it-works, auth, deal history, deal screen). Use it for visual direction, typography, spacing, color and component polish.
2. **web-design-guidelines**: once the screens are built, run it as a review pass over all pages. Fix what it flags (accessibility, contrast, focus states, form UX, responsive layout) before finishing.
3. **creative**: use it for the landing and how-it-works pages: the hero concept, headline and benefit copy, and the walkthrough storytelling. Keep the copy plain-language and user-friendly.

All three are linked into this project's `.claude/skills/` folder: `design-taste-frontend`, `web-design-guidelines`, and `creative` (which points to `.agents/skills/design-system`). If the Skill tool doesn't list one of them, read its `SKILL.md` directly from that folder and follow it. Don't skip it.

## Context
- The app is currently a single page: `src/App.jsx` (dashboard UI), `src/reviewEngine.js` (policy rules, risk scoring, approval routing, mock AI explanations) and `src/styles.css`.
- Keep `reviewEngine.js` as the single source of truth for review logic. Don't change its rules unless something below requires it.
- Hard rule that must survive the restructure: deals are never auto-approved. Approve stays locked until a named reviewer acknowledges the flags and every routed approver has signed off. Reject and Request Changes require a comment.
- AI explanations stay mocked. The app must still work without any LLM API key. The only keys it needs are the Supabase URL and anon key.

## 1. Routing and screens (use react-router-dom)
1. `/`: Landing page. Friendly, modern, plain-language hero ("Review B2B deals in minutes, with humans always in control"), 3–4 benefit cards, and one primary button: "See how it works".
2. `/how-it-works`: A step-by-step walkthrough (stepper or carousel) of the flow: upload or enter a deal, see AI flags and risk level, route to approvers, a human decides, then share or print. Each step should say how it helps the user (saves time, catches risky terms, creates an audit trail). Finish with a "Get started" button that goes to `/auth`.
3. `/auth`: Login / Sign up tabs.
   - Sign up fields: full name, work email, password, and organization (either create a new org by name, or join an existing org with an invite code).
   - Login: email and password, plus "Forgot password".
   - Show clear inline errors and loading states. Handle Supabase's "confirm your email" state gracefully.
4. `/deals`: Protected route. A deal history table for the user's organization (customer, value, risk badge, status, created by, date), with search and a filter by status or risk. Buttons: "New deal" and "Upload PDF".
5. `/deals/new` and `/deals/:id`: The existing deal review dashboard (form on the left, results on the right), now loading and saving to Supabase.
- Protected routes redirect to `/auth` when there is no session. A logged-in user who visits `/auth` goes to `/deals`.
- Add a top bar with the org name, the user's name, and Sign out.

## 2. Supabase backend
Create `supabase/migrations/001_init.sql` with:
- `organizations` (id uuid pk, name text, invite_code text unique, created_at)
- `profiles` (id uuid pk references auth.users on delete cascade, full_name, email, organization_id references organizations, role text default 'member', created_at)
- `deals` (id, organization_id, created_by references profiles, customer, deal_value numeric, discount numeric, payment_terms, implementation_cost numeric, liability, sla, margin numeric, security_review bool, risk_level, flags jsonb, approvers jsonb, status text default 'pending' check in ('pending','approved','rejected','changes_requested'), source text check in ('manual','pdf'), pdf_path text, created_at, updated_at)
- `deal_events` (id, deal_id, actor_id, actor_label, kind text ('ai','human','system'), text, created_at). This is the persisted audit trail, including sign-offs and the final decision with the reviewer name and comment.
- A trigger on `auth.users` insert that creates the `profiles` row and creates or joins the organization from the sign-up metadata (`full_name`, `org_name` or `invite_code`). Generate a random `invite_code` for new orgs.
- Row Level Security on every table: users can read and write only rows in their own organization. Invite-code lookup must not expose other orgs' data. Use a `security definer` function for it.
- A private Storage bucket `deal-pdfs` with policies scoping objects to the user's org folder (`{org_id}/{deal_id}.pdf`).

Client side:
- `src/lib/supabase.js` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Add `.env.example` and make sure `.env.local` is gitignored.
- Never use or commit a service-role key in the frontend.
- If the env vars are missing, show a friendly setup screen instead of crashing.

I will create the Supabase project myself. Write step-by-step setup instructions in the README: create the project, run the migration in the SQL editor, create the bucket, copy the keys into `.env.local`, and optionally turn off email confirmation for local testing.

## 3. PDF upload and value extraction
- Add an "Upload PDF" option: a drag-and-drop zone plus a file picker. PDF only, max 10 MB.
- Extract text in the browser with `pdfjs-dist`, then parse the deal fields with tolerant regex and keyword matching. Fields: customer, deal value, discount %, payment terms (Net-XX), implementation cost, liability (cap multiple or unlimited), SLA %, expected margin. Put the parser in `src/lib/extractDealTerms.js` as a pure function.
- Human in the loop: show an "Extracted values" review panel. For each field, show the value found, the source snippet, and found or not-found status. The user edits or confirms the values before they fill the deal form. Never run the review or save silently.
- Upload the original PDF to the `deal-pdfs` bucket and link it on the deal (`source = 'pdf'`, `pdf_path`). Let the user view or download it later from the deal page.
- Create a sample contract PDF at `public/samples/sample-deal.pdf` that matches the default example deal ($400,000, 25% discount, Net-90, $62,000 implementation, unlimited liability, 99.99% SLA, 38% margin). Add a "Try with sample PDF" link. Generate it with a small script using `pdf-lib`.

## 4. Share: email and print
On a reviewed deal, add:
- **Email summary**: opens a `mailto:` link with the subject "Deal review: {customer} ({risk} risk)" and a plain-text body. The body includes the key terms, the flags with explanations, the required approvers, the status, and a link back to the deal. No email backend needed.
- **Print / Save as PDF**: a clean printable report view (a `@media print` stylesheet that hides navigation and buttons and shows the deal summary, flags, routing, decision and audit trail), triggered with `window.print()`.
- **Copy summary** to clipboard.

## 5. Persistence behavior
- Running a review saves or updates the deal row with `risk_level`, `flags` and `approvers`, and logs an `ai` event.
- Sign-offs and decisions are written to `deal_events`, and the decision updates `deals.status`. Reloading the page restores everything.
- The deal history list updates after saving.

## 6. Quality bar
- Keep the current enterprise look (navy header, risk badges, cards), but make the landing and how-it-works pages warmer and more approachable. Layouts must work on mobile, with no horizontal scroll.
- Organize the code into `src/pages/`, `src/components/`, `src/lib/` and `src/context/AuthContext.jsx`. Split the current `App.jsx` into components.
- Install all dependencies, run `npm run build`, and fix every error and warning.
- Start the dev server and click through the whole flow in the browser: landing → how it works → sign up → deals → upload sample PDF → confirm extracted values → review → sign off → approve → email/print → sign out → log back in → see the deal in history. If Supabase keys aren't configured yet, verify everything up to auth, then tell me exactly what to set up.
- Add unit tests (vitest) for `extractDealTerms` and `reviewEngine`.
- Update the README.

When finished, tell me: the run command, the localhost URL, the Supabase setup steps I still need to do, and any assumptions you made.
