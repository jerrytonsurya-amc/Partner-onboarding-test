/* SQLite storage for onboarding applications, QC decisions, partners, and leads. */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const dictionary = require('./dictionary');
const { buildSampleApps, DEMO_LEADS, DEMO_AGENT } = require('./seedData');

const file = path.join(__dirname, '..', 'data', 'lamf.sqlite');
const schemaFile = path.join(__dirname, '..', 'db', 'schema.sql');

let db = null;
let depth = 0;

const CHILD_TABLES = [
  'pan_verifications', 'aadhaar_kyc', 'declarations', 'bank_accounts', 'gst_details', 'documents',
  'consents', 'timeline_events', 'qc_decisions', 'interest_share_rules', 'proc_fee_rules',
  'agreement_terms', 'agreements',
];

function bad(message, status) {
  const err = new Error(message);
  err.status = status || 400;
  return err;
}

function tx(fn) {
  if (depth) return fn();
  depth += 1;
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    depth -= 1;
    return result;
  } catch (err) {
    depth -= 1;
    try { db.exec('ROLLBACK'); } catch (e) { /* already closed */ }
    throw err;
  }
}

function nil(value) {
  return value === undefined || value === '' ? null : value;
}

function flag(value) {
  return value ? 1 : 0;
}

function nowISO() {
  return new Date().toISOString();
}

function rank(status) {
  return { Draft: 0, Submitted: 1, Approved: 2, Rejected: 2 }[status] || 0;
}

function mergeTimeline(a, b) {
  const map = new Map();
  for (const event of [...(a || []), ...(b || [])]) {
    if (!event || !event.ts) continue;
    const note = event.note || '';
    map.set([event.ts, event.status, note].join('|'), { ts: event.ts, status: event.status, note });
  }
  return [...map.values()].sort((x, y) => String(x.ts).localeCompare(String(y.ts)));
}

function mergeApp(prev, next) {
  if (!prev) return next;
  const out = Object.assign({}, prev, next);
  out.kyc = next.kyc && Object.keys(next.kyc).length ? next.kyc : prev.kyc;
  out.createdAt = prev.createdAt || next.createdAt;
  out.step = Math.max(prev.step || 0, next.step || 0);
  if (!next.ref && prev.ref) out.ref = prev.ref;
  if (!next.submittedAt && prev.submittedAt) out.submittedAt = prev.submittedAt;
  if (!next.consents && prev.consents) out.consents = prev.consents;
  if (prev.qc && next.reapply) {
    out.appStatus = 'Draft';
    out.qc = null;
  } else if (next.appStatus === 'Submitted' && prev.appStatus === 'Rejected' && next.submittedAt && String(next.submittedAt) > String((prev.qc && prev.qc.at) || '')) {
    out.appStatus = 'Submitted';
    out.qc = null;
  } else {
    if (prev.qc && (!next.qc || String(next.qc.at || '') < String(prev.qc.at || ''))) out.qc = prev.qc;
    if (rank(prev.appStatus) > rank(out.appStatus)) out.appStatus = prev.appStatus;
  }
  if (prev.agreement && prev.agreement.signedAt && !(next.agreement && next.agreement.signedAt)) out.agreement = prev.agreement;
  out.timeline = mergeTimeline(prev.timeline, next.timeline);
  return out;
}

function quoteIdent(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Unexpected table name');
  return '"' + name + '"';
}

