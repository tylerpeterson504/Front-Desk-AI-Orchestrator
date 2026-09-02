import express from 'express';
import { githubService } from '../services/githubService';
import { authenticateToken } from '../config/auth';
import { requestId } from '../middleware/errorHandler';

const router = express.Router();

router.get('/status', requestId, authenticateToken, (req, res, next) => {
  try {
    const status = githubService.getStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

export default router;
