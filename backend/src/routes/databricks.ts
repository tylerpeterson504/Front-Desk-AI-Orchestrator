import express from 'express';
import { databricksService } from '../services/databricksService';
import { authenticateToken } from '../config/auth';
import { requestId } from '../middleware/errorHandler';

const router = express.Router();

router.get('/status', requestId, authenticateToken, (req, res, next) => {
  try {
    const status = databricksService.getStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

export default router;
