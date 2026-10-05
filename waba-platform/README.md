# WABA Campaign Platform

Message + cohort selection -> template approval -> test-send + approve ->
per-recipient launch -> funnel/budget dashboards -> lead assignment -> AI
drafting -> monthly planner + weekly digest. Built against TimesMobile
(WABA messaging) and LeadSquared (CRM), with Claude for AI-assisted
drafting and calendar suggestions.

## 1. Install

```
npm install
```

`better-sqlite3` compiles a native binding on install - this has been
verified to work in a standard Linux/Node 18+ environment. If it fails on
your machine, you likely need build tools (`build-essential` on Ubuntu, or
Xcode command line tools on macOS).

## 2. Configure

```
cp .env.example .env
```

Fill in real values in `.env`:
- `TIMESMOBILE_BASE_URL`, `TIMESMOBILE_API_KEY`
- `LSQ_BASE_URL` (default `https://api-in21.leadsquared.com/v2` - confirm
  this matches your account's API host from Settings > API Access Keys),
  `LSQ_ACCESS_KEY`, `LSQ_SECRET_KEY`
- `ANTHROPIC_API_KEY` (from console.anthropic.com - needed for Page 8 AI
  drafting and calendar suggestions; everything else works without it)
- `APPROVER_WHATSAPP_NUMBER` - your number, international format, no `+`
- SMTP settings + `DIGEST_RECIPIENTS` - for the three email alerts and the
  Monday weekly digest. Leave blank to disable email (the app still works,
  it just logs a warning instead of sending)
- `PUBLIC_BASE_URL` - see step 4

## 3. Run

```
npm start
```

Open `http://localhost:3000`. First visit: create the first admin account
(bootstrap screen). After that, use "Invite" logic via `/api/auth/invite`
(any logged-in user can add teammates - access is binary, no per-charter
restriction, per the requirements doc).

## 4. Expose webhooks so TimesMobile can reach you

```
npx ngrok http 3000
```

Put the `https://...ngrok...` URL into `PUBLIC_BASE_URL` in `.env`, restart,
then give TimesMobile these three webhook URLs (see their panel steps in
the Webhook_configuration doc they shared):

```
<PUBLIC_BASE_URL>/webhook/timesmobile/status            (message status: sent/delivered/read/failed)
<PUBLIC_BASE_URL>/webhook/timesmobile/inbound            (button/list-reply clicks)
<PUBLIC_BASE_URL>/webhook/timesmobile/template-status    (template approved/rejected)
```

For a permanent setup, deploy to any small VM/server instead of a tunnel.

## 5. What's real vs. what to verify on first live use

Everything below is wired to TimesMobile/LSQ's **real, confirmed** endpoints
and payload shapes (from the Postman collections and public API docs you
shared) - not placeholders. Three small things are marked assumptions until
you test them live (see `config/stages.js` and the comments in
`adapters/leadsquared.js`):

1. **Exact LSQ stage value spellings** - edit `config/stages.js` once you
   pull real stage data; nothing else needs to change.
2. **Whether your LSQ account logs stage changes as retrievable activities**
   - `getLeadActivities()` assumes this; if not, stage-change tracking needs
   a different LSQ endpoint for your account's setup.
3. **Whether `Get Users` (LeadManagement.svc/User.GetAll`) returns BDE email
   addresses** - if not, cross-reference via `getLeadOwner()` instead.
4. **Click threshold for "Assigned" Path A** - `config/config.js` has
   `assignedThresholds` (3 single-campaign / 5 cross-campaign in 3 days) -
   these were the numbers agreed in the requirements doc; adjust if needed.
5. **TimesMobile rate limits** - not documented in what was shared; the
   per-recipient send loop in `campaignService.approveAndLaunch` has a
   `rateLimitMs` (default 250ms between sends) - tune once you know limits.

## 6. Architecture note: no bulk-send API

TimesMobile's Send Message API takes exactly one recipient per call - there
is no bulk/campaign object. `campaignService.approveAndLaunch()` is where
this platform does the fan-out: it pulls the full cohort from LSQ, then
loops through calling TimesMobile's send endpoint once per recipient,
recording each as its own row in `campaign_recipients`. A "campaign" here is
entirely our own concept, stitched together from individual sends.

## 7. Data model

Everything is built on an **event log**, not overwritten state:
- `message_events` - append-only sent/delivered/read/clicked/failed/form_fill
  events per recipient, fed by webhooks
- `lsq_stage_events` - append-only lead stage-change history
- `bde_assignment_events` - append-only reassignment history (from
  integration-time onward only - historical reassignments before that can't
  be reconstructed)

This is what makes sticky/cumulative funnel counts (Prospect, Session Done,
RFD) and live/point-in-time counts (True Churn) both work correctly from
the same underlying data - see `services/funnelService.js`.

## 8. Pages -> code map

| Page | Route prefix | Key files |
|---|---|---|
| 1. Main preview | `/api/funnel/rollup` | `services/funnelService.js` |
| 2. Charter-wise | `/api/funnel/by-charter` | same |
| 3. Deep-dive | `/api/funnel/deep-dive` | `routes/funnel.js` |
| 4. Cost/budget | `/api/budget/*` | `services/budgetService.js` |
| 5. Template/campaign creation | `/api/templates`, `/api/campaigns` | `adapters/timesmobile.js`, `services/campaignService.js` |
| 6. Lead assignment | `/api/assignment/*` | `services/assignmentService.js` |
| 7. Campaign search/compare | `/api/campaigns`, `/api/funnel/campaign/:id` | `services/funnelService.js` |
| 8. AI Assist | `/api/messages/generate`, `/api/ai/suggest-calendar` | `adapters/claude.js` |
| 9. Planner + weekly digest | `/api/planner/*` | `jobs/plannerRunner.js`, `jobs/weeklyDigest.js` |

## 9. Cron jobs (run automatically once the server is up)

- **Daily 8am**: planner reminder email for entries due today (still
  requires manual test-send + approve in the UI - planning ahead doesn't
  bypass approval, per your explicit requirement)
- **Monday 8am**: weekly digest (funnel + spend by charter), emailed and
  archived in the tool
- **Every 6 hours**: delivery-rate-drop alert check
- **Every 30 minutes**: re-run Assigned-lead qualification checks

## 10. Project structure

```
server.js                entrypoint - wires routes, sessions, cron jobs
config/config.js          reads .env, charter lists, thresholds
config/stages.js           LSQ stage-name constants - edit here first
db/schema.sql, db/db.js    SQLite schema + connection
adapters/timesmobile.js    real TimesMobile endpoints
adapters/leadsquared.js    real LSQ endpoints
adapters/claude.js         AI drafting + calendar suggestions
services/                 business logic (campaigns, funnel, budget, assignment, auth, email, alerts)
routes/                   Express routes, one file per page-group
jobs/                     the two cron job bodies
public/                   frontend (plain HTML/CSS/JS, no build step)
```
