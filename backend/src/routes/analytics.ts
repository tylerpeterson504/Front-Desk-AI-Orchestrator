import express from 'express';
import { analyticsService } from '../services/analyticsService';
import { requireAuth } from '../middleware/requireAuth';
import { requestId } from '../middleware/errorHandler';
import logger from '../lib/logger';

const router = express.Router();

// POST /api/analytics/response-events
// Body: { events: [{ property_id, conversation_hash, first_seen_at, replied_at? }] }
// Fire-and-forget telemetry from the extension side panel. No guest PII.
router.post('/response-events', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const body = req.body as { events?: unknown };
    const count = await analyticsService.record((body?.events ?? []) as never, userId);
    res.status(201).json({ recorded: count });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/response-times?property_id=&days=
// Median/avg/p95 first-response seconds for an owned property.
router.get('/response-times', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const propertyId = parseInt(String(req.query.property_id ?? ''), 10);
    const days = parseInt(String(req.query.days ?? '30'), 10);
    const summary = await analyticsService.responseTimes(propertyId, userId, days);

    logger.debug('response-times queried', { user_id: userId, property_id: propertyId });
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

export default router;
