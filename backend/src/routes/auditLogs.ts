import express from 'express';
import { auditLogService } from '../services/auditLogService';
import { authenticateToken } from '../config/auth';
import { requestId } from '../middleware/errorHandler';

const router = express.Router();

// Get audit logs for the authenticated user
router.get('/', requestId, authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).user.userId;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500);
    const requestedOffset = parseInt(req.query.offset as string, 10) || 0;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const offset = req.query.page ? (page - 1) * limit : Math.max(requestedOffset, 0);

    const logs = await auditLogService.getAll(userId, { limit, offset });
    res.json(req.query.page ? logs : logs.data);
  } catch (err) {
    next(err);
  }
});

export default router;
