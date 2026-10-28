/* Digio DigiKYC calls. Credentials stay on the server.
   Docs: https://documentation.digio.in/digikyc/ */
const crypto = require('crypto');
require('./env');

const NAME_MATCH = 70;

/* Sandbox penny drop always returns this placeholder, so a real account never reaches 70%. */
function isSandboxDummyName(name) {
  return targets().sandbox && String(name || '').replace(/\s+/g, ' ').trim().toLowerCase() === 'dummy customer name';
}

function decideBankMatch({ verified, beneficiary, fuzzyMatchResult, score }) {
  const sandboxDummy = isSandboxDummyName(beneficiary);
  const numeric = score == null || Number.isNaN(score) ? null : score;
  let nameMismatch = verified === true && (fuzzyMatchResult === false || (numeric != null && numeric < NAME_MATCH));
  if (sandboxDummy && verified) nameMismatch = false;
  const ok = verified === true && !nameMismatch;
  return {
    ok,
    nameMismatch,
    sandboxDummy,
    nameMatch: sandboxDummy && ok ? 100 : (numeric == null ? (ok ? 100 : 0) : numeric),
  };
}

function env(name) {
  return (process.env[name] || '').trim();
}

function targets() {
  const sandbox = env('DIGIO_ENV') !== 'production';
  return {
    sandbox,
    apiBase: env('DIGIO_BASE_URL') || (sandbox ? 'https://ext.digio.in:444' : 'https://api.digio.in'),
    gatewayBase: env('DIGIO_GATEWAY_URL') || (sandbox ? 'https://ext.digio.in' : 'https://app.digio.in'),
  };
}

function missing(extra) {
  const absent = [];
  if (!env('DIGIO_CLIENT_ID')) absent.push('DIGIO_CLIENT_ID');
  if (!env('DIGIO_CLIENT_SECRET')) absent.push('DIGIO_CLIENT_SECRET');
  (extra || []).forEach((name) => { if (!env(name)) absent.push(name); });
  return absent;
}

function configStatus() {
  const base = missing();
  const template = missing(['DIGIO_DIGILOCKER_TEMPLATE']);
  return {
    environment: targets().sandbox ? 'sandbox' : 'production',
    pan: base.length === 0,
    ifsc: base.length === 0,
    bank: base.length === 0,
    digilocker: template.length === 0,
    missing: template,
  };
}

function fail(message, status) {
  const err = new Error(message);
  err.status = status || 400;
  return err;
}

function requestId(prefix) {
  return prefix + crypto.randomBytes(8).toString('hex');
}

function isoDate(value) {
  const text = String(value || '').trim();
  const dmy = text.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (dmy) return dmy[3] + '-' + dmy[2] + '-' + dmy[1];
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return '';
}

function panType(category) {
  const text = String(category || '').toLowerCase();
  if (text.includes('company')) return 'Company';
  if (text.includes('firm') || text.includes('partnership')) return 'Firm';
  if (text.includes('huf')) return 'HUF';
  if (text.includes('individual') || text.includes('person')) return 'Individual';
  return category || '';
}

function genderLabel(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'M' || text === 'MALE') return 'Male';
  if (text === 'F' || text === 'FEMALE') return 'Female';
  if (text === 'T' || text === 'TRANSGENDER') return 'Transgender';
  return value || '';
}

function maskAadhaar(id) {
  const digits = String(id || '').replace(/\D/g, '');
  return 'XXXX XXXX ' + (digits.slice(-4) || '0000');
}

function findString(obj, names, depth) {
  if (!obj || typeof obj !== 'object' || (depth || 0) > 4) return '';
  for (const key of Object.keys(obj)) {
    if (names.includes(key.toLowerCase()) && typeof obj[key] === 'string' && obj[key].trim()) return obj[key].trim();
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = findString(value, names, (depth || 0) + 1);
      if (found) return found;
    }
  }
  return '';
}

