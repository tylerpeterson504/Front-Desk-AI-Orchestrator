// Minimal structured logger. One JSON object per line so hosted log
// collectors can parse it without a shipping agent.
//
// Never pass secrets here. `redact()` scrubs the field names we know are
// sensitive, but it is a safety net, not a licence to log credentials.

const SENSITIVE_KEYS = new Set([
  'password',
  'wifi_password',
  'token',
  'authorization',
  'apikey',
  'api_key',
  'jwt_secret',
  'secret'
]);

function redact(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (typeof value !== 'object') return value;

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(val, depth + 1);
  }
  return out;
}

// Jest runs would otherwise interleave thousands of log lines with the report.
// Set LOG_VERBOSE=1 to see them while debugging a test.
function isSilenced() {
  return process.env.NODE_ENV === 'test' && !process.env.LOG_VERBOSE;
}

function emit(level, message, meta = {}) {
  if (isSilenced()) return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...redact(meta)
  });
  if (level === 'error' || level === 'warn') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

module.exports = {
  info: (message, meta) => emit('info', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  error: (message, meta) => emit('error', message, meta),
  redact
};
