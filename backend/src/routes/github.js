const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../config/auth');
const { isConfigured } = require('../services/github');

router.get('/status', authenticateToken, (req, res) => {
  res.json({ configured: isConfigured() });
});

module.exports = router;
