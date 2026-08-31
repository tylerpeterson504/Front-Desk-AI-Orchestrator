// Helpers for expressing intentional HTTP failures.
//
// Routes throw `httpError(400, 'name is required')` instead of writing the
// response inline. The central error handler (src/middleware/errorHandler.js)
// decides what reaches the client: `expose`d messages are sent verbatim,
// everything else collapses to a generic 500 so driver/database internals
// never leave the server.

function httpError(status, message, options = {}) {
  const error = new Error(message);
  error.status = status;
  // Client-safe by default for 4xx; 5xx must opt in explicitly.
  error.expose = options.expose ?? status < 500;
  if (options.code) error.code = options.code;
  return error;
}

// Wraps an async route handler so a rejected promise reaches Express's error
// pipeline. Express 4 does not do this on its own.
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = { httpError, asyncHandler };
