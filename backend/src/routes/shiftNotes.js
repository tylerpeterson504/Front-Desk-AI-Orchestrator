const express = require('express');
const router = express.Router();
const db = require('../config/database').db;
const { authenticateToken } = require('../config/auth');
const { httpError, asyncHandler } = require('../lib/httpError');

const COLUMNS = 'id, user_id, property_id, content, created_at, updated_at';
const MAX_CONTENT_LENGTH = 10000;

function readContent(raw) {
  if (raw == null) {
    throw httpError(400, 'content is required');
  }
  if (typeof raw !== 'string') {
    throw httpError(400, 'content must be a string');
  }
  const normalized = raw.trim();
  if (!normalized) {
    throw httpError(400, 'content must not be empty');
  }
  if (normalized.length > MAX_CONTENT_LENGTH) {
    throw httpError(400, `content must be at most ${MAX_CONTENT_LENGTH} characters`);
  }
  return normalized;
}

// Get shift notes for today
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const shiftNotes = await db.any(
    `SELECT ${COLUMNS} FROM shift_notes
     WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE
     ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(shiftNotes);
}));

// Create shift note
router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const { property_id, content } = req.body || {};

  if (property_id == null) {
    throw httpError(400, 'property_id is required');
  }
  if (typeof property_id !== 'number' && typeof property_id !== 'string') {
    throw httpError(400, 'property_id must be a positive integer');
  }
  const propertyId = Number(property_id);
  if (!Number.isInteger(propertyId) || propertyId <= 0) {
    throw httpError(400, 'property_id must be a positive integer');
  }

  const normalizedContent = readContent(content);

  const property = await db.oneOrNone(
    'SELECT id FROM properties WHERE id = $1 AND user_id = $2',
    [propertyId, req.user.id]
  );
  if (!property) {
    throw httpError(403, 'Property not found or access denied');
  }

  const shiftNote = await db.one(
    `INSERT INTO shift_notes (user_id, property_id, content)
     VALUES ($1, $2, $3)
     RETURNING ${COLUMNS}`,
    [req.user.id, propertyId, normalizedContent]
  );

  res.status(201).json(shiftNote);
}));

// Update shift note
router.put('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const normalizedContent = readContent(req.body?.content);

  const shiftNote = await db.oneOrNone(
    `UPDATE shift_notes
     SET content = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING ${COLUMNS}`,
    [normalizedContent, req.params.id, req.user.id]
  );
  if (!shiftNote) {
    throw httpError(404, 'Shift note not found');
  }
  res.json(shiftNote);
}));

// Delete shift note
router.delete('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const result = await db.result(
    'DELETE FROM shift_notes WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (result.rowCount === 0) {
    throw httpError(404, 'Shift note not found');
  }
  res.status(204).send();
}));

module.exports = router;
