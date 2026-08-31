const jwt = require('jsonwebtoken');
const { httpError } = require('../lib/httpError');

const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (!isProduction ? 'dev-secret-change-in-production' : null);
// Access tokens are deliberately short-lived: they are stateless, so the only
// bound on a stolen or de-privileged token is its expiry. Long-lived sessions
// live in the refresh_tokens table instead, where they can be revoked.
const ACCESS_TOKEN_TTL = process.env.JWT_TTL || '15m';

// Seconds, for the `expires_in` a client needs to schedule a refresh. Kept in
// sync with ACCESS_TOKEN_TTL by parsing it rather than by a second constant.
function accessTokenTtlSeconds() {
  const match = /^(\d+)([smhd])?$/.exec(String(ACCESS_TOKEN_TTL).trim());
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2] || 's';
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  return value * multiplier;
}

function authenticateToken(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(503).json({ error: 'Authentication is not configured' });
  }
  const authHeader = req.headers.authorization;
  const [scheme, token] = authHeader ? authHeader.split(' ') : [];

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Route guard for role-restricted endpoints. Must run after authenticateToken.
function requireRole(...roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!req.user) return next(httpError(401, 'Access token required'));
    if (!allowed.has(req.user.role)) {
      return next(httpError(403, 'Insufficient permissions'));
    }
    return next();
  };
}

function generateToken(user) {
  if (!JWT_SECRET) {
    const error = new Error('Authentication is not configured');
    error.code = 'AUTH_NOT_CONFIGURED';
    throw error;
  }
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

module.exports = { authenticateToken, requireRole, generateToken, accessTokenTtlSeconds };
