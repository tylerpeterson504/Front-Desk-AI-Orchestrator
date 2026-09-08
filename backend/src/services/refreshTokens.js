// Refresh-token sessions: issue, rotate, revoke.
//
// The tradeoff this implements: access tokens stay stateless (no database hit on
// every request) but are short-lived, and the long-lived credential is an opaque
// refresh token whose state lives in Postgres so it can be revoked. Revoking a
// session therefore takes effect within one access-token lifetime — 15 minutes
// by default — rather than never.
//
// Only a SHA-256 hash of each token is stored. The raw value is returned once,
// at issue time, and cannot be recovered from the database.
//
// Rotation is single-use: refreshing revokes the presented token and issues a
// successor in the same `family_id`. Presenting an already-rotated token means a
// replay or a stolen copy, so the entire family is revoked and the client has to
// log in again. That is the standard detection for refresh-token theft.

const crypto = require('crypto');
const { db } = require('../config/database');
const { httpError } = require('../lib/httpError');
const logger = require('../lib/logger');

const TOKEN_BYTES = 32;
const DEFAULT_TTL_DAYS = 30;

function ttlDays() {
  const parsed = Number.parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '', 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) return DEFAULT_TTL_DAYS;
  return parsed;
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function expiryFromNow() {
  return new Date(Date.now() + ttlDays() * 24 * 60 * 60 * 1000);
}

// Bearer-safe and URL-safe, and long enough that guessing is not a strategy.
function newRawToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

async function insertToken({ userId, familyId, client }) {
  const raw = newRawToken();
  await db.none(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, client)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hashToken(raw), familyId, expiryFromNow(), client || null]
  );
  return raw;
}

// Start a new session (login / register).
async function issueSession(user, { client } = {}) {
  const familyId = crypto.randomUUID();
  const token = await insertToken({ userId: user.id, familyId, client });
  return { token, familyId, expiresAt: expiryFromNow() };
}

async function revokeFamily(familyId, reason) {
  await db.none(
    `UPDATE refresh_tokens
        SET revoked_at = NOW(), revoked_reason = $2
      WHERE family_id = $1 AND revoked_at IS NULL`,
    [familyId, reason]
  );
}

// Exchange a refresh token for its successor. Returns the stored row's user_id
// and the new raw token; the caller mints the access token.
async function rotate(rawToken, { client } = {}) {
  if (typeof rawToken !== 'string' || !rawToken.trim()) {
    throw httpError(400, 'A refresh token is required');
  }

  const row = await db.oneOrNone(
    `SELECT id, user_id, family_id, expires_at, revoked_at, rotated_at
       FROM refresh_tokens
      WHERE token_hash = $1`,
    [hashToken(rawToken)]
  );

  // Unknown hash: nothing to rotate and nothing to leak about why.
  if (!row) throw httpError(401, 'Invalid refresh token');

  // Already used or already revoked. If it was rotated, someone is presenting a
  // superseded token — treat the family as compromised.
  if (row.revoked_at || row.rotated_at) {
    await revokeFamily(row.family_id, 'reuse_detected');
    logger.warn('refresh token reuse detected', {
      user_id: row.user_id,
      family_id: row.family_id
    });
    throw httpError(401, 'Invalid refresh token');
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw httpError(401, 'Refresh token expired');
  }

  const successor = await insertToken({
    userId: row.user_id,
    familyId: row.family_id,
    client
  });

  await db.none(
    `UPDATE refresh_tokens
        SET rotated_at = NOW(), revoked_at = NOW(), revoked_reason = 'rotated'
      WHERE id = $1`,
    [row.id]
  );

  return { token: successor, userId: row.user_id, familyId: row.family_id };
}

// Log out one session. Revokes the whole family so a stolen successor from the
// same chain cannot be used either. Silent when the token is unknown: logout
// should not be an oracle, and a client clearing a dead token is not an error.
async function revokeSession(rawToken) {
  if (typeof rawToken !== 'string' || !rawToken.trim()) return false;

  const row = await db.oneOrNone(
    'SELECT family_id FROM refresh_tokens WHERE token_hash = $1',
    [hashToken(rawToken)]
  );
  if (!row) return false;

  await revokeFamily(row.family_id, 'logout');
  return true;
}

// Log out everywhere. Also used when a user's role changes, so the old role
// cannot be refreshed back into a new access token.
async function revokeAllForUser(userId, reason = 'logout_all') {
  const result = await db.result(
    `UPDATE refresh_tokens
        SET revoked_at = NOW(), revoked_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, reason]
  );
  return result?.rowCount || 0;
}

// Housekeeping: expired rows are dead weight, not security state.
async function deleteExpired() {
  const result = await db.result('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
  return result?.rowCount || 0;
}

module.exports = {
  issueSession,
  rotate,
  revokeSession,
  revokeAllForUser,
  revokeFamily,
  deleteExpired,
  hashToken,
  ttlDays
};
