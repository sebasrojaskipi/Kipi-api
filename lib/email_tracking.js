// Mirror of kipi-chatbot/kipi/services/email_tracking.py — both must compute
// the same HMAC-SHA256 truncated to 16 bytes for tokens to validate.
const crypto = require('crypto');

const SECRET = process.env.EMAIL_TRACKING_SECRET || '';
const TOKEN_BYTES = 16;

function makeToken(blastId, userId, eventType) {
  if (!SECRET) {
    throw new Error('EMAIL_TRACKING_SECRET not set in kipi-api');
  }
  const msg = `${blastId}:${userId}:${eventType}`;
  const digest = crypto.createHmac('sha256', SECRET).update(msg).digest();
  return digest.subarray(0, TOKEN_BYTES)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function verifyToken(token, blastId, userId, eventType) {
  let expected;
  try {
    expected = makeToken(blastId, userId, eventType);
  } catch {
    return false;
  }
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

module.exports = { makeToken, verifyToken };