async function digio(path, body) {
  const absent = missing();
  if (absent.length) throw fail('Digio is not configured. Add ' + absent.join(', ') + ' to .env and restart the server.', 503);
  const { apiBase } = targets();
  const auth = Buffer.from(env('DIGIO_CLIENT_ID') + ':' + env('DIGIO_CLIENT_SECRET')).toString('base64');
  let response;
  try {
    response = await fetch(apiBase + path, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + auth,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw fail('Could not reach Digio. ' + err.message, 502);
  }
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch (err) { data = { message: text.slice(0, 300) }; }
  if (!response.ok) {
    throw fail(data.message || data.error_message || data.error_msg || ('Digio returned ' + response.status), response.status === 401 ? 401 : 502);
  }
  return data;
}

async function verifyPan(input) {
  const pan = String((input && input.pan) || '').toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) throw fail('Enter a valid PAN.');
  const body = await digio('/v3/client/kyc/fetch_id_data/PAN', {
    id_no: pan,
    unique_request_id: requestId('pan'),
  });
  const statusText = String(body.status || body.remarks || '');
  const invalid = /invalid|not[\s_-]*found|fail|inactive/i.test(statusText);
  const name = body.name || body.full_name || '';
  const ok = !!name && !invalid;
  return {
    ok,
    name,
    dob: isoDate(body.dob || body.date_of_birth || (body.details && body.details.dob)),
    type: panType(body.category),
    status: ok ? (statusText || 'Valid – Existing & Active') : (statusText || 'PAN could not be verified'),
    at: new Date().toISOString(),
  };
}

async function verifyGst(input) {
  const gstin = String((input && input.gstin) || '').toUpperCase().replace(/\s/g, '');
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) throw fail('Enter a valid GSTIN.');
  const body = await digio('/v3/client/kyc/fetch_id_data/GST', {
    id_no: gstin,
    unique_request_id: requestId('gst'),
  });
  const details = body.details || {};
  const address = (details.pradr && details.pradr.addr) || {};
  const legalName = details.lgnm || body.corporate_name || details.trade_nam || '';
  const status = details.sts || '';
  const jurisdiction = [details.ctj, address.dst, address.stcd].filter(Boolean).join(', ');
  const inactive = /cancel|inactive|suspend|invalid/i.test(status);
  const ok = !!legalName && !inactive;
  return {
    ok,
    skipped: false,
    gstin: body.gstin || details.gstin || gstin,
    legalName,
    status: status || (ok ? 'Active' : 'GSTIN could not be verified'),
    state: jurisdiction,
  };
}

async function verifyIfsc(input) {
  const ifsc = String((input && input.ifsc) || '').toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw fail('Enter a valid IFSC.');
  const body = await digio('/v3/client/kyc/verify/IFSC', { identifier: ifsc, unique_request_id: requestId('ifsc') });
  const source = body.data || body.result || body;
  return {
    ok: body.verified !== false,
    ifsc,
    bank: findString(source, ['bank', 'bank_name', 'bankname']),
    branch: findString(source, ['branch', 'branch_name', 'branchname']),
    city: findString(source, ['city', 'district']),
    state: findString(source, ['state']),
    status: body.error_message || '',
  };
}

async function verifyBank(input) {
  const account = String((input && input.accountNumber) || '').replace(/\D/g, '');
  const ifsc = String((input && input.ifsc) || '').toUpperCase();
  const holder = String((input && input.holder) || '').trim();
  const panName = String((input && input.panName) || holder).trim();
  if (!/^\d{9,18}$/.test(account)) throw fail('Account number is 9–18 digits.');
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw fail('Enter a valid IFSC.');
  let branchInfo = { bank: '', branch: '' };
  try { branchInfo = await verifyIfsc({ ifsc }); } catch (err) { /* Penny drop still identifies the account. */ }
  const body = await digio('/v4/client/verify/bank_account', {
    beneficiary_account_no: account,
    beneficiary_ifsc: ifsc,
    beneficiary_name: panName || holder,
    validation_mode: 'PENNY_DROP',
    amount: 1,
    narration: 'LAMF partner verification',
    unique_request_id: requestId('bank'),
  });
  const score = body.fuzzy_match_score == null ? null : Number(body.fuzzy_match_score);
  const beneficiary = body.beneficiary_name_with_bank || '';
  const decision = decideBankMatch({ verified: body.verified === true, beneficiary, fuzzyMatchResult: body.fuzzy_match_result, score });
  const { ok, nameMismatch } = decision;
  return {
    ok,
    nameMismatch,
    mode: 'manual',
    method: body.validation_mode === 'PENNY_LESS' ? 'Penny-less verification' : 'Penny drop ₹1',
    acc: 'XXXXXXXX' + account.slice(-4),
    ifsc,
    bank: branchInfo.bank || '',
    branch: branchInfo.branch || '',
    type: input.type || 'Savings',
    holder,
    beneficiary,
    nameMatch: decision.nameMatch,
    at: body.verified_at || new Date().toISOString(),
    status: ok ? '' : (body.error_msg || (nameMismatch ? 'The account name does not match the PAN name.' : 'The bank account could not be verified.')),
    providerId: body.id || '',
  };
}

