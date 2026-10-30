/* LAMF partner programme: approver panel (QC approval of submitted partner applications). */
(async function () {
  const KEY = 'lamf-approver-v4';
  const ONBOARDING_KEY = 'lamf-partner-onboarding-v7'; // live application submitted from the onboarding app (same origin)
  const APPROVER = 'QC Approver';
  const nowISO = () => new Date().toISOString();
  const d = (s) => new Date(s).toISOString();

  const REJECT_REASONS = ['PAN details mismatch', 'Aadhaar / address mismatch', 'Bank account could not be verified', 'Incomplete or invalid documents', 'Compliance / negative-list concern', 'Other'];

  /* ---------- sample applications (same shape as the onboarding app) ---------- */
  function sample(o) {
    const person = o.entity === 'Individual' || o.entity === 'Proprietor';
    return {
      id: o.id, ref: o.ref, name: o.name, mobile: o.mobile, email: o.email, entity: o.entity, dob: o.dob, pan: o.pan,
      appStatus: o.status || 'Submitted', submittedAt: d(o.at), gstRegistered: !!o.gstin, address: '', timeline: [{ ts: d(o.at), status: 'Submitted' }],
      kyc: {
        mobileOk: true, emailOk: true,
        pan: { ok: true, name: o.name.toUpperCase(), dob: o.dob, type: person ? 'Individual' : o.entity === 'Company' ? 'Company' : 'Firm', status: 'Valid – Existing & Active', at: d(o.at) },
        aadhaar: { ok: true, at: d(o.at), name: o.aadhaarName || o.name, signatory: !person, dob: o.aadhaarDob || o.dob, gender: o.gender || 'Male', masked: 'XXXX XXXX ' + o.a4, address: Object.assign({ country: 'India' }, o.addr) },
        decl: { fatca: true, pep: true, at: d(o.at) },
        bank: Object.assign({ ok: true, mode: 'upi', method: 'UPI ₹1 verification', type: 'Savings', beneficiary: (o.bankName || o.name).toUpperCase(), nameMatch: o.bankMatch || 100, cheque: null }, o.bank),
        gst: o.gstin ? { ok: true, gstin: o.gstin, legalName: o.name.toUpperCase(), status: 'Active', state: 'State code ' + o.gstin.slice(0, 2) } : { ok: true, skipped: true },
        docs: o.docs || {},
      },
      qc: o.qc || null, agreement: o.agreement || null,
    };
  }
  const A = {
    chennai: { house: 'No. 27, Ground Floor', street: 'Ranganathan Street, T. Nagar', landmark: 'Opposite Panagal Park', city: 'Chennai', district: 'Chennai', state: 'Tamil Nadu', pin: '600017' },
    blr: { house: 'Flat 4B, Sai Krupa Apartments', street: '12th Cross Road, Indiranagar', landmark: 'Near Indiranagar Metro Station', city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pin: '560038' },
    mum: { house: 'B-302, Shanti Niketan CHS', street: 'S.V. Road, Andheri West', landmark: 'Near Andheri Railway Station', city: 'Mumbai', district: 'Mumbai Suburban', state: 'Maharashtra', pin: '400058' },
    hyd: { house: 'H.No. 8-2-293/82', street: 'Road No. 10, Jubilee Hills', landmark: 'Behind Apollo Hospital', city: 'Hyderabad', district: 'Hyderabad', state: 'Telangana', pin: '500033' },
    cbe: { house: '45/2, Lakshmi Nivas', street: 'Race Course Road, Gopalapuram', landmark: 'Near Race Course', city: 'Coimbatore', district: 'Coimbatore', state: 'Tamil Nadu', pin: '641018' },
  };
  function seed() {
    return {
      v: 1,
      apps: [
        sample({ id: 'S1', ref: 'SCL-LD-20261020-000001', name: 'Meera Krishnan', mobile: '9840011223', email: 'meera.k@example.com', entity: 'Individual', dob: '1988-03-14', pan: 'BKMPK2231F', gender: 'Female', a4: '4821', addr: A.chennai, at: '2026-10-20T10:15:00', bank: { acc: 'XXXXXXXX4521', ifsc: 'HDFC0001234', bank: 'HDFC Bank', branch: 'T Nagar' } }),
        sample({ id: 'S2', ref: 'SCL-LD-20261020-000002', name: 'Arjun Mehta', mobile: '9820033445', email: 'arjun.mehta@example.com', entity: 'Proprietor', dob: '1984-11-02', pan: 'CDMPM7781K', a4: '3390', addr: A.mum, at: '2026-10-20T09:02:00', gstin: '27CDMPM7781K1Z2', bank: { mode: 'manual', method: 'Penny drop ₹1', acc: 'XXXXXXXX7710', ifsc: 'ICIC0002211', bank: 'ICICI Bank', branch: 'Andheri West', type: 'Current' }, docs: { udyam: { name: 'udyam_certificate.pdf', size: 182344 } } }),
        sample({ id: 'S3', ref: 'SCL-LD-20261019-000001', name: 'Kaveri Wealth Partners', mobile: '9445045678', email: 'kaveri.wp@example.com', entity: 'Partnership', dob: '2016-04-01', pan: 'AAKFK5521L', aadhaarName: 'Rahul Sharma', aadhaarDob: '1979-06-21', a4: '2045', addr: A.cbe, at: '2026-10-19T17:40:00', gstin: '33AAKFK5521L1Z8', bankName: 'K Karthikeyan', bankMatch: 40, bank: { mode: 'manual', method: 'Penny drop ₹1 + cancelled cheque', acc: 'XXXXXXXX0000', ifsc: 'CNRB0001122', bank: 'Canara Bank', branch: 'Gopalapuram', type: 'Current', cheque: { name: 'cancelled_cheque.jpg', size: 204811 } }, docs: { deed: { name: 'partnership_deed.pdf', size: 402211 } } }),
        sample({ id: 'S4', ref: 'SCL-LD-20261019-000002', name: 'Nimbus Finserv Pvt Ltd', mobile: '9000011122', email: 'ops@nimbusfinserv.example', entity: 'Company', dob: '2018-07-01', pan: 'AAHCN4410Q', aadhaarName: 'Vikram Rao', aadhaarDob: '1975-02-09', a4: '5501', addr: A.blr, at: '2026-10-19T12:20:00', gstin: '29AAHCN4410Q1Z4', bank: { mode: 'manual', method: 'Penny drop ₹1', acc: 'XXXXXXXX1199', ifsc: 'UTIB0000987', bank: 'Axis Bank', branch: 'Indiranagar', type: 'Current' }, docs: { coi: { name: 'certificate_of_incorporation.pdf', size: 120440 } } }),
        sample({ id: 'S5', ref: 'SCL-LD-20261018-000001', name: 'Priya Venkatesh', mobile: '9600034567', email: 'priya.v@example.com', entity: 'Individual', dob: '1991-08-09', pan: 'DEFPV2468M', gender: 'Female', a4: '6612', addr: A.cbe, at: '2026-10-18T15:05:00', bank: { acc: 'XXXXXXXX3307', ifsc: 'HDFC0001234', bank: 'HDFC Bank', branch: 'Main Branch' },
          status: 'Approved', qc: { decision: 'Approved', by: APPROVER, at: d('2026-10-19T11:30:00'), eAgreement: { sentAt: d('2026-10-19T11:30:00') }, commercials: { interest: [{ from: 9, to: 10, then: 0.5 }, { from: 10, to: 12, then: 0.75 }], procFee: [{ op: '<', amount: 500000, share: 300 }, { op: '>=', amount: 500000, share: 500 }] } },
          agreement: { signedAt: d('2026-10-19T15:05:00'), docId: 'ESG48210377', agentCode: 'SCL-AG-000001' } }),
        sample({ id: 'S6', ref: 'SCL-LD-20261018-000002', name: 'Suresh Kumar', mobile: '9884055566', email: 'suresh.kumar@example.com', entity: 'Individual', dob: '1986-12-30', pan: 'FGHPK9753P', a4: '7756', addr: A.hyd, at: '2026-10-18T10:45:00', bank: { mode: 'manual', method: 'Penny drop ₹1', acc: 'XXXXXXXX6620', ifsc: 'KKBK0007788', bank: 'Kotak Mahindra Bank', branch: 'Jubilee Hills' },
          status: 'Approved', qc: { decision: 'Approved', by: APPROVER, at: d('2026-10-18T16:10:00'), eAgreement: { sentAt: d('2026-10-18T16:10:00') }, commercials: { interest: null, procFee: [{ op: '>=', amount: 100000, share: 250 }] } } }),
        sample({ id: 'S7', ref: 'SCL-LD-20261017-000001', name: 'Ganesh & Co', mobile: '9176056789', email: 'ganesh.co@example.com', entity: 'Partnership', dob: '2012-01-15', pan: 'AAGFG3301H', aadhaarName: 'Suresh Kumar', aadhaarDob: '1970-05-05', a4: '1187', addr: A.chennai, at: '2026-10-17T14:00:00', bank: { acc: 'XXXXXXXX9033', ifsc: 'SBIN0004455', bank: 'State Bank of India', branch: 'T Nagar' }, docs: { deed: { name: 'deed_scan_partial.pdf', size: 88000 } },
          status: 'Rejected', qc: { decision: 'Rejected', by: APPROVER, at: d('2026-10-18T12:00:00'), reason: 'Incomplete or invalid documents', remarks: 'Partnership deed is missing pages 3–5 (partner signatures).' } }),
      ],
    };
  }

  /* ---------- store: sample apps and live applications, both in SQLite when served ---------- */
  let state = { v: 1, apps: [] };
  let remote = false;
  const saver = LamfPersist.queued();
  const subs = new Set();
  try {
    remote = await LamfPersist.ping();
    if (remote) state = await LamfPersist.load('/api/approver');
    else {
      try { const raw = localStorage.getItem(KEY); if (raw) state = JSON.parse(raw); } catch (e) { /* storage unavailable */ }
      if (!state || state.v !== 1) state = seed();
    }
  } catch (e) {
    document.getElementById('root').textContent = 'Could not load the application database. Leave this page open from the local server (node serve.js) and refresh.';
    return;
  }
  const emit = () => { state = Object.assign({}, state); subs.forEach((f) => f()); };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };
  const readOnboarding = () => { try { return JSON.parse(localStorage.getItem(ONBOARDING_KEY) || 'null'); } catch (e) { return null; } };
  /* Every submitted journey from the onboarding app (one per mobile number). Used only when the page is opened as a file. */
  function readLive() {
    const o = readOnboarding();
    return o && o.journeys ? Object.values(o.journeys).filter((a) => a.ref && a.appStatus !== 'Draft') : [];
  }
  function adopt(next) {
    if (!next || saver.busy()) return;
    const sameApps = JSON.stringify(state.apps) === JSON.stringify(next.apps);
    const sameLeads = JSON.stringify(state.partnerLeads || []) === JSON.stringify(next.partnerLeads || []);
    if (sameApps && sameLeads) return;
    state = next;
    subs.forEach((f) => f());
  }
  if (remote) LamfPersist.watch('/api/approver', () => saver.busy(), adopt);
  else window.addEventListener('storage', (e) => { if (e.key === ONBOARDING_KEY || e.key === KEY) { if (e.key === KEY && e.newValue) state = JSON.parse(e.newValue); emit(); } });
  window.Store = { get: () => state, subscribe: (f) => { subs.add(f); return () => subs.delete(f); } };

  function allApps() {
    const list = state.apps.slice();
    if (!remote) readLive().forEach((a) => { if (!list.some((x) => x.id === a.id)) list.unshift(Object.assign({}, a, { live: true })); });
    return list.sort((x, y) => (y.submittedAt || '').localeCompare(x.submittedAt || ''));
  }
  /* Records a QC decision. The server writes it onto the same application the applicant is watching. */
  function decide(app, qc) {
    const status = qc.decision;
    const entry = { ts: qc.at, status, note: [qc.reason, qc.remarks].filter(Boolean).join('. ') };
    const applyLocal = (x) => { x.appStatus = status; x.qc = qc; x.timeline = (x.timeline || []).concat(entry); };
    if (remote) {
      const x = state.apps.find((y) => y.id === app.id);
      if (x) applyLocal(x);
      emit();
      saver.run(() => LamfPersist.post('/api/approver/decision', { id: app.id, qc })).then((saved) => adopt(saved)).catch(() => toast('Could not save the decision. Refresh and try again.', 'Database'));
    } else if (app.live) {
      const o = readOnboarding();
      const t = o && o.journeys && o.journeys[app.mobile];
      if (!t) return;
      t.appStatus = status; t.qc = qc; t.timeline = (t.timeline || []).concat(entry);
      if (o.app && o.app.mobile === app.mobile) o.app = t;
      o.notifications = [{ id: 'N' + Date.now(), ts: qc.at, ch: 'SMS · Email', msg: status === 'Approved' ? `Your application ${t.ref} is approved. Your partner e-agreement has been sent to ${t.email} for e-signing.` : `Your application ${t.ref} was not approved. Reason: ${qc.reason}.` }].concat(o.notifications || []);
      try { localStorage.setItem(ONBOARDING_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ }
      emit();
    } else {
      const x = state.apps.find((y) => y.id === app.id);
      applyLocal(x);
      save();
      emit();
    }
    toast(status === 'Approved' ? `E-agreement sent to ${app.name}` : `${app.name} rejected`, 'Decision recorded');
  }

  const { html, useState, useEffect, useStore, fdt, fd } = UI;
  const { Badge, Btn, Card, Input, Select, Text, Modal, Table, KV, Note } = UI;
  const SIGNED = 'E-agreement signed';
  const statusOf = (x) => (x.appStatus === 'Approved' ? (x.agreement && x.agreement.signedAt ? SIGNED : 'Approved') : x.appStatus === 'Rejected' ? 'Rejected' : 'Pending');
  const TONE = { Pending: 'warn', Approved: 'info', [SIGNED]: 'ok', Rejected: 'err' };
  const pct = (n) => (+n).toFixed(2).replace(/\.?0+$/, '') + '%';
  const rule = (r) => pct(r.from) + ' to ' + pct(r.to) + ' → ' + pct(r.then);
  const validityText = (v) => (v.until ? 'till ' + fd(v.until) : (v.months % 12 ? v.months + ' months' : v.months / 12 + (v.months === 12 ? ' year' : ' years')) + ' from the date of signing');
  const commList = (c) => !c ? '' : html`<ul class="comm-list">
    ${c.payout != null && html`<li key="pay">${pct(c.payout)} of the disbursed loan amount</li>`}
    ${(c.interest || []).map((r, i) => html`<li key=${'i' + i}>Interest rate ${rule(r)} partner share</li>`)}
    ${(c.procFee || []).map((r, i) => html`<li key=${'p' + i}>Processing fee: loan amount ${r.op} ${UI.inr(r.amount)} → ${UI.inr(r.share)} partner share</li>`)}
    ${c.validity && html`<li key="v">Agreement validity: ${validityText(c.validity)}</li>`}
  </ul>`;
  const StatusBadge = ({ x }) => html`<${Badge} tone=${TONE[statusOf(x)]}>${statusOf(x)}<//>`;
  const person = (x) => x.entity === 'Individual' || x.entity === 'Proprietor';
  const entityLabel = (x) => (person(x) ? 'Individual / Proprietor' : x.entity);
  const professionLabel = (x) => {
    const base = x.profession === 'Others' && x.professionDetail ? 'Others — ' + x.professionDetail : (x.profession || '');
    return x.arn ? base + ' · ARN ' + x.arn : base;
  };

  /* ======================= LIST ======================= */
  function QcList({ onOpen }) {
    useStore();
    const [tab, setTab] = useState('Pending');
    const [q, setQ] = useState('');
    const [sort, setSort] = useState('desc');
    const apps = allApps();
    const counts = { All: apps.length, Pending: 0, Approved: 0, [SIGNED]: 0, Rejected: 0 };
    apps.forEach((x) => { counts[statusOf(x)]++; });
    const rows = apps
      .filter((x) => tab === 'All' || statusOf(x) === tab)
      .filter((x) => !q || [x.ref, x.name, x.pan, x.mobile, x.email].join(' ').toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (sort === 'desc' ? -1 : 1) * (a.submittedAt || '').localeCompare(b.submittedAt || ''));
    const sortHead = html`<button class="th-sort" onClick=${(e) => { e.stopPropagation(); setSort(sort === 'desc' ? 'asc' : 'desc'); }} aria-label=${'Sort by submitted date, currently ' + (sort === 'desc' ? 'newest first' : 'oldest first')}>Submitted <span aria-hidden="true">${sort === 'desc' ? '↓' : '↑'}</span></button>`;
    return html`<div class="content-narrow">
      <div class="page-h"><div><h1>QC approval</h1><p>Review submitted partner applications, then approve and send the e-agreement, or reject.</p></div></div>
      <div class="qc-tabs" role="tablist" aria-label="Filter by status">
        ${['All', 'Pending', 'Approved', SIGNED, 'Rejected'].map((t) => html`<button key=${t} role="tab" aria-selected=${tab === t} class=${'qc-tab ' + (t === 'All' ? '' : TONE[t]) + (tab === t ? ' on' : '')} onClick=${() => setTab(t)}>
          <span class="qc-tab-l">${t}</span><span class="qc-tab-n">${counts[t]}</span></button>`)}
      </div>
      <div class="card">
        <div class="row mb">
          <input type="search" placeholder="Search by name, reference, PAN, mobile or email" aria-label="Search applications" value=${q} onInput=${(e) => setQ(e.target.value)} style="flex:1;min-width:220px" />
        </div>
        <${Table} rows=${rows} onRow=${(x) => onOpen(x)} empty=${tab === 'Pending' ? 'No applications waiting for QC.' : 'No applications here.'} cols=${[
          { h: 'Reference', k: 'ref', r: (x) => html`<span class="mono nowrap">${x.ref}</span>${x.live ? html` <${Badge} tone="pri">New<//>` : ''}` },
          { h: 'Applicant', k: 'name', r: (x) => html`<b>${x.name}</b>` },
          { h: 'Entity', k: 'entity' },
          { h: 'PAN', k: 'pan', r: (x) => html`<span class="mono nowrap">${x.pan}</span>` },
          { h: sortHead, k: 'submitted', r: (x) => html`<span class="nowrap">${fd(x.submittedAt)}</span><div class="small muted">${new Date(x.submittedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>` },
          { h: 'Status', k: 'status', r: (x) => html`<${StatusBadge} x=${x} />${x.qc ? html`<div class="small muted">${fd(x.qc.at)}</div>` : ''}` },
          { h: '', k: 'act', r: (x) => html`<${Btn} sm kind=${statusOf(x) === 'Pending' ? 'primary' : ''}>${statusOf(x) === 'Pending' ? 'Review' : 'View'}<//>` },
        ]} />
      </div>
    </div>`;
  }

  /* ======================= DOCUMENT VIEWER ======================= */
  function DocViewer({ title, file, x, onClose }) {
    const isImg = file.data && /^data:image\//.test(file.data);
    const isPdf = file.data && /^data:application\/pdf/.test(file.data);
    return html`<${Modal} title=${title} onClose=${onClose} wide footer=${html`${file.data ? html`<a class="btn" href=${file.data} download=${file.name}>Download<//>` : ''}<${Btn} kind="primary" onClick=${onClose}>Close<//>`}>
      <div class="stack">
        <div class="small muted">${file.name} · ${UI.kb(file.size)}</div>
        ${isImg ? html`<img class="doc-img" src=${file.data} alt=${title} />`
          : isPdf ? html`<iframe class="doc-frame" src=${file.data} title=${title}></iframe>`
          : html`<div class="doc-paper" role="img" aria-label=${'Preview of ' + title}>
              <div class="doc-paper-h">${title}</div>
              <p><b>${x.name}</b></p>
              <p class="small">PAN ${x.pan}${x.kyc.gst && x.kyc.gst.gstin ? ' · GSTIN ' + x.kyc.gst.gstin : ''}</p>
              <div class="doc-lines">${[90, 76, 84, 60, 88, 70, 80, 52].map((w, i) => html`<span key=${i} style=${{ width: w + '%' }}></span>`)}</div>
              <p class="small muted" style="margin-top:16px">Original file not stored for this sample application. Showing a placeholder preview.</p>
            </div>`}
      </div><//>`;
  }

  /* ======================= SEND E-AGREEMENT ======================= */
  const VERIFY_CHECKS = [
    ['applicant', 'Applicant details verified', 'Name, entity type, profession, ARN, mobile and email'],
    ['pan', 'PAN verified', 'PAN and name as per PAN'],
    ['kyc', 'KYC (Aadhaar) verified', 'Aadhaar details, photo and address'],
    ['bank', 'Bank account verified', 'Penny drop and name match with PAN'],
    ['gst', 'GST & entity documents verified', 'GSTIN and uploaded entity documents'],
  ];
  const PAYOUTS = [0.3, 0.5];
  function SendAgreement({ x, onClose, onSend }) {
    const checks = VERIFY_CHECKS.filter(([key]) => key !== 'kyc' || x.entity === 'Individual' || x.entity === 'Proprietor');
    const [ticks, setTicks] = useState({});
    const [rate, setRate] = useState(null);
    const done = checks.filter(([key]) => ticks[key]).length;
    const ready = done === checks.length;
    const valid = ready && PAYOUTS.indexOf(rate) >= 0;
    const toggle = (key) => {
      const next = Object.assign({}, ticks, { [key]: !ticks[key] });
      setTicks(next);
      if (checks.some(([id]) => !next[id])) setRate(null);
    };
    return html`<${Modal} title="Approve & send e-agreement" onClose=${onClose} footer=${html`<${Btn} onClick=${onClose}>Cancel<//><${Btn} kind="primary" disabled=${!valid} onClick=${() => onSend({ payout: rate, checks: checks.map(([key]) => key) })}>Approve & send<//>`}>
      <div class="verify-pop stack">
        <div>
          <h3>Verify the application</h3>
          <p class="verify-lead">Tick each section once you have checked it. ${done} of ${checks.length} verified.</p>
        </div>
        <div class="verify-rows">
          ${checks.map(([key, title, sub]) => html`<label key=${key} class="verify-row">
            <input type="checkbox" checked=${!!ticks[key]} onChange=${() => toggle(key)} />
            <span><b>${title}</b><span class="small">${sub}</span></span>
          </label>`)}
        </div>
        <div>
          <h3>Commercials</h3>
          <p class="verify-lead">Verify every section above to choose the commercials.</p>
          <div class=${'rate-pick' + (ready ? '' : ' is-locked')} role="radiogroup" aria-label="Commercials">
            ${PAYOUTS.map((p) => html`<button key=${p} type="button" role="radio" aria-checked=${rate === p} class=${'rate-card' + (rate === p ? ' on' : '')} disabled=${!ready} onClick=${() => setRate(p)}>
              <b>${p}%</b><span>of the disbursed loan amount</span>
            </button>`)}
          </div>
          ${rate != null && html`<${Note} tone="info"><b>Selected commercials</b><div>Partner commission of ${rate}% of the disbursed loan amount.</div><//>`}
        </div>
      </div><//>`;
  }

  /* ======================= REVIEW ======================= */
  const DOCS_FOR = { Individual: [], Proprietor: [], Partnership: [['deed', 'Partnership deed']], Company: [['coi', 'Certificate of Incorporation (COI)']] };
  function Review({ id, live, onBack }) {
    useStore();
    const x = allApps().find((y) => y.id === id);
    const [modal, setModal] = useState(null);
    const [reason, setReason] = useState(REJECT_REASONS[0]);
    const [rejRemarks, setRejRemarks] = useState('');
    if (!x) return html`<div class="content-narrow"><${Note}>This application is no longer available.<//><div class="mt"><${Btn} onClick=${onBack}>← Back to approvals<//></div></div>`;
    const k = x.kyc, ad = k.aadhaar || {}, addr = ad.address || {}, bank = k.bank || {}, gst = k.gst || {};
    const pending = statusOf(x) === 'Pending';
    const viewBtn = (title, f) => html`<span class="doc-row"><span class="doc-name">📎 ${f.name}</span><${Btn} sm onClick=${() => setModal({ doc: { title, file: f } })}>View<//></span>`;
    const firm = x.entity === 'Partnership' || x.entity === 'Company';
    const docRows = (DOCS_FOR[x.entity] || []).map(([key, label]) => [label, k.docs && k.docs[key] ? viewBtn(label, k.docs[key]) : '—']);
    const match = Number(bank.nameMatch) || 0;
    return html`<div class=${'content-narrow' + (pending ? ' has-actions' : '')}>
      <div class="mb"><${Btn} kind="link" onClick=${onBack}>← Approvals<//></div>
      <${UI.SummaryStrip} icon="user" title=${x.name} sub=${x.ref + ' · ' + entityLabel(x) + ' · PAN ' + x.pan}
        tag=${{ text: statusOf(x), tone: { Pending: 'warn', Approved: 'info', [SIGNED]: 'ok', Rejected: 'err' }[statusOf(x)] }}
        lines=${[['phone', '+91 ' + x.mobile], ['mail', html`<span class="one-line">${x.email}</span>`]]}
        figLabel="Name match with PAN" fig=${match + '%'} figSub=${bank.bank ? 'Bank: ' + bank.bank : ''}
        boxLabel="Submitted" box=${fd(x.submittedAt)} boxSub=${new Date(x.submittedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} />
      ${x.qc && html`<div class="mb"><${Note} tone=${x.qc.decision === 'Approved' ? 'ok' : 'err'}>
        ${x.qc.decision === 'Approved'
          ? html`<b>Approved & e-agreement sent</b> by ${x.qc.by} on ${fdt(x.qc.at)}${x.qc.commercials ? html`<div class="small mt"><b>Commercials</b>${commList(x.qc.commercials)}</div>` : ''}${x.agreement && x.agreement.signedAt ? html`<div class="small mt"><b>Signed by the partner</b> on ${fdt(x.agreement.signedAt)} · agent code <b class="mono">${x.agreement.agentCode}</b></div>` : html`<div class="small mt">Waiting for the partner to sign.</div>`}`
          : html`<b>Rejected</b> by ${x.qc.by} on ${fdt(x.qc.at)} · reason: <b>${x.qc.reason}</b>${x.qc.remarks ? html`<div class="small mt">“${x.qc.remarks}”</div>` : ''}`}
      <//></div>`}
      <div class="stack">
        <div class="grid g2">
          <${Card} title="Applicant"><${KV} items=${[['Reference', x.ref], ...(x.partnerType ? [['Partner type', x.partnerType]] : []), ['Entity type', entityLabel(x)], ['Profession', professionLabel(x)], [person(x) ? 'Name' : 'Entity name', x.name], [person(x) ? 'Date of birth' : 'Date of incorporation', fd(x.dob)], ['Mobile', html`${x.mobile} <span class="ok-t"><${UI.Tick} size="16" label="Verified" /></span>`], ['Email', html`<span class="one-line">${x.email}</span> <span class="ok-t"><${UI.Tick} size="16" label="Verified" /></span>`]]} /><//>
          <${Card} title="PAN"><${KV} items=${[['PAN', html`<span class="mono">${x.pan}</span>`], ['Name as per PAN', k.pan.name], [person(x) ? 'DOB as per PAN' : 'Incorporation as per PAN', fd(k.pan.dob)], ['Holder type', k.pan.type]]} /><//>
        </div>
        ${firm ? html`<${Card} title="KYC information"><p class="muted" style="margin:0">Not applicable</p><//>` : html`<${Card} title=${'KYC information' + (ad.signatory ? ' · authorised signatory' : '')}>
          <div class="kyc-grid">
            <figure class="kyc-photo"><${UI.IdPhoto} src=${ad.photo} name=${ad.name} /><figcaption class="small muted">Photo from Aadhaar</figcaption></figure>
            <${KV} items=${[['Name', ad.name], ['Date of birth', fd(ad.dob)], ['Gender', ad.gender], ['Aadhaar', html`<span class="mono">${ad.masked}</span>`], ['Fetched on', fdt(ad.at)]]} />
          </div>
        <//>`}
        ${firm ? '' : html`<${Card} title="Address as per Aadhaar"><${KV} items=${[['House / Flat no.', addr.house], ['Street / Locality', addr.street], ['Landmark', addr.landmark], ['City / Town', addr.city], ['District', addr.district], ['State', addr.state], ['PIN code', addr.pin], ['Country', addr.country]]} /><//>`}
        <${Card} title="Bank account"><${KV} items=${[['Account', html`<span class="mono">${bank.acc}</span> · ${bank.type || 'Savings'}`], ['Bank / IFSC', bank.bank + ' · ' + bank.ifsc], ['Name as per bank', bank.beneficiary],
            ['Name match with PAN', html`<span class=${match >= 70 ? 'ok-t' : 'err-t'}>${match}%</span>`], ['Cancelled cheque', bank.cheque ? viewBtn('Cancelled cheque', bank.cheque) : '']]} /><//>
        <${Card} title="GST & entity documents"><${KV} items=${[['GSTIN', gst.gstin ? html`<span class="mono">${gst.gstin}</span>` : ''], ['Legal name', gst.gstin ? gst.legalName : ''], ['GST status', gst.gstin ? gst.status : ''], ...docRows]} /><//>
      </div>
      ${pending && html`<div class="qc-actions" role="region" aria-label="Decision">
        <${Btn} kind="danger" onClick=${() => setModal('reject')}>Reject<//>
        <${Btn} kind="primary" onClick=${() => setModal('agree')}>Approve & send e-agreement<//>
      </div>`}
      ${modal && modal.doc && html`<${DocViewer} title=${modal.doc.title} file=${modal.doc.file} x=${x} onClose=${() => setModal(null)} />`}
      ${modal === 'agree' && html`<${SendAgreement} x=${x} onClose=${() => setModal(null)} onSend=${(picked) => { decide(x, { decision: 'Approved', by: APPROVER, at: nowISO(), eAgreement: { sentAt: nowISO(), to: [x.email, x.mobile] }, checks: picked.checks, commercials: { payout: picked.payout } }); setModal(null); }} />`}
      ${modal === 'reject' && html`<${Modal} title=${'Reject ' + x.name} onClose=${() => setModal(null)} footer=${html`<${Btn} onClick=${() => setModal(null)}>Cancel<//><${Btn} kind="danger" disabled=${reason === 'Other' && !rejRemarks.trim()} onClick=${() => { decide(x, { decision: 'Rejected', by: APPROVER, at: nowISO(), reason, remarks: rejRemarks.trim() }); setModal(null); }}>Reject application<//>`}>
        <div class="stack">
          <${Select} label="Reason" value=${reason} onChange=${setReason} options=${REJECT_REASONS} />
          <${Text} label=${reason === 'Other' ? 'Remarks (required)' : 'Remarks for the applicant (optional)'} value=${rejRemarks} onChange=${setRejRemarks} />
          <${Note} tone="warn">The applicant is told their application was not approved, with this reason.<//>
        </div><//>`}
    </div>`;
  }

  function partnerLeads() {
    const list = (state.partnerLeads || []).slice();
    if (!remote) {
      try {
        JSON.parse(localStorage.getItem('lamf-partner-leads') || '[]').forEach((lead) => {
          if (!list.some((x) => x.id === lead.id)) list.push(lead);
        });
      } catch (e) { /* ignore */ }
    }
    return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function LeadList() {
    useStore();
    const [q, setQ] = useState('');
    const leads = partnerLeads().filter((x) => !q || [x.firstName, x.lastName, x.email, x.companyName, x.category, x.mobile, x.comments].join(' ').toLowerCase().includes(q.toLowerCase()));
    return html`<div class="content-narrow">
      <div class="page-h"><div><h1>Partner leads</h1><p>Lending platform enquiries submitted from onboarding.</p></div></div>
      <div class="card">
        <div class="row mb">
          <input type="search" placeholder="Search by name, email, company or comments" aria-label="Search leads" value=${q} onInput=${(e) => setQ(e.target.value)} style="flex:1;min-width:220px" />
        </div>
        <${Table} rows=${leads} empty="No partner leads yet." cols=${[
          { h: 'Submitted', k: 'at', r: (x) => html`<span class="nowrap">${fd(x.createdAt)}</span><div class="small muted">${new Date(x.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>` },
          { h: 'Partner type', k: 'category' },
          { h: 'Name', k: 'name', r: (x) => html`<b>${x.firstName} ${x.lastName}</b>` },
          { h: 'Email', k: 'email', r: (x) => html`<span class="one-line">${x.email}</span>` },
          { h: 'Company', k: 'company', r: (x) => x.companyName },
          { h: 'Mobile', k: 'mobile', r: (x) => x.mobile || '—' },
          { h: 'Comments', k: 'comments', r: (x) => x.comments || '—' },
        ]} />
      </div>
    </div>`;
  }

  /* ======================= SHELL ======================= */
  // Light theme only.
  document.documentElement.setAttribute('data-theme', 'light');

  function Menu({ view, onClose, onApproval, onLeads, onReset }) {
    useStore();
    const pendingCount = allApps().filter((x) => statusOf(x) === 'Pending').length;
    const leadCount = partnerLeads().length;
    useEffect(() => { const f = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, []);
    return html`<div class="drawer-bg" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
      <nav class="drawer" aria-label="Main menu">
        <div class="drawer-h"><span class="brand-btn"><img class="brand-logo" src=${window.BRAND_LOGO} alt="Shriram Credit" /><span class="brand-sub">Approver panel<small>${APPROVER}</small></span></span><button class="x" aria-label="Close menu" onClick=${onClose}>×</button></div>
        <a href="#" class=${'drawer-item' + (view === 'approval' ? ' on' : '')} onClick=${(e) => { e.preventDefault(); onApproval(); }}><span>Approval</span>${pendingCount > 0 && html`<span class="count">${pendingCount}</span>`}</a>
        <a href="#" class=${'drawer-item' + (view === 'leads' ? ' on' : '')} onClick=${(e) => { e.preventDefault(); onLeads(); }}><span>Leads</span>${leadCount > 0 && html`<span class="count">${leadCount}</span>`}</a>
        <div class="drawer-sep"></div>
        <a href="#" class="drawer-item" onClick=${(e) => { e.preventDefault(); onReset(); }}><span>Reset sample data</span></a>
      </nav>
    </div>`;
  }

  function App() {
    const [screen, setScreen] = useState('approval');
    const [open, setOpen] = useState(null);
    const [menu, setMenu] = useState(false);
    const toList = () => { setScreen('approval'); setOpen(null); setMenu(false); window.scrollTo(0, 0); };
    const toLeads = () => { setScreen('leads'); setOpen(null); setMenu(false); window.scrollTo(0, 0); };
    return html`<div class="shell">
      <header class="top">
        <button class="btn sm burger" aria-label="Open menu" aria-expanded=${menu} onClick=${() => setMenu(true)}><span aria-hidden="true">☰</span></button>
        <button class="brand-btn" onClick=${toList} aria-label="Approvals home"><img class="brand-logo" src=${window.BRAND_LOGO} alt="Shriram Credit" /></button>
        <div class="grow"></div>
      </header>
      ${menu && html`<${Menu} view=${open ? 'approval' : screen} onClose=${() => setMenu(false)} onApproval=${toList} onLeads=${toLeads} onReset=${() => { if (confirm('Reset the sample applications? The live application is not affected.')) { if (remote) { saver.run(() => LamfPersist.post('/api/approver/reset', {})).then((saved) => { state = saved; emit(); toList(); }).catch(() => toast('Could not reset sample data.', 'Database')); } else { state = seed(); save(); emit(); toList(); } } }} />`}
      <main>${open ? html`<${Review} key=${open.id} id=${open.id} live=${open.live} onBack=${toList} />` : screen === 'leads' ? html`<${LeadList} />` : html`<${QcList} onOpen=${(x) => { setOpen({ id: x.id, live: !!x.live }); window.scrollTo(0, 0); }} />`}</main>
      <${UI.Toasts} />
    </div>`;
  }
  ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
})();
