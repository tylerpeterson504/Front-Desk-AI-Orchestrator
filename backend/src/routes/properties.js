const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { authenticateToken } = require('../config/auth');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const properties = await db.any('SELECT * FROM properties WHERE user_id = $1', [req.user.id]);
    res.json(properties);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, url_pattern, wifi_ssid, wifi_password, checkout_time, tone_guidelines } = req.body;
    const property = await db.one(
      `INSERT INTO properties (user_id, name, url_pattern, wifi_ssid, wifi_password, checkout_time, tone_guidelines)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, name, url_pattern, wifi_ssid, wifi_password, checkout_time || '11:00:00', tone_guidelines]
    );
    res.status(201).json(property);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const property = await db.oneOrNone(
      'SELECT * FROM properties WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!property) return res.status(404).json({ error: 'Property not found' });
    res.json(property);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { name, url_pattern, wifi_ssid, wifi_password, checkout_time, tone_guidelines } = req.body;
    const property = await db.oneOrNone(
      `UPDATE properties SET name=$1, url_pattern=$2, wifi_ssid=$3, wifi_password=$4,
       checkout_time=$5, tone_guidelines=$6, updated_at=NOW()
       WHERE id=$7 AND user_id=$8 RETURNING *`,
      [name, url_pattern, wifi_ssid, wifi_password, checkout_time, tone_guidelines, req.params.id, req.user.id]
    );
    if (!property) return res.status(404).json({ error: 'Property not found' });
    res.json(property);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await db.none('DELETE FROM properties WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
