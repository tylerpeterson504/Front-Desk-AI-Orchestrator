const express = require('express');
const router = express.Router();
const db = require('../config/database').db;
const { authenticateToken } = require('../config/auth');
const { httpError, asyncHandler } = require('../lib/httpError');
const { draftGuestReply } = require('../services/llm');

// POST /api/copilot/draft
// Body: { property_id?, tone?, template_ids?: number[], guest_info?: {...}, chat_context?: {...} }
// Returns: { draft, meta: { provider, template_count, property, tone } }
//
// `guest_info` and `chat_context` are page-collected and therefore UNTRUSTED —
// a guest can type anything into a chat. They are whitelisted and length-capped
// here, then fenced as data (not instructions) by the prompt builder.
// Properties and templates are re-resolved server-side from the caller's own
// records so the LLM only ever sees staff-approved text.

const GUEST_INFO_FIELDS = [
  'guestName',
  'roomNumber',
  'checkIn',
  'checkOut',
  'reservationStatus',
  'confirmationNumber'
];

const MAX_FIELD_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_MESSAGES = 20;
const MAX_TEMPLATE_IDS = 10;

// Collapses control characters and truncates. Keeps ordinary punctuation and
// non-Latin scripts intact.
function scrubText(value, maxLength) {
  if (value == null) return null;
  const text = String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function sanitizeGuestInfo(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const field of GUEST_INFO_FIELDS) {
    const value = scrubText(raw[field], MAX_FIELD_LENGTH);
    if (value) out[field] = value;
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeChatContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const messages = Array.isArray(raw.messages)
    ? raw.messages
        .slice(-MAX_MESSAGES)
        .map((message) => {
          if (!message || typeof message !== 'object') return null;
          const text = scrubText(message.text, MAX_MESSAGE_LENGTH);
          if (!text) return null;
          return {
            sender: scrubText(message.sender, 80) || 'Guest',
            text
          };
        })
        .filter(Boolean)
    : [];

  const activeGuest = scrubText(raw.activeGuest, MAX_FIELD_LENGTH);
  if (!messages.length && !activeGuest) return null;
  return { messages, activeGuest };
}

router.post('/draft', authenticateToken, asyncHandler(async (req, res) => {
  const { property_id, tone, template_ids } = req.body || {};

  const toneSafe = tone === 'friendly' ? 'friendly' : 'professional';
  const guestInfo = sanitizeGuestInfo(req.body?.guest_info);
  const chatContext = sanitizeChatContext(req.body?.chat_context);

  // Resolve property (must belong to caller). Never send wifi_password to the LLM.
  let property = null;
  if (property_id != null) {
    property = await db.oneOrNone(
      'SELECT id, name, checkout_time, tone_guidelines, wifi_ssid FROM properties WHERE id = $1 AND user_id = $2',
      [property_id, req.user.id]
    );
    if (!property) {
      throw httpError(403, 'Property not found or access denied');
    }
  }

  // Resolve selected templates (owned by caller)
  let templates = [];
  const ids = Array.isArray(template_ids)
    ? template_ids.filter((n) => Number.isInteger(n)).slice(0, MAX_TEMPLATE_IDS)
    : [];
  if (ids.length) {
    templates = await db.any(
      `SELECT id, name, category, content FROM templates
       WHERE user_id = $1 AND id = ANY($2) ORDER BY name`,
      [req.user.id, ids]
    );
  }

  let draft;
  let provider;
  try {
    ({ text: draft, provider } = await draftGuestReply({
      property,
      guestInfo,
      chatContext,
      templates,
      tone: toneSafe
    }));
  } catch (error) {
    if (error.code === 'LLM_NOT_CONFIGURED') {
      throw httpError(503, 'AI drafting not configured on the server');
    }
    throw error;
  }

  res.json({
    draft,
    meta: {
      provider,
      template_count: templates.length,
      property: property ? { id: property.id, name: property.name } : null,
      tone: toneSafe
    }
  });
}));

module.exports = router;
