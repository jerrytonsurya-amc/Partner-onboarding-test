// Static pages plus the SQLite API. `node serve.js`, then open http://localhost:5180
const http = require('http');
const fs = require('fs');
const path = require('path');
require('./lib/env');
const db = require('./lib/db');
const digio = require('./lib/digio');
const otp = require('./lib/otp');
const { renderSchemaPage, schemaToCsv } = require('./lib/schemaPage');
const { schemaToPdf } = require('./lib/schemaPdf');

const root = __dirname;
const port = Number(process.env.PORT) || 5180;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };

db.init();

function sendJson(res, code, body) {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 25 * 1024 * 1024) {
        reject(Object.assign(new Error('Request is too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (err) { reject(Object.assign(new Error('Expected JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, urlPath) {
  if (req.method === 'GET' && urlPath === '/api/health') return sendJson(res, 200, { ok: true, database: db.file });
  if (req.method === 'GET' && urlPath === '/api/schema') return sendJson(res, 200, db.describe());
  if (req.method === 'GET' && urlPath === '/api/onboarding') return sendJson(res, 200, db.getOnboardingState());
  if (req.method === 'PUT' && urlPath === '/api/onboarding') return sendJson(res, 200, db.saveOnboardingState(await readBody(req)));
  if (req.method === 'GET' && urlPath === '/api/approver') return sendJson(res, 200, db.getApproverState());
  if (req.method === 'POST' && urlPath === '/api/approver/decision') {
    const body = await readBody(req);
    return sendJson(res, 200, db.applyDecision(body.id, body.qc));
  }
  if (req.method === 'POST' && urlPath === '/api/approver/reset') {
    await readBody(req);
    return sendJson(res, 200, db.resetSamples());
  }
  if (req.method === 'GET' && urlPath === '/api/agent') return sendJson(res, 200, db.getAgentState());
  if (req.method === 'PUT' && urlPath === '/api/agent') return sendJson(res, 200, db.saveAgentState(await readBody(req)));
  if (req.method === 'POST' && urlPath === '/api/partner-leads') return sendJson(res, 200, db.savePartnerLead(await readBody(req)));
  if (req.method === 'POST' && urlPath === '/api/otp/send') return sendJson(res, 200, await otp.send(await readBody(req)));
  if (req.method === 'POST' && urlPath === '/api/otp/verify') return sendJson(res, 200, otp.verify(await readBody(req)));
  if (req.method === 'GET' && urlPath === '/api/kyc/config') return sendJson(res, 200, digio.configStatus());
  if (req.method === 'POST' && urlPath === '/api/kyc/pan') return sendJson(res, 200, await digio.verifyPan(await readBody(req)));
  if (req.method === 'POST' && urlPath === '/api/kyc/gst') return sendJson(res, 200, await digio.verifyGst(await readBody(req)));
  if (req.method === 'POST' && urlPath === '/api/kyc/ifsc') return sendJson(res, 200, await digio.verifyIfsc(await readBody(req)));
  if (req.method === 'POST' && urlPath === '/api/kyc/bank') return sendJson(res, 200, await digio.verifyBank(await readBody(req)));
  if (req.method === 'POST' && urlPath === '/api/kyc/digilocker') return sendJson(res, 200, await digio.startDigilocker(await readBody(req)));
  if (req.method === 'GET' && urlPath.startsWith('/api/kyc/digilocker/')) {
    return sendJson(res, 200, await digio.pollDigilocker(decodeURIComponent(urlPath.slice('/api/kyc/digilocker/'.length))));
  }
  return sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  try {
    if (urlPath === '/data-schema') {
      const html = renderSchemaPage(db.describe());
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }
    if (urlPath === '/data-schema.csv') {
      const csv = schemaToCsv(db.describe());
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="lamf-data-schema.csv"',
        'Cache-Control': 'no-store',
      });
      return res.end(csv);
    }
    if (urlPath === '/data-schema.pdf') {
      const pdf = schemaToPdf(db.describe());
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="lamf-data-schema.pdf"',
        'Content-Length': pdf.length,
        'Cache-Control': 'no-store',
      });
      return res.end(pdf);
    }
    if (urlPath.startsWith('/api/')) return await handleApi(req, res, urlPath);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) return sendJson(res, err.status || 500, { error: err.message || 'Server error' });
    return;
  }

  const cleanPages = { '/approver': 'approver.html', '/agent': 'agent.html' };
  if (urlPath === '/approver.html' || urlPath === '/agent.html') {
    const query = (req.url || '').includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.writeHead(302, { Location: urlPath.replace(/\.html$/, '') + query });
    return res.end();
  }
  const pageFile = cleanPages[urlPath];
  const file = path.normalize(path.join(root, pageFile || (urlPath === '/' ? 'index.html' : urlPath)));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log('LAMF partner onboarding running at http://localhost:' + port);
  console.log('SQLite database: ' + db.file);
  console.log('Data schema: http://localhost:' + port + '/data-schema');
});
