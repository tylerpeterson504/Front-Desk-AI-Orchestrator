// Central error handling.
//
// Rule: clients get a status code, a safe message, and a request id. They never
// get `error.message` from a database driver — pg-promise errors carry table
// names, column names, constraint names and SQL fragments.
//
// The full error (message, stack, pg code, route) is logged server-side against
// the same request id, so support can still trace a report end to end.

const crypto = require('crypto');
const logger = require('../lib/logger');

function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

function notFound(req, res) {
  res.status(404).json({ error: 'Not found', request_id: req.id });
}

// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity
function errorHandler(error, req, res, next) {
  const status = Number.isInteger(error.status) ? error.status : 500;

  // Malformed JSON body from express.json()
  const isBodyParseError = error.type === 'entity.parse.failed';
  const isBodyTooLarge = error.type === 'entity.too.large';

  if (status >= 500 && !isBodyParseError && !isBodyTooLarge) {
    logger.error('request failed', {
      request_id: req.id,
      method: req.method,
      path: req.originalUrl,
      user_id: req.user?.id ?? null,
      error: error.message,
      code: error.code ?? null,
      stack: error.stack
    });
  } else {
    logger.warn('request rejected', {
      request_id: req.id,
      method: req.method,
      path: req.originalUrl,
      user_id: req.user?.id ?? null,
      status,
      error: error.message,
      code: error.code ?? null
    });
  }

  if (isBodyParseError) {
    return res.status(400).json({ error: 'Malformed JSON body', request_id: req.id });
  }
  if (isBodyTooLarge) {
    return res.status(413).json({ error: 'Request body too large', request_id: req.id });
  }

  const message = error.expose && status < 500 ? error.message : 'Internal server error';
  return res.status(status).json({ error: message, request_id: req.id });
}

module.exports = { requestId, notFound, errorHandler };
