const express = require('express');
const router = express.Router();
const db = require('../config/database').db;
const { authenticateToken } = require('../config/auth');

// Get shift notes for today
router.get('/', authenticateToken, async (req, res) => {
  try {
    const shiftNotes = await db.any(
      `SELECT * FROM shift_notes 
       WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE 
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(shiftNotes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create shift note
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { property_id, content } = req.body;
    if (property_id == null) {
      return res.status(400).json({ error: 'property_id is required' });
    }
    if (typeof property_id !== 'number' && typeof property_id !== 'string') {
      return res.status(400).json({ error: 'property_id must be a positive integer' });
    }
    const propertyId = Number(property_id);
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: 'property_id must be a positive integer' });
    }

    if (content == null) {
      return res.status(400).json({ error: 'content is required' });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content must be a string' });
    }

    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return res.status(400).json({ error: 'content must not be empty' });
    }

    const property = await db.oneOrNone(
      'SELECT id FROM properties WHERE id = $1 AND user_id = $2',
      [propertyId, req.user.id]
    );
    if (!property) {
      return res.status(403).json({ error: 'Property not found or access denied' });
    }

    const shiftNote = await db.one(
      `INSERT INTO shift_notes (user_id, property_id, content) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [req.user.id, propertyId, normalizedContent]
    );
    
    res.status(201).json(shiftNote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update shift note
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    if (content == null) {
      return res.status(400).json({ error: 'content is required' });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content must be a string' });
    }

    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return res.status(400).json({ error: 'content must not be empty' });
    }
    
    const shiftNote = await db.oneOrNone(
      `UPDATE shift_notes 
       SET content = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [normalizedContent, req.params.id, req.user.id]
    );

    if (!shiftNote) {
      return res.status(404).json({ error: 'Shift note not found' });
    }
    
    if (!shiftNote) {
      return res.status(404).json({ error: 'Shift note not found' });
    }
    res.json(shiftNote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete shift note
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await db.result(
      'DELETE FROM shift_notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Shift note not found' });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
