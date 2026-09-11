import express from 'express';
import { templateService } from '../services/templateService';
import { authenticateToken } from '../config/auth';
import { requestId } from '../middleware/errorHandler';
import logger from '../lib/logger';

const router = express.Router();

// Get all templates for the authenticated user
router.get('/', requestId, authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).user.userId;
    const { category, search } = req.query;

    const templates = await templateService.getAll(userId, {
      category: category as string | undefined,
      search: search as string | undefined
    });

    res.json(templates);
  } catch (err) {
    next(err);
  }
});

// Get a single template
router.get('/:id', requestId, authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).user.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid template ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const template = await templateService.getById(id, userId);
    res.json(template);
  } catch (err) {
    next(err);
  }
});

// Create a template
router.post('/', requestId, authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).user.userId;
    const template = await templateService.create(req.body, userId);

    logger.info('Template created', { template_id: template.id, user_id: userId, request_id: req.requestId });
    res.status(201).json(template);
  } catch (err) {
    next(err);
  }
});

// Update a template
router.put('/:id', requestId, authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).user.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid template ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const template = await templateService.update(id, req.body, userId);

    logger.info('Template updated', { template_id: template.id, user_id: userId, request_id: req.requestId });
    res.json(template);
  } catch (err) {
    next(err);
  }
});

// Delete a template
router.delete('/:id', requestId, authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).user.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid template ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    await templateService.delete(id, userId);

    logger.info('Template deleted', { template_id: id, user_id: userId, request_id: req.requestId });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
