/* Talks to the local SQLite server when the pages are opened through `node serve.js`. */
(function () {
  function queued() {
    let dirty = 0;
    let chain = Promise.resolve();
    return {
      busy() { return dirty > 0; },
      run(task) {
        dirty += 1;
        const run = chain.then(() => task());
        chain = run.then(() => { dirty -= 1; }, () => { dirty -= 1; });
        return run;
      },
    };
  }

  function ping() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1200);
    return fetch('/api/health', { cache: 'no-store', signal: ctrl.signal })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => clearTimeout(timer));
  }

  async function send(url, method, body) {
    const r = await fetch(url, {
      method,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Could not save data');
    return data;
  }

  function load(url) { return send(url, 'GET'); }
  function save(url, body) { return send(url, 'PUT', body); }
  function post(url, body) { return send(url, 'POST', body || {}); }

  function watch(url, isBusy, apply) {
    const timer = setInterval(() => {
      if (isBusy()) return;
      load(url).then((next) => { if (!isBusy()) apply(next); }).catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }

  window.LamfPersist = { ping, load, save, post, watch, queued };
})();
