const express = require('express');
const { pool } = require('../db');
const { verifyToken } = require('../lib/email_tracking');

const router = express.Router();

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

const CLICK_HOST_ALLOWLIST = new Set([
  'wa.me',
  'whatsapp.com',
  'kipi.app',
  'www.kipi.app',
  'api.kipi.app',
]);

async function recordEvent(blastId, userId, eventType, metadata = null) {
  try {
    await pool.query(
      `INSERT INTO email_events (blast_id, user_id, event_type, event_at, metadata)
       VALUES (?, ?, ?, NOW(), ?)`,
      [blastId, userId, eventType, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error(`record ${eventType} failed:`, err.message);
  }
}

async function shouldRecordOpen(blastId, userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM email_events
     WHERE blast_id = ? AND user_id = ? AND event_type = 'open'
       AND event_at > (NOW() - INTERVAL 5 MINUTE)`,
    [blastId, userId]
  );
  return rows[0].n === 0;
}

router.get('/o/:blastId/:userId/:tokenWithExt', async (req, res) => {
  const blastId = parseInt(req.params.blastId, 10);
  const userId = parseInt(req.params.userId, 10);
  const token = req.params.tokenWithExt.replace(/\.png$/, '');

  res.set({
    'Content-Type': 'image/png',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
  });

  if (Number.isNaN(blastId) || Number.isNaN(userId)) {
    return res.status(200).send(PIXEL);
  }
  if (!verifyToken(token, blastId, userId, 'open')) {
    return res.status(200).send(PIXEL);
  }
  if (await shouldRecordOpen(blastId, userId)) {
    await recordEvent(blastId, userId, 'open');
  }
  return res.status(200).send(PIXEL);
});

router.get('/c/:blastId/:userId/:token', async (req, res) => {
  const blastId = parseInt(req.params.blastId, 10);
  const userId = parseInt(req.params.userId, 10);
  const token = req.params.token;
  const target = req.query.u;

  if (!target || typeof target !== 'string') {
    return res.status(400).send('missing u');
  }
  if (Number.isNaN(blastId) || Number.isNaN(userId)) {
    return res.status(400).send('bad ids');
  }
  if (!verifyToken(token, blastId, userId, 'click')) {
    return res.status(400).send('invalid token');
  }

  let parsed;
  try { parsed = new URL(target); }
  catch { return res.status(400).send('invalid url'); }

  if (!CLICK_HOST_ALLOWLIST.has(parsed.host)) {
    return res.status(400).send('host not allowed');
  }

  await recordEvent(blastId, userId, 'click', { target });
  return res.redirect(302, target);
});

module.exports = router;
