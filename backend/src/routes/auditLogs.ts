import express from 'express';
import { auditLogService } from '../services/auditLogService';
import { authenticateToken } from '../config/auth';
import { requestId } from '../middleware/errorHandler';

const router = express.Router();

/**
 * Returns the authenticated user's audit logs with a total count when `page`
 * is supplied, or the legacy array response otherwise. Defaults to 100 items
 * (at most 500); page takes precedence over offset. Forwards errors to
 * Express's error handler.
 */
async function getAuditLogs(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const userId = (req as any).user.userId;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500);
    const requestedOffset = parseInt(req.query.offset as string, 10) || 0;
    const pageQuery = req.query.page;
    const hasPage = pageQuery !== undefined;
    if (hasPage && (typeof pageQuery !== 'string' || !pageQuery.trim())) {
      return res.status(400).json({
        error: 'Invalid page parameter',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }
    const page = Math.max(parseInt(typeof pageQuery === 'string' ? pageQuery : '1', 10) || 1, 1);
    const offset = hasPage ? (page - 1) * limit : Math.max(requestedOffset, 0);

    const logs = await auditLogService.getAll(userId, { limit, offset });
    res.json(hasPage ? logs : logs.data);
  } catch (err) {
    next(err);
  }
}

router.get('/', requestId, authenticateToken, getAuditLogs);

export default router;
