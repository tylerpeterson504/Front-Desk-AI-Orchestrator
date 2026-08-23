const express = require('express');
const router = express.Router();
const db = require('../config/database').db;
const { authenticateToken } = require('../config/auth');

// Get all templates for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = 'SELECT * FROM templates WHERE user_id = $1';
    const params = [req.user.id];

    if (category) {
      query += ' AND category = $2';
      params.push(category);
    }

    if (search) {
      const idx = params.length + 1;
      query += ` AND (name ILIKE $${idx} OR $${idx} = ANY(tags))`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY name';
    const templates = await db.any(query, params);
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single template
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const template = await db.oneOrNone(
      'SELECT * FROM templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a template
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, category, content, tags } = req.body;

    const template = await db.one(
      `INSERT INTO templates (user_id, name, category, content, tags)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, name, category, content, tags || []]
    );
    res.status(201).json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a template
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { name, category, content, tags } = req.body;

    const template = await db.oneOrNone(
      `UPDATE templates
       SET name = $1, category = $2, content = $3, tags = $4, updated_at = NOW()
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [name, category, content, tags || [], req.params.id, req.user.id]
    );
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a template
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await db.result(
      'DELETE FROM templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
