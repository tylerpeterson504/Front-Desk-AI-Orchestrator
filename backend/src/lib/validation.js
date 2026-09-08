// Shared validation utilities.
//
// Centralizes common validation patterns used across routes to ensure consistency
// and reduce duplication.

const { httpError } = require('../lib/httpError');

// Common validation patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s\-\(\)\+]{10,20}$/;

/**
 * Validates and returns a required string value.
 * Trims whitespace and validates length.
 * 
 * @param {any} value - The value to validate
 * @param {string} field - The field name for error messages
 * @param {Object} options - Validation options
 * @param {number} options.maxLength - Maximum allowed length (default: 255)
 * @returns {string} The trimmed, validated string
 * @throws {Error} If validation fails
 */
function requireString(value, field, { maxLength = 255 } = {}) {
  if (typeof value !== 'string' || !value?.trim()) {
    throw httpError(400, `${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw httpError(400, `${field} must be at most ${maxLength} characters`);
  }
  if (trimmed.length === 0) {
    throw httpError(400, `${field} is required`);
  }
  return trimmed;
}

/**
 * Validates and returns an optional string value.
 * Returns null for null, undefined, or empty/whitespace-only strings.
 * Trims whitespace and validates length for non-null values.
 * 
 * @param {any} value - The value to validate
 * @param {string} field - The field name for error messages
 * @param {Object} options - Validation options
 * @param {number} options.maxLength - Maximum allowed length (default: 255)
 * @returns {string|null} The trimmed, validated string or null
 * @throws {Error} If validation fails for non-null values
 */
function optionalString(value, field, { maxLength = 255 } = {}) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') {
    throw httpError(400, `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > maxLength) {
    throw httpError(400, `${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

/**
 * Validates and returns an optional string that can be empty but not null.
 * Useful for fields like wifi_ssid where empty string is valid.
 * 
 * @param {any} value - The value to validate
 * @param {string} field - The field name for error messages
 * @param {Object} options - Validation options
 * @param {number} options.maxLength - Maximum allowed length (default: 255)
 * @returns {string} The trimmed, validated string (empty string for null/undefined)
 * @throws {Error} If validation fails
 */
function optionalStringOrEmpty(value, field, { maxLength = 255 } = {}) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') {
    throw httpError(400, `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw httpError(400, `${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

/**
 * Validates and returns a positive integer.
 * 
 * @param {any} value - The value to validate
 * @param {string} field - The field name for error messages
 * @returns {number} The validated positive integer
 * @throws {Error} If validation fails
 */
function requirePositiveInteger(value, field) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw httpError(400, `${field} must be a positive integer`);
  }
  return num;
}

/**
 * Validates and returns a non-negative integer.
 * 
 * @param {any} value - The value to validate
 * @param {string} field - The field name for error messages
 * @returns {number} The validated non-negative integer
 * @throws {Error} If validation fails
 */
function requireNonNegativeInteger(value, field) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw httpError(400, `${field} must be a non-negative integer`);
  }
  return num;
}

/**
 * Validates that a value is one of the allowed options.
 * 
 * @param {any} value - The value to validate
 * @param {string} field - The field name for error messages
 * @param {Array} allowedValues - Array of allowed values
 * @returns {any} The validated value
 * @throws {Error} If validation fails
 */
function requireOneOf(value, field, allowedValues) {
  if (!allowedValues.includes(value)) {
    throw httpError(400, `${field} must be one of: ${allowedValues.join(', ')}`);
  }
  return value;
}

/**
 * Validates that a value is an array.
 * 
 * @param {any} value - The value to validate
 * @param {string} field - The field name for error messages
 * @param {Object} options - Validation options
 * @param {number} options.maxLength - Maximum array length
 * @param {Function} options.itemValidator - Optional function to validate each item
 * @returns {Array} The validated array
 * @throws {Error} If validation fails
 */
function requireArray(value, field, { maxLength, itemValidator } = {}) {
  if (!Array.isArray(value)) {
    throw httpError(400, `${field} must be an array`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw httpError(400, `${field} must have at most ${maxLength} items`);
  }
  if (itemValidator) {
    for (let i = 0; i < value.length; i++) {
      try {
        itemValidator(value[i], `${field}[${i}]`);
      } catch (error) {
        throw error;
      }
    }
  }
  return value;
}

/**
 * Validates that a value is a boolean.
 * 
 * @param {any} value - The value to validate
 * @param {string} field - The field name for error messages
 * @returns {boolean} The validated boolean
 * @throws {Error} If validation fails
 */
function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw httpError(400, `${field} must be a boolean`);
  }
  return value;
}

/**
 * Validates that a value is an object.
 * 
 * @param {any} value - The value to validate
 * @param {string} field - The field name for error messages
 * @returns {Object} The validated object
 * @throws {Error} If validation fails
 */
function requireObject(value, field) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw httpError(400, `${field} must be an object`);
  }
  return value;
}

/**
 * Validates and normalizes a time string in HH:MM or HH:MM:SS format.
 * 
 * @param {any} value - The value to validate
 * @param {string} field - The field name for error messages
 * @param {string} fallback - Fallback value if null/undefined
 * @returns {string} The normalized time string (HH:MM:SS)
 * @throws {Error} If validation fails
 */
function requireTime(value, field, fallback = '11:00:00') {
  if (value == null || value === '') return fallback;
  
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
  if (typeof value !== 'string' || !timePattern.test(value.trim())) {
    throw httpError(400, `${field} must be HH:MM or HH:MM:SS (24-hour)`);
  }
  
  const trimmed = value.trim();
  
  // Validate time components are within valid ranges
  const [hours, minutes, seconds] = trimmed.split(':').map(Number);
  if (hours > 23 || minutes > 59 || (seconds && seconds > 59)) {
    throw httpError(400, `${field} must be a valid time (00:00:00 to 23:59:59)`);
  }
  
  // Normalize to HH:MM:SS format
  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
}

/**
 * Validates an email address format.
 * 
 * @param {any} value - The value to validate
 * @param {string} field - The field name for error messages
 * @returns {string} The validated email (trimmed and lowercased)
 * @throws {Error} If validation fails
 */
function requireEmail(value, field) {
  const validated = requireString(value, field, { maxLength: 254 });
  
  // Basic email format validation
  const parts = validated.split('@');
  if (parts.length !== 2) {
    throw httpError(400, `${field} must be a valid email address`);
  }
  
  const [local, domain] = parts;
  if (!local || !domain) {
    throw httpError(400, `${field} must be a valid email address`);
  }
  
  if (/\s/.test(local) || /\s/.test(domain)) {
    throw httpError(400, `${field} must be a valid email address`);
  }
  
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some(label => label.length === 0)) {
    throw httpError(400, `${field} must be a valid email address`);
  }
  
  return validated.toLowerCase();
}

module.exports = {
  requireString,
  optionalString,
  optionalStringOrEmpty,
  requirePositiveInteger,
  requireNonNegativeInteger,
  requireOneOf,
  requireArray,
  requireBoolean,
  requireObject,
  requireTime,
  requireEmail
};
