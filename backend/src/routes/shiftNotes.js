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
    
    const shiftNote = await db.one(
      `INSERT INTO shift_notes (user_id, property_id, content) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [req.user.id, property_id, content]
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
    
    const shiftNote = await db.one(
      `UPDATE shift_notes 
       SET content = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [content, req.params.id, req.user.id]
    );
    
    res.json(shiftNote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete shift note
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await db.none(
      'DELETE FROM shift_notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
