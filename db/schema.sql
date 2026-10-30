-- LAMF partner onboarding schema.
-- One SQLite database for the onboarding journey, the QC approver panel, and the agent portal.
-- Created automatically by `node serve.js`. Field meanings live in data_dictionary.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- Allowed values captured by the pages.
CREATE TABLE IF NOT EXISTS entity_types (
  code TEXT PRIMARY KEY,
  pan_fourth_char TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS application_statuses (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS products (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS lead_statuses (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS document_kinds (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  entity_type TEXT,
  required INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reject_reasons (
  reason TEXT PRIMARY KEY
);

-- Which screen is open, and who it belongs to (mobile or agent code).
CREATE TABLE IF NOT EXISTS app_sessions (
  app TEXT PRIMARY KEY CHECK (app IN ('onboarding', 'agent')),
  view TEXT NOT NULL,
  subject TEXT
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  ref TEXT UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('onboarding', 'sample')),
  name TEXT NOT NULL DEFAULT '',
  mobile TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  entity TEXT NOT NULL DEFAULT 'Individual' REFERENCES entity_types(code),
  dob TEXT NOT NULL DEFAULT '',
  pan TEXT NOT NULL DEFAULT '',
  profession TEXT NOT NULL DEFAULT '',
  profession_detail TEXT NOT NULL DEFAULT '',
  arn TEXT NOT NULL DEFAULT '',
  partner_type TEXT NOT NULL DEFAULT '',
  app_status TEXT NOT NULL DEFAULT 'Draft' REFERENCES application_statuses(name),
  gst_registered INTEGER NOT NULL DEFAULT 0,
  address TEXT NOT NULL DEFAULT '',
  step INTEGER NOT NULL DEFAULT 0,
  mobile_ok INTEGER NOT NULL DEFAULT 0,
  email_ok INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  submitted_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (source, mobile)
);

CREATE TABLE IF NOT EXISTS pan_verifications (
  application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  ok INTEGER NOT NULL DEFAULT 0,
  holder_name TEXT,
  dob TEXT,
  holder_type TEXT,
  status TEXT,
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS aadhaar_kyc (
  application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  ok INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  full_name TEXT,
  is_signatory INTEGER NOT NULL DEFAULT 0,
  dob TEXT,
  gender TEXT,
  masked_number TEXT,
  photo TEXT,
  provider_request_id TEXT,
  house TEXT,
  street TEXT,
  landmark TEXT,
  city TEXT,
  district TEXT,
  state TEXT,
  pin TEXT,
  country TEXT
);

CREATE TABLE IF NOT EXISTS declarations (
  -- Kept for older sample applications. The journey no longer asks for FATCA or PEP.
  application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  fatca INTEGER NOT NULL DEFAULT 0,
  pep INTEGER NOT NULL DEFAULT 0,
  declared_at TEXT
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  ok INTEGER NOT NULL DEFAULT 0,
  mode TEXT,
  method TEXT,
  account_type TEXT,
  account_holder TEXT,
  account_masked TEXT,
  ifsc TEXT,
  bank_name TEXT,
  branch TEXT,
  beneficiary TEXT,
  name_match REAL,
  verified_at TEXT,
  provider_id TEXT
);

CREATE TABLE IF NOT EXISTS gst_details (
  application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  ok INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  gstin TEXT,
  legal_name TEXT,
  status TEXT,
  jurisdiction TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  kind TEXT NOT NULL REFERENCES document_kinds(code),
  file_name TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  data_url TEXT,
  UNIQUE (application_id, kind)
);

CREATE TABLE IF NOT EXISTS consents (
  application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  declaration INTEGER NOT NULL DEFAULT 0,
  terms INTEGER NOT NULL DEFAULT 0,
  consented_at TEXT
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id INTEGER PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event_at TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS qc_decisions (
  application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('Approved', 'Rejected')),
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  reason TEXT REFERENCES reject_reasons(reason),
  remarks TEXT,
  eagreement_sent_at TEXT,
  sent_to_email TEXT,
  sent_to_mobile TEXT,
  checklist TEXT
);

CREATE TABLE IF NOT EXISTS interest_share_rules (
  id INTEGER PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  rate_from REAL NOT NULL,
  rate_to REAL NOT NULL,
  partner_share REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS proc_fee_rules (
  id INTEGER PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  basis TEXT NOT NULL DEFAULT 'Loan amount',
  operator TEXT NOT NULL CHECK (operator IN ('<', '>', '<=', '>=')),
  loan_amount REAL NOT NULL,
  share_amount REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS agreement_terms (
  application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  valid_months INTEGER,
  valid_until TEXT,
  payout_percent REAL
);

CREATE TABLE IF NOT EXISTS agreements (
  application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  signed_at TEXT,
  doc_id TEXT,
  agent_code TEXT,
  temp_password TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS partners (
  agent_code TEXT PRIMARY KEY,
  application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  pan TEXT NOT NULL DEFAULT '',
  entity TEXT NOT NULL DEFAULT 'Individual',
  is_demo INTEGER NOT NULL DEFAULT 0,
  temp_password TEXT NOT NULL DEFAULT 'Welcome@123'
);

CREATE TABLE IF NOT EXISTS agent_credentials (
  agent_code TEXT PRIMARY KEY REFERENCES partners(agent_code) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  set_at TEXT NOT NULL,
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  agent_code TEXT NOT NULL REFERENCES partners(agent_code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  pan TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  product TEXT NOT NULL REFERENCES products(name),
  status TEXT NOT NULL REFERENCES lead_statuses(name),
  disbursed_amount REAL,
  sanctioned_amount REAL,
  created_at TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS partner_leads (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company_name TEXT NOT NULL,
  comments TEXT NOT NULL DEFAULT '',
  mobile TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_dictionary (
  id INTEGER PRIMARY KEY,
  sort_order INTEGER NOT NULL,
  page TEXT NOT NULL,
  section TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  data_type TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  storage_table TEXT NOT NULL,
  storage_column TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(app_status);
CREATE INDEX IF NOT EXISTS idx_applications_ref ON applications(ref);
CREATE INDEX IF NOT EXISTS idx_timeline_app ON timeline_events(application_id, event_at);
CREATE INDEX IF NOT EXISTS idx_leads_agent ON leads(agent_code, sort_order);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
