// Registration policy.
//
// Previously `POST /api/auth/register` was open to the internet on a public
// backend: any stranger could create a tenant and spend the deployment's LLM
// budget. Registration is now gated.
//
// REGISTRATION_MODE
//   invite  Caller must present a valid invite token (default in production).
//   open    Anyone may register. Refused in production.
//   closed  Registration is disabled entirely.
//
// Default when REGISTRATION_MODE is unset:
//   production      → invite
//   everything else → open, so local dev and CI keep working
//
// Invite token is presented as either `X-Registration-Token: <token>` or
// `{ "invite_token": "<token>" }` in the body, compared in constant time
// against REGISTRATION_INVITE_TOKEN.

const crypto = require('crypto');
const { httpError } = require('../lib/httpError');

const VALID_MODES = new Set(['invite', 'open', 'closed']);

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function getMode() {
  const configured = String(process.env.REGISTRATION_MODE || '').trim().toLowerCase();
  if (VALID_MODES.has(configured)) return configured;
  return isProduction() ? 'invite' : 'open';
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

// Throws an httpError when the request may not register a user.
function assertRegistrationAllowed(req) {
  const mode = getMode();

  if (mode === 'closed') {
    throw httpError(403, 'Registration is disabled');
  }

  if (mode === 'open') {
    if (isProduction()) {
      // Refuse rather than honour an obviously unsafe production setting.
      throw httpError(403, 'Registration is disabled');
    }
    return;
  }

  // mode === 'invite'
  const expected = String(process.env.REGISTRATION_INVITE_TOKEN || '').trim();
  if (!expected) {
    throw httpError(503, 'Registration is not configured');
  }

  const presented = req.get('x-registration-token') || req.body?.invite_token || '';
  if (!presented || !timingSafeEqual(presented, expected)) {
    throw httpError(403, 'A valid invite token is required to register');
  }
}

module.exports = { assertRegistrationAllowed, getMode };
