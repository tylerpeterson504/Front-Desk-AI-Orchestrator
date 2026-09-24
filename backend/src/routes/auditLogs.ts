import express from 'express';
import { auditLogService } from '../services/auditLogService';
import { authenticateToken } from '../config/auth';
import { requestId } from '../middleware/errorHandler';

const router = express.Router();

/**
 * Returns the authenticated user's audit logs with a total count when `page`
 * is supplied, or the legacy array response otherwise. Forwards errors to
 * Express's error handler.
 */
async function getAuditLogs(req: express.Request, res: express.Response, next: express.NextFunction) {
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
}

router.get('/', requestId, authenticateToken, getAuditLogs);

export default router;
