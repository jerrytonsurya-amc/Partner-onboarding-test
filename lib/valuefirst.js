/* ValueFirst transactional SMS. Credentials stay on the server.
   Token: POST /psms/api/messages/token?action=generate  (Basic Auth, about 7 days)
   Send:  POST /psms/servlet/psms.JsonEservice           (Bearer token)
   DLT template variables go in @TEMPLATEINFO as templateId~value. */
require('./env');

const TOKEN_URL = 'https://api.myvfirst.com/psms/api/messages/token?action=generate';
const SEND_URL = 'https://api.myvfirst.com/psms/servlet/psms.JsonEservice';

const ERRORS = {
  28673: 'The mobile number is not numeric.',
  28674: 'The mobile number is empty.',
  28675: 'The sender id is empty.',
  28676: 'The message does not match the approved template.',
  28680: 'ValueFirst rejected the sender id.',
  28681: 'ValueFirst rejected this message as a duplicate. Wait a moment and resend.',
  28682: 'The mobile number is not a valid Indian number.',
  28694: 'ValueFirst rejected the template id or the OTP variable.',
  28702: 'ValueFirst rejected the DLT parameters. A principal entity id may be required.',
  28703: 'ValueFirst rejected the DLT content type.',
  52992: 'ValueFirst username or password is incorrect.',
  52995: 'The ValueFirst daily credit limit has been reached.',
  57089: 'The ValueFirst contract has expired.',
  57090: 'The ValueFirst account has no credit left.',
  57091: 'The ValueFirst user is disabled.',
  65280: 'ValueFirst is temporarily unavailable.',
};

let tokenCache = { token: '', expiresAt: 0 };
let seq = 1;

function env(name) {
  return (process.env[name] || '').trim();
}

function fail(message, status) {
  const err = new Error(message);
  err.status = status || 502;
  return err;
}

function basicAuth() {
  const user = env('VF_USERNAME');
  const pass = env('VF_PASSWORD');
  if (!user || !pass) throw fail('ValueFirst username or password is not configured.', 500);
  return 'Basic ' + Buffer.from(user + ':' + pass, 'utf8').toString('base64');
}

function parseExpiry(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return Date.now() + 6 * 24 * 60 * 60 * 1000;
  return new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]).getTime();
}

function toMsisdn(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '');
  let local = digits;
  if (digits.length === 12 && digits.startsWith('91')) local = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) local = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(local)) throw fail('Enter a valid 10-digit Indian mobile number.', 400);
  return { local, to: '91' + local };
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return { data: {}, text: '' };
  try { return { data: JSON.parse(text), text }; }
  catch (err) { return { data: {}, text }; }
}

async function token() {
  if (tokenCache.token && tokenCache.expiresAt - Date.now() > 60 * 60 * 1000) return tokenCache.token;
  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: basicAuth(), Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    console.error('ValueFirst token request failed', err && err.message);
    throw fail('Could not reach ValueFirst to issue a token.', 502);
  }
  const { data, text } = await readJson(res);
  if (!res.ok || !data.token) {
    const code = Number(data.Code || data.CODE || data.code);
    console.error('ValueFirst token failed', res.status, code || text.slice(0, 180));
    if (res.status === 403) {
      throw fail('ValueFirst refused the token request. This usually means the computer\'s IP is not whitelisted for ' + env('VF_USERNAME') + '.', 502);
    }
    if (res.status === 401) throw fail('ValueFirst rejected the username or password.', 502);
    throw fail(ERRORS[code] || 'ValueFirst could not issue a token. Check the username and password.', 502);
  }
  tokenCache = { token: data.token, expiresAt: parseExpiry(data.expiryDate) };
  return data.token;
}

function guidList(data) {
  const guid = data && data.MESSAGEACK && data.MESSAGEACK.GUID;
  if (!guid) return [];
  return Array.isArray(guid) ? guid : [guid];
}

function ackError(data) {
  for (const guid of guidList(data)) {
    const error = guid.ERROR || guid.Error;
    if (!error) continue;
    const item = Array.isArray(error) ? error[0] : error;
    if (item && (item.CODE != null || item.Code != null)) return item;
  }
  return null;
}

function templateInfo(otp) {
  const id = env('VF_TEMPLATE_ID');
  if (!/^\d{8,20}$/.test(id)) throw fail('ValueFirst template id is not configured.', 500);
  const text = env('VF_TEMPLATE_TEXT');
  const vars = text.match(/\{#[^#]+#\}/g) || [];
  if (text && vars.length !== 1) throw fail('The ValueFirst template must contain one OTP variable.', 500);
  if (!/^\d{6}$/.test(otp)) throw fail('OTP must be 6 digits.', 500);
  return id + '~' + otp;
}

/* Sends the approved OTP template. @TEXT is left empty so TEMPLATEINFO is used. */
async function sendOtp(mobile, otp, tag) {
  const sender = env('VF_SENDER_ID');
  if (!/^[A-Za-z0-9]{6}$/.test(sender)) throw fail('ValueFirst sender id is not configured.', 500);
  const { to } = toMsisdn(mobile);
  const id = String(seq++);
  const body = {
    '@VER': '1.2',
    USER: {},
    DLR: { '@URL': '' },
    SMS: [{
      '@UDH': '0',
      '@CODING': '1',
      '@TEXT': '',
      '@TEMPLATEINFO': templateInfo(otp),
      '@PROPERTY': '0',
      '@ID': id,
      ADDRESS: [{
        '@FROM': sender,
        '@TO': to,
        '@SEQ': id,
        '@TAG': String(tag || 'otp').slice(0, 40),
      }],
    }],
  };

  const bearer = await token();
  let res;
  try {
    res = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + bearer,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    console.error('ValueFirst send request failed', err && err.message);
    throw fail('Could not reach ValueFirst to send the OTP.', 502);
  }
  const { data, text } = await readJson(res);
  if (res.status === 401) {
    tokenCache = { token: '', expiresAt: 0 };
    throw fail('ValueFirst rejected the access token.', 502);
  }
  const error = ackError(data);
  const code = error ? Number(error.CODE != null ? error.CODE : error.Code) : 0;
  if (!res.ok || error || !guidList(data).length) {
    console.error('ValueFirst send failed', res.status, code || text.slice(0, 180));
    throw fail(ERRORS[code] || 'ValueFirst did not accept the OTP.', 502);
  }
  const guid = guidList(data)[0];
  console.log('ValueFirst OTP submitted ' + (guid.GUID || '') + ' to ' + to.slice(0, 4) + '******' + to.slice(-4));
  return { to, guid: guid.GUID || '', submittedAt: guid.SUBMITDATE || '' };
}

module.exports = { sendOtp, toMsisdn, token };
