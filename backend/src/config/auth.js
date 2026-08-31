const jwt = require('jsonwebtoken');
const { httpError } = require('../lib/httpError');

const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (!isProduction ? 'dev-secret-change-in-production' : null);
const TOKEN_TTL = process.env.JWT_TTL || '12h';

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
    { expiresIn: TOKEN_TTL }
  );
}

module.exports = { authenticateToken, requireRole, generateToken };