function refreshLookups() {
  const insert = (sql, rows) => {
    const stmt = db.prepare(sql);
    rows.forEach((row) => stmt.run(...row));
  };
  insert('INSERT OR IGNORE INTO entity_types (code, pan_fourth_char) VALUES (?, ?)', [
    ['Individual', 'P'], ['Proprietor', 'P'], ['Partnership', 'F'], ['Company', 'C'],
  ]);
  insert('INSERT OR IGNORE INTO application_statuses (name) VALUES (?)', [
    ['Draft'], ['Submitted'], ['Approved'], ['Rejected'],
  ]);
  insert('INSERT OR IGNORE INTO products (name) VALUES (?)', [
    ['Loan against mutual funds'], ['Loan against securities'],
  ]);
  insert('INSERT OR IGNORE INTO lead_statuses (name) VALUES (?)', [
    ['Not started'], ['In progress'], ['Sanctioned'], ['Disbursed'], ['Rejected'],
  ]);
  insert('INSERT OR IGNORE INTO document_kinds (code, label, entity_type, required) VALUES (?, ?, ?, ?)', [
    ['cheque', 'Cancelled cheque', null, 0],
    ['udyam', 'Udyam / Shop & Establishment certificate', 'Proprietor', 0],
    ['deed', 'Partnership deed', 'Partnership', 1],
    ['coi', 'Certificate of Incorporation (COI)', 'Company', 1],
  ]);
  insert('INSERT OR IGNORE INTO reject_reasons (reason) VALUES (?)', [
    ['PAN details mismatch'],
    ['Aadhaar / address mismatch'],
    ['Bank account could not be verified'],
    ['Incomplete or invalid documents'],
    ['Compliance / negative-list concern'],
    ['Other'],
  ]);
}

