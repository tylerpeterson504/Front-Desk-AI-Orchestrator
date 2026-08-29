require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

app.disable('x-powered-by');
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()) : true
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

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });
}

module.exports = app;
