import express from 'express';
import { copilotService } from '../services/copilotService';
import { authenticateToken } from '../config/auth';
import { requestId } from '../middleware/errorHandler';
import logger from '../lib/logger';

const router = express.Router();

// POST /api/copilot/draft
// Body: { property_id?, tone?, template_ids?: number[], guest_info?: {...}, chat_context?: {...} }
// Returns: { draft, meta: { provider, template_count, property, tone } }
router.post('/draft', requestId, authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).user.userId;
    const response = await copilotService.draft(req.body, userId);

    logger.info('Copilot draft generated', { user_id: userId, request_id: req.requestId });
    res.json(response);
  } catch (err) {
    next(err);
  }
});

export default router;
