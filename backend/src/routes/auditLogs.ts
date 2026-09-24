import express from 'express';
import { auditLogService } from '../services/auditLogService';
import { authenticateToken } from '../config/auth';
import { requestId } from '../middleware/errorHandler';

const router = express.Router();

/** Returns the authenticated user's logs as an array, or as { data, total }
 * when a page query parameter is present. Uses a 100-item default and a
 * 500-item limit; page takes precedence over offset when both are supplied.
 * Forwards service failures to the error handler.
 */
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
