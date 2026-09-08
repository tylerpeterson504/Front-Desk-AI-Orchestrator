const express = require('express');
const router = express.Router();
const db = require('../config/database').db;
const { authenticateToken } = require('../config/auth');
const { httpError, asyncHandler } = require('../lib/httpError');
const { encryptSecret, decryptSecret } = require('../lib/secretBox');
const {
  requireString,
  optionalString,
  requireTime
} = require('../lib/validation');
const logger = require('../lib/logger');

// Wi-Fi password handling:
// - Never included in any list/get response. Enumerated column lists only.
// - Encrypted at rest with AES-256-GCM (src/lib/secretBox.js) before insert.
// - Readable only through /:id/wifi, which is audit-logged.

const SAFE_COLUMNS =
  'id, user_id, name, url_pattern, wifi_ssid, checkout_time, tone_guidelines, created_at, updated_at';

// Validated here rather than letting a bad string reach the TIME column and
// surface as an opaque 500.
function normalizeCheckoutTime(value, fallback = '11:00:00') {
  return requireTime(value, 'checkout_time', fallback);
}

function readPropertyBody(body, { checkoutFallback } = {}) {
  return {
    name: requireString(body?.name, 'name'),
    urlPattern: requireString(body?.url_pattern, 'url_pattern', { maxLength: 100 }),
    wifiSsid: optionalString(body?.wifi_ssid, 'wifi_ssid'),
    wifiPassword: optionalString(body?.wifi_password, 'wifi_password'),
    checkoutTime: normalizeCheckoutTime(body?.checkout_time, checkoutFallback),
    toneGuidelines: optionalString(body?.tone_guidelines, 'tone_guidelines', { maxLength: 2000 })
  };
}

// Get all properties for the authenticated user
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const properties = await db.any(
    `SELECT ${SAFE_COLUMNS} FROM properties WHERE user_id = $1 ORDER BY name`,
    [req.user.id]
  );
  res.json(properties);
}));

// Get a single property
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const property = await db.oneOrNone(
    `SELECT ${SAFE_COLUMNS} FROM properties WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!property) {
    throw httpError(404, 'Property not found');
  }
  res.json(property);
}));

// Reveal the Wi-Fi password on demand (audit-logged)
router.get('/:id/wifi', authenticateToken, asyncHandler(async (req, res) => {
  const property = await db.oneOrNone(
    'SELECT id, name, wifi_ssid, wifi_password FROM properties WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!property) {
    logger.debug('Property not found', { propertyId: req.params.id, userId: req.user.id, request_id: req.id });
    throw httpError(404, 'Property not found or access denied');
  }

  // Audit the reveal so access to the credential is traceable.
  await db.none(
    `INSERT INTO audit_logs (user_id, property_id, action, details)
     VALUES ($1, $2, $3, $4)`,
    [
      req.user.id,
      property.id,
      'wifi_password_revealed',
      JSON.stringify({ property: property.name, at: new Date().toISOString(), request_id: req.id })
    ]
  );

  res.json({ ssid: property.wifi_ssid, password: decryptSecret(property.wifi_password) });
}));

// Create a property
router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const input = readPropertyBody(req.body, { checkoutFallback: '11:00:00' });

  const property = await db.one(
    `INSERT INTO properties (user_id, name, url_pattern, wifi_ssid, wifi_password, checkout_time, tone_guidelines)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${SAFE_COLUMNS}`,
    [
      req.user.id,
      input.name,
      input.urlPattern,
      input.wifiSsid,
      encryptSecret(input.wifiPassword),
      input.checkoutTime,
      input.toneGuidelines
    ]
  );
  res.status(201).json(property);
}));

// Update a property
router.put('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const input = readPropertyBody(req.body, { checkoutFallback: null });

  const property = await db.oneOrNone(
    `UPDATE properties
     SET name = $1, url_pattern = $2, wifi_ssid = $3, wifi_password = $4,
         checkout_time = $5, tone_guidelines = $6, updated_at = NOW()
     WHERE id = $7 AND user_id = $8
     RETURNING ${SAFE_COLUMNS}`,
    [
      input.name,
      input.urlPattern,
      input.wifiSsid,
      encryptSecret(input.wifiPassword),
      input.checkoutTime,
      input.toneGuidelines,
      req.params.id,
      req.user.id
    ]
  );
  if (!property) {
    throw httpError(404, 'Property not found');
  }
  res.json(property);
}));

// Delete a property
router.delete('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const result = await db.result(
    'DELETE FROM properties WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (result.rowCount === 0) {
    throw httpError(404, 'Property not found');
  }
  res.status(204).send();
}));

module.exports = router;
