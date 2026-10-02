import express from 'express';
import { templateService } from '../services/templateService';
import { requireAuth } from '../middleware/requireAuth';
import { requestId } from '../middleware/errorHandler';
import logger from '../lib/logger';

const router = express.Router();

// Get all templates for the authenticated user
router.get('/', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
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
router.get('/:id', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
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
router.post('/', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const template = await templateService.create(req.body, userId);

    logger.info('Template created', { template_id: template.id, user_id: userId, request_id: req.requestId });
    res.status(201).json(template);
  } catch (err) {
    next(err);
  }
});

// Update a template
router.put('/:id', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
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
router.delete('/:id', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
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

// Advanced search for templates
router.post('/search', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const options = req.body;

    const templates = await templateService.search(userId, options);
    res.json(templates);
  } catch (err) {
    next(err);
  }
});

// Get template statistics
router.get('/stats', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;

    const stats = await templateService.getStats(userId);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// Get template version history
router.get('/:id/versions', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid template ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const versions = await templateService.getVersionHistory(id, userId);
    res.json(versions);
  } catch (err) {
    next(err);
  }
});

// Share template with another property
router.post('/:id/share', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const id = parseInt(req.params.id, 10);
    const { target_property_id } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid template ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    if (!target_property_id || !Number.isInteger(target_property_id)) {
      return res.status(400).json({
        error: 'target_property_id is required',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const sharedTemplate = await templateService.shareWithProperty(id, target_property_id, userId);
    logger.info('Template shared', { template_id: id, target_property_id, user_id: userId, request_id: req.requestId });
    res.status(201).json(sharedTemplate);
  } catch (err) {
    next(err);
  }
});

// Submit template for approval
router.post('/:id/submit-approval', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid template ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const template = await templateService.submitForApproval(id, userId);
    logger.info('Template submitted for approval', { template_id: id, user_id: userId, request_id: req.requestId });
    res.json(template);
  } catch (err) {
    next(err);
  }
});

// Approve/reject/archive template
router.post('/:id/approve', requestId, requireAuth, async (req, res, next) => {
  try {
    const approverId = req.auth!.userId;
    const id = parseInt(req.params.id, 10);
    const { action, comments } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid template ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    if (!action || !['approve', 'reject', 'archive'].includes(action)) {
      return res.status(400).json({
        error: 'Valid action is required (approve, reject, archive)',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const template = await templateService.approveTemplate(id, action as 'approve' | 'reject' | 'archive', approverId, comments);
    logger.info('Template approval action', { template_id: id, action, approver_id: approverId, request_id: req.requestId });
    res.json(template);
  } catch (err) {
    next(err);
  }
});

// Increment usage count
router.post('/:id/increment-usage', requestId, requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid template ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    await templateService.incrementUsageCount(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
