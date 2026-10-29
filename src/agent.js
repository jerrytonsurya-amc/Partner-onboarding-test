/* LAMF partner programme: agent portal (sign-in with Agent ID / mobile + OTP, dashboard with leads). */
(async function () {
  const KEY = 'lamf-agent-portal-v1';
  const ONBOARDING_KEY = 'lamf-partner-onboarding-v7'; // partners who signed the e-agreement in onboarding (same origin)
  const APPLY_BASE = 'https://partners.lamf.example/apply'; // customer application link base
  const PRODUCTS = ['Loan against mutual funds', 'Loan against securities'];
  const nowISO = () => new Date().toISOString();
  const d = (s) => new Date(s).toISOString();

  /* Built-in demo partner so the portal can be tried without onboarding first. */
  const DEMO = { agentCode: 'SCL-AG-000001', name: 'Priya Venkatesh', mobile: '9600034567', email: 'priya.v@example.com', pan: 'DEFPV2468M', entity: 'Individual', demo: true, tempPassword: 'Welcome@123' };
  const DEMO_LEADS = [
    { id: 'LD-30018', name: 'Hariprasath V', mobile: '8903263193', pan: 'AWLPH7421F', email: '', product: 'Loan against securities', status: 'Not started', createdAt: d('2026-08-04T17:03:00') },
    { id: 'LD-30022', name: 'Kavitha Raman', mobile: '9841022331', pan: 'BQRPR6612K', email: 'kavitha.r@example.com', product: 'Loan against mutual funds', status: 'In progress', createdAt: d('2026-09-12T11:20:00') },
    { id: 'LD-30027', name: 'Sanjay Menon', mobile: '9884011245', pan: 'CTMPM2290L', email: '', product: 'Loan against mutual funds', status: 'Disbursed', sanctioned: 900000, disbursed: 750000, createdAt: d('2026-09-28T15:45:00') },
    { id: 'LD-30031', name: 'Deepa Natarajan', mobile: '9790033447', pan: 'DNKPN8823P', email: '', product: 'Loan against mutual funds', status: 'Sanctioned', sanctioned: 500000, createdAt: d('2026-10-10T10:05:00') },
  ];

  /* ---------- store ---------- */
  let state = { v: 3, session: null, creds: {}, leads: { [DEMO.agentCode]: DEMO_LEADS }, partners: [] };
  let remote = false;
  const saver = LamfPersist.queued();
  const subs = new Set();
  try {
    remote = await LamfPersist.ping();
    if (remote) state = await LamfPersist.load('/api/agent');
    else {
      try { const raw = localStorage.getItem(KEY); if (raw) state = JSON.parse(raw); } catch (e) { /* storage unavailable */ }
      if (!state || state.v !== 3) state = { v: 3, session: null, creds: {}, leads: { [DEMO.agentCode]: DEMO_LEADS }, partners: [] };
    }
  } catch (e) {
    document.getElementById('root').textContent = 'Could not load the application database. Leave this page open from the local server (node serve.js) and refresh.';
    return;
  }
  function adopt(next) {
    if (!next || saver.busy()) return;
    if (JSON.stringify(state) === JSON.stringify(next)) return;
    state = next;
    subs.forEach((f) => f());
  }
  function update(fn) {
    fn(state);
    state = Object.assign({}, state);
    if (remote) {
      const snap = JSON.parse(JSON.stringify(state));
      saver.run(() => LamfPersist.save('/api/agent', snap)).then((saved) => { if (!saver.busy()) adopt(saved); }).catch(() => toast('Could not save to the database.', 'Agent portal'));
    } else {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    }
    subs.forEach((f) => f());
  }
  window.Store = { get: () => state, update, subscribe: (f) => { subs.add(f); return () => subs.delete(f); } };
  if (remote) LamfPersist.watch('/api/agent', () => saver.busy(), adopt);
  else window.addEventListener('storage', (e) => { if (e.key === ONBOARDING_KEY) subs.forEach((f) => f()); });

  /* Active partners: from SQLite when served, otherwise the demo partner plus anyone who e-signed in this browser. */
  function partners() {
    if (remote) return state.partners || [];
    const list = [DEMO];
    try {
      const o = JSON.parse(localStorage.getItem(ONBOARDING_KEY) || 'null');
      Object.values((o && o.journeys) || {}).forEach((a) => {
        if (a.agreement && a.agreement.signedAt && !list.some((p) => p.agentCode === a.agreement.agentCode)) list.push({ agentCode: a.agreement.agentCode, name: a.name, mobile: a.mobile, email: a.email, pan: a.pan, entity: a.entity, tempPassword: a.agreement.tempPassword || 'Welcome@123' });
      });
    } catch (e) { /* ignore */ }
    return list;
  }
  const me = () => partners().find((p) => p.agentCode === state.session) || null;
  const myLeads = () => (state.leads[state.session] || []);

  const { html, useState, useEffect, useStore, otp, inr } = UI;
  const { Btn, Input, Select, Modal, Note, KV } = UI;
  const copy = (text, what) => { try { navigator.clipboard.writeText(text); } catch (e) { /* ignore */ } toast((what || 'Link') + ' copied'); };
  const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const genDate = (iso) => { const t = new Date(iso); return ordinal(t.getDate()) + ' ' + t.toLocaleDateString('en-IN', { month: 'short' }) + ', ' + t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }); };
  const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  const MOB_RE = /^[6-9]\d{9}$/;
  const leadLink = (lead, code) => APPLY_BASE + '?agent=' + code + (lead ? '&lead=' + lead.id : '');
  const TONE = { 'Not started': 'err', 'In progress': 'warn', Sanctioned: 'info', Disbursed: 'ok', Rejected: 'err' };

  /* ---------- icons (stroke, currentColor) ---------- */
  const P = {
    dashboard: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
    user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
    help: 'M4 13v-1a8 8 0 0116 0v1M4 13h3v6H5a1 1 0 01-1-1zM20 13h-3v6h2a1 1 0 001-1z',
    search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
    plus: 'M12 5v14M5 12h14',
    chevron: 'M6 9l6 6 6-6',
    logout: 'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l4-4-4-4M14 12H4',
  };
  const Icon = ({ n, size }) => html`<svg class="ico" width=${size || 20} height=${size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[n]} /></svg>`;

  /* ---------- credentials ----------
     First login uses the temporary password issued at e-sign; the partner must then set their own.
     Passwords are stored as a one-way hash (prototype only). When the portal is served, that hash is kept in SQLite. */
  const hashPw = (pw) => { let h = 0x811c9dc5; for (const c of 'lamf:' + pw) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
  const PW_RULES = [['At least 8 characters', (p) => p.length >= 8], ['An uppercase letter', (p) => /[A-Z]/.test(p)], ['A lowercase letter', (p) => /[a-z]/.test(p)], ['A number', (p) => /\d/.test(p)], ['A special character', (p) => /[^A-Za-z0-9]/.test(p)]];
  const pwOk = (p) => PW_RULES.every(([, t]) => t(p));
  const findPartner = (userId) => partners().find((p) => (p.email || '').toLowerCase() === userId.trim().toLowerCase());

  function PasswordFields({ pw, setPw, pw2, setPw2, tempPw }) {
    const [show, setShow] = useState(false);
    const same = pw2 !== '' && pw === pw2;
    return html`<div class="stack">
      <${Input} label="New password" type=${show ? 'text' : 'password'} value=${pw} onChange=${setPw} autocomplete="new-password" />
      <ul class="pw-rules" aria-label="Password rules">${PW_RULES.map(([l, t]) => html`<li key=${l} class=${t(pw) ? 'ok' : ''}><span aria-hidden="true">${t(pw) ? html`<${UI.Tick} size="14" />` : '•'}</span> ${l}</li>`)}</ul>
      <${Input} label="Confirm new password" type=${show ? 'text' : 'password'} value=${pw2} onChange=${setPw2} autocomplete="new-password"
        err=${pw2 && !same ? 'Passwords do not match' : tempPw && pw && pw === tempPw ? 'Choose a password different from the temporary one' : ''} />
      <label class="check small"><input type="checkbox" checked=${show} onChange=${(e) => setShow(e.target.checked)} /> <span>Show passwords</span></label>
    </div>`;
  }

  /* ======================= SIGN IN ======================= */
  function SignIn() {
    const prefill = new URLSearchParams(location.search).get('id') || '';
    const [view, setView] = useState('login'); // login | reset (first login) | forgot
    const [userId, setUserId] = useState(prefill);
    const [password, setPassword] = useState('');
    const [err, setErr] = useState('');
    const [partner, setPartner] = useState(null);
    const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
    const [fId, setFId] = useState(prefill); const [fSent, setFSent] = useState(false); const [fOtp, setFOtp] = useState(''); const [fOk, setFOk] = useState(false); const [fBusy, setFBusy] = useState(false); const [fFallback, setFFallback] = useState(false);
    const reset = () => { setErr(''); setPw(''); setPw2(''); };

    function login() {
      const p = findPartner(userId);
      const cred = p && state.creds[p.agentCode];
      if (!p || (cred ? hashPw(password) !== cred.hash : password !== p.tempPassword)) return setErr('Incorrect User ID or password.');
      if (!cred) { setPartner(p); reset(); setView('reset'); return; }
      update((s) => { s.session = p.agentCode; s.creds[p.agentCode].lastLogin = nowISO(); if (!s.leads[p.agentCode]) s.leads[p.agentCode] = []; });
      toast('Welcome back, ' + p.name.split(' ')[0] + '!', 'Signed in');
    }
    function savePassword(p, firstTime) {
      update((s) => { s.creds[p.agentCode] = { hash: hashPw(pw), setAt: nowISO(), lastLogin: nowISO() }; s.session = p.agentCode; if (!s.leads[p.agentCode]) s.leads[p.agentCode] = []; });
      toast(firstTime ? 'Password set. Use your User ID and new password from now on.' : 'Password reset. You are signed in.', 'Agent portal');
    }
    async function sendReset() {
      const p = findPartner(fId);
      if (!p) return setErr('No active partner found with this User ID.');
      if (!/^[6-9]\d{9}$/.test(p.mobile || '')) return setErr('This partner has no mobile number for an OTP.');
      setFBusy(true); setErr('');
      try {
        if (await LamfPersist.ping()) await LamfPersist.post('/api/otp/send', { mobile: p.mobile, purpose: 'agent-reset' });
        setFFallback(false);
        setFSent(true);
      } catch (e) {
        setFFallback(true);
        setFSent(true);
        setErr(e.message || 'Could not send the OTP.');
      } finally { setFBusy(false); }
    }
    async function verifyReset() {
      const p = findPartner(fId);
      if (!p) return setErr('No active partner found with this User ID.');
      setFBusy(true); setErr('');
      try {
        if (fFallback) {
          if (fOtp !== otp()) return setErr('Incorrect OTP');
        } else if (await LamfPersist.ping()) await LamfPersist.post('/api/otp/verify', { mobile: p.mobile, purpose: 'agent-reset', otp: fOtp });
        else if (fOtp !== otp()) return setErr('Incorrect OTP');
        setFOk(true); reset();
      } catch (e) {
        setErr(e.message || 'Incorrect OTP');
      } finally { setFBusy(false); }
    }

    const card = (body) => html`<div class="ap-login"><div class="card stack ap-login-card">
      <img class="brand-logo" src=${window.BRAND_LOGO} alt="Shriram Credit" style="height:40px;align-self:flex-start" />${body}</div></div>`;

    if (view === 'reset') return card(html`
      <div><h1>Set a new password</h1><p class="muted" style="margin:4px 0 0">This is your first login, so please replace your temporary password.</p></div>
      <${KV} items=${[['User ID', html`<b class="mono">${partner.email}</b>`], ['Name', partner.name]]} />
      <${PasswordFields} pw=${pw} setPw=${setPw} pw2=${pw2} setPw2=${setPw2} tempPw=${partner.tempPassword} />
      <${Btn} kind="primary" disabled=${!pwOk(pw) || pw !== pw2 || pw === partner.tempPassword} onClick=${() => savePassword(partner, true)}>Set password & continue<//>`);

    if (view === 'forgot') {
      const p = findPartner(fId);
      return card(html`
        <div><h1>Forgot password</h1><p class="muted" style="margin:4px 0 0">We'll send an OTP to your registered mobile number.</p></div>
        <${Input} label="User ID" value=${fId} onChange=${(v) => { setFId(v); setFSent(false); setFOtp(''); setFOk(false); setFFallback(false); setErr(''); }} placeholder="name@example.com" disabled=${fOk} />
        ${!fSent && html`<${Btn} kind="primary" disabled=${!fId.trim() || fBusy} onClick=${sendReset}>${fBusy ? 'Sending OTP…' : 'Send OTP'}<//>`}
        ${fSent && !fOk && html`<div class="stack">
          ${fFallback
            ? html`<${Note} tone="warn">${err || 'SMS could not be sent.'} Enter 000000 to continue.<//>`
            : html`<${Note} tone="info">OTP sent to the mobile registered for ${p.agentCode} (XXXXXX${p.mobile.slice(-4)}). It is valid for 120 seconds.<//>`}
          <${UI.OtpBoxes} value=${fOtp} onChange=${(v) => { setFOtp(v); if (!fFallback) setErr(''); }} autoFocus />
          <${Btn} kind="primary" disabled=${fBusy || fOtp.length !== 6} onClick=${verifyReset}>Verify OTP<//>
        </div>`}
        ${fOk && html`<${PasswordFields} pw=${pw} setPw=${setPw} pw2=${pw2} setPw2=${setPw2} />
          <${Btn} kind="primary" disabled=${!pwOk(pw) || pw !== pw2} onClick=${() => savePassword(p, false)}>Reset password & sign in<//>`}
        ${err && !(fSent && fFallback && !fOk) && html`<${Note} tone="err">${err}<//>`}
        <${Btn} kind="link" onClick=${() => { setView('login'); setFSent(false); setFOtp(''); setFOk(false); setFFallback(false); reset(); }}>← Back to sign in<//>`);
    }

    return card(html`
      <div><h1>Agent portal</h1><p class="muted" style="margin:4px 0 0">Sign in with your User ID and password.</p></div>
      <form class="stack" onSubmit=${(e) => { e.preventDefault(); login(); }}>
        <${Input} label="User ID" value=${userId} onChange=${(v) => { setUserId(v); setErr(''); }} placeholder="Your email ID" autocomplete="username" />
        <${Input} label="Password" type="password" value=${password} onChange=${(v) => { setPassword(v); setErr(''); }} autocomplete="current-password" />
        ${err && html`<${Note} tone="err">${err}<//>`}
        <button class="btn primary" type="submit" disabled=${!userId.trim() || !password}>Sign in</button>
        <${Btn} kind="link" onClick=${() => { setView('forgot'); setFId(userId); setFSent(false); setFOtp(''); setFOk(false); setErr(''); }}>Forgot password?<//>
      </form>
`);
  }

  /* ======================= MODALS ======================= */
  function ShareLinkModal({ title, link, mobile, onClose }) {
    const text = 'Get a loan against your mutual funds without selling them. Apply here: ' + link;
    return html`<${Modal} title=${title} onClose=${onClose} footer=${html`<${Btn} onClick=${onClose}>Close<//>`}>
      <div class="stack">
        <p class="muted" style="margin:0">Applications through this link are tagged to your Agent ID.</p>
        <div class="row"><input readonly value=${link} onFocus=${(e) => e.target.select()} style="flex:1" aria-label="Link" /><${Btn} kind="primary" onClick=${() => copy(link)}>Copy<//></div>
        <div class="row">
          <a class="btn" target="_blank" rel="noopener" href=${'https://wa.me/' + (mobile ? '91' + mobile : '') + '?text=' + encodeURIComponent(text)}>Share on WhatsApp</a>
          <a class="btn" href=${'mailto:?subject=' + encodeURIComponent('Loan against mutual funds') + '&body=' + encodeURIComponent(text)}>Share by email</a>
        </div>
      </div><//>`;
  }

  function LeadModal({ onClose }) {
    const [f, setF] = useState({ name: '', mobile: '', pan: '', email: '', product: PRODUCTS[0] });
    const [err, setErr] = useState('');
    const set = (k) => (v) => { setF(Object.assign({}, f, { [k]: v })); setErr(''); };
    function save() {
      if (!f.name.trim()) return setErr('Enter the client name.');
      if (!MOB_RE.test(f.mobile)) return setErr('Enter a valid 10-digit mobile number.');
      if (!PAN_RE.test(f.pan)) return setErr('Enter a valid PAN (e.g. ABCDE1234F).');
      if (myLeads().some((l) => l.mobile === f.mobile || l.pan === f.pan)) return setErr('A lead with this mobile or PAN already exists.');
      update((s) => { s.leads[s.session] = [{ id: 'LD-' + String(Date.now()).slice(-5), name: f.name.trim(), mobile: f.mobile, pan: f.pan, email: f.email.trim(), product: f.product, status: 'Not started', createdAt: nowISO() }].concat(s.leads[s.session] || []); });
      toast('Lead created for ' + f.name.trim() + '. Share the application link with your client.');
      onClose();
    }
    return html`<${Modal} title="Create a new lead" onClose=${onClose} footer=${html`<${Btn} onClick=${onClose}>Cancel<//><${Btn} kind="primary" onClick=${save}>Create lead<//>`}>
      <div class="stack">
        <div class="grid g2">
          <${Input} label="Client name *" value=${f.name} onChange=${set('name')} />
          <${Input} label="Mobile number *" value=${f.mobile} onChange=${(v) => set('mobile')(v.replace(/\D/g, '').slice(0, 10))} inputmode="numeric" />
          <${Input} label="PAN *" value=${f.pan} onChange=${(v) => set('pan')(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} placeholder="ABCDE1234F" />
          <${Input} label="Email (optional)" value=${f.email} onChange=${set('email')} type="email" />
        </div>
        <${Select} label="Product" value=${f.product} onChange=${set('product')} options=${PRODUCTS} />
        ${err && html`<${Note} tone="err">${err}<//>`}
      </div><//>`;
  }

  /* ======================= DASHBOARD ======================= */
  function Dashboard({ a }) {
    useStore();
    const [modal, setModal] = useState(null);
    const [q, setQ] = useState('');
    const [prod, setProd] = useState('All');
    const [status, setStatus] = useState('All');
    const all = myLeads();
    const count = (s) => all.filter((l) => l.status === s).length;
    const TILES = [['All', 'Total leads', '', all.length], ['Not started', 'Not started', 'err', count('Not started')], ['In progress', 'In progress', 'warn', count('In progress')], ['Sanctioned', 'Sanctioned', 'info', count('Sanctioned')], ['Disbursed', 'Disbursed', 'ok', count('Disbursed')]];
    const leads = all
      .filter((l) => status === 'All' || l.status === status)
      .filter((l) => prod === 'All' || l.product === prod)
      .filter((l) => !q || [l.name, l.id, l.mobile, l.pan, genDate(l.createdAt)].join(' ').toLowerCase().includes(q.toLowerCase()));
    return html`<div>
      <h1 class="ap-h1">Welcome ${a.name}</h1>
      <div class="qc-tabs ap-tiles" role="tablist" aria-label="Leads by status">
        ${TILES.map(([k, label, tone, n]) => html`<button key=${k} role="tab" aria-selected=${status === k} class=${'qc-tab ' + tone + (status === k ? ' on' : '')} onClick=${() => setStatus(k)}>
          <span class="qc-tab-l">${label}</span><span class="qc-tab-n">${n}</span></button>`)}
      </div>
      <div class="ap-leads-h">
        <h2 class="ap-h2">All Leads</h2>
        <div class="row">
          <label class="ap-search"><${Icon} n="search" size=${18} /><input type="search" placeholder="Search by Name, Id, date" aria-label="Search leads" value=${q} onInput=${(e) => setQ(e.target.value)} /></label>
          <button class="btn" onClick=${() => setModal('share')}><${Icon} n="link" size=${18} />Share unique link</button>
          <button class="btn primary" onClick=${() => setModal('lead')}><${Icon} n="plus" size=${18} />Create a new lead</button>
        </div>
      </div>
      <div class="ap-table-wrap"><table class="ap-table ap-leads">
        <colgroup><col class="w-date" /><col class="w-name" /><col class="w-prod" /><col class="w-status" /><col class="w-amt" /><col class="w-amt" /><col class="w-mob" /><col class="w-pan" /><col class="w-act" /></colgroup>
        <thead><tr><th>Generated Date</th><th>Client Name</th>
          <th><label class="th-filter">Product <${Icon} n="chevron" size=${14} /><select value=${prod} onChange=${(e) => setProd(e.target.value)} aria-label="Filter by product">${['All', ...PRODUCTS].map((p) => html`<option key=${p} value=${p}>${p === 'All' ? 'All products' : p}</option>`)}</select></label></th>
          <th>Status</th><th>Sanctioned amount</th><th>Disbursed amount</th><th>Contact Number</th><th>PAN Number</th><th>Actions</th></tr></thead>
        <tbody>${leads.length ? leads.map((l) => html`<tr key=${l.id}>
            <td class="nowrap">${genDate(l.createdAt)}</td>
            <td>${l.name}</td>
            <td><span class="ap-chip">${l.product}</span></td>
            <td><span class=${'ap-pill ' + TONE[l.status]}>${l.status}</span></td>
            <td class="amt">${(l.status === 'Sanctioned' || l.status === 'Disbursed') && l.sanctioned ? html`<b>${inr(l.sanctioned)}</b>` : html`<span class="muted">—</span>`}</td>
            <td class="amt">${l.status === 'Disbursed' && l.disbursed ? html`<b>${inr(l.disbursed)}</b>` : html`<span class="muted">—</span>`}</td>
            <td class="nowrap">${l.mobile ? '+91' + l.mobile : '—'}</td>
            <td class="pan">${l.pan}</td>
            <td><button class="ap-link" onClick=${() => setModal({ share: l })}>Share Link</button></td>
          </tr>`) : html`<tr><td colspan="9" class="ap-empty">${all.length ? (status !== 'All' && !q && prod === 'All' ? 'No leads are ' + status.toLowerCase() + ' yet.' : 'No leads match your search.') : 'No leads yet. Create your first lead or share your unique link.'}</td></tr>`}</tbody>
      </table></div>
      ${modal === 'share' && html`<${ShareLinkModal} title="Share unique link" link=${leadLink(null, a.agentCode)} onClose=${() => setModal(null)} />`}
      ${modal && modal.share && html`<${ShareLinkModal} title=${'Share link with ' + modal.share.name} link=${leadLink(modal.share, a.agentCode)} mobile=${modal.share.mobile} onClose=${() => setModal(null)} />`}
      ${modal === 'lead' && html`<${LeadModal} onClose=${() => setModal(null)} />`}
    </div>`;
  }

  /* ======================= SHELL ======================= */
  // Light theme only.
  document.documentElement.setAttribute('data-theme', 'light');

  function AccountMenu({ a, onClose }) {
    useEffect(() => { const f = (e) => { if (!e.target.closest('.ap-acct')) onClose(); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
    return html`<div class="card ap-menu" role="menu">
      <${Btn} sm kind="danger" onClick=${() => { update((s) => { s.session = null; }); onClose(); }}><${Icon} n="logout" size=${16} />Log out<//>
    </div>`;
  }

  function Menu({ onClose }) {
    useEffect(() => { const f = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, []);
    return html`<div class="drawer-bg" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
      <nav class="drawer" aria-label="Main menu">
        <div class="drawer-h"><span class="brand-btn"><img class="brand-logo" src=${window.BRAND_LOGO} alt="Shriram Credit" /></span><button class="x" aria-label="Close menu" onClick=${onClose}>×</button></div>
        <a href="#" class="drawer-item on" aria-current="page" onClick=${(e) => { e.preventDefault(); onClose(); window.scrollTo(0, 0); }}><span class="row" style="gap:10px"><${Icon} n="dashboard" />Dashboard</span></a>
      </nav>
    </div>`;
  }

  function App() {
    useStore();
    const a = me();
    const [menu, setMenu] = useState(false);
    const [acct, setAcct] = useState(false);
    const [help, setHelp] = useState(false);
    if (!a) return html`<div class="shell"><${SignIn} /><${UI.Toasts} /></div>`;
    return html`<div class="ap">
      <header class="ap-top">
        <button class="btn sm burger" aria-label="Open menu" aria-expanded=${menu} onClick=${() => setMenu(true)}><span aria-hidden="true">☰</span></button>
        <button class="brand-btn" onClick=${() => window.scrollTo(0, 0)} aria-label="Dashboard"><img class="brand-logo" src=${window.BRAND_LOGO} alt="Shriram Credit" /></button>
        <div class="grow"></div>
        <button class="ap-toplink" onClick=${() => setHelp(true)}><${Icon} n="help" />Need Help?</button>
        <div class="ap-acct"><button class="ap-toplink" aria-haspopup="menu" aria-expanded=${acct} onClick=${() => setAcct(!acct)}><${Icon} n="user" />My Account</button>
          ${acct && html`<${AccountMenu} a=${a} onClose=${() => setAcct(false)} />`}</div>
      </header>
      ${menu && html`<${Menu} onClose=${() => setMenu(false)} />`}
      <main class="ap-main"><${Dashboard} a=${a} /></main>
      ${help && html`<${Modal} title="Need help?" onClose=${() => setHelp(false)} footer=${html`<${Btn} onClick=${() => setHelp(false)}>Close<//>`}>
        <${KV} items=${[['Partner helpline', '1800-000-000 (Mon–Sat, 9:30 am – 6:30 pm)'], ['Email', 'partners@lamf.example'], ['Your Agent ID', html`<b class="mono">${a.agentCode}</b>`]]} /><//>`}
      <${UI.Toasts} />
    </div>`;
  }
  ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
})();
