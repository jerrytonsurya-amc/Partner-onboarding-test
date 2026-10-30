/* LAMF partner onboarding: standalone journey (landing → 6 steps → status). */
(async function () {
  const KEY = 'lamf-partner-onboarding-v7';
  const AGENT_PORTAL_URL = 'agent'; // agent portal, served next to this page
  const CONFIG = { nameMatch: 70 };
  const ENTITIES = [
    { label: 'Individual / Proprietor', value: 'Individual' },
    { label: 'Partnership', value: 'Partnership' },
    { label: 'Company', value: 'Company' },
  ];
  const PROFESSIONS = {
    Individual: ['Mutual fund distributor', 'Chartered accountant', 'IT Professional', 'Others'],
    Partnership: ['Mutual fund distribution', 'Chartered accountancy firm', 'General Business', 'Others'],
    Company: ['Mutual fund distribution', 'Chartered accountancy firm', 'General Business', 'Others'],
  };
  const PARTNER_TYPES = ['Mutual Fund Distributors', 'Lending Platforms', 'Stock Brokers', 'Financial Superapps', 'Wealth Managers'];
  const LEAD_PARTNER_TYPE = 'Lending Platforms';
  const isPerson = (entity) => entity === 'Individual' || entity === 'Proprietor';
  const isFirm = (entity) => entity === 'Partnership' || entity === 'Company';
  const IFSC = { SBIN: 'State Bank of India', HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', UTIB: 'Axis Bank', KKBK: 'Kotak Mahindra Bank', IOBA: 'Indian Overseas Bank', IDIB: 'Indian Bank', CNRB: 'Canara Bank', BARB: 'Bank of Baroda', PUNB: 'Punjab National Bank' };
  const nowISO = () => new Date().toISOString();

  function nameMatch(a, b) {
    const norm = (x) => (x || '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !['MR', 'MRS', 'MS', 'AND', 'CO', 'PVT', 'LTD'].includes(t));
    const A = norm(a), B = norm(b);
    if (!A.length || !B.length) return 0;
    const hit = A.filter((t) => B.includes(t) || B.some((u) => u[0] === t[0] && (u.length === 1 || t.length === 1))).length;
    return Math.round((hit / Math.max(A.length, B.length)) * 100);
  }
  function newApplicant() {
    return {
      id: 'APP' + Date.now().toString(36).toUpperCase(), ref: null, name: '', mobile: '', email: '', entity: 'Individual', dob: '', pan: '',
      appStatus: 'Draft', gstRegistered: false, createdAt: nowISO(), submittedAt: null, step: 0, timeline: [],
      kyc: { mobileOk: false, emailOk: false, pan: {}, aadhaar: {}, decl: {}, bank: {}, gst: {}, docs: {} },
    };
  }

  /* ---------- store: one journey per mobile. Served pages write to SQLite; a file opened directly stays in this browser. ---------- */
  let state = { v: 2, view: 'landing', app: null, journeys: {}, notifications: [] };
  let remote = false;
  const saver = LamfPersist.queued();
  const subs = new Set();
  try {
    remote = await LamfPersist.ping();
    if (remote) state = await LamfPersist.load('/api/onboarding');
    else {
      try { const raw = localStorage.getItem(KEY); if (raw) state = JSON.parse(raw); } catch (e) { /* storage unavailable */ }
      if (!state || state.v !== 2) state = { v: 2, view: 'landing', app: null, journeys: {}, notifications: [] };
    }
  } catch (e) {
    document.getElementById('root').textContent = 'Could not load the application database. Leave this page open from the local server (node serve.js) and refresh.';
    return;
  }
  if (state.app && state.app.mobile) state.app = state.journeys[state.app.mobile] || state.app;

  function publish() {
    if (state.app && state.app.mobile) state.journeys[state.app.mobile] = state.app;
    state = Object.assign({}, state);
    subs.forEach((f) => f());
  }
  function adopt(next) {
    if (!next || saver.busy()) return;
    const view = state.view;
    const mobile = state.app && state.app.mobile;
    const app = view === 'apply' && mobile ? (next.journeys[mobile] || null) : null;
    const merged = Object.assign({}, next, { view, app });
    if (JSON.stringify({ app: state.app, journeys: state.journeys, notifications: state.notifications, view: state.view })
      === JSON.stringify({ app: merged.app, journeys: merged.journeys, notifications: merged.notifications, view: merged.view })) return;
    state = merged;
    subs.forEach((f) => f());
  }
  function update(fn) {
    fn(state);
    publish();
    if (remote) {
      const snap = JSON.parse(JSON.stringify(state));
      saver.run(() => LamfPersist.save('/api/onboarding', snap)).then((saved) => { if (!saver.busy()) adopt(saved); }).catch(() => {});
    } else {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    }
  }
  window.Store = { get: () => state, update, subscribe: (f) => { subs.add(f); return () => subs.delete(f); } };
  if (remote) LamfPersist.watch('/api/onboarding', () => saver.busy(), adopt);
  else window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      const next = JSON.parse(e.newValue);
      const mine = state.app && state.app.mobile;
      state = Object.assign(next, { view: state.view, app: mine ? next.journeys[mine] || null : next.app });
      subs.forEach((f) => f());
    } catch (err) { /* ignore */ }
  });

  function notify(s, msg, ch) {
    s.notifications.unshift({ id: 'N' + Math.random().toString(36).slice(2, 8), ts: nowISO(), ch: ch || 'SMS · Email', msg });
    setTimeout(() => window.toast(msg, ch || 'SMS · Email'), 0);
  }
  const updApp = (fn) => update((s) => fn(s.app, s));
  const stepDone = (idx, fn) => updApp((a, s) => { fn(a, s); a.step = Math.max(a.step || 0, idx + 1); });

  const { html, useState, useEffect, useRef, useStore, fdt, fd, sleep, otp } = UI;
  const { Badge, Btn, Card, Input, Text, KV, Note, FileIn } = UI;
  const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

  const ico = (d) => html`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d=${d} /></svg>`;
  const ICONS = {
    alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
    search: 'M11 4a7 7 0 110 14 7 7 0 010-14zM20 20l-4-4',
    phone: 'M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2zM11 18h2',
    save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
    doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  };

  /* Success mark: green ring with a bold check. */
  // Animated on mount: the ring draws, the check strokes through, one soft pulse (see .success-mark in ref.css).
  const SuccessMark = () => html`<svg class="success-mark" viewBox="0 0 100 100" width="72" height="72" aria-hidden="true">
    <circle class="sm-pulse" cx="50" cy="50" r="44" fill="#33b540" />
    <circle class="sm-ring" cx="50" cy="50" r="40.5" fill="none" stroke="#33b540" stroke-width="9" pathLength="1" />
    <path class="sm-check" d="M30 51 L43 64 L71 36" fill="none" stroke="#33b540" stroke-width="10" stroke-linecap="square" stroke-linejoin="miter" pathLength="1" /></svg>`;

  /* ======================= LANDING ======================= */
  function Landing() {
    const [starting, setStarting] = useState(false);
    return html`<div class="landing">
      ${starting && html`<${StartModal} onClose=${() => setStarting(false)} />`}
      <section class="hero">
        <div class="hero-in">
          <h1>Become a Loan Against Mutual Funds <span class="accent">partner</span></h1>
          <p>Help your clients get funds without selling their investments, and earn commission on every disbursed loan.</p>
          <div class="row"><${Btn} kind="primary" onClick=${() => setStarting(true)}>Start application →<//></div>
          <p class="small" style="opacity:.85">Takes about 10 minutes · 100% digital · no paperwork</p>
        </div>
      </section>
      <div class="content-narrow">
        <div class="grid g3">
          ${[['Earn up to 1.25%', 'Commission on every disbursal, credited monthly to your bank account.'], ['Fully digital', 'PAN, bank account and documents, all online.'], ['Grow a team', 'Add sub-agents under you and track their business in one place.']].map(([t, d]) => html`<div class="card" key=${t}><h2>${t}</h2><p class="muted" style="margin:6px 0 0">${d}</p></div>`)}
        </div>
        <${Card} title="What you'll need" cls="mt">
          <div class="grid g2">
            <ul class="ticks"><li>Mobile number and email ID</li><li>PAN card</li></ul>
            <ul class="ticks"><li>Bank account for commission payouts</li><li>GSTIN, if you are GST registered</li></ul>
          </div>
        <//>
        <${Card} title="How it works" cls="mt">
          <ol class="steps-list">${STEPS.map((t) => html`<li key=${t}>${t}</li>`)}</ol>
        <//>
      </div>
    </div>`;
  }

  /* OTP: valid for 120 seconds, resend after 30 seconds, 3 wrong attempts then a 15-minute lock.
     SMS is sent and checked by the server. Email still uses the on-screen prototype code. */
  function OtpChallenge({ destination, onVerified, channel, purpose }) {
    const sms = (channel || 'SMS') === 'SMS';
    const [sentAt, setSentAt] = useState(0);
    const [attempts, setAttempts] = useState(0);
    const [lockUntil, setLockUntil] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const [ent, setEnt] = useState('');
    const [err, setErr] = useState('');
    const [sendErr, setSendErr] = useState('');
    const [fallback, setFallback] = useState(false);
    const [busy, setBusy] = useState(true);
    const [ready, setReady] = useState(false);
    const started = useRef(false);
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
    const locked = now < lockUntil;
    const age = sentAt ? Math.floor((now - sentAt) / 1000) : 0;
    const expired = ready && age >= 120;
    const resendIn = Math.max(0, 30 - age);
    const lockMins = Math.max(1, Math.ceil((lockUntil - now) / 60000));
    async function send() {
      if (locked || busy && ready) return;
      setBusy(true); setErr(''); setSendErr('');
      try {
        if (sms && window.LamfPersist && await LamfPersist.ping()) {
          const data = await LamfPersist.post('/api/otp/send', { mobile: destination, purpose: purpose || 'onboarding' });
          const expiresIn = Number(data.expiresIn) || 120;
          setSentAt(Date.now() - (120 - expiresIn) * 1000);
          setFallback(false);
          setSendErr('');
        } else setSentAt(Date.now());
        setAttempts(0); setEnt(''); setReady(true);
        toast('OTP sent to ' + destination, channel || 'SMS');
      } catch (e) {
        setFallback(true);
        setSendErr(e.message || 'Could not send the OTP.');
        setSentAt(Date.now());
        setAttempts(0); setEnt(''); setReady(true);
        toast('Enter 000000 to continue', channel || 'SMS');
      } finally { setBusy(false); }
    }
    useEffect(() => { if (started.current) return; started.current = true; send(); }, []);
    async function verify() {
      if (locked) return setErr('Too many incorrect attempts. Try again in ' + lockMins + ' minutes.');
      if (!sentAt || expired) return setErr('This OTP has expired. Resend a new one.');
      setBusy(true);
      try {
        if (fallback) {
          if (ent === otp()) return onVerified();
        } else if (sms && window.LamfPersist && await LamfPersist.ping()) {
          await LamfPersist.post('/api/otp/verify', { mobile: destination, purpose: purpose || 'onboarding', otp: ent });
          onVerified();
          return;
        } else if (ent === otp()) return onVerified();
        const next = attempts + 1;
        setAttempts(next);
        if (next >= 3) { setLockUntil(Date.now() + 15 * 60 * 1000); return setErr('Too many incorrect attempts. Try again in 15 minutes.'); }
        setErr('Incorrect OTP. ' + (3 - next) + (3 - next === 1 ? ' attempt' : ' attempts') + ' left.');
      } catch (e) {
        const message = e.message || 'Incorrect OTP';
        if (message.indexOf('Too many incorrect attempts') === 0) setLockUntil(Date.now() + 15 * 60 * 1000);
        setErr(message);
      } finally { setBusy(false); }
    }
    return html`<div class="stack">
      ${!ready && html`<${Note} tone="info">Sending OTP to ${destination}…<//>`}
      ${ready && fallback && html`<${Note} tone="warn">${sendErr} Enter 000000 to continue.<//>`}
      ${ready && !fallback && html`<${Note} tone="info">OTP sent to ${destination}. It is valid for 120 seconds.<//>`}
      ${locked && html`<${Note} tone="err">Too many incorrect attempts. Try again in ${lockMins} minutes.<//>`}
      ${ready && !locked && html`<${UI.OtpBoxes} value=${ent} onChange=${(v) => { setEnt(v); setErr(''); }} err=${err} autoFocus />
        <div class="row">
          <${Btn} kind="primary" disabled=${busy || ent.length !== 6 || expired} onClick=${verify}>Verify<//>
          <${Btn} kind="link" disabled=${busy || resendIn > 0} onClick=${send}>${resendIn > 0 ? 'Resend in ' + resendIn + 's' : 'Resend'}<//>
        </div>`}
      ${expired && !locked && html`<${Note} tone="warn">This OTP has expired. Resend a new one.<//>`}
    </div>`;
  }

  function activePartner(mobile) {
    return (Store.get().activePartners || []).find((p) => p.mobile === mobile);
  }
  function nextRef() {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = 'SCL-LD-' + day + '-';
    let n = 0;
    Object.values(Store.get().journeys || {}).forEach((j) => {
      if (j.ref && j.ref.indexOf(prefix) === 0) n = Math.max(n, parseInt(j.ref.slice(prefix.length), 10) || 0);
    });
    return prefix + String(n + 1).padStart(6, '0');
  }
  function nextAgentCode() {
    let n = 0;
    const seen = (code) => { const m = /^SCL-AG-(\d+)$/.exec(code || ''); if (m) n = Math.max(n, parseInt(m[1], 10)); };
    Object.values(Store.get().journeys || {}).forEach((j) => j.agreement && seen(j.agreement.agentCode));
    (Store.get().activePartners || []).forEach((p) => seen(p.agentCode));
    return 'SCL-AG-' + String(n + 1).padStart(6, '0');
  }
  function maskAccount(acc) {
    const digits = String(acc || '').replace(/\D/g, '');
    if (!digits) return acc || '';
    return 'X'.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
  }

  /* Mobile + OTP. An existing journey for this mobile is resumed; otherwise a new one starts with the mobile verified. */
  function StartModal({ onClose }) {
    const [mobile, setMobile] = useState('');
    const [sent, setSent] = useState(false);
    const [blocked, setBlocked] = useState('');
    const valid = /^[6-9]\d{9}$/.test(mobile);
    function verified() {
      const partner = activePartner(mobile);
      if (partner) return setBlocked('An Agent ID has already been generated for this mobile number. Sign in to the agent portal with your email instead of starting a new application.');
      const existing = Store.get().journeys[mobile];
      update((st) => {
        if (existing) st.app = existing;
        else { const n = newApplicant(); n.mobile = mobile; n.kyc.mobileOk = true; st.app = n; }
        st.view = 'apply';
      });
      toast(existing ? 'Welcome back! Picking up where you left off.' : 'Mobile verified. Let\'s set up your application.', 'Start application');
      window.scrollTo(0, 0);
      onClose();
    }
    return html`<${UI.Modal} title="Start application" icon=${ico(ICONS.phone)} sub="Enter your mobile number. If you've already started an application, we'll take you back to it." onClose=${onClose} footer=${sent ? '' : html`<${Btn} kind="primary" disabled=${!valid} onClick=${() => setSent(true)}>Send OTP<//>`}>
      <div class="stack">
        <${Input} label="Mobile number" value=${mobile} onChange=${(v) => { setMobile(v.replace(/\D/g, '').slice(0, 10)); setSent(false); setBlocked(''); }} inputmode="numeric" placeholder="10-digit mobile" autoFocus
          err=${mobile && !valid ? 'Enter a valid 10-digit Indian mobile number' : ''} />
        ${blocked && html`<${Note} tone="err">${blocked}<//>`}
        ${sent && !blocked && html`<${OtpChallenge} destination=${mobile} onVerified=${verified} />`}
      </div><//>`;
  }

  /* ======================= JOURNEY ======================= */
  const STEPS = ['Registration', 'Entity & PAN', 'KYC verification', 'Bank account', 'GST & entity docs', 'Review & submit'];

  function Journey() {
    const s = useStore();
    const a = s.app;
    if (!a) return html`<${Landing} />`;
    if (a.appStatus !== 'Draft') return html`<${Tracker} a=${a} />`;
    return html`<${Wizard} a=${a} />`;
  }

  function Wizard({ a }) {
    const firm = isFirm(a.entity);
    const flow = (firm ? STEPS.filter((t) => t !== 'KYC verification') : STEPS).map((t) => ({ t, abs: STEPS.indexOf(t) }));
    const comps = [StepReg, StepPAN, StepKYC, StepBank, StepGST, StepReview];
    const [absI, setAbsI] = useState(() => {
      let start = Math.min(a.step || 0, 5);
      if (isFirm(a.entity) && start === 2) start = 3;
      return start;
    });
    const next = () => {
      setAbsI((x) => {
        let n = x + 1;
        if (Store.get().app && isFirm(Store.get().app.entity) && n === 2) n = 3;
        return Math.min(n, 5);
      });
      window.scrollTo(0, 0);
    };
    const back = () => {
      setAbsI((x) => {
        let n = x - 1;
        if (Store.get().app && isFirm(Store.get().app.entity) && n === 2) n = 1;
        return Math.max(n, 0);
      });
      window.scrollTo(0, 0);
    };
    const Comp = comps[absI];
    const done = a.step || 0;
    const pct = Math.round((flow.filter((s) => s.abs < done).length / flow.length) * 100);
    const returned = (a.timeline || []).filter((event) => event.status === 'Rejected').pop();
    return html`<div class="content-narrow">
      ${returned && html`<div class="mb"><${Note} tone="warn">Your previous application was not approved. ${returned.note} Update the details and submit again.<//></div>`}
      <div class="prog" role="progressbar" aria-label="Application progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${pct}>
        <span class="small muted">Application progress</span><b>${pct}% completed</b>
        <span class="prog-bar"><i style=${'width:' + pct + '%'}></i></span>
      </div>
      <div class="chev-row">
        <ol class="chev" aria-label="Application steps">${flow.map((s, k) => html`<li key=${s.t}>
          <button class=${s.abs === absI ? 'cur' : s.abs < done ? 'done' : ''} disabled=${s.abs > done} aria-current=${s.abs === absI ? 'step' : undefined} onClick=${() => setAbsI(s.abs)}>
            <span class=${'n' + (s.abs < done && s.abs !== absI ? ' n-ok' : '')}>${s.abs < done && s.abs !== absI ? html`<${UI.Tick} size="22" />` : k + 1}</span>${s.t}</button></li>`)}</ol>
        <div class="chev-actions"><${Btn} sm onClick=${() => window.dispatchEvent(new Event('lamf:ask-exit'))}>Save & exit<//></div>
      </div>
      <div class="card wiz-card"><${Comp} key=${absI} a=${a} next=${next} idx=${absI} goTo=${(k) => { if (Store.get().app && isFirm(Store.get().app.entity) && k === 2) return; setAbsI(k); window.scrollTo(0, 0); }} /></div>
      ${absI > 0 && html`<div class="mt"><${Btn} kind="link" onClick=${back}>← Previous step<//></div>`}
    </div>`;
  }

  /* Field + "Send OTP → enter OTP → Verify" flow, shared by mobile and email. */
  function OtpVerify({ label, value, onChange, valid, invalidMsg, ok, setOk, channel, what, inputProps }) {
    const [sent, setSent] = useState(false);
    const change = (v) => { onChange(v); setOk(false); setSent(false); };
    return html`<div class="stack">
      <label class="field"><span>${label}</span>
        <div class=${'verify-box' + (ok ? ' is-ok' : '')}>
          <input value=${value} onInput=${(e) => change(e.target.value)} aria-describedby=${ok ? what + '-ok' : undefined} ...${inputProps} />
          ${ok && html`<span class="verify-tick" title=${what + ' verified'}><${UI.Tick} id=${what + '-ok'} label=${what + ' verified'} /></span>`}
        </div>
        ${value && !valid && html`<div class="errt">${invalidMsg}</div>`}
      </label>
      ${ok ? null : sent ? html`<${OtpChallenge} key=${value} destination=${value} channel=${channel} onVerified=${() => setOk(true)} />` : html`<div><${Btn} disabled=${!valid} onClick=${() => setSent(true)}>Send OTP<//></div>`}
    </div>`;
  }

  function StepReg({ a, next, idx }) {
    const [email, setEmail] = useState(a.email || '');
    const [eOk, setEOk] = useState(!!a.kyc.emailOk);
    const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    return html`<div class="stack">
      <h2>Step 1 · Email verification</h2>
      <div class="grid g2">
        <label class="field"><span>Mobile number</span>
          <div class="verify-box is-ok"><input value=${a.mobile} readonly aria-describedby="mobile-ok" /><span class="verify-tick" title="Mobile verified"><${UI.Tick} id="mobile-ok" label="Mobile verified" /></span></div>
          <div class="hint">Verified when you started the application</div></label>
        <${OtpVerify} label="Email ID" what="Email" channel="Email" value=${email} onChange=${(v) => setEmail(v.trim())} valid=${emailValid}
          invalidMsg="Enter a valid email" ok=${eOk} setOk=${setEOk} inputProps=${{ type: 'email', placeholder: 'name@example.com' }} />
      </div>
      <div class="row end"><${Btn} kind="primary" disabled=${!eOk} onClick=${() => {
        stepDone(idx, (ag) => { ag.email = email; ag.kyc.emailOk = true; });
        next();
      }}>Save & continue →<//></div>
    </div>`;
  }

  /* PAN lookup result: name and date of birth / incorporation as held by NSDL (sample records keyed off the PAN). */
  const PAN_NAMES = {
    P: ['Meera Krishnan', 'Arjun Mehta', 'Priya Venkatesh', 'Rahul Sharma', 'Kavya Iyer', 'Suresh Kumar', 'Lakshmi Narayanan', 'Vikram Rao'],
    F: ['Sri Lakshmi Associates', 'Kaveri Wealth Partners', 'Ganesh & Co', 'Bluewater Advisors LLP'],
    C: ['Nimbus Finserv Pvt Ltd', 'Coral Wealth Advisors Pvt Ltd', 'Everest Capital Services Pvt Ltd', 'Sapphire Investments Pvt Ltd'],
  };
  function panLookup(pan) {
    const h = hashOf(pan, 7);
    const kind = pan[3] === 'F' ? 'F' : pan[3] === 'C' ? 'C' : 'P';
    const list = PAN_NAMES[kind];
    const year = kind === 'P' ? 1970 + (h % 30) : 2000 + (h % 22);
    const dob = year + '-' + String((h % 12) + 1).padStart(2, '0') + '-' + String((h % 27) + 1).padStart(2, '0');
    return { name: list[h % list.length].toUpperCase(), dob, type: { P: 'Individual', F: 'Firm', C: 'Company', H: 'HUF' }[pan[3]] || 'Other' };
  }

  const hashOf = (str, seed) => [...String(str)].reduce((t, c) => (Math.imul(t, 31) + c.charCodeAt(0)) >>> 0, seed || 7);

  function StepPAN({ a, next, idx }) {
    const [partnerType, setPartnerType] = useState(a.partnerType || '');
    const [entity, setEntity] = useState(a.entity === 'Proprietor' ? 'Individual' : (a.entity || 'Individual'));
    const [profession, setProfession] = useState(a.profession || '');
    const [professionOther, setProfessionOther] = useState(a.profession === 'Others' ? (a.professionDetail || '') : '');
    const [arn, setArn] = useState(a.arn || '');
    const [incorporated, setIncorporated] = useState(isFirm(a.entity) ? (a.dob || '') : '');
    const [pan, setPan] = useState(a.pan || '');
    const [busy, setBusy] = useState(false);
    const [res, setRes] = useState(a.kyc.pan && a.kyc.pan.status ? a.kyc.pan : null);
    const [lead, setLead] = useState({ first: '', last: '', email: '', company: '', comments: '' });
    const [leadBusy, setLeadBusy] = useState(false);
    const [leadDone, setLeadDone] = useState(false);
    const [leadErr, setLeadErr] = useState('');
    const valid = PAN_RE.test(pan);
    const person = isPerson(entity);
    const firm = isFirm(entity);
    const leadType = partnerType === LEAD_PARTNER_TYPE;
    const professions = PROFESSIONS[entity] || PROFESSIONS.Individual;
    const expected = { Individual: 'P', Partnership: 'F', Company: 'C' }[entity];
    const mismatch = valid && pan[3] !== expected;
    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email.trim());
    const leadReady = !!(lead.first.trim() && lead.last.trim() && emailOk && lead.company.trim());
    function chooseEntity(value) {
      setEntity(value);
      setRes(null);
      const options = PROFESSIONS[value] || [];
      if (!options.includes(profession)) {
        setProfession('');
        setProfessionOther('');
      }
      if (!isFirm(value)) setIncorporated('');
    }
    function choosePartner(value) {
      setPartnerType(value);
      setLeadDone(false);
      setLeadErr('');
    }
    async function verify() {
      setBusy(true); setRes(null);
      try {
        if (await LamfPersist.ping()) setRes(await LamfPersist.post('/api/kyc/pan', { pan }));
        else {
          await sleep(1400);
          if (pan[0] === 'Z') setRes({ ok: false, status: 'PAN not found in NSDL/Protean records. Please check and try again.' });
          else setRes(Object.assign({ ok: true, status: 'Valid – Existing & Active', at: nowISO() }, panLookup(pan)));
        }
      } catch (err) {
        setRes({ ok: false, status: err.message || 'PAN could not be verified' });
      }
      setBusy(false);
    }
    async function submitLead() {
      if (!leadReady || leadBusy) return;
      setLeadBusy(true); setLeadErr('');
      try {
        const body = {
          category: partnerType,
          firstName: lead.first.trim(),
          lastName: lead.last.trim(),
          email: lead.email.trim(),
          companyName: lead.company.trim(),
          comments: lead.comments.trim(),
          mobile: a.mobile || '',
        };
        if (await LamfPersist.ping()) await LamfPersist.post('/api/partner-leads', body);
        else {
          const key = 'lamf-partner-leads';
          const list = JSON.parse(localStorage.getItem(key) || '[]');
          list.unshift(Object.assign({ id: 'PL' + Date.now().toString(36).toUpperCase(), createdAt: nowISO() }, body));
          localStorage.setItem(key, JSON.stringify(list));
        }
        setLeadDone(true);
        toast('Details submitted.', partnerType);
      } catch (err) {
        setLeadErr(err.message || 'Could not save these details.');
      }
      setLeadBusy(false);
    }
    const panLabel = entity === 'Partnership' ? 'PAN number of the partnership' : entity === 'Company' ? 'PAN number of the company' : 'PAN number';
    const needsArn = profession === 'Mutual fund distributor' || profession === 'Mutual fund distribution';
    const specified = profession !== 'Others' || !!professionOther.trim();
    const arnOk = !needsArn || /^ARN\d{3,8}$/.test(arn);
    const canContinue = !!(partnerType && !leadType && res && res.ok && profession && specified && arnOk && (!firm || incorporated));
    return html`<div class="stack">
      <h2>Step 2 · Entity type & PAN</h2>
      <div class="field"><span>What best describes you?</span><div class="chips">${PARTNER_TYPES.map((p) => html`<button key=${p} class=${'chip' + (partnerType === p ? ' on' : '')} onClick=${() => choosePartner(p)}>${p}</button>`)}</div></div>
      ${leadType && (leadDone
        ? html`<${Note} tone="ok">Thank you. Your details have been shared with our team.<//>`
        : html`<div class="stack">
            <p class="muted" style="margin:0">Tell us about your lending platform. Our team will get in touch.</p>
            <div class="grid g2">
              <${Input} label="First name" value=${lead.first} onChange=${(v) => setLead(Object.assign({}, lead, { first: v.slice(0, 80) }))} />
              <${Input} label="Last name" value=${lead.last} onChange=${(v) => setLead(Object.assign({}, lead, { last: v.slice(0, 80) }))} />
            </div>
            <div class="grid g2">
              <${Input} label="Email" type="email" value=${lead.email} onChange=${(v) => setLead(Object.assign({}, lead, { email: v.slice(0, 120) }))} placeholder="name@company.com" err=${lead.email && !emailOk ? 'Enter a valid email' : ''} />
              <${Input} label="Company name" value=${lead.company} onChange=${(v) => setLead(Object.assign({}, lead, { company: v.slice(0, 120) }))} />
            </div>
            <${Text} label="Comments" value=${lead.comments} onChange=${(v) => setLead(Object.assign({}, lead, { comments: v.slice(0, 1000) }))} placeholder="Optional" />
            ${leadErr && html`<${Note} tone="err">${leadErr}<//>`}
            <div class="row end"><${Btn} kind="primary" disabled=${!leadReady || leadBusy} onClick=${submitLead}>${leadBusy ? 'Submitting…' : 'Submit'}<//></div>
          </div>`)}
      ${partnerType && !leadType && html`<div class="stack">
      <div class="field"><span>Entity type</span><div class="chips">${ENTITIES.map((e) => html`<button key=${e.value} class=${'chip' + ((e.value === 'Individual' ? person : entity === e.value) ? ' on' : '')} onClick=${() => chooseEntity(e.value)}>${e.label}</button>`)}</div></div>
      <div class="field"><span>What best describes your profession?</span><div class="chips">${professions.map((p) => html`<button key=${p} class=${'chip' + (profession === p ? ' on' : '')} onClick=${() => { setProfession(p); if (p !== 'Others') setProfessionOther(''); }}>${p}</button>`)}</div></div>
      ${profession === 'Others' && html`<${Input} label="Please specify your profession" value=${professionOther} onChange=${(v) => setProfessionOther(v.slice(0, 80))} placeholder="e.g. Wealth advisory" />`}
      ${needsArn && html`<${Input} label="ARN number" value=${arn} onChange=${(v) => setArn(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))} placeholder="ARN12345" err=${arn && !arnOk ? 'Enter the ARN, for example ARN12345' : ''} />`}
      <div class="grid g2">
        <div class="stack">
          <${Input} label=${panLabel} value=${pan} ok=${!!(res && res.ok)} onChange=${(v) => { setPan(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)); setRes(null); }} placeholder="ABCDE1234F"
            err=${pan.length === 10 && !valid ? 'Format: 5 letters, 4 digits, 1 letter' : mismatch ? `This PAN belongs to a ${({ P: 'person', F: 'firm', C: 'company' })[pan[3]] || 'different holder type'}, not a ${entity.toLowerCase()}. Check the entity type.` : ''} />
          ${res && (res.ok
            ? html`<div class="pan-name"><b>${res.name}</b></div>`
            : html`<${Note} tone="err">${res.status}<//>`)}
          ${!(res && res.ok) && html`<div><${Btn} kind="primary" disabled=${!valid || mismatch || busy} onClick=${verify}>Verify PAN<//></div>`}
        </div>
        ${firm && html`<${Input} label="Date of incorporation" type="date" value=${incorporated} onChange=${setIncorporated} />`}
      </div>
      ${busy && html`<${UI.LoaderPop} text="Verifying your PAN…" sub="This takes a few seconds. Please don't close this window." />`}
      <div class="row end"><${Btn} kind="primary" disabled=${!canContinue} onClick=${() => {
        stepDone(idx, (ag) => {
          ag.partnerType = partnerType;
          ag.entity = entity; ag.profession = profession; ag.professionDetail = profession === 'Others' ? professionOther.trim() : ''; ag.arn = needsArn ? arn : ''; ag.pan = pan;
          ag.name = res.name.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()).replace(/\bPvt Ltd\b/i, 'Pvt Ltd').replace(/\bLlp\b/, 'LLP');
          ag.dob = firm ? incorporated : res.dob; ag.kyc.pan = res;
          if (isFirm(entity)) ag.step = Math.max(ag.step || 0, 3);
          else if (!(ag.kyc.aadhaar && ag.kyc.aadhaar.ok)) ag.step = 2;
        });
        next();
      }}>Save & continue →<//></div>
      </div>`}
    </div>`;
  }

  /* e-Aadhaar as returned by DigiLocker (sample records keyed off the PAN). Address is in the Indian format. */
  const ADDRESSES = [
    { house: 'Flat 4B, Sai Krupa Apartments', street: '12th Cross Road, Indiranagar', landmark: 'Near Indiranagar Metro Station', city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pin: '560038' },
    { house: 'No. 27, Ground Floor', street: 'Ranganathan Street, T. Nagar', landmark: 'Opposite Panagal Park', city: 'Chennai', district: 'Chennai', state: 'Tamil Nadu', pin: '600017' },
    { house: 'B-302, Shanti Niketan CHS', street: 'S.V. Road, Andheri West', landmark: 'Near Andheri Railway Station', city: 'Mumbai', district: 'Mumbai Suburban', state: 'Maharashtra', pin: '400058' },
    { house: 'H.No. 8-2-293/82', street: 'Road No. 10, Jubilee Hills', landmark: 'Behind Apollo Hospital', city: 'Hyderabad', district: 'Hyderabad', state: 'Telangana', pin: '500033' },
    { house: '45/2, Lakshmi Nivas', street: 'Race Course Road, Gopalapuram', landmark: 'Near Race Course', city: 'Coimbatore', district: 'Coimbatore', state: 'Tamil Nadu', pin: '641018' },
  ];
  const FEMALE = ['MEERA', 'PRIYA', 'KAVYA', 'LAKSHMI DEVI', 'ANITHA'];
  const titleCase = (n) => n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  function aadhaarLookup(a) {
    const h = hashOf(a.pan, 5);
    const person = a.entity === 'Individual' || a.entity === 'Proprietor';
    const holder = person ? a.kyc.pan.name : PAN_NAMES.P[h % PAN_NAMES.P.length].toUpperCase();
    const addr = ADDRESSES[h % ADDRESSES.length];
    return {
      ok: true, at: nowISO(), name: titleCase(holder), signatory: !person,
      dob: person ? a.dob : (1965 + (h % 25)) + '-0' + ((h % 9) + 1) + '-1' + (h % 9),
      gender: FEMALE.some((f) => holder.startsWith(f)) ? 'Female' : 'Male',
      masked: 'XXXX XXXX ' + String(1000 + (h % 9000)),
      address: Object.assign({ country: 'India' }, addr),
    };
  }
  const addressLine = (x) => [x.house, x.street, x.landmark, x.city, x.district, x.state + ' – ' + x.pin].join(', ');

  const DIGI_KEY = 'lamf-digilocker-request';
  function StepKYC({ a, next, idx }) {
    const done = !!(a.kyc.aadhaar && a.kyc.aadhaar.ok);
    const [phase, setPhase] = useState(done ? 'done' : 'redirect');
    const [gateway, setGateway] = useState('');
    const [kycError, setKycError] = useState('');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      if (done) return undefined;
      let alive = true;
      async function finish(rec) {
        rec.signatory = !(a.entity === 'Individual' || a.entity === 'Proprietor');
        updApp((ag) => { ag.kyc.aadhaar = rec; ag.address = addressLine(rec.address); });
        sessionStorage.removeItem(DIGI_KEY);
        setPhase('done');
      }
      (async () => {
        setKycError('');
        try {
          const remote = await LamfPersist.ping();
          if (!alive) return;
          if (!remote) {
            await sleep(2200); if (!alive) return;
            setPhase('fetch');
            await sleep(1600); if (!alive) return;
            await finish(aadhaarLookup(a));
            return;
          }
          let id = sessionStorage.getItem(DIGI_KEY);
          if (!id) {
            setPhase('redirect');
            const started = await LamfPersist.post('/api/kyc/digilocker', {
              applicationId: a.id, mobile: a.mobile, name: a.name || (a.kyc.pan && a.kyc.pan.name) || '', returnUrl: location.origin + location.pathname,
            });
            if (!alive) return;
            id = started.requestId;
            sessionStorage.setItem(DIGI_KEY, id);
            setGateway(started.gatewayUrl || '');
            if (started.gatewayUrl) window.open(started.gatewayUrl, 'digilocker', 'width=480,height=760');
          }
          for (let i = 0; i < 150 && alive; i++) {
            const result = await LamfPersist.load('/api/kyc/digilocker/' + encodeURIComponent(id));
            if (!alive) return;
            if (result.pending) { setPhase('fetch'); await sleep(2000); continue; }
            if (!result.ok) throw new Error(result.status || 'DigiLocker did not return Aadhaar');
            await finish(result.aadhaar);
            return;
          }
          if (alive) setPhase('waiting');
        } catch (err) {
          if (!alive) return;
          setKycError(err.message || 'DigiLocker could not be started');
          setPhase('error');
        }
      })();
      return () => { alive = false; };
    }, [attempt]);
    const ad = a.kyc.aadhaar || {};
    const x = ad.address || {};
    if (phase !== 'done') {
      return html`<div class="stack">
        <h2>Step 3 · KYC verification</h2>
        ${phase === 'error' ? html`<${Note} tone="err">${kycError}<//><div><${Btn} kind="primary" onClick=${() => { sessionStorage.removeItem(DIGI_KEY); setAttempt((n) => n + 1); }}>Try DigiLocker again<//></div>` : html`<div class="loader" role="status" aria-live="polite">
          <span class="loader-ring" aria-hidden="true"></span>
          <h3>${phase === 'redirect' ? 'Redirecting you to DigiLocker…' : phase === 'waiting' ? 'Still waiting for DigiLocker' : 'Fetching your Aadhaar from DigiLocker…'}</h3>
          <p class="muted small" style="margin:0">${phase === 'redirect' ? 'Complete DigiLocker in the window that opened. It asks you to share your Aadhaar.' : 'Almost done. Please wait a moment.'}</p>
          ${gateway && html`<p class="small" style="margin:0"><a href=${gateway} target="_blank" rel="noopener">Open DigiLocker</a> if the window did not open.</p>`}
          ${phase === 'waiting' && html`<div><${Btn} kind="primary" onClick=${() => setAttempt((n) => n + 1)}>Check again<//></div>`}
        </div>`}
      </div>`;
    }
    return html`<div class="stack">
      <h2>Step 3 · KYC verification</h2>
      ${ad.signatory && html`<${Note} tone="info">Aadhaar of the authorised signatory of ${a.name}.<//>`}
      <div class="grid g2">
        <div class="aadhaar-card" role="img" aria-label=${'Aadhaar card of ' + ad.name}>
          <div class="ac-head"><span>Aadhaar</span></div>
          <div class="ac-body">
            <div class="ac-photo"><${UI.IdPhoto} src=${ad.photo} name=${ad.name} /></div>
            <dl class="ac-info">
              <dt>Name</dt><dd>${ad.name}</dd>
              <dt>Date of birth</dt><dd>${fd(ad.dob)}</dd>
              <dt>Gender</dt><dd>${ad.gender}</dd>
            </dl>
          </div>
          <div class="ac-num">${ad.masked}</div>
        </div>
        <div class="card">
          <h3>Address as per Aadhaar</h3>
          <div class="mt"><${KV} items=${[['House / Flat no.', x.house], ['Street / Locality', x.street], ['Landmark', x.landmark], ['City / Town', x.city], ['District', x.district], ['State', x.state], ['PIN code', x.pin], ['Country', x.country]]} /></div>
        </div>
      </div>
      <div class="row end"><${Btn} kind="primary" onClick=${() => { stepDone(idx, () => {}); next(); }}>Continue →<//></div>
    </div>`;
  }

  /* IFSC finder data: state → city → branches (sample directory). */
  const BRANCH_DIR = {
    'Tamil Nadu': { Chennai: ['T Nagar', 'Anna Nagar', 'Adyar', 'Velachery'], Coimbatore: ['RS Puram', 'Gandhipuram', 'Peelamedu'], Madurai: ['Anna Nagar', 'KK Nagar'] },
    Karnataka: { Bengaluru: ['Koramangala', 'Indiranagar', 'Jayanagar', 'Whitefield'], Mysuru: ['Saraswathipuram', 'Vijayanagar'] },
    Maharashtra: { Mumbai: ['Andheri East', 'Bandra West', 'Fort'], Pune: ['Kothrud', 'Shivajinagar', 'Hinjewadi'] },
    Delhi: { 'New Delhi': ['Connaught Place', 'Karol Bagh', 'Saket'] },
    Telangana: { Hyderabad: ['Banjara Hills', 'Madhapur', 'Secunderabad'] },
  };
  const DIR_BANKS = ['SBIN', 'HDFC', 'ICIC', 'UTIB', 'KKBK', 'IOBA'];
  function branchesOf(state, city, bank) {
    const out = [];
    (BRANCH_DIR[state] && BRANCH_DIR[state][city] || []).forEach((loc) => {
      const n = String(hashOf(state + city + loc + bank) % 900000 + 100000);
      out.push({ ifsc: bank + '0' + n, label: loc, branch: loc + ', ' + city });
    });
    return out;
  }
  function IfscFinder({ onPick, onClose }) {
    const [bank, setBank] = useState('');
    const [st, setSt] = useState('');
    const [city, setCity] = useState('');
    const [br, setBr] = useState('');
    const banks = DIR_BANKS.map((code) => ({ v: code, l: IFSC[code] })).sort((a, b) => a.l.localeCompare(b.l));
    const list = bank && st && city ? branchesOf(st, city, bank) : [];
    const pick = list.find((x) => x.ifsc === br);
    return html`<${UI.Modal} title="Find your IFSC" icon=${ico(ICONS.search)} sub="Select your branch and we'll fill in the IFSC for you." onClose=${onClose}
      footer=${html`<${Btn} kind="primary" disabled=${!pick} onClick=${() => onPick(pick)}>Use this branch<//>`}>
      <div class="stack">
        <${UI.Select} label="Bank" value=${bank} onChange=${(v) => { setBank(v); setSt(''); setCity(''); setBr(''); }} options=${[{ v: '', l: 'Select bank' }, ...banks]} />
        <${UI.Select} label="State" value=${st} disabled=${!bank} onChange=${(v) => { setSt(v); setCity(''); setBr(''); }} options=${[{ v: '', l: 'Select state' }, ...Object.keys(BRANCH_DIR)]} />
        <${UI.Select} label="City" value=${city} disabled=${!st} onChange=${(v) => { setCity(v); setBr(''); }} options=${[{ v: '', l: 'Select city' }, ...(st ? Object.keys(BRANCH_DIR[st]) : [])]} />
        <${UI.Select} label="Branch" value=${br} disabled=${!city} onChange=${setBr} options=${[{ v: '', l: 'Select branch' }, ...list.map((x) => ({ v: x.ifsc, l: x.label }))]} />
        ${pick && html`<${Note} tone="ok">IFSC <b class="mono">${pick.ifsc}</b> · ${IFSC[pick.ifsc.slice(0, 4)]}, ${pick.branch}<//>`}
      </div><//>`;
  }

  function StepBank({ a, next, idx }) {
    const saved = a.kyc.bank && a.kyc.bank.acc ? a.kyc.bank : null;
    const panName = a.kyc.pan.name || (a.name || '').toUpperCase();
    const [f, setF] = useState({ holder: (saved && saved.holder) || panName, type: (saved && saved.type) || 'Savings', acc: '', acc2: '', ifsc: (saved && saved.ifsc) || '' });
    const [busy, setBusy] = useState(false);
    const [res, setRes] = useState(saved);
    const [mismatch, setMismatch] = useState(false);
    const [cheque, setCheque] = useState(saved && saved.cheque);
    const set = (k) => (v) => { setF((x) => Object.assign({}, x, { [k]: v }, k === 'ifsc' && v !== x.ifsc ? { branchName: '' } : {})); setRes(null); setCheque(null); };
    const [finder, setFinder] = useState(false);
    const bankName = IFSC_RE.test(f.ifsc) ? IFSC[f.ifsc.slice(0, 4)] || 'Co-operative Bank' : null;
    const branch = bankName ? f.branchName || (saved && saved.ifsc === f.ifsc && saved.branch) || 'Branch ' + f.ifsc.slice(5) : '';
    async function penny() {
      setBusy(true); setCheque(null); setMismatch(false);
      try {
        if (await LamfPersist.ping()) {
          const r = await LamfPersist.post('/api/kyc/bank', { accountNumber: f.acc, ifsc: f.ifsc, holder: f.holder.trim(), panName, type: f.type });
          if (!r.bank) r.bank = bankName;
          if (!r.branch) r.branch = branch;
          setRes(r);
          if (r.nameMismatch) setMismatch(true);
        } else {
          await sleep(1300);
          const beneficiary = f.acc.endsWith('0000') ? 'K KARTHIKEYAN' : f.holder.trim().toUpperCase();
          const r = { mode: 'manual', method: 'Penny drop ₹1', acc: 'XXXXXXXX' + f.acc.slice(-4), ifsc: f.ifsc, bank: bankName, branch, type: f.type, holder: f.holder.trim(), beneficiary, at: nowISO() };
          r.nameMatch = nameMatch(panName, beneficiary); r.ok = r.nameMatch >= CONFIG.nameMatch; setRes(r); if (!r.ok) setMismatch(true);
        }
      } catch (err) {
        setRes({ ok: false, status: err.message || 'The bank account could not be verified' });
      }
      setBusy(false);
    }
    const accErr = f.acc && !/^\d{9,18}$/.test(f.acc) ? 'Account number is 9–18 digits' : '';
    const acc2Err = f.acc2 && f.acc !== f.acc2 ? 'Account numbers do not match' : '';
    const ifscErr = f.ifsc.length === 11 && !IFSC_RE.test(f.ifsc) ? 'Invalid IFSC (e.g. HDFC0001234)' : '';
    const manualOk = f.holder.trim() && /^\d{9,18}$/.test(f.acc) && f.acc === f.acc2 && bankName;
    const canSave = res && res.ok;
    return html`<div class="stack">
      ${finder && html`<${IfscFinder} onClose=${() => setFinder(false)} onPick=${(x) => { setF((y) => Object.assign({}, y, { ifsc: x.ifsc, branchName: x.branch })); setRes(null); setCheque(null); setFinder(false); toast('IFSC ' + x.ifsc + ' filled in'); }} />`}
      <h2>Step 4 · Bank account for payouts</h2>
      <p class="muted" style="margin:0">Commissions are paid into this account. We verify it by crediting ₹1.</p>
      <div class="card stack">
          <div class="grid g2">
            <${Input} label="Account holder name" value=${f.holder} onChange=${set('holder')} />
            <div class="field"><span>Account type</span><div class="chips">${['Savings', 'Current'].map((t) => html`<button key=${t} class=${'chip' + (f.type === t ? ' on' : '')} onClick=${() => set('type')(t)}>${t}</button>`)}</div></div>
            <${Input} label="Account number" value=${f.acc} onChange=${(v) => set('acc')(v.replace(/\D/g, '').slice(0, 18))} inputmode="numeric" autocomplete="off" err=${accErr} />
            <${Input} label="Re-enter account number" value=${f.acc2} onChange=${(v) => set('acc2')(v.replace(/\D/g, '').slice(0, 18))} inputmode="numeric" autocomplete="off" err=${acc2Err} onPaste=${(e) => e.preventDefault()} />
            <div class="ifsc-wrap"><${Input} label="IFSC" value=${f.ifsc} onChange=${(v) => set('ifsc')(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))} placeholder="HDFC0001234" err=${ifscErr} hint=${bankName ? bankName + ' · ' + branch : ''} />
              <div class="ifsc-link"><${Btn} kind="link" onClick=${() => setFinder(true)}>Don't know your IFSC?<//></div></div>
          </div>
          <div><${Btn} kind="primary" disabled=${!manualOk || busy} onClick=${penny}>Verify account<//></div>
        </div>
      ${res && (res.acc ? html`<${Note} tone=${res.ok ? 'ok' : 'warn'}><${KV} items=${[['Account', res.acc + ' · ' + (res.type || 'Savings')], ['Bank / IFSC', (res.bank || 'Bank') + ' · ' + res.ifsc], ['Name as per bank', res.beneficiary || '—']]} /><//>` : html`<${Note} tone="err">${res.status}<//>`)}
      ${busy && html`<${UI.LoaderPop} text="Crediting ₹1 to your account…" sub="We're verifying your account and fetching the account holder's name." />`}
      ${mismatch && res && html`<${UI.Modal} title="Name doesn't match" icon=${ico(ICONS.alert)} sub=${'The bank account is in the name of ' + res.beneficiary + ', which doesn\'t match your PAN name ' + panName + '. Please add a bank account held in your own name to continue.'} onClose=${() => setMismatch(false)}
        footer=${html`<${Btn} kind="primary" onClick=${() => setMismatch(false)}>Change bank details<//>`}><//>`}
      <div class="row end"><${Btn} kind="primary" disabled=${!canSave} onClick=${() => { stepDone(idx, (ag) => { ag.kyc.bank = Object.assign({}, res, { acc: maskAccount(res.acc), cheque: null }); }); next(); }}>Save & continue →<//></div>
    </div>`;
  }

  const DOCS_BY_ENTITY = {
    Individual: [],
    Proprietor: [],
    Partnership: [{ k: 'deed', l: 'Partnership deed', req: true }],
    Company: [{ k: 'coi', l: 'Certificate of Incorporation (COI)', req: true }],
  };
  function StepGST({ a, next, idx }) {
    const [gstin, setGstin] = useState(a.kyc.gst.gstin || '');
    const [res, setRes] = useState(a.kyc.gst.gstin ? a.kyc.gst : null);
    const [busy, setBusy] = useState(false);
    const [docs, setDocs] = useState(Object.assign({}, a.kyc.docs));
    const list = DOCS_BY_ENTITY[a.entity] || [];
    const docsOk = list.every((x) => !x.req || docs[x.k]);
    const gstOk = !gstin || (res && res.ok);
    async function verify() {
      setBusy(true);
      try {
        if (await LamfPersist.ping()) setRes(await LamfPersist.post('/api/kyc/gst', { gstin }));
        else {
          await sleep(900);
          setRes({ ok: true, gstin, legalName: (a.name || '').toUpperCase(), state: 'State code ' + gstin.slice(0, 2), status: 'Active', skipped: false });
        }
      } catch (err) {
        setRes({ ok: false, status: err.message || 'GSTIN could not be verified' });
      }
      setBusy(false);
    }
    return html`<div class="stack">
      <h2>Step 5 · GST & entity documents</h2>
      <div class=${'grid gst-fields' + (list.length ? ' g2' : '')}>
        <${Input} label="GSTIN (optional)" value=${gstin} onChange=${(v) => { setGstin(v.toUpperCase().slice(0, 15)); setRes(null); }} placeholder="33ABCDE1234F1Z5" err=${gstin.length === 15 && !GST_RE.test(gstin) ? 'Invalid GSTIN format' : ''} hint="Leave blank if you are not GST registered. TDS still applies." />
        ${list.map((x) => html`<${FileIn} key=${x.k} label=${x.l + (x.req ? ' *' : ' (optional)')} value=${docs[x.k]} onChange=${(v) => setDocs((d) => Object.assign({}, d, { [x.k]: v }))} />`)}
      </div>
      ${gstin && html`<div><${Btn} disabled=${!GST_RE.test(gstin) || busy} onClick=${verify}>Verify GSTIN<//></div>`}
      ${busy && html`<${UI.LoaderPop} />`}
      ${res && (res.ok ? html`<${Note} tone="ok"><${KV} items=${[['Legal name', res.legalName], ['Status', res.status], ['Jurisdiction', res.state]]} /><//>` : html`<${Note} tone="err">${res.status}<//>`)}
      <div class="row end"><${Btn} kind="primary" disabled=${!(docsOk && gstOk)} onClick=${() => { stepDone(idx, (ag) => { ag.kyc.gst = gstin ? res : { ok: true, skipped: true }; ag.gstRegistered = !!gstin; ag.kyc.docs = docs; }); next(); }}>Save & continue →<//></div>
    </div>`;
  }

  /* Review sections (design-system pattern): a card per section with an Edit link and label-over-value cells. */
  const DOC_LABEL = { deed: 'Partnership deed', coi: 'Certificate of Incorporation (COI)', udyam: 'Udyam / Shop & Establishment certificate' };
  function ReviewCards({ a, onEdit }) {
    const k = a.kyc, ad = k.aadhaar || {}, x = ad.address || {}, bank = k.bank || {}, gst = k.gst || {};
    const person = isPerson(a.entity);
    const entityLabel = person ? 'Individual / Proprietor' : a.entity;
    const skipKyc = isFirm(a.entity);
    const docs = Object.entries(k.docs || {}).filter(([, v]) => v);
    const sections = [
      ['Contact details', 0, k.emailOk ? [['Mobile number', a.mobile], ['Email ID', html`<span class="one-line">${a.email}</span>`]] : []],
      ['Entity & PAN', 1, k.pan.ok ? [['Partner type', a.partnerType || ''], ['Entity type', entityLabel], ['Profession', a.profession === 'Others' && a.professionDetail ? 'Others — ' + a.professionDetail : (a.profession || '')], ...(a.arn ? [['ARN number', a.arn]] : []), [person ? 'Name as per PAN' : 'Entity name as per PAN', k.pan.name], ['PAN', a.pan], ...(isFirm(a.entity) ? [['Date of incorporation', fd(a.dob)]] : [])] : []],
      ['KYC information', 2, skipKyc ? [['KYC verification', 'Not applicable']] : ad.ok ? [['Name as per Aadhaar', ad.name], ['Aadhaar', ad.masked], ['Address', [x.house, x.street, x.city, x.state + ' – ' + x.pin].filter(Boolean).join(', ')]] : []],
      ['Bank account', 3, bank.acc ? [['Account', bank.acc + ' · ' + (bank.type || 'Savings')], ['Bank / IFSC', bank.bank + ' · ' + bank.ifsc], ['Name as per bank', bank.beneficiary], ...(bank.cheque ? [['Cancelled cheque', bank.cheque.name]] : [])] : []],
      ['GST & entity documents', 4, gst.ok ? [['GSTIN', gst.skipped ? 'Not GST registered' : gst.gstin], ...docs.map(([key, f]) => [DOC_LABEL[key] || key, f.name])] : []],
    ];
    return html`<div>${sections.map(([t, step, items]) => html`<section class="rv-card" key=${t} aria-label=${t}>
      <div class="rv-h"><h3>${t}</h3>${onEdit && !(skipKyc && step === 2) ? html`<button class="rv-edit" onClick=${() => onEdit(step)} aria-label=${'Edit ' + t}>Edit</button>` : ''}</div>
      ${items.length ? html`<${KV} items=${items} />` : html`<span class="rv-pending">Not completed yet</span>`}
    </section>`)}</div>`;
  }

  const TERMS = [
    ['Eligibility', 'You confirm that you are at least 18 years old (or a validly registered entity) and legally able to act as a partner.'],
    ['Conduct', 'You will source customers honestly, share accurate product information, and never collect fees, cash or OTPs from customers.'],
    ['Data & privacy', 'You will protect customer information, use it only to process applications, and follow applicable data-protection laws.'],
    ['Commercials', 'Commission and fee-share are paid as per the partner agreement and the rate card in force, after applicable taxes.'],
    ['Verification', 'We may verify your details with third parties, including credit bureaus and KYC registries, at onboarding and during the partnership.'],
    ['Termination', 'Either party may end the partnership with notice. We may suspend or end it immediately for misconduct or breach of these terms.'],
  ];
  function StepReview({ a, goTo }) {
    const [decl, setDecl] = useState(false);
    const [tnc, setTnc] = useState(false);
    const [showTnc, setShowTnc] = useState(false);
    const ready = (a.step || 0) >= 5;
    return html`<div class="stack">
      <h2>Step 6 · Review & submit</h2>
      <p class="muted" style="margin:0">Check your details before submitting. Use Edit to change a section.</p>
      <${ReviewCards} a=${a} onEdit=${goTo} />
      <label class=${'decl' + (decl ? ' on' : '')}><input type="checkbox" checked=${decl} onChange=${(e) => setDecl(e.target.checked)} />
        <span><b>Declaration</b><span class="small muted">I declare that the information provided is true and consent to background verification.</span></span></label>
      <label class=${'decl' + (tnc ? ' on' : '')}><input type="checkbox" checked=${tnc} onChange=${(e) => setTnc(e.target.checked)} />
        <span><b>I agree to the <a href="#" class="tnc-link" onClick=${(e) => { e.preventDefault(); e.stopPropagation(); setShowTnc(true); }}>Terms & Conditions</a></b><span class="small muted">Please read them before agreeing.</span></span></label>
      <div class="row end"><${Btn} kind="primary" disabled=${!decl || !tnc || !ready} onClick=${() => {
        updApp((ag, st) => {
          ag.consents = { declaration: true, terms: true, at: nowISO() };
          ag.appStatus = 'Submitted'; ag.submittedAt = nowISO(); ag.ref = ag.ref || nextRef();
          ag.qc = null; ag.reapply = false;
          ag.timeline.push({ ts: ag.submittedAt, status: 'Submitted' });
          notify(st, 'Application ' + ag.ref + ' submitted. We will verify your details within 2 working days.', 'SMS · Email');
        });
        window.scrollTo(0, 0);
      }}>Submit application<//></div>
      ${showTnc && html`<${UI.Modal} title="Terms & Conditions" onClose=${() => setShowTnc(false)} wide footer=${html`<${Btn} onClick=${() => setShowTnc(false)}>Close<//><${Btn} kind="primary" onClick=${() => { setTnc(true); setShowTnc(false); }}>I agree<//>`}>
        <ol class="tnc">${TERMS.map(([h, t]) => html`<li key=${h}><b>${h}.</b> ${t}</li>`)}</ol>
      <//>`}
    </div>`;
  }

  /* ---------- partner e-agreement (sent by the approver, e-signed here via DigiLocker) ---------- */
  const pct = (n) => (+n).toFixed(2).replace(/\.?0+$/, '') + '%';
  function commLines(a) {
    const c = a.qc && a.qc.commercials;
    if (!c) return " as per the Lender's published rate card.";
    const items = [];
    if (c.payout != null) items.push('<li>The Partner receives ' + pct(c.payout) + ' of the disbursed loan amount</li>');
    (c.interest || []).forEach((r) => items.push('<li>Interest rate share: where the interest rate is ' + pct(r.from) + ' to ' + pct(r.to) + ', the Partner receives ' + pct(r.then) + '</li>'));
    const OP = { '<': 'less than', '>': 'more than', '<=': 'up to', '>=': 'at least' };
    (c.procFee || []).forEach((r) => items.push('<li>Processing fee share: where the loan amount is ' + OP[r.op] + ' ' + UI.inr(r.amount) + ', the Partner receives ' + UI.inr(r.share) + '</li>'));
    return '<ul>' + items.join('') + '</ul>';
  }
  function validityClause(a) {
    const v = a.qc && a.qc.commercials && a.qc.commercials.validity;
    if (!v) return '';
    return '<li>This agreement is valid ' + (v.until ? 'till ' + fd(v.until) : 'for ' + (v.months % 12 ? v.months + ' months' : v.months / 12 + (v.months === 12 ? ' year' : ' years')) + ' from the date of signing') + ', unless ended earlier under its terms.</li>';
  }
  function agreementHTML(a, signed) {
    const ad = a.kyc.aadhaar || {}, bank = a.kyc.bank || {};
    return `<h1>Partner (DSA) Agreement</h1>
      <p class="muted">Agreement ref: LAMF/DSA/${a.ref}/${new Date().getFullYear()}</p>
      <p>This agreement is made between <b>the Lender</b> (offering Loans Against Mutual Funds) and <b>${a.name}</b> (${a.entity}), PAN <b>${a.pan}</b>, of ${a.address || '—'} ("Partner").</p>
      <ol>
        <li>The Partner will source customers for Loans Against Mutual Funds and will not collect any fee or cash from customers.</li>
        ${validityClause(a)}<li>Commercials payable to the Partner on disbursed loans, monthly, after applicable TDS${a.gstRegistered ? ' and with GST' : ''}:${commLines(a)}</li>
        <li>Payouts are credited to the verified bank account ${bank.acc || '—'} (${bank.bank || '—'}).</li>
        <li>The Partner will follow the Fair Practices Code, KYC/AML norms and data-privacy obligations.</li>
        <li>Either party may end this agreement with 30 days' notice. The Lender may suspend the Partner immediately for misconduct.</li>
      </ol>
      ${signed ? `<p style="margin-top:20px"><b>Digitally signed using Aadhaar e-Sign via DigiLocker</b> by ${ad.name || a.name} (Aadhaar ${ad.masked || ''}) on ${fdt(signed.signedAt)} · Doc ID ${signed.docId}</p>` : '<p style="margin-top:20px" class="muted">Signature pending</p>'}`;
  }

  function SignModal({ a, onClose }) {
    const [step, setStep] = useState('read');
    const [agree, setAgree] = useState(false);
    async function sign() {
      setStep('redirect'); await sleep(2200);
      setStep('signing'); await sleep(1600);
      updApp((ag, st) => {
        const code = nextAgentCode();
        ag.agreement = { signedAt: nowISO(), docId: 'ESG' + Math.floor(1e7 + Math.random() * 9e7), agentCode: code, tempPassword: 'Welcome@123' }; // prototype: email is simulated, so every temporary password is Welcome@123
        notify(st, 'Agreement signed. Your partner account is active. User ID ' + ag.email + ', temporary password sent by email.', 'SMS · Email');
      });
      onClose();
    }
    const footer = step === 'read'
      ? html`<${Btn} onClick=${onClose}>Cancel<//><${Btn} kind="primary" disabled=${!agree} onClick=${sign}>e-Sign via DigiLocker ↗<//>` : null;
    return html`<${UI.Modal} title="Sign partner e-agreement" onClose=${step === 'read' ? onClose : null} wide footer=${footer}>
      ${step === 'read' && html`<div class="stack">
        <div class="agreement" dangerouslySetInnerHTML=${{ __html: agreementHTML(a, null) }}></div>
        <label class=${'decl' + (agree ? ' on' : '')}><input type="checkbox" checked=${agree} onChange=${(e) => setAgree(e.target.checked)} />
          <span><b>I have read and agree to the partner agreement</b><span class="small muted">You'll be taken to DigiLocker to e-sign it with your Aadhaar.</span></span></label>
      </div>`}
      ${step !== 'read' && html`<div class="loader" role="status" aria-live="polite">
        <span class="loader-ring" aria-hidden="true"></span>
        <h3>${step === 'redirect' ? 'Redirecting you to DigiLocker…' : 'Applying your Aadhaar e-sign…'}</h3>
        <p class="muted small" style="margin:0">${step === 'redirect' ? 'You will be taken to DigiLocker to securely e-sign your partner agreement.' : 'Almost done. Please wait a moment.'}</p>
        <p class="muted small" style="margin:0">Please don't close or refresh this page.</p>
      </div>`}
    <//>`;
  }

  function Tracker({ a }) {
    const qc = a.qc || {};
    const approved = a.appStatus === 'Approved', rejected = a.appStatus === 'Rejected';
    const signed = approved && a.agreement && a.agreement.signedAt ? a.agreement : null;
    const [signing, setSigning] = useState(false);
    const firm = isFirm(a.entity);
    const stages = [
      ...(firm ? [] : [{ t: 'KYC verified', d: a.kyc.aadhaar && a.kyc.aadhaar.at ? 'Aadhaar via DigiLocker · ' + fdt(a.kyc.aadhaar.at) : 'Done', state: 'done' }]),
      { t: 'Submitted', d: fdt(a.submittedAt), state: 'done' },
      { t: 'Application review', d: rejected ? 'Reviewed · ' + fdt(qc.at) : approved ? 'Reviewed · ' + fdt(qc.at) : 'Our team is checking your application.', state: approved || rejected ? 'done' : 'current' },
      rejected
        ? { t: 'Not approved', d: (qc.reason || 'Not approved') + (qc.remarks ? ': ' + qc.remarks : ''), state: 'rejected' }
        : { t: 'Approved', d: signed ? 'E-agreement signed · ' + fdt(signed.signedAt) : approved ? 'Sign the e-agreement to activate your account.' : 'We send you the partner e-agreement to sign.', state: approved ? 'done' : 'pending', action: approved && !signed },
    ];
    return html`<div class="content-narrow">
      ${signed ? html`<div class="card success mb">
          <${SuccessMark} />
          <h1>You're now a partner!</h1>
          <p class="muted" style="margin:6px 0 14px">Agreement signed on ${fdt(signed.signedAt)}. Your partner account is active.</p>
          <div class="agent-id"><span class="small muted">Agent ID</span><b class="mono">${signed.agentCode}</b>
            <${Btn} sm onClick=${() => { try { navigator.clipboard.writeText(signed.agentCode); } catch (e) { /* ignore */ } toast('Agent ID copied'); }}>Copy<//></div>
          <p class="small" style="margin:10px 0 0">User ID <b class="mono">${a.email}</b></p>
          <p class="small muted" style="margin:6px 0 0">Your temporary password has been emailed to ${a.email}. You'll set your own password the first time you sign in.</p>
          <div class="row mt" style="justify-content:center">
            <a class="btn primary" href=${AGENT_PORTAL_URL + '?id=' + encodeURIComponent(a.email)} target="_blank" rel="noopener">Open agent portal ↗</a>
            <${Btn} onClick=${() => UI.printHTML('Signed partner agreement', agreementHTML(a, signed))}>Download signed agreement<//>
          </div>
        </div>
        <${Card} title="How to use your Agent ID" cls="mb">
          <ol class="howto">
            <li><b>Open the agent portal</b> with the button above, or <a href=${AGENT_PORTAL_URL + '?id=' + encodeURIComponent(a.email)} target="_blank" rel="noopener">open the agent portal sign-in</a>.</li>
            <li><b>Sign in</b> with your User ID <b class="mono">${a.email}</b> and the temporary password emailed to you.</li>
            <li><b>Set a new password</b> when asked. From then on, sign in with your User ID and that password.</li>
            <li><b>Add customer leads</b> and share your application link. Every application is tagged to your Agent ID.</li>
            <li><b>Track</b> applications, sanctions and disbursals from your dashboard.</li>
          </ol>
        <//>`
      : approved ? html`<div class="card success mb">
          <${SuccessMark} />
          <h1>Application approved</h1>
          <p class="muted" style="margin:6px 0 12px">One last step: e-sign your partner agreement via DigiLocker to activate your account.</p>
          <div class="row" style="justify-content:center"><${Btn} kind="primary" onClick=${() => setSigning(true)}>Sign e-agreement<//></div>
        </div>`
      : rejected ? html`<div class="card success mb rejected">
          <div class="tick" aria-hidden="true">✕</div>
          <h1>Application not approved</h1>
          <p class="muted" style="margin:6px 0 0">Reference <b class="mono">${a.ref}</b>. Reason: <b>${qc.reason}</b>${qc.remarks ? '. ' + qc.remarks : ''}</p>
          <p class="small muted" style="margin:8px 0 14px">For help, call 1800-000-000 or email partners@lamf.example. You can correct the details and submit again.</p>
          <div class="row" style="justify-content:center"><${Btn} kind="primary" onClick=${() => updApp((ag) => { ag.appStatus = 'Draft'; ag.qc = null; ag.reapply = true; })}>Fix and reapply<//></div>
        </div>`
      : html`<div class="card success mb">
          <${SuccessMark} />
          <h1>Application submitted</h1>
          <p class="muted" style="margin:6px 0 0">Reference number <b class="mono">${a.ref}</b>. We'll SMS and email you at every stage, usually within 2 working days.</p>
        </div>`}
      <${Card} title=${approved || rejected ? 'Application status' : 'What happens next'}>
        <ol class="stp stp-status" aria-label="Application status">${stages.map((x, k) => {
          const st = { done: 'done', current: 'cur', rejected: 'rej', pending: 'todo' }[x.state];
          const line = st === 'cur' ? 'half' : st === 'done' ? 'done' : 'todo';
          return html`<li key=${x.t} class=${'stp-' + st} style=${{ '--i': k }} aria-current=${st === 'cur' ? 'step' : undefined}><div class="stp-item">
            <span class="stp-top"><span class="stp-dot">${st === 'done' ? html`<${UI.Tick} size="34" />` : st === 'rej' ? html`<span aria-hidden="true">✕</span>` : ''}</span>
              ${k < stages.length - 1 && html`<span class=${'stp-line ' + line}></span>`}</span>
            <span class="stp-k">Step ${k + 1}</span>
            <span class="stp-t">${x.t}</span>
            <span class="stp-s">${st === 'cur' ? 'In Progress' : st === 'done' ? 'Completed' : st === 'rej' ? 'Not approved' : 'Pending'}</span>
            ${x.d && x.d !== 'Completed' && html`<span class="stp-d">${x.d}</span>`}
          </div></li>`;
        })}</ol>
        ${stages.some((x) => x.action) && html`<div class="row end mt"><${Btn} kind="primary" onClick=${() => setSigning(true)}>Sign e-agreement<//></div>`}
      <//>
      ${!signed && html`<div class="mt"><h2 style="margin-bottom:12px">Your submitted details</h2><${ReviewCards} a=${a} /></div>`}
      ${signing && html`<${SignModal} a=${a} onClose=${() => setSigning(false)} />`}
    </div>`;
  }

  /* ======================= SHELL ======================= */
  // Light theme only.
  document.documentElement.setAttribute('data-theme', 'light');

  function Header() {
    const s = useStore();
    const [askExit, setAskExit] = useState(false);
    useEffect(() => { const f = () => setAskExit(true); window.addEventListener('lamf:ask-exit', f); return () => window.removeEventListener('lamf:ask-exit', f); }, []);
    return html`<header class="top">
      <button class="brand-btn" onClick=${() => update((st) => { st.view = 'landing'; })} aria-label="Home"><img class="brand-logo" src=${window.BRAND_LOGO} alt="Shriram Credit" /></button>
      <div class="grow"></div>
      ${s.view === 'apply' && s.app && s.app.appStatus !== 'Draft' && html`<${Btn} sm onClick=${() => update((st) => { st.app = null; st.view = 'landing'; })}>Log out<//>`}
      ${askExit && html`<${UI.Modal} title="Would you like to save your progress?" icon=${ico(ICONS.save)} sub=${remote ? 'We\'ll keep your application in the local database. Use Start application with your mobile number to pick up right where you left off.' : 'We\'ll keep your application on this device. Use Start application with your mobile number to pick up right where you left off.'} onClose=${() => setAskExit(false)}
        footer=${html`<${Btn} onClick=${() => setAskExit(false)}>Keep going<//><${Btn} kind="primary" onClick=${() => { setAskExit(false); update((st) => { st.app = null; st.view = 'landing'; }); toast('Progress saved.'); }}>Save & exit<//>`}></${UI.Modal}>`}
    </header>`;
  }

  function App() {
    const s = useStore();
    return html`<div class="shell"><${Header} /><main>${s.view === 'apply' ? html`<${Journey} />` : html`<${Landing} />`}</main><footer class="foot small muted">Need help? Call 1800-000-000 or email partners@lamf.example</footer><${UI.Toasts} /></div>`;
  }
  ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
})();