function gatewayUrl(response, returnUrl) {
  const token = response.access_token && response.access_token.id;
  if (!response.id || !token || !response.customer_identifier) return '';
  const { gatewayBase } = targets();
  const url = gatewayBase + '/#/gateway/login/' + response.id + '/' + token + '/' + response.customer_identifier;
  return returnUrl ? url + '?redirect_url=' + encodeURIComponent(returnUrl) : url;
}

function addressFrom(card) {
  const info = card.address_information || card.addressInformation || {};
  const raw = typeof card.address === 'string' ? card.address : (info.address || '');
  return {
    house: info.address || raw.split(',')[0] || '',
    street: info.localityOrPostOffice || info.locality || '',
    landmark: '',
    city: info.districtOrCity || info.city || '',
    district: info.district || info.districtOrCity || '',
    state: info.state || '',
    pin: String(info.pincode || info.pin || ''),
    country: 'India',
  };
}

function aadhaarFrom(response) {
  const actions = response.actions || [];
  const action = actions.find((item) => item.type === 'digilocker') || actions.find((item) => item.id_card_data_response) || {};
  const card = action.id_card_data_response || (action.details && (action.details.aadhaar || action.details)) || {};
  const photo = action.file_base64 ? (String(action.file_base64).startsWith('data:') ? action.file_base64 : 'data:image/jpeg;base64,' + action.file_base64) : '';
  if (!card.name && !card.id_no) return null;
  return {
    ok: true,
    at: action.completed_at || new Date().toISOString(),
    name: card.name || '',
    dob: isoDate(card.dob),
    gender: genderLabel(card.gender),
    masked: maskAadhaar(card.id_no),
    photo: photo || undefined,
    address: addressFrom(card),
    providerRequestId: response.id,
  };
}

function finished(status) {
  return status === 'success' || status === 'approved';
}

function failed(status) {
  return status === 'rejected' || status === 'failed' || status === 'expired' || status === 'skipped';
}

async function startDigilocker(input) {
  const absent = missing(['DIGIO_DIGILOCKER_TEMPLATE']);
  if (absent.length) throw fail('Digio DigiLocker is not configured. Add ' + absent.join(', ') + ' to .env and restart the server.', 503);
  const mobile = String((input && input.mobile) || '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(mobile)) throw fail('A verified mobile number is required before DigiLocker.');
  const referenceId = String((input && input.applicationId) || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
  const response = await digio('/client/kyc/v2/request/with_template', Object.assign({
    customer_identifier: mobile,
    customer_name: String((input && input.name) || '').slice(0, 100),
    template_name: env('DIGIO_DIGILOCKER_TEMPLATE'),
    notify_customer: false,
    generate_access_token: true,
    transaction_id: requestId('kyc'),
    expire_in_days: 1,
  }, referenceId ? { reference_id: referenceId } : {}));
  return {
    requestId: response.id,
    status: response.status || 'requested',
    gatewayUrl: gatewayUrl(response, input && input.returnUrl),
  };
}

async function pollDigilocker(requestId) {
  if (!/^[A-Za-z0-9]+$/.test(requestId || '')) throw fail('Unknown DigiLocker request.');
  const response = await digio('/client/kyc/v2/' + requestId + '/response?detail_response=true');
  const action = (response.actions || []).find((item) => item.type === 'digilocker');
  const status = (action && action.status) || response.status;
  if (failed(status)) {
    return { pending: false, ok: false, status: (response.error_messages && response.error_messages[0]) || ('DigiLocker ' + status) };
  }
  const aadhaar = finished(status) ? aadhaarFrom(response) : null;
  if (aadhaar) return { pending: false, ok: true, aadhaar };
  if (finished(status)) return { pending: false, ok: false, status: 'DigiLocker finished without Aadhaar details.' };
  return { pending: true, status: status || 'requested' };
}

module.exports = { configStatus, verifyPan, verifyIfsc, verifyGst, verifyBank, startDigilocker, pollDigilocker };
