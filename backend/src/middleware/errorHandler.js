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

// Known error codes for better client-side handling
const KNOWN_ERROR_CODES = new Set([
  'LLM_NOT_CONFIGURED',
  'MISTRAL_NOT_CONFIGURED',
  'MISTRAL_REQUEST_FAILED',
  'DATABASE_ERROR',
  'AUTH_NOT_CONFIGURED',
  'INVALID_INPUT',
  'NOT_FOUND',
  'ACCESS_DENIED',
  'RATE_LIMITED'
]);

function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

function notFound(req, res) {
  res.status(404).json({
    error: 'Not found',
    request_id: req.id,
    code: 'NOT_FOUND'
  });
}

// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity
function errorHandler(error, req, res, next) {
  const status = Number.isInteger(error.status) ? error.status : 500;

  // Malformed JSON body from express.json()
  const isBodyParseError = error.type === 'entity.parse.failed';
  const isBodyTooLarge = error.type === 'entity.too.large';

  // Extract error code safely
  const errorCode = error.code && KNOWN_ERROR_CODES.has(error.code) ? error.code : null;

  // Enhanced logging with more context
  const logData = {
    request_id: req.id,
    method: req.method,
    path: req.originalUrl,
    user_id: req.user?.id ?? null,
    status,
    error: error.message,
    code: errorCode
  };

  if (status >= 500 && !isBodyParseError && !isBodyTooLarge) {
    logger.error('request failed', {
      ...logData,
      stack: error.stack,
      // Add database error details if present
      db_error: error.code && error.code.startsWith('23') ? error.code : undefined
    });
  } else {
    logger.warn('request rejected', logData);
  }

  if (isBodyParseError) {
    return res.status(400).json({
      error: 'Malformed JSON body',
      request_id: req.id,
      code: 'INVALID_JSON'
    });
  }
  if (isBodyTooLarge) {
    return res.status(413).json({
      error: 'Request body too large',
      request_id: req.id,
      code: 'PAYLOAD_TOO_LARGE'
    });
  }

  // For known error codes, provide more specific messages
  let message = error.expose && status < 500 ? error.message : 'Internal server error';
  
  // Special handling for AI configuration errors
  if (errorCode === 'LLM_NOT_CONFIGURED' || errorCode === 'MISTRAL_NOT_CONFIGURED') {
    message = 'AI service is not configured. Please set up your Mistral API key.';
  } else if (errorCode === 'MISTRAL_REQUEST_FAILED') {
    message = 'AI service request failed. Please try again later.';
  } else if (errorCode === 'AUTH_NOT_CONFIGURED') {
    message = 'Authentication is not configured on the server.';
  }

  const response = { error: message, request_id: req.id };
  if (errorCode) response.code = errorCode;
  
  return res.status(status).json(response);
}

module.exports = { requestId, notFound, errorHandler };
