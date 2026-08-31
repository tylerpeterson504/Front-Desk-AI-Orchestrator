require('dotenv').config();
// Freebuff Cloud writes Keys-tab values to the workspace-root .env.local.
// Load it without overriding anything already set by backend/.env or the shell.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./lib/logger');
const { requestId, notFound, errorHandler } = require('./middleware/errorHandler');
const { getMode } = require('./config/registration');

const app = express();

app.disable('x-powered-by');
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

// Rate limit auth endpoints to mitigate brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

// Routes
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/properties', apiLimiter, require('./routes/properties'));
app.use('/api/templates', apiLimiter, require('./routes/templates'));
app.use('/api/shift-notes', apiLimiter, require('./routes/shiftNotes'));
app.use('/api/audit-logs', apiLimiter, require('./routes/auditLogs'));
app.use('/api/copilot', apiLimiter, require('./routes/copilot'));
app.use('/api/databricks', apiLimiter, require('./routes/databricks'));
app.use('/api/github', apiLimiter, require('./routes/github'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

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