function refreshDictionary() {
  db.exec('DELETE FROM data_dictionary');
  const stmt = db.prepare(`INSERT INTO data_dictionary
    (sort_order, page, section, field_key, label, data_type, required, storage_table, storage_column, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  dictionary.forEach((row, index) => stmt.run(
    index, row.page, row.section, row.field, row.label, row.type, row.required, row.table, row.column, row.notes
  ));
}

function clearChildren(id) {
  for (const table of CHILD_TABLES) db.prepare(`DELETE FROM ${table} WHERE application_id = ?`).run(id);
}

function fileOf(file) {
  if (!file || !file.name) return null;
  return { name: file.name, size: Number(file.size) || 0, data: file.data || null };
}

function writeApplication(app, source) {
  const kyc = app.kyc || {};
  const createdAt = app.createdAt || app.submittedAt || nowISO();
  db.prepare(`INSERT INTO applications (
      id, ref, source, name, mobile, email, entity, dob, pan, profession, profession_detail, app_status, gst_registered, address, step,
      mobile_ok, email_ok, created_at, submitted_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ref = excluded.ref, source = excluded.source, name = excluded.name, mobile = excluded.mobile,
      email = excluded.email, entity = excluded.entity, dob = excluded.dob, pan = excluded.pan, profession = excluded.profession,
      profession_detail = excluded.profession_detail,
      app_status = excluded.app_status, gst_registered = excluded.gst_registered, address = excluded.address,
      step = excluded.step, mobile_ok = excluded.mobile_ok, email_ok = excluded.email_ok,
      created_at = excluded.created_at, submitted_at = excluded.submitted_at, updated_at = excluded.updated_at
  `).run(
    app.id, nil(app.ref), source, app.name || '', app.mobile, app.email || '', app.entity || 'Individual',
    app.dob || '', app.pan || '', app.profession || '', app.professionDetail || '', app.appStatus || 'Draft', flag(app.gstRegistered), app.address || '',
    Number(app.step) || 0, flag(kyc.mobileOk), flag(kyc.emailOk), createdAt, nil(app.submittedAt), nowISO()
  );

  clearChildren(app.id);

  const pan = kyc.pan || {};
  if (pan.status || pan.name) {
    db.prepare(`INSERT INTO pan_verifications (application_id, ok, holder_name, dob, holder_type, status, verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(app.id, flag(pan.ok), nil(pan.name), nil(pan.dob), nil(pan.type), nil(pan.status), nil(pan.at));
  }

  const ad = kyc.aadhaar || {};
  if (ad.name || ad.masked) {
    const addr = ad.address || {};
    db.prepare(`INSERT INTO aadhaar_kyc (
        application_id, ok, verified_at, full_name, is_signatory, dob, gender, masked_number, photo, provider_request_id,
        house, street, landmark, city, district, state, pin, country
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      app.id, flag(ad.ok), nil(ad.at), nil(ad.name), flag(ad.signatory), nil(ad.dob), nil(ad.gender), nil(ad.masked), nil(ad.photo), nil(ad.providerRequestId),
      nil(addr.house), nil(addr.street), nil(addr.landmark), nil(addr.city), nil(addr.district), nil(addr.state), nil(addr.pin), nil(addr.country)
    );
  }

  const decl = kyc.decl || {};
  if (decl.at || decl.fatca || decl.pep) {
    db.prepare('INSERT INTO declarations (application_id, fatca, pep, declared_at) VALUES (?, ?, ?, ?)').run(
      app.id, flag(decl.fatca), flag(decl.pep), nil(decl.at)
    );
  }

  const bank = kyc.bank || {};
  if (bank.acc || bank.ifsc) {
    db.prepare(`INSERT INTO bank_accounts (
        application_id, ok, mode, method, account_type, account_holder, account_masked, ifsc, bank_name, branch,
        beneficiary, name_match, verified_at, provider_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      app.id, flag(bank.ok), nil(bank.mode), nil(bank.method), nil(bank.type), nil(bank.holder), nil(bank.acc),
      nil(bank.ifsc), nil(bank.bank), nil(bank.branch), nil(bank.beneficiary),
      bank.nameMatch == null || bank.nameMatch === '' ? null : Number(bank.nameMatch), nil(bank.at), nil(bank.providerId)
    );
  }

  const gst = kyc.gst || {};
  if (gst.gstin || gst.skipped || gst.legalName) {
    db.prepare(`INSERT INTO gst_details (application_id, ok, skipped, gstin, legal_name, status, jurisdiction)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(app.id, flag(gst.ok), flag(gst.skipped), nil(gst.gstin), nil(gst.legalName), nil(gst.status), nil(gst.state));
  }

  const insertDoc = db.prepare(`INSERT INTO documents (application_id, kind, file_name, byte_size, data_url) VALUES (?, ?, ?, ?, ?)`);
  const cheque = fileOf(bank.cheque);
  if (cheque) insertDoc.run(app.id, 'cheque', cheque.name, cheque.size, cheque.data);
  Object.entries(kyc.docs || {}).forEach(([kind, doc]) => {
    const stored = fileOf(doc);
    if (stored) insertDoc.run(app.id, kind, stored.name, stored.size, stored.data);
  });

  const consents = app.consents || {};
  if (consents.at || consents.declaration || consents.terms) {
    db.prepare('INSERT INTO consents (application_id, declaration, terms, consented_at) VALUES (?, ?, ?, ?)').run(
      app.id, flag(consents.declaration), flag(consents.terms), nil(consents.at)
    );
  }

  const insertEvent = db.prepare('INSERT INTO timeline_events (application_id, event_at, status, note) VALUES (?, ?, ?, ?)');
  (app.timeline || []).forEach((event) => {
    if (event && event.ts && event.status) insertEvent.run(app.id, event.ts, event.status, event.note || '');
  });

  const qc = app.qc;
  if (qc && qc.decision) {
    const sent = qc.eAgreement || {};
    const to = Array.isArray(sent.to) ? sent.to : [];
    db.prepare(`INSERT INTO qc_decisions (
        application_id, decision, decided_by, decided_at, reason, remarks, eagreement_sent_at, sent_to_email, sent_to_mobile
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      app.id, qc.decision, qc.by || 'QC Approver', qc.at || nowISO(), nil(qc.reason), nil(qc.remarks),
      nil(sent.sentAt), nil(to[0]), nil(to[1])
    );
    const commercials = qc.commercials || {};
    const insertRate = db.prepare('INSERT INTO interest_share_rules (application_id, sort_order, rate_from, rate_to, partner_share) VALUES (?, ?, ?, ?, ?)');
    (commercials.interest || []).forEach((rule, index) => insertRate.run(app.id, index, Number(rule.from), Number(rule.to), Number(rule.then)));
    const insertFee = db.prepare('INSERT INTO proc_fee_rules (application_id, sort_order, basis, operator, loan_amount, share_amount) VALUES (?, ?, ?, ?, ?, ?)');
    (commercials.procFee || []).forEach((rule, index) => insertFee.run(app.id, index, 'Loan amount', rule.op, Number(rule.amount), Number(rule.share)));
    const validity = commercials.validity;
    if ((validity && (validity.until || validity.months)) || commercials.payout != null) {
      db.prepare('INSERT INTO agreement_terms (application_id, valid_months, valid_until, payout_percent) VALUES (?, ?, ?, ?)').run(
        app.id,
        validity && !validity.until && validity.months ? Number(validity.months) : null,
        validity ? nil(validity.until) : null,
        commercials.payout != null ? Number(commercials.payout) : null
      );
    }
  }

  const agreement = app.agreement;
  if (agreement && (agreement.signedAt || agreement.agentCode)) {
    db.prepare('INSERT INTO agreements (application_id, signed_at, doc_id, agent_code, temp_password) VALUES (?, ?, ?, ?, ?)').run(
      app.id, nil(agreement.signedAt), nil(agreement.docId), nil(agreement.agentCode), nil(agreement.tempPassword)
    );
  }

  syncPartner(app);
}

function syncPartner(app) {
  const agreement = app.agreement;
  if (!agreement || !agreement.signedAt || !agreement.agentCode) return;
  const demo = agreement.agentCode === DEMO_AGENT ? 1 : 0;
  db.prepare(`INSERT INTO partners (agent_code, application_id, name, mobile, email, pan, entity, is_demo, temp_password)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent_code) DO UPDATE SET
      application_id = excluded.application_id,
      name = excluded.name,
      mobile = excluded.mobile,
      email = excluded.email,
      pan = excluded.pan,
      entity = excluded.entity,
      temp_password = excluded.temp_password,
      is_demo = MAX(partners.is_demo, excluded.is_demo)
  `).run(
    agreement.agentCode, app.id, app.name || agreement.agentCode, app.mobile || '', app.email || '', app.pan || '',
    app.entity || 'Individual', demo, agreement.tempPassword || 'Welcome@123'
  );
}

function findExisting(app, source) {
  if (app.id) {
    const byId = db.prepare('SELECT * FROM applications WHERE id = ?').get(app.id);
    if (byId) return byId;
  }
  if (source === 'onboarding' && app.mobile) {
    return db.prepare("SELECT * FROM applications WHERE source = 'onboarding' AND mobile = ?").get(app.mobile) || null;
  }
  return null;
}

function upsertApplication(next, source) {
  if (!next || !next.mobile) return;
  const existing = findExisting(next, source);
  const prev = existing ? rowToApp(existing) : null;
  const merged = mergeApp(prev, next);
  if (existing) merged.id = existing.id;
  if (!merged.id) merged.id = next.id;
  writeApplication(merged, existing ? existing.source : source);
}

function rowToApp(row) {
  const id = row.id;
  const pan = db.prepare('SELECT * FROM pan_verifications WHERE application_id = ?').get(id);
  const ad = db.prepare('SELECT * FROM aadhaar_kyc WHERE application_id = ?').get(id);
  const decl = db.prepare('SELECT * FROM declarations WHERE application_id = ?').get(id);
  const bank = db.prepare('SELECT * FROM bank_accounts WHERE application_id = ?').get(id);
  const gst = db.prepare('SELECT * FROM gst_details WHERE application_id = ?').get(id);
  const docs = db.prepare('SELECT * FROM documents WHERE application_id = ?').all(id);
  const consents = db.prepare('SELECT * FROM consents WHERE application_id = ?').get(id);
  const timeline = db.prepare('SELECT * FROM timeline_events WHERE application_id = ? ORDER BY event_at, id').all(id);
  const qcRow = db.prepare('SELECT * FROM qc_decisions WHERE application_id = ?').get(id);
  const rates = db.prepare('SELECT * FROM interest_share_rules WHERE application_id = ? ORDER BY sort_order, id').all(id);
  const fees = db.prepare('SELECT * FROM proc_fee_rules WHERE application_id = ? ORDER BY sort_order, id').all(id);
  const terms = db.prepare('SELECT * FROM agreement_terms WHERE application_id = ?').get(id);
  const agreement = db.prepare('SELECT * FROM agreements WHERE application_id = ?').get(id);

  const docMap = {};
  let cheque = null;
  docs.forEach((doc) => {
    const file = { name: doc.file_name, size: doc.byte_size };
    if (doc.data_url) file.data = doc.data_url;
    if (doc.kind === 'cheque') cheque = file;
    else docMap[doc.kind] = file;
  });

  const kyc = {
    mobileOk: !!row.mobile_ok,
    emailOk: !!row.email_ok,
    pan: pan ? { ok: !!pan.ok, name: pan.holder_name, dob: pan.dob, type: pan.holder_type, status: pan.status, at: pan.verified_at } : {},
    aadhaar: ad ? {
      ok: !!ad.ok, at: ad.verified_at, name: ad.full_name, signatory: !!ad.is_signatory, dob: ad.dob, gender: ad.gender,
      masked: ad.masked_number, photo: ad.photo || undefined, providerRequestId: ad.provider_request_id || undefined,
      address: { house: ad.house, street: ad.street, landmark: ad.landmark, city: ad.city, district: ad.district, state: ad.state, pin: ad.pin, country: ad.country },
    } : {},
    decl: decl ? { fatca: !!decl.fatca, pep: !!decl.pep, at: decl.declared_at } : {},
    bank: bank ? {
      ok: !!bank.ok, mode: bank.mode, method: bank.method, type: bank.account_type, holder: bank.account_holder,
      acc: bank.account_masked, ifsc: bank.ifsc, bank: bank.bank_name, branch: bank.branch, beneficiary: bank.beneficiary,
      nameMatch: bank.name_match == null ? undefined : bank.name_match, at: bank.verified_at, providerId: bank.provider_id || undefined, cheque,
    } : {},
    gst: gst ? { ok: !!gst.ok, skipped: !!gst.skipped, gstin: gst.gstin, legalName: gst.legal_name, status: gst.status, state: gst.jurisdiction } : {},
    docs: docMap,
  };

  const app = {
    id: row.id,
    ref: row.ref,
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    entity: row.entity,
    profession: row.profession || '',
    professionDetail: row.profession_detail || '',
    dob: row.dob,
    pan: row.pan,
    appStatus: row.app_status,
    gstRegistered: !!row.gst_registered,
    address: row.address || '',
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    step: row.step,
    timeline: timeline.map((event) => {
      const item = { ts: event.event_at, status: event.status };
      if (event.note) item.note = event.note;
      return item;
    }),
    kyc,
  };
  if (consents) app.consents = { declaration: !!consents.declaration, terms: !!consents.terms, at: consents.consented_at };

  if (qcRow) {
    const qc = { decision: qcRow.decision, by: qcRow.decided_by, at: qcRow.decided_at };
    if (qcRow.reason) qc.reason = qcRow.reason;
    if (qcRow.remarks) qc.remarks = qcRow.remarks;
    if (qcRow.eagreement_sent_at) {
      qc.eAgreement = { sentAt: qcRow.eagreement_sent_at };
      const to = [qcRow.sent_to_email, qcRow.sent_to_mobile].filter(Boolean);
      if (to.length) qc.eAgreement.to = to;
    }
    if (rates.length || fees.length || terms) {
      qc.commercials = {
        interest: rates.length ? rates.map((rule) => ({ from: rule.rate_from, to: rule.rate_to, then: rule.partner_share })) : null,
        procFee: fees.length ? fees.map((rule) => ({ op: rule.operator, amount: rule.loan_amount, share: rule.share_amount })) : null,
      };
      if (terms && terms.valid_until) qc.commercials.validity = { until: terms.valid_until };
      else if (terms && terms.valid_months) qc.commercials.validity = { months: terms.valid_months };
      if (terms && terms.payout_percent != null) qc.commercials.payout = terms.payout_percent;
    }
    app.qc = qc;
  }

  if (agreement && (agreement.signed_at || agreement.agent_code)) {
    app.agreement = { signedAt: agreement.signed_at, docId: agreement.doc_id, agentCode: agreement.agent_code };
    if (agreement.temp_password) app.agreement.tempPassword = agreement.temp_password;
  }
  return app;
}

function readNotifications() {
  return db.prepare('SELECT * FROM notifications ORDER BY created_at DESC, id DESC').all().map((row) => ({
    id: row.id, ts: row.created_at, ch: row.channel, msg: row.message,
  }));
}

function saveNotifications(list) {
  const stmt = db.prepare(`INSERT INTO notifications (id, application_id, channel, message, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      application_id = COALESCE(excluded.application_id, notifications.application_id),
      channel = excluded.channel,
      message = excluded.message,
      created_at = excluded.created_at`);
  (list || []).forEach((note) => {
    if (!note || !note.id || !note.msg) return;
    stmt.run(String(note.id), note.applicationId || null, note.ch || 'SMS · Email', note.msg, note.ts || nowISO());
  });
}

function saveSession(app, view, subject) {
  db.prepare(`INSERT INTO app_sessions (app, view, subject) VALUES (?, ?, ?)
    ON CONFLICT(app) DO UPDATE SET view = excluded.view, subject = excluded.subject`).run(app, view, subject || null);
}

function getOnboardingState() {
  const session = db.prepare("SELECT * FROM app_sessions WHERE app = 'onboarding'").get();
  const journeys = {};
  db.prepare("SELECT * FROM applications WHERE source = 'onboarding' ORDER BY created_at").all().forEach((row) => {
    const app = rowToApp(row);
    journeys[app.mobile] = app;
  });
  const view = session && session.view === 'apply' ? 'apply' : 'landing';
  const app = view === 'apply' && session && session.subject ? journeys[session.subject] || null : null;
  return { v: 2, view, app, journeys, notifications: readNotifications() };
}

function saveOnboardingState(body) {
  if (!body || typeof body !== 'object') throw bad('Expected the onboarding record.');
  tx(() => {
    const journeys = body.journeys && typeof body.journeys === 'object' ? body.journeys : {};
    Object.values(journeys).forEach((app) => upsertApplication(app, 'onboarding'));
    if (body.app && body.app.mobile && !journeys[body.app.mobile]) upsertApplication(body.app, 'onboarding');
    saveNotifications(body.notifications);
    const view = body.view === 'apply' ? 'apply' : 'landing';
    const subject = view === 'apply' && body.app && body.app.mobile ? body.app.mobile : null;
    saveSession('onboarding', view, subject);
  });
  return getOnboardingState();
}

function getApproverState() {
  const apps = db.prepare(`SELECT * FROM applications
    WHERE app_status != 'Draft' AND ref IS NOT NULL
    ORDER BY submitted_at DESC`).all().map((row) => Object.assign(rowToApp(row), { live: row.source === 'onboarding' }));
  return { v: 1, apps };
}

function applyDecision(id, qc) {
  if (!id) throw bad('Choose an application.');
  if (!qc || (qc.decision !== 'Approved' && qc.decision !== 'Rejected')) throw bad('Decision must be Approved or Rejected.');
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  if (!row) throw bad('Application not found.', 404);
  tx(() => {
    const app = rowToApp(row);
    app.appStatus = qc.decision;
    app.qc = qc;
    app.timeline = (app.timeline || []).concat([{ ts: qc.at || nowISO(), status: qc.decision, note: [qc.reason, qc.remarks].filter(Boolean).join('. ') }]);
    writeApplication(app, row.source);
    const message = qc.decision === 'Approved'
      ? `Your application ${app.ref} is approved. Your partner e-agreement has been sent to ${app.email} for e-signing.`
      : `Your application ${app.ref} was not approved. Reason: ${qc.reason}.`;
    saveNotifications([{ id: 'N' + Date.now(), ts: qc.at || nowISO(), ch: 'SMS · Email', msg: message, applicationId: app.id }]);
  });
  return getApproverState();
}

function resetSamples() {
  tx(() => {
    db.prepare("DELETE FROM applications WHERE source = 'sample'").run();
    buildSampleApps().forEach((app) => writeApplication(app, 'sample'));
    seedDemoLeads();
  });
  return getApproverState();
}

function seedSamplesIfEmpty() {
  const row = db.prepare("SELECT COUNT(*) AS n FROM applications WHERE source = 'sample'").get();
  if (row.n > 0) return;
  buildSampleApps().forEach((app) => writeApplication(app, 'sample'));
}

function seedDemoLeads() {
  const partner = db.prepare('SELECT agent_code FROM partners WHERE agent_code = ?').get(DEMO_AGENT);
  if (!partner) return;
  const existing = db.prepare('SELECT COUNT(*) AS n FROM leads WHERE agent_code = ?').get(DEMO_AGENT);
  if (existing.n > 0) return;
  const stmt = db.prepare(`INSERT INTO leads (id, agent_code, name, mobile, pan, email, product, status, disbursed_amount, created_at, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  DEMO_LEADS.forEach((lead, index) => stmt.run(
    lead.id, DEMO_AGENT, lead.name, lead.mobile, lead.pan, lead.email || '', lead.product, lead.status,
    lead.disbursed == null ? null : lead.disbursed, lead.createdAt, index
  ));
}

function mapLead(row) {
  const lead = {
    id: row.id, name: row.name, mobile: row.mobile, pan: row.pan, email: row.email || '',
    product: row.product, status: row.status, createdAt: row.created_at,
  };
  if (row.disbursed_amount != null) lead.disbursed = row.disbursed_amount;
  return lead;
}

function getAgentState() {
  const session = db.prepare("SELECT * FROM app_sessions WHERE app = 'agent'").get();
  const partners = db.prepare('SELECT * FROM partners ORDER BY is_demo DESC, agent_code').all().map((row) => ({
    agentCode: row.agent_code, name: row.name, mobile: row.mobile, email: row.email, pan: row.pan,
    entity: row.entity, demo: !!row.is_demo, tempPassword: row.temp_password,
  }));
  const creds = {};
  db.prepare('SELECT * FROM agent_credentials').all().forEach((row) => {
    creds[row.agent_code] = { hash: row.password_hash, setAt: row.set_at, lastLogin: row.last_login };
  });
  const leads = {};
  partners.forEach((partner) => { leads[partner.agentCode] = []; });
  db.prepare('SELECT * FROM leads ORDER BY sort_order, created_at').all().forEach((row) => {
    if (!leads[row.agent_code]) leads[row.agent_code] = [];
    leads[row.agent_code].push(mapLead(row));
  });
  return { v: 3, session: session && session.subject ? session.subject : null, creds, leads, partners };
}

function saveAgentState(body) {
  if (!body || typeof body !== 'object') throw bad('Expected the agent portal record.');
  tx(() => {
    saveSession('agent', 'portal', body.session || null);
    const credStmt = db.prepare(`INSERT INTO agent_credentials (agent_code, password_hash, set_at, last_login)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(agent_code) DO UPDATE SET
        password_hash = excluded.password_hash,
        set_at = excluded.set_at,
        last_login = excluded.last_login`);
    Object.entries(body.creds || {}).forEach(([code, cred]) => {
      if (!cred || !cred.hash) return;
      const partner = db.prepare('SELECT agent_code FROM partners WHERE agent_code = ?').get(code);
      if (!partner) return;
      const prev = db.prepare('SELECT set_at FROM agent_credentials WHERE agent_code = ?').get(code);
      if (prev && cred.setAt && String(prev.set_at) > String(cred.setAt)) return;
      credStmt.run(code, cred.hash, cred.setAt || nowISO(), cred.lastLogin || null);
    });
    const leadStmt = db.prepare(`INSERT INTO leads (id, agent_code, name, mobile, pan, email, product, status, disbursed_amount, created_at, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        agent_code = excluded.agent_code, name = excluded.name, mobile = excluded.mobile, pan = excluded.pan,
        email = excluded.email, product = excluded.product, status = excluded.status,
        disbursed_amount = excluded.disbursed_amount, created_at = excluded.created_at, sort_order = excluded.sort_order`);
    Object.entries(body.leads || {}).forEach(([code, list]) => {
      const partner = db.prepare('SELECT agent_code FROM partners WHERE agent_code = ?').get(code);
      if (!partner || !Array.isArray(list)) return;
      list.forEach((lead, index) => {
        if (!lead || !lead.id) return;
        leadStmt.run(
          lead.id, code, lead.name || '', lead.mobile || '', lead.pan || '', lead.email || '',
          lead.product, lead.status || 'Not started', lead.disbursed == null ? null : Number(lead.disbursed),
          lead.createdAt || nowISO(), index
        );
      });
    });
  });
  return getAgentState();
}

function describe() {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const tables = names.map(({ name }) => {
    const ident = quoteIdent(name);
    return {
      name,
      rows: db.prepare(`SELECT COUNT(*) AS n FROM ${ident}`).get().n,
      columns: db.prepare(`PRAGMA table_info(${ident})`).all().map((col) => ({
        name: col.name, type: col.type || 'TEXT', pk: !!col.pk, required: !!col.notnull,
      })),
      foreignKeys: db.prepare(`PRAGMA foreign_key_list(${ident})`).all().map((fk) => ({
        from: fk.from, table: fk.table, to: fk.to, onDelete: fk.on_delete,
      })),
    };
  });
  return {
    file,
    tables,
    dictionary: db.prepare('SELECT page, section, field_key, label, data_type, required, storage_table, storage_column, notes FROM data_dictionary ORDER BY sort_order').all(),
  };
}

function init() {
  if (db) return db;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(fs.readFileSync(schemaFile, 'utf8'));
  const appCols = db.prepare('PRAGMA table_info(applications)').all();
  if (!appCols.some((col) => col.name === 'profession')) db.exec("ALTER TABLE applications ADD COLUMN profession TEXT NOT NULL DEFAULT ''");
  if (!appCols.some((col) => col.name === 'profession_detail')) db.exec("ALTER TABLE applications ADD COLUMN profession_detail TEXT NOT NULL DEFAULT ''");
  const aadhaarCols = db.prepare('PRAGMA table_info(aadhaar_kyc)').all();
  if (aadhaarCols.length && !aadhaarCols.some((col) => col.name === 'provider_request_id')) db.exec('ALTER TABLE aadhaar_kyc ADD COLUMN provider_request_id TEXT');
  const bankCols = db.prepare('PRAGMA table_info(bank_accounts)').all();
  if (bankCols.length && !bankCols.some((col) => col.name === 'provider_id')) db.exec('ALTER TABLE bank_accounts ADD COLUMN provider_id TEXT');
  const termCols = db.prepare('PRAGMA table_info(agreement_terms)').all();
  if (termCols.length && !termCols.some((col) => col.name === 'payout_percent')) db.exec('ALTER TABLE agreement_terms ADD COLUMN payout_percent REAL');
  tx(() => {
    db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(nowISO());
    refreshLookups();
    refreshDictionary();
    seedSamplesIfEmpty();
    seedDemoLeads();
  });
  return db;
}

module.exports = {
  file,
  init,
  getOnboardingState,
  saveOnboardingState,
  getApproverState,
  applyDecision,
  resetSamples,
  getAgentState,
  saveAgentState,
  describe,
};
