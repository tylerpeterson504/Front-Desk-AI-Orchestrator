const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/database').db;
const {
  generateToken,
  authenticateToken,
  requireRole,
  accessTokenTtlSeconds
} = require('../config/auth');
const { assertRegistrationAllowed } = require('../config/registration');
const { httpError, asyncHandler } = require('../lib/httpError');
const logger = require('../lib/logger');
const { isValidEmail } = require('../lib/validateEmail');
const refreshTokens = require('../services/refreshTokens');

const DEFAULT_ROLE = 'agent';
const ASSIGNABLE_ROLES = new Set(['agent', 'manager', 'admin']);
const MIN_PASSWORD_LENGTH = 12;

// Every endpoint that hands out credentials returns the same shape, so clients
// have one code path for login, register and refresh.
async function respondWithSession(req, res, user, status = 200) {
  const session = await refreshTokens.issueSession(user, {
    client: req.headers['user-agent'] || null
  });

  res.status(status).json({
    token: generateToken(user),
    expires_in: accessTokenTtlSeconds(),
    refresh_token: session.token,
    refresh_expires_at: session.expiresAt,
    user: { id: user.id, email: user.email, name: user.name, role: user.role }
  });
}

function bcryptRounds() {
  const parsed = Number.parseInt(process.env.BCRYPT_ROUNDS || '', 10);
  if (!Number.isInteger(parsed) || parsed < 10 || parsed > 15) return 12;
  return parsed;
}

// Register
//
// `role` is deliberately NOT read from the request body. Accepting it let any
// caller self-assign `admin` and have that claim signed into their JWT. New
// accounts are always created as DEFAULT_ROLE; promotion happens through the
// admin-only PATCH /api/auth/users/:id/role below.
router.post('/register', asyncHandler(async (req, res) => {
  assertRegistrationAllowed(req);

  const { email, password, name } = req.body || {};

  if (!email || !password || !name) {
    throw httpError(400, 'Email, password, and name are required');
  }
  if (typeof email !== 'string' || !isValidEmail(email.trim())) {
    throw httpError(400, 'A valid email address is required');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw httpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (typeof name !== 'string' || !name.trim()) {
    throw httpError(400, 'A name is required');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const hashedPassword = await bcrypt.hash(password, bcryptRounds());

  let user;
  try {
    user = await db.one(
      `INSERT INTO users (email, password, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, created_at`,
      [normalizedEmail, hashedPassword, name.trim(), DEFAULT_ROLE]
    );
  } catch (error) {
    if (error.code === '23505') {
      throw httpError(409, 'Email already in use');
    }
    throw error;
  }

  logger.info('user registered', { user_id: user.id, role: user.role, request_id: req.id });

  await respondWithSession(req, res, user, 201);
}));

// Login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    throw httpError(400, 'Email and password are required');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  // Enumerated rather than SELECT *, so a future column (a reset token, a TOTP
  // secret) is not pulled into memory here by accident. `password` is needed for
  // the compare below and is never put on the response.
  const user = await db.oneOrNone(
    'SELECT id, email, name, role, password FROM users WHERE LOWER(email) = $1',
    [normalizedEmail]
  );

  // Same response for unknown email and bad password, so the endpoint is not
  // an account-existence oracle.
  if (!user || !(await bcrypt.compare(String(password), user.password))) {
    throw httpError(401, 'Invalid credentials');
  }

  await respondWithSession(req, res, user);
}));

// Exchange a refresh token for a new access token.
//
// Unauthenticated on purpose: the whole point is to be callable once the access
// token has expired. The refresh token itself is the credential.
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refresh_token: presented } = req.body || {};

  const rotated = await refreshTokens.rotate(presented, {
    client: req.headers['user-agent'] || null
  });

  // Read the user fresh so a role change or a deleted account takes effect on
  // the next refresh rather than persisting for the life of the session.
  const user = await db.oneOrNone(
    'SELECT id, email, name, role FROM users WHERE id = $1',
    [rotated.userId]
  );
  if (!user) {
    await refreshTokens.revokeFamily(rotated.familyId, 'user_missing');
    throw httpError(401, 'Invalid refresh token');
  }

  logger.info('token refreshed', {
    user_id: user.id,
    family_id: rotated.familyId,
    request_id: req.id
  });

  res.json({
    token: generateToken(user),
    expires_in: accessTokenTtlSeconds(),
    refresh_token: rotated.token,
    user
  });
}));

// Log out this session. Unauthenticated so an expired access token does not
// leave a client unable to clean up its refresh token, and idempotent: an
// unknown token still returns 204 rather than confirming what exists.
router.post('/logout', asyncHandler(async (req, res) => {
  const { refresh_token: presented } = req.body || {};
  const revoked = await refreshTokens.revokeSession(presented);

  if (revoked) {
    logger.info('session revoked', { request_id: req.id });
  }
  res.status(204).end();
}));

// Log out every session for the caller — the "sign out other devices" path.
router.post('/logout-all', authenticateToken, asyncHandler(async (req, res) => {
  const count = await refreshTokens.revokeAllForUser(req.user.id);
  logger.info('all sessions revoked', {
    user_id: req.user.id,
    sessions: count,
    request_id: req.id
  });
  res.json({ revoked_sessions: count });
}));

// Who am I — lets the dashboard validate a stored token on boot.
router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  const user = await db.oneOrNone(
    'SELECT id, email, name, role, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!user) {
    throw httpError(401, 'Invalid credentials');
  }
  res.json({ user });
}));

// Change a user's role. Admin only — this is the only path that can mint an
// admin, and it requires an existing admin (bootstrap the first one with
// `npm run set-role -- <email> admin`).
router.patch('/users/:id/role', authenticateToken, requireRole('admin'), asyncHandler(async (req, res) => {
  const { role } = req.body || {};
  if (!ASSIGNABLE_ROLES.has(role)) {
    throw httpError(400, `role must be one of: ${[...ASSIGNABLE_ROLES].join(', ')}`);
  }

  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    throw httpError(400, 'A valid user id is required');
  }

  const user = await db.oneOrNone(
    `UPDATE users SET role = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, email, name, role`,
    [role, targetId]
  );
  if (!user) {
    throw httpError(404, 'User not found');
  }

  // The old role is baked into any outstanding access token, and a refresh
  // would otherwise keep the session alive across the change. Force a re-login
  // so the new role is what gets signed.
  const revokedSessions = await refreshTokens.revokeAllForUser(user.id, 'role_changed');

  logger.info('role changed', {
    actor_id: req.user.id,
    revoked_sessions: revokedSessions,
    target_id: user.id,
    new_role: role,
    request_id: req.id
  });

  res.json({ user });
}));

module.exports = router;
