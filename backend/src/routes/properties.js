const express = require('express');
const router = express.Router();
const db = require('../config/database').db;
const { authenticateToken } = require('../config/auth');

// Wi-Fi password is deliberately excluded from all list/get responses.
// It is served only via /:id/wifi, which is also audit-logged.

// Get all properties for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const properties = await db.any(
      'SELECT id, user_id, name, url_pattern, wifi_ssid, checkout_time, tone_guidelines, created_at, updated_at FROM properties WHERE user_id = $1 ORDER BY name',
      [req.user.id]
    );
    res.json(properties);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single property
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const property = await db.oneOrNone(
      'SELECT id, user_id, name, url_pattern, wifi_ssid, checkout_time, tone_guidelines, created_at, updated_at FROM properties WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.json(property);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reveal the Wi-Fi password on demand (audit-logged)
router.get('/:id/wifi', authenticateToken, async (req, res) => {
  try {
    const property = await db.oneOrNone(
      'SELECT id, name, wifi_ssid, wifi_password FROM properties WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Audit the reveal so access to the credential is traceable.
    await db.none(
      `INSERT INTO audit_logs (user_id, property_id, action, details)
       VALUES ($1, $2, $3, $4)`,
      [
        req.user.id,
        property.id,
        'wifi_password_revealed',
        JSON.stringify({ property: property.name, at: new Date().toISOString() })
      ]
    );

    res.json({ ssid: property.wifi_ssid, password: property.wifi_password });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a property
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, url_pattern, wifi_ssid, wifi_password, checkout_time, tone_guidelines } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!url_pattern || typeof url_pattern !== 'string' || !url_pattern.trim()) {
      return res.status(400).json({ error: 'url_pattern is required' });
    }

    const property = await db.one(
      `INSERT INTO properties (user_id, name, url_pattern, wifi_ssid, wifi_password, checkout_time, tone_guidelines)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, name, url_pattern, wifi_ssid, checkout_time, tone_guidelines, created_at, updated_at`,
      [req.user.id, name, url_pattern, wifi_ssid, wifi_password, checkout_time || '11:00:00', tone_guidelines]
    );
    res.status(201).json(property);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a property
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { name, url_pattern, wifi_ssid, wifi_password, checkout_time, tone_guidelines } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!url_pattern || typeof url_pattern !== 'string' || !url_pattern.trim()) {
      return res.status(400).json({ error: 'url_pattern is required' });
    }

    const property = await db.oneOrNone(
      `UPDATE properties
       SET name = $1, url_pattern = $2, wifi_ssid = $3, wifi_password = $4,
           checkout_time = $5, tone_guidelines = $6, updated_at = NOW()
       WHERE id = $7 AND user_id = $8
       RETURNING id, user_id, name, url_pattern, wifi_ssid, checkout_time, tone_guidelines, created_at, updated_at`,
      [name, url_pattern, wifi_ssid, wifi_password, checkout_time, tone_guidelines, req.params.id, req.user.id]
    );
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.json(property);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a property
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await db.result(
      'DELETE FROM properties WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
