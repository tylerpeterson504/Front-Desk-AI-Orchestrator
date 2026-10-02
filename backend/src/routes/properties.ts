import express from 'express';
import { propertyService } from '../services/propertyService';
import { requireAuth } from '../middleware/requireAuth';
import { requestId } from '../middleware/errorHandler';
import logger from '../lib/logger';

const router = express.Router();

// Get all properties
router.get('/', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const properties = await propertyService.getAll(userId);
    res.json(properties);
  } catch (err) {
    next(err);
  }
});

// Get single property
router.get('/:id', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid property ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const property = await propertyService.getById(id, userId);
    res.json(property);
  } catch (err) {
    next(err);
  }
});

// Create property
router.post('/', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const property = await propertyService.create(req.body, userId, req.requestId);
    logger.info('Property created', { property_id: property.id, user_id: userId, request_id: req.requestId });
    res.status(201).json(property);
  } catch (err) {
    next(err);
  }
});

// Update property
router.put('/:id', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid property ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const property = await propertyService.update(id, req.body, userId);
    logger.info('Property updated', { property_id: property.id, user_id: userId, request_id: req.requestId });
    res.json(property);
  } catch (err) {
    next(err);
  }
});

// Delete property
router.delete('/:id', requestId, requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid property ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    await propertyService.delete(id, userId);
    logger.info('Property deleted', { property_id: id, user_id: userId, request_id: req.requestId });
    res.json({ message: 'Property deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// Get Wi-Fi password (audit-logged, requires authentication)
router.get('/:id/wifi', requestId, requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid property ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const wifi = await propertyService.getWifiPassword(id, req.auth!.userId, req.requestId);
    logger.info('WiFi password retrieved', { property_id: id, user_id: req.auth!.userId, request_id: req.requestId });
    res.json(wifi);
  } catch (err) {
    next(err);
  }
});

export default router;
