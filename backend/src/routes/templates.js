const express = require('express');
const router = express.Router();
const db = require('../config/database').db;
const { authenticateToken } = require('../config/auth');
const { httpError, asyncHandler } = require('../lib/httpError');

// Columns are enumerated rather than `SELECT *` so a future migration cannot
// silently widen the API surface.
const COLUMNS = 'id, user_id, name, category, content, tags, created_at, updated_at';

const MAX_CONTENT_LENGTH = 5000;
const MAX_TAGS = 25;

function readTemplateBody(body) {
  const { name, category, content, tags } = body || {};

  if (typeof name !== 'string' || !name.trim()) {
    throw httpError(400, 'name is required');
  }
  if (name.length > 255) {
    throw httpError(400, 'name must be at most 255 characters');
  }
  if (typeof content !== 'string' || !content.trim()) {
    throw httpError(400, 'content is required');
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    throw httpError(400, `content must be at most ${MAX_CONTENT_LENGTH} characters`);
  }
  if (category != null && (typeof category !== 'string' || category.length > 100)) {
    throw httpError(400, 'category must be a string of at most 100 characters');
  }
  if (tags != null && !Array.isArray(tags)) {
    throw httpError(400, 'tags must be an array');
  }
  if (Array.isArray(tags)) {
    if (tags.length > MAX_TAGS) {
      throw httpError(400, `tags must contain at most ${MAX_TAGS} entries`);
    }
    if (tags.some((tag) => typeof tag !== 'string' || tag.length > 100)) {
      throw httpError(400, 'each tag must be a string of at most 100 characters');
    }
  }

  return {
    name: name.trim(),
    category: category ?? null,
    content,
    tags: tags || []
  };
}

// Get all templates for the authenticated user
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { category, search } = req.query;
  let query = `SELECT ${COLUMNS} FROM templates WHERE user_id = $1`;
  const params = [req.user.id];

  if (category) {
    query += ' AND category = $2';
    params.push(category);
  }

  if (search) {
    const nameIdx = params.length + 1;
    const tagIdx = params.length + 2;
    query += ` AND (name ILIKE $${nameIdx} OR $${tagIdx} = ANY(tags))`;
    params.push(`%${search}%`);
    params.push(search);
  }

  query += ' ORDER BY name';
  const templates = await db.any(query, params);
  res.json(templates);
}));

// Get a single template
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const template = await db.oneOrNone(
    `SELECT ${COLUMNS} FROM templates WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!template) {
    throw httpError(404, 'Template not found');
  }
  res.json(template);
}));

// Create a template
router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const input = readTemplateBody(req.body);

  const template = await db.one(
    `INSERT INTO templates (user_id, name, category, content, tags)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [req.user.id, input.name, input.category, input.content, input.tags]
  );
  res.status(201).json(template);
}));

// Update a template
router.put('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const input = readTemplateBody(req.body);

  const template = await db.oneOrNone(
    `UPDATE templates
     SET name = $1, category = $2, content = $3, tags = $4, updated_at = NOW()
     WHERE id = $5 AND user_id = $6
     RETURNING ${COLUMNS}`,
    [input.name, input.category, input.content, input.tags, req.params.id, req.user.id]
  );
  if (!template) {
    throw httpError(404, 'Template not found');
  }
  res.json(template);
}));

// Delete a template
router.delete('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const result = await db.result(
    'DELETE FROM templates WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (result.rowCount === 0) {
    throw httpError(404, 'Template not found');
  }
  res.status(204).send();
}));

module.exports = router;
