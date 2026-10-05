-- Users (login / access - binary, any logged-in user sees everything)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Message library (write / upload / select previous)
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  header_type TEXT,          -- none|text|image|video|document
  header_content TEXT,       -- text string, or media URL/handle
  footer TEXT,
  buttons_json TEXT,         -- JSON array of button definitions
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Templates submitted to TimesMobile (mirrors their template object)
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER REFERENCES messages(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,        -- MARKETING|UTILITY|AUTHENTICATION
  language TEXT NOT NULL DEFAULT 'en',
  components_json TEXT NOT NULL, -- exact TimesMobile components array
  timesmobile_template_id INTEGER,
  status TEXT NOT NULL DEFAULT 'submitted', -- submitted|approved|rejected
  rejected_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Campaigns (our own concept - TimesMobile has no bulk/campaign object;
-- we loop per-recipient and group those sends under one campaign row)
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  template_id INTEGER REFERENCES templates(id),
  message_id INTEGER REFERENCES messages(id),
  cohort_list_id TEXT,          -- LSQ ListId
  cohort_name TEXT,
  charter_granular TEXT NOT NULL,
  charter_rollup TEXT,
  scheduled_date TEXT,          -- for planner entries
  send_components_json TEXT,    -- default send-time components (variables); personalization can override per-recipient
  status TEXT NOT NULL DEFAULT 'draft',
  -- draft -> awaiting_approval -> launched  (or -> draft again on reject)
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per individual recipient send (the per-recipient loop)
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  lead_id TEXT,                 -- LSQ ProspectId, when known
  phone TEXT NOT NULL,
  is_test_send INTEGER NOT NULL DEFAULT 0,
  wa_message_id TEXT,           -- TimesMobile's returned message id (wamid)
  ct_trace_id TEXT,             -- links async response to webhook callbacks
  send_status TEXT,             -- accepted|failed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Message-level event log (sent/delivered/read/clicked/failed), from webhooks
-- This is append-only - never overwritten - so cumulative funnel counts work.
CREATE TABLE IF NOT EXISTS message_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_recipient_id INTEGER REFERENCES campaign_recipients(id),
  campaign_id INTEGER REFERENCES campaigns(id),
  event_type TEXT NOT NULL,     -- sent|delivered|read|clicked|failed
  event_timestamp TEXT NOT NULL,
  raw_payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- LSQ lead stage change log (append-only event log, not current-state)
CREATE TABLE IF NOT EXISTS lsq_stage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL,
  old_stage TEXT,
  new_stage TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  observed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- BDE assignment / reassignment history (append-only, from point of integration onward)
CREATE TABLE IF NOT EXISTS bde_assignment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL,
  old_owner_email TEXT,
  new_owner_email TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  changed_by_user_id INTEGER REFERENCES users(id)
);

-- Leads that qualified as "Assigned" (Page 6 - Lead Assignment)
CREATE TABLE IF NOT EXISTS qualified_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL,
  campaign_id INTEGER REFERENCES campaigns(id),
  qualification_reason TEXT NOT NULL,
  -- clicks_single_campaign | clicks_cross_campaign | form_fill | fast_conversion
  qualified_at TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_bde_email TEXT
);

-- Budgets: independent overall cap + per-charter weekly/monthly, fully manual entry
CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  charter TEXT,                 -- NULL means "overall"
  period_type TEXT NOT NULL,    -- week|month
  period_start TEXT NOT NULL,   -- Monday for week, 1st for month
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Monthly planner entries (Page 9)
CREATE TABLE IF NOT EXISTS planner_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planned_date TEXT NOT NULL,
  cohort_list_id TEXT,
  cohort_name TEXT,
  message_id INTEGER REFERENCES messages(id),
  charter_granular TEXT NOT NULL,
  charter_rollup TEXT,
  campaign_id INTEGER REFERENCES campaigns(id), -- filled once the campaign is created on its date
  status TEXT NOT NULL DEFAULT 'planned', -- planned|fired|done
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Content playbook - single reference blob backing AI drafting (Page 8)
CREATE TABLE IF NOT EXISTS content_playbook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_text TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Weekly digest archive (Page 9)
CREATE TABLE IF NOT EXISTS digest_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sync status per external source, for the "last synced at" indicator
CREATE TABLE IF NOT EXISTS sync_status (
  source TEXT PRIMARY KEY,      -- timesmobile|lsq
  last_synced_at TEXT,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_events_recipient ON message_events(campaign_recipient_id);
CREATE INDEX IF NOT EXISTS idx_events_campaign ON message_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_stage_events_lead ON lsq_stage_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_assignment_events_lead ON bde_assignment_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_qualified_leads_campaign ON qualified_leads(campaign_id);
