const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/database').db;
const { generateToken, authenticateToken, requireRole } = require('../config/auth');
const { assertRegistrationAllowed } = require('../config/registration');
const { httpError, asyncHandler } = require('../lib/httpError');
const logger = require('../lib/logger');

const DEFAULT_ROLE = 'agent';
const ASSIGNABLE_ROLES = new Set(['agent', 'manager', 'admin']);
const MIN_PASSWORD_LENGTH = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
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

  const token = generateToken(user);
  res.status(201).json({ token, user });
}));

// Login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    throw httpError(400, 'Email and password are required');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await db.oneOrNone('SELECT * FROM users WHERE LOWER(email) = $1', [normalizedEmail]);

  // Same response for unknown email and bad password, so the endpoint is not
  // an account-existence oracle.
  if (!user || !(await bcrypt.compare(String(password), user.password))) {
    throw httpError(401, 'Invalid credentials');
  }

  const token = generateToken(user);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role }
  });
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

  logger.info('role changed', {
    actor_id: req.user.id,
    target_id: user.id,
    new_role: role,
    request_id: req.id
  });

  res.json({ user });
}));

module.exports = router;
