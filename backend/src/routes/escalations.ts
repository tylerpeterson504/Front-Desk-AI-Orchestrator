import express from 'express';
import { escalationService } from '../services/escalationService';
import { requireAuth } from '../middleware/requireAuth';
import { requestId } from '../middleware/errorHandler';
import logger from '../lib/logger';

const router = express.Router();

// List escalations (created by or assigned to the caller). Optional ?status=
router.get('/', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const escalations = await escalationService.getAll(userId, { status });
    res.json(escalations);
  } catch (err) {
    next(err);
  }
});

// Create an escalation for a property owned by the caller
router.post('/', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const escalation = await escalationService.create(req.body, userId);

    logger.info('Escalation created', { escalation_id: escalation.id, user_id: userId, request_id: req.requestId });
    res.status(201).json(escalation);
  } catch (err) {
    next(err);
  }
});

// Update status / priority / assignment
router.put('/:id', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid escalation ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const escalation = await escalationService.update(id, req.body, userId);

    logger.info('Escalation updated', { escalation_id: escalation.id, user_id: userId, request_id: req.requestId });
    res.json(escalation);
  } catch (err) {
    next(err);
  }
});

// Delete an escalation (creator only)
router.delete('/:id', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid escalation ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    await escalationService.delete(id, userId);

    logger.info('Escalation deleted', { escalation_id: id, user_id: userId, request_id: req.requestId });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
