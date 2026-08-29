const express = require('express');
const router = express.Router();
const db = require('../config/database').db;
const { authenticateToken } = require('../config/auth');
const { draftGuestReply } = require('../services/llm');

// POST /api/copilot/draft
// Body: { property_id?, tone?, template_ids?: number[], guest_info?: {...}, chat_context?: {...} }
// Returns: { draft, meta: { model, template_count, property } }
//
// The extension sends the page-scraped guest/chat context it already holds;
// the server enriches with its own property + template records (authoritative)
// and calls Gemini. Template contents are fetched server-side so the LLM only
// ever sees staff-approved text owned by the caller.

router.post('/draft', authenticateToken, async (req, res) => {
  try {
    const { property_id, tone, template_ids, guest_info, chat_context } = req.body || {};

    const toneSafe = tone === 'friendly' ? 'friendly' : 'professional';

    // Resolve property (must belong to caller). Never send wifi_password to the LLM.
    let property = null;
    if (property_id != null) {
      property = await db.oneOrNone(
        'SELECT id, name, checkout_time, tone_guidelines, wifi_ssid FROM properties WHERE id = $1 AND user_id = $2',
        [property_id, req.user.id]
      );
      if (!property) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }
    }

    // Resolve selected templates (owned by caller)
    let templates = [];
    const ids = Array.isArray(template_ids) ? template_ids.filter((n) => Number.isInteger(n)).slice(0, 10) : [];
    if (ids.length) {
      templates = await db.any(
        `SELECT id, name, category, content FROM templates
         WHERE user_id = $1 AND id = ANY($2) ORDER BY name`,
        [req.user.id, ids]
      );
    }

    const draft = await draftGuestReply({
      property,
      guestInfo: guest_info || null,
      chatContext: chat_context || null,
      templates,
      tone: toneSafe
    });

    res.json({
      draft,
      meta: {
        model: require('../services/llm').MODEL_NAME,
        template_count: templates.length,
        property: property ? { id: property.id, name: property.name } : null,
        tone: toneSafe
      }
    });
  } catch (error) {
    if (error.code === 'LLM_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'AI drafting not configured on the server' });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
