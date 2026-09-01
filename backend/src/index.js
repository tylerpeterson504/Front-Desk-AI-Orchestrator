require('dotenv').config();
// Freebuff Cloud writes Keys-tab values to the workspace-root .env.local.
// Load it without overriding anything already set by backend/.env or the shell.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./lib/logger');
const { requestId, notFound, errorHandler } = require('./middleware/errorHandler');
const { getMode } = require('./config/registration');

const app = express();

app.disable('x-powered-by');
// The app runs behind a reverse proxy (preview/deploy) that sets X-Forwarded-For.
// Without this, express-rate-limit raises ERR_ERL_UNEXPECTED_X_FORWARDED_FOR and
// rate-limit keys resolve to the proxy instead of the client.
app.set('trust proxy', 1);
app.use(helmet());
app.use(requestId);

// CORS: an unset CORS_ORIGIN used to mean "reflect any origin". In production
// that is now a hard failure instead of a silent open door.
const corsOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!corsOrigins.length) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN must list the allowed browser origins in production');
  }
  logger.warn('CORS_ORIGIN is not set; allowing localhost origins for development only');
}

app.use(cors({
  origin: corsOrigins.length
    ? corsOrigins
    : [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/, /^chrome-extension:\/\//]
}));
app.use(express.json({ limit: '256kb' }));

// General rate limit for all API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

// Rate limit credential-guessing endpoints to mitigate brute-force attacks.
// Refresh and logout are excluded: they are not guessable (an unknown refresh
// token is simply rejected) and they run on a timer. A front desk shares one
// public IP, so with 15-minute access tokens a handful of staff would otherwise
// exhaust this budget on legitimate refreshes and be logged out.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  skip: (req) => req.path === '/refresh' || req.path === '/logout'
});

// Refresh still needs a ceiling — one client refreshes ~4 times an hour, so this
// is generous for a shared IP and still caps a token-stuffing loop.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

// The dashboard shell is a single static file read from disk. Give it a high
// ceiling so normal browser refreshes are unaffected while still putting a
// bound on repeated filesystem hits from one client.
const appShellLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

// Routes
app.use('/api/auth', authLimiter, refreshLimiter, require('./routes/auth'));
app.use('/api/properties', apiLimiter, require('./routes/properties'));
app.use('/api/templates', apiLimiter, require('./routes/templates'));
app.use('/api/shift-notes', apiLimiter, require('./routes/shiftNotes'));
app.use('/api/audit-logs', apiLimiter, require('./routes/auditLogs'));
app.use('/api/copilot', apiLimiter, require('./routes/copilot'));
app.use('/api/databricks', apiLimiter, require('./routes/databricks'));
app.use('/api/github', apiLimiter, require('./routes/github'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Serve dashboard static files in production.
// The SPA catch-all is registered BEFORE the notFound middleware so unknown
// browser routes serve the app shell, while unknown /api routes keep their
// JSON 404 (with request id) from the notFound middleware.
const dashboardBuild = path.join(__dirname, '../../dashboard/build');
app.use(express.static(dashboardBuild));
app.get('*', appShellLimiter, (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(dashboardBuild, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info('backend started', {
      port: PORT,
      env: process.env.NODE_ENV || 'development',
      registration_mode: getMode()
    });
  });
}

module.exports = app;
