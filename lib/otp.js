/* SMS OTP challenges. The code is hashed in memory for 120 seconds and is not stored in SQLite. */
const crypto = require('crypto');
const valuefirst = require('./valuefirst');

const TTL = 120 * 1000;
const RESEND = 30 * 1000;
const MAX_ATTEMPTS = 3;
const LOCK = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const HOUR_CAP = 8;
const PURPOSES = { onboarding: 'onboarding', 'agent-reset': 'agent-reset' };

const challenges = new Map();

function fail(message, status) {
  const err = new Error(message);
  err.status = status || 400;
  return err;
}

function hash(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function minutes(ms) {
  return Math.max(1, Math.ceil(ms / 60000));
}

function generate() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function send(body) {
  const purpose = PURPOSES[body && body.purpose];
  if (!purpose) throw fail('Unknown OTP purpose.');
  const { local } = valuefirst.toMsisdn(body.mobile);
  const id = purpose + ':' + local;
  const now = Date.now();
  const existing = challenges.get(id);
  if (existing && existing.lockUntil > now) {
    throw fail('Too many incorrect attempts. Try again in ' + minutes(existing.lockUntil - now) + ' minutes.', 429);
  }
  if (existing && existing.expiresAt > now && now - existing.sentAt < RESEND) {
    return {
      ok: true,
      resent: false,
      expiresIn: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
      retryIn: Math.max(1, Math.ceil((RESEND - (now - existing.sentAt)) / 1000)),
    };
  }
  const inHour = existing && now - existing.hourStart < HOUR;
  const hourStart = inHour ? existing.hourStart : now;
  const hourCount = inHour ? existing.hourCount : 0;
  if (hourCount >= HOUR_CAP) throw fail('Too many OTPs sent to this number. Try again in a little while.', 429);

  const code = generate();
  const result = await valuefirst.sendOtp(local, code, purpose);
  challenges.set(id, {
    hash: hash(code),
    sentAt: now,
    expiresAt: now + TTL,
    attempts: 0,
    lockUntil: 0,
    hourStart,
    hourCount: hourCount + 1,
    guid: result.guid,
  });
  return { ok: true, resent: true, expiresIn: TTL / 1000, retryIn: RESEND / 1000 };
}

function verify(body) {
  const purpose = PURPOSES[body && body.purpose];
  if (!purpose) throw fail('Unknown OTP purpose.');
  const { local } = valuefirst.toMsisdn(body.mobile);
  const id = purpose + ':' + local;
  const row = challenges.get(id);
  const now = Date.now();
  if (!row || row.expiresAt <= now) {
    challenges.delete(id);
    throw fail('This OTP has expired. Resend a new one.');
  }
  if (row.lockUntil > now) throw fail('Too many incorrect attempts. Try again in ' + minutes(row.lockUntil - now) + ' minutes.', 429);
  const code = String((body && body.otp) || '').replace(/\D/g, '');
  if (code.length !== 6 || hash(code) !== row.hash) {
    row.attempts += 1;
    if (row.attempts >= MAX_ATTEMPTS) {
      row.lockUntil = now + LOCK;
      throw fail('Too many incorrect attempts. Try again in 15 minutes.', 429);
    }
    const left = MAX_ATTEMPTS - row.attempts;
    throw fail('Incorrect OTP. ' + left + (left === 1 ? ' attempt' : ' attempts') + ' left.');
  }
  challenges.delete(id);
  return { ok: true };
}

module.exports = { send, verify };
