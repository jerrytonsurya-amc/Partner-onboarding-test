/* Shared UI primitives and helpers. */
(function () {
  const { useState, useEffect, useRef, useMemo, useSyncExternalStore } = React;
  // Lets templates use plain HTML attributes (class, style="a:b", for) on top of React.
  const parseStyle = (str) => str.split(';').reduce((o, decl) => {
    const i = decl.indexOf(':'); if (i < 0) return o;
    const k = decl.slice(0, i).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()); o[k] = decl.slice(i + 1).trim(); return o;
  }, {});
  function h(type, props, ...children) {
    if (props) {
      if (props.class !== undefined) { props.className = props.class; delete props.class; }
      if (props.for !== undefined) { props.htmlFor = props.for; delete props.for; }
      if (typeof props.style === 'string') props.style = parseStyle(props.style);
      if (props.readonly !== undefined) { props.readOnly = props.readonly; delete props.readonly; }
      if (props.maxlength !== undefined) { props.maxLength = props.maxlength; delete props.maxlength; }
      if (props.inputmode !== undefined) { props.inputMode = props.inputmode; delete props.inputmode; }
      if (props.autocomplete !== undefined) { props.autoComplete = props.autocomplete; delete props.autocomplete; }
      if (props.playsinline !== undefined) { props.playsInline = true; delete props.playsinline; }
    }
    return React.createElement(type, props, ...children);
  }
  const html = htm.bind(h);

  const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
  const inrShort = (n) => {
    n = n || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
    return inr(n);
  };
  const fdt = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const fd = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const monthLabel = (m) => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const otp = () => '000000';
  const initials = (n) => (n || '?').split(/\s+/).filter((w) => /[A-Za-z]/.test(w[0] || '')).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  const fileMeta = (f) => (f ? { name: f.name, size: f.size } : null);
  const kb = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');

  function useStore() { return useSyncExternalStore(Store.subscribe, Store.get); }

  function useHash() {
    const [h, setH] = useState(location.hash.slice(1));
    useEffect(() => { const f = () => setH(location.hash.slice(1)); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
    return h;
  }
  const go = (path) => { location.hash = path; window.scrollTo(0, 0); };

  /* ---------- toasts ---------- */
  const toastSubs = new Set();
  window.toast = (msg, sub) => toastSubs.forEach((f) => f({ id: Math.random(), msg, sub }));
  function Toasts() {
    const [items, setItems] = useState([]);
    useEffect(() => {
      const f = (t) => { setItems((x) => [...x.slice(-3), t]); setTimeout(() => setItems((x) => x.filter((y) => y.id !== t.id)), 4500); };
      toastSubs.add(f); return () => toastSubs.delete(f);
    }, []);
    return html`<div class="toasts" role="status" aria-live="polite">${items.map((t) => html`<div class="toast" key=${t.id}>${t.sub && html`<small>${t.sub}</small>`}${t.msg}</div>`)}</div>`;
  }

  /* ---------- primitives ---------- */
  const STATUS_TONE = {
    Active: 'ok', Approved: 'ok', Disbursed: 'ok', Paid: 'ok', Verified: 'ok', Closed: 'ok', Resolved: 'ok', Onboarded: 'ok',
    Submitted: 'pri', 'Under Review': 'info', Recommended: 'info', 'In Progress': 'info', 'Pending Checker': 'warn', 'Pending Ops': 'warn', 'Pending Approval': 'warn', Pending: 'warn', Open: 'warn', Invited: 'warn', Accrued: 'warn', 'In Payout': 'info',
    'Query Raised': 'warn', Draft: '', Rejected: 'err', Suspended: 'warn', Deactivated: 'err', Blacklisted: 'err', Lost: 'err', Failed: 'err', Inactive: '',
    'Lien Marked': 'info', Applied: 'pri', 'Portfolio Fetched': 'pri', Lead: '',
  };
  const Badge = ({ s, tone, children }) => html`<span class=${'badge ' + (tone != null ? tone : STATUS_TONE[s] || '')}>${children || s}</span>`;
  const Btn = ({ kind, sm, children, ...p }) => html`<button type="button" class=${'btn ' + (kind || '') + (sm ? ' sm' : '')} ...${p}>${children}</button>`;
  const Card = ({ title, actions, children, cls }) => html`<section class=${'card ' + (cls || '')}>
    ${(title || actions) && html`<div class="card-h"><h2>${title}</h2>${actions && html`<div class="row">${actions}</div>`}</div>`}
    ${children}</section>`;
  const PageH = ({ title, sub, children }) => html`<div class="page-h"><div><h1>${title}</h1>${sub && html`<p>${sub}</p>`}</div>${children && html`<div class="row">${children}</div>`}</div>`;

  function Field({ label, hint, err, children }) {
    return html`<label class="field"><span>${label}</span>${children}${err ? html`<div class="errt">${err}</div>` : hint && html`<div class="hint">${hint}</div>`}</label>`;
  }
  const Input = ({ label, hint, err, value, onChange, ok, ...p }) => {
    const inp = html`<input value=${value == null ? '' : value} onInput=${(e) => onChange(e.target.value)} ...${p} />`;
    return html`<${Field} label=${label} hint=${hint} err=${err}>${ok ? html`<div class="verify-box is-ok">${inp}<span class="verify-tick" title="Verified"><${Tick} label="Verified" /></span></div>` : inp}<//>`;
  };
  const Select = ({ label, hint, value, onChange, options, ...p }) => html`<${Field} label=${label} hint=${hint}><select value=${value} onChange=${(e) => onChange(e.target.value)} ...${p}>
    ${options.map((o) => (typeof o === 'string' ? html`<option key=${o} value=${o}>${o}</option>` : html`<option key=${o.v} value=${o.v}>${o.l}</option>`))}</select><//>`;
  const Text = ({ label, value, onChange, ...p }) => html`<${Field} label=${label}><textarea value=${value} onInput=${(e) => onChange(e.target.value)} ...${p}></textarea><//>`;
  // Keeps a data URL for small files so reviewers can open the document later; larger files keep details only.
  const readFile = (f) => {
    if (!f) return Promise.resolve(null);
    const meta = { name: f.name, size: f.size, type: f.type };
    if (f.size > 1.5e6) return Promise.resolve(meta);
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(Object.assign(meta, { data: r.result })); r.onerror = () => res(meta); r.readAsDataURL(f); });
  };
  const FileIn = ({ label, value, onChange, accept, hint }) => html`<label class="field file-field">
    <span>${label}</span>
    <span class="file-face">
      <input type="file" accept=${accept || 'image/*,.pdf'} onChange=${(e) => readFile(e.target.files[0]).then(onChange)} />
      <span class="file-btn">Choose file</span>
      <span class="file-name">${value ? value.name : 'No file chosen'}</span>
    </span>
    ${value ? html`<div class="hint file-ok"><${Tick} size="14" /> ${kb(value.size)}</div>` : hint ? html`<div class="hint">${hint}</div>` : ''}
  </label>`;

  /* Popup. With \`icon\` it uses the design-system layout: icon in a soft circle, centred title and subtitle, full-width actions. */
  function Modal({ title, onClose, children, footer, wide, icon, sub }) {
    useEffect(() => { const f = (e) => e.key === 'Escape' && onClose && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, []);
    return html`<div class="modal-bg" onMouseDown=${(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div class=${'modal' + (wide ? ' wide' : '') + (icon ? ' pop' : '')} role="dialog" aria-modal="true" aria-label=${title}>
        ${icon
          ? html`<div class="modal-h"><span class="pop-ico" aria-hidden="true">${icon}</span><h2>${title}</h2>${sub && html`<p class="pop-sub">${sub}</p>`}${onClose && html`<button class="x" aria-label="Close" onClick=${onClose}>×</button>`}</div>`
          : html`<div class="modal-h"><h2>${title}</h2>${onClose && html`<button class="x" aria-label="Close" onClick=${onClose}>×</button>`}</div>`}
        <div class="modal-b">${children}</div>
        ${footer && html`<div class="modal-f">${footer}</div>`}
      </div></div>`;
  }

  function Tabs({ tabs, value, onChange }) {
    return html`<div class="tabs" role="tablist">${tabs.map((t) => {
      const k = typeof t === 'string' ? t : t.k; const l = typeof t === 'string' ? t : t.l;
      return html`<button key=${k} role="tab" class=${value === k ? 'on' : ''} onClick=${() => onChange(k)}>${l}</button>`;
    })}</div>`;
  }

  function Table({ cols, rows, onRow, empty }) {
    if (!rows.length) return html`<div class="note">${empty || 'Nothing here yet.'}</div>`;
    return html`<div class="tbl-wrap"><table><thead><tr>${cols.map((c) => html`<th key=${c.k || c.h} class=${c.num ? 'num' : ''}>${c.h}</th>`)}</tr></thead>
      <tbody>${rows.map((r, i) => html`<tr key=${r.id || i} class=${onRow ? 'click' : ''} onClick=${onRow ? () => onRow(r) : null}>
        ${cols.map((c) => html`<td key=${c.k || c.h} class=${c.num ? 'num' : ''}>${c.r ? c.r(r) : r[c.k]}</td>`)}</tr>`)}</tbody></table></div>`;
  }

  const KPI = ({ l, v, s }) => html`<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div>${s && html`<div class="s">${s}</div>`}</div>`;
  /* Summary strip (reference layout): icon tile + title/sub/tag, contact lines, a headline figure, and a boxed status. */
  const SI = {
    user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
    phone: 'M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2zM11 18h2',
    mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
    doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  };
  const sico = (n, s) => html`<svg width=${s || 18} height=${s || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${SI[n]} /></svg>`;
  function SummaryStrip({ icon, title, sub, tag, lines, figLabel, fig, figSub, boxLabel, box, boxSub }) {
    return html`<section class="sum-strip" aria-label="Summary">
      <div class="sum-id"><span class="sum-tile" aria-hidden="true">${sico(icon || 'doc', 26)}</span>
        <div class="sum-id-t"><span class="sum-sub">${sub}</span><b class="sum-title">${title}</b>${tag && html`<span class=${'sum-tag ' + (tag.tone || '')}>${tag.text}</span>`}</div></div>
      <div class="sum-lines">${(lines || []).filter((l) => l[1]).map(([ic, t]) => html`<span key=${t} class="sum-line">${sico(ic, 16)}${t}</span>`)}</div>
      <div class="sum-fig"><span class="sum-fig-l">${figLabel}</span><b>${fig}</b><span class="sum-fig-s">${figSub}</span></div>
      <div class="sum-box"><span class="sum-fig-l">${boxLabel}</span><b>${box}</b><span class="sum-fig-s">${boxSub}</span></div>
    </section>`;
  }

  /* Details as label-over-value cells (design-system review pattern). */
  const KV = ({ items, cols }) => html`<dl class=${'kv' + (cols ? ' kv-' + cols : '')}>${items.filter(Boolean).map(([k, v]) => html`<div class="kv-i" key=${k}><dt>${k}</dt><dd>${v == null || v === '' ? '—' : v}</dd></div>`)}</dl>`;
  const Note = ({ tone, children }) => html`<div class=${'note ' + (tone || '')}>${children}</div>`;
  const Avatar = ({ name, src }) => html`<div class="avatar">${src ? html`<img src=${src} alt="Selfie" />` : initials(name)}</div>`;

  /* Aadhaar photo: the real image when available, otherwise a neutral ID-photo placeholder. */
  const IdPhoto = ({ src, name }) => (src ? html`<img class="id-photo" src=${src} alt=${'Photo of ' + (name || 'applicant') + ' from Aadhaar'} />` : html`<svg class="id-photo" viewBox="0 0 84 100" role="img" aria-label="Photo from Aadhaar"><rect width="84" height="100" fill="#e9edf3"/><circle cx="42" cy="38" r="17" fill="#aeb8c7"/><path d="M10 100c3-21 16-33 32-33s29 12 32 33z" fill="#aeb8c7"/></svg>`);
  /* Six one-digit OTP boxes: typing moves to the next box, Backspace goes back, a pasted code fills every box. */
  function OtpBoxes({ value, onChange, label, err, autoFocus }) {
    const refs = useRef([]);
    const [d, setD] = useState(() => Array.from({ length: 6 }, (_, k) => (value || '')[k] || ''));
    useEffect(() => { if (!value) setD(['', '', '', '', '', '']); }, [value]);
    const emit = (n) => { setD(n); onChange(n.join('')); };
    const put = (k, str) => {
      const digits = str.replace(/\D/g, ''); if (!digits) return;
      const n = d.slice(); let j = k;
      for (const c of digits) { if (j > 5) break; n[j++] = c; }
      emit(n); const f = refs.current[Math.min(j, 5)]; if (f) f.focus();
    };
    const key = (k, e) => {
      if (e.key === 'Backspace') { e.preventDefault(); const n = d.slice(); if (n[k]) n[k] = ''; else if (k > 0) { n[k - 1] = ''; refs.current[k - 1].focus(); } emit(n); }
      else if (e.key === 'ArrowLeft' && k > 0) refs.current[k - 1].focus();
      else if (e.key === 'ArrowRight' && k < 5) refs.current[k + 1].focus();
    };
    return html`<div class="field otp-field"><span>${label || 'Enter OTP'}</span>
      <div class=${'otp-boxes' + (err ? ' bad' : '')} role="group" aria-label=${label || 'Enter OTP'}>${d.map((c, k) => html`<input key=${k} ref=${(el) => { refs.current[k] = el; }} value=${c} inputmode="numeric" maxlength="6"
        autocomplete=${k === 0 ? 'one-time-code' : 'off'} aria-label=${'OTP digit ' + (k + 1)} autoFocus=${!!autoFocus && k === 0}
        onChange=${(e) => { const t = e.target.value; if (!t) { const n = d.slice(); n[k] = ''; emit(n); } else put(k, t.length > 1 && c ? t.replace(c, '') : t); }}
        onKeyDown=${(e) => key(k, e)} onFocus=${(e) => e.target.select()} onPaste=${(e) => { e.preventDefault(); put(k, e.clipboardData.getData('text')); }} />`)}</div>
      ${err && html`<div class="errt">${err}</div>`}</div>`;
  }

  /* Verified mark: green ring with a bold check (same as the success screen). */
  function Tick({ size, label, id }) {
    return html`<svg class="tick-mark" id=${id} viewBox="0 0 100 100" width=${size || 22} height=${size || 22} role=${label ? 'img' : undefined} aria-label=${label} aria-hidden=${label ? undefined : 'true'}>
      <circle cx="50" cy="50" r="40.5" fill="none" stroke="#33b540" stroke-width="9" pathLength="1" />
      <path d="M30 51 L43 64 L71 36" fill="none" stroke="#33b540" stroke-width="10" stroke-linecap="square" pathLength="1" /></svg>`;
  }

  /* Blocking popup loader. */
  function LoaderPop({ text, sub }) {
    return html`<div class="modal-bg"><div class="modal pop loader-pop" role="alertdialog" aria-modal="true" aria-label=${text || 'Please wait'}>
      <div class="loader" role="status" aria-live="polite"><span class="loader-ring" aria-hidden="true"></span>${text ? html`<h3>${text}</h3>` : ''}${sub ? html`<p class="small muted" style="margin:0">${sub}</p>` : ''}</div></div></div>`;
  }

  function Busy({ text }) { return html`<div class="row muted"><span class="spin" aria-hidden="true">⏳</span> ${text || 'Please wait…'}</div>`; }

  /* ---------- export helpers ---------- */
  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function toCSV(rows, cols) {
    const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const keys = cols || (rows[0] ? Object.keys(rows[0]) : []);
    return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
  }
  function downloadCSV(name, rows, cols) { download(name, toCSV(rows, cols), 'text/csv'); toast('Downloaded ' + name); }
  function printHTML(title, body) {
    const w = window.open('', '_blank');
    if (!w) { download(title.replace(/\W+/g, '_') + '.html', body, 'text/html'); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + title + '</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:760px;margin:30px auto;padding:0 20px;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left}h1{font-size:20px}.r{text-align:right}.muted{color:#666}</style></head><body>' + body + '<script>setTimeout(()=>print(),300)<\/script></body></html>');
    w.document.close();
  }

  window.UI = {
    html, useState, useEffect, useRef, useMemo, useStore, useHash, go, inr, inrShort, fdt, fd, monthLabel, sleep, otp, initials, kb, fileMeta,
    Toasts, Badge, Btn, Card, PageH, Field, Input, Select, Text, FileIn, Modal, Tabs, Table, KPI, KV, Note, Avatar, IdPhoto, SummaryStrip, Busy, OtpBoxes, Tick, LoaderPop, download, downloadCSV, toCSV, printHTML,
  };
})();
