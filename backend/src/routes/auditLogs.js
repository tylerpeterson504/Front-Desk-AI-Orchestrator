const express = require('express');
const router = express.Router();
const db = require('../config/database').db;
const { authenticateToken } = require('../config/auth');
const { asyncHandler } = require('../lib/httpError');

// Get audit logs for the authenticated user
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const requestedOffset = parseInt(req.query.offset, 10) || 0;
  const offset = requestedOffset > 0 ? requestedOffset : 0;

  const logs = await db.any(
    `SELECT al.id, al.user_id, al.property_id, al.action, al.details, al.created_at,
            p.name AS property_name
     FROM audit_logs al
     LEFT JOIN properties p ON p.id = al.property_id
     WHERE al.user_id = $1
     ORDER BY al.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );
  res.json(logs);
}));

module.exports = router;
