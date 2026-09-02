import express from 'express';
import { propertyService } from '../services/propertyService';
import { authenticateToken } from '../config/auth';
import { requestId } from '../middleware/errorHandler';
import logger from '../lib/logger';

const router = express.Router();

// Get all properties
router.get('/', requestId, async (req, res, next) => {
  try {
    const properties = await propertyService.getAll();
    res.json(properties);
  } catch (err) {
    next(err);
  }
});

// Get single property
router.get('/:id', requestId, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid property ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const property = await propertyService.getById(id);
    res.json(property);
  } catch (err) {
    next(err);
  }
});

// Create property
router.post('/', requestId, async (req, res, next) => {
  try {
    const property = await propertyService.create(req.body, req.requestId);
    logger.info('Property created', { property_id: property.id, request_id: req.requestId });
    res.status(201).json(property);
  } catch (err) {
    next(err);
  }
});

// Update property
router.put('/:id', requestId, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid property ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const property = await propertyService.update(id, req.body);
    logger.info('Property updated', { property_id: property.id, request_id: req.requestId });
    res.json(property);
  } catch (err) {
    next(err);
  }
});

// Delete property
router.delete('/:id', requestId, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid property ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    await propertyService.delete(id);
    logger.info('Property deleted', { property_id: id, request_id: req.requestId });
    res.json({ message: 'Property deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// Get Wi-Fi password (audit-logged, requires authentication)
router.get('/:id/wifi', requestId, authenticateToken, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid property ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const wifi = await propertyService.getWifiPassword(id, req.requestId);
    logger.info('WiFi password retrieved', { property_id: id, user_id: (req as any).user?.id, request_id: req.requestId });
    res.json(wifi);
  } catch (err) {
    next(err);
  }
});

export default router;
