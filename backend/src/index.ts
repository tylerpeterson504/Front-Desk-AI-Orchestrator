import 'reflect-metadata';
import dotenv from 'dotenv';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import logger from './lib/logger';
import { requestId, notFound, errorHandler } from './middleware/errorHandler';
import { getMode } from './config/registration';
import { initializeDatabase } from './config/database';
import { config } from './config';
import { responseCache } from './middleware/cache';
import { performanceMonitor } from './middleware/performance';
import { additionalSecurityHeaders, sanitizeInput } from './middleware/security';

// Load environment variables
dotenv.config();
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const app = express();

app.disable('x-powered-by');
// The app runs behind a reverse proxy (preview/deploy) that sets X-Forwarded-For.
// Without this, express-rate-limit raises ERR_ERL_UNEXPECTED_X_FORWARDED_FOR and
// rate-limit keys resolve to the proxy instead of the client.
app.set('trust proxy', 1);
app.use(helmet());
app.use(additionalSecurityHeaders);
app.use(requestId);
app.use(performanceMonitor());

// CORS configuration
const corsOrigins = config.CORS_ORIGIN
  ? config.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : [];

if (!corsOrigins.length) {
  if (config.NODE_ENV === 'production') {
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
app.use(sanitizeInput);

// Response cache for idempotent GET endpoints (60s TTL)
app.use(responseCache(60));

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
  skip: (req) => req.path === '/api/auth/refresh' || req.path === '/api/auth/logout'
});

// Refresh still needs a ceiling -- one client refreshes ~4 times an hour, so this
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

// Database is initialized only when the server starts (see isMainModule below),
// so importing this app (e.g. in tests) does not attempt a live connection.

// Routes
import authRouter from './routes/auth';
import propertiesRouter from './routes/properties';
import templatesRouter from './routes/templates';
import shiftNotesRouter from './routes/shiftNotes';
import auditLogsRouter from './routes/auditLogs';
import copilotRouter from './routes/copilot';
import databricksRouter from './routes/databricks';
import githubRouter from './routes/github';

app.use('/api/auth', authLimiter, refreshLimiter, authRouter);
app.use('/api/properties', apiLimiter, propertiesRouter);
app.use('/api/templates', apiLimiter, templatesRouter);
app.use('/api/shift-notes', apiLimiter, shiftNotesRouter);
app.use('/api/audit-logs', apiLimiter, auditLogsRouter);
app.use('/api/copilot', apiLimiter, copilotRouter);
app.use('/api/databricks', apiLimiter, databricksRouter);
app.use('/api/github', apiLimiter, githubRouter);

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

const PORT = config.PORT || 3001;

// Start server only if this file is run directly. Importing this module
// (e.g. in tests) must NOT connect to the database; only connect when the
// server is actually starting.
const isMainModule = import.meta.url.endsWith(process.argv[1]);

if (isMainModule) {
  initializeDatabase()
    .then(() => {
      app.listen(PORT, () => {
        logger.info('backend started', {
          port: PORT,
          env: config.NODE_ENV || 'development',
          registration_mode: getMode()
        });
      });
    })
    .catch((err) => {
      logger.error('Failed to initialize database', { error: err });
      process.exit(1);
    });
}

export default app;
