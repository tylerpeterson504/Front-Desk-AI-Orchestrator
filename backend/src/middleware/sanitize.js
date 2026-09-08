// Request body sanitization middleware.
//
// Protects against prototype pollution attacks and removes potentially
// dangerous fields from request bodies.

/**
 * Removes prototype pollution vectors from an object.
 * Recursively cleans nested objects and arrays.
 * 
 * @param {Object|Array} obj - The object to sanitize
 * @returns {Object|Array} The sanitized object
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  // Check for prototype pollution markers
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip dangerous keys
    if (dangerous.includes(key)) {
      continue;
    }
    // Recursively sanitize nested values
    sanitized[key] = sanitizeObject(value);
  }
  
  return sanitized;
}

/**
 * Express middleware that sanitizes request bodies.
 * Should be placed early in the middleware chain, before JSON parsing.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function sanitizeBody(req, res, next) {
  // Only sanitize if body exists
  if (!req.body) {
    return next();
  }

  // Sanitize the body
  req.body = sanitizeObject(req.body);
  
  next();
}

/**
 * Express middleware that sanitizes query parameters.
 * Protects against prototype pollution in query strings.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function sanitizeQuery(req, res, next) {
  if (!req.query) {
    return next();
  }

  req.query = sanitizeObject(req.query);
  
  next();
}

/**
 * Trim whitespace from string values in an object.
 * Recursively processes nested objects and arrays.
 * 
 * @param {Object|Array} obj - The object to trim
 * @returns {Object|Array} The trimmed object
 */
function trimObjectStrings(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(trimObjectStrings);
  }

  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return obj.trim();
    }
    return obj;
  }

  const trimmed = {};
  for (const [key, value] of Object.entries(obj)) {
    trimmed[key] = trimObjectStrings(value);
  }
  
  return trimmed;
}

/**
 * Express middleware that trims whitespace from all string values in the body.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function trimBodyStrings(req, res, next) {
  if (!req.body) {
    return next();
  }

  req.body = trimObjectStrings(req.body);
  
  next();
}

/**
 * Remove fields that should never be accepted from client requests.
 * 
 * @param {Object} obj - The object to filter
 * @param {string[]} fieldsToRemove - Fields to remove
 * @returns {Object} The filtered object
 */
function removeFields(obj, fieldsToRemove) {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  const filtered = {};
  for (const [key, value] of Object.entries(obj)) {
    if (fieldsToRemove.includes(key)) {
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      filtered[key] = removeFields(value, fieldsToRemove);
    } else {
      filtered[key] = value;
    }
  }
  
  return filtered;
}

/**
 * Express middleware that removes potentially dangerous fields from the body.
 * 
 * @param {string[]} fields - Fields to remove
 * @returns {Function} Express middleware function
 */
function removeBodyFields(fields) {
  return (req, res, next) => {
    if (!req.body) {
      return next();
    }
    req.body = removeFields(req.body, fields);
    next();
  };
}

/**
 * Sanitize a value to prevent XSS if it will be rendered in HTML.
 * Escapes HTML special characters.
 * 
 * @param {string} value - The value to escape
 * @returns {string} The escaped value
 */
function escapeHtml(value) {
  if (typeof value !== 'string') {
    return value;
  }
  
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Helper function that sanitizes an object and applies a transformation to string values.
 * 
 * @param {Object|Array} obj - The object to process
 * @param {Function} transform - Function to apply to string values
 * @returns {Object|Array} The processed object
 */
function sanitizeAndTransform(obj, transform) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeAndTransform(item, transform));
  }

  if (typeof obj !== 'object') {
    return typeof obj === 'string' ? transform(obj) : obj;
  }

  // Check for prototype pollution markers
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (dangerous.includes(key)) {
      continue;
    }
    result[key] = sanitizeAndTransform(value, transform);
  }
  return result;
}

/**
 * Express middleware that escapes HTML in string values in the body.
 * Useful for endpoints that might echo user input in HTML responses.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function escapeBodyHtml(req, res, next) {
  if (!req.body) {
    return next();
  }

  req.body = sanitizeAndTransform(req.body, escapeHtml);
  
  next();
}

module.exports = {
  sanitizeObject,
  sanitizeAndTransform,
  sanitizeBody,
  sanitizeQuery,
  trimObjectStrings,
  trimBodyStrings,
  removeFields,
  removeBodyFields,
  escapeHtml,
  escapeBodyHtml
};
