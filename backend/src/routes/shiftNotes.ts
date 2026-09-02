import express from 'express';
import { shiftNoteService } from '../services/shiftNoteService';
import { authenticateToken } from '../config/auth';
import { requestId } from '../middleware/errorHandler';
import logger from '../lib/logger';

const router = express.Router();

// Get shift notes for today
router.get('/', requestId, authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).user.userId;
    const shiftNotes = await shiftNoteService.getAll(userId);
    res.json(shiftNotes);
  } catch (err) {
    next(err);
  }
});

// Create shift note
router.post('/', requestId, authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).user.userId;
    const shiftNote = await shiftNoteService.create(req.body, userId);

    logger.info('Shift note created', { shift_note_id: shiftNote.id, user_id: userId, request_id: req.requestId });
    res.status(201).json(shiftNote);
  } catch (err) {
    next(err);
  }
});

// Update shift note
router.put('/:id', requestId, authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).user.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid shift note ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const shiftNote = await shiftNoteService.update(id, req.body, userId);

    logger.info('Shift note updated', { shift_note_id: shiftNote.id, user_id: userId, request_id: req.requestId });
    res.json(shiftNote);
  } catch (err) {
    next(err);
  }
});

// Delete shift note
router.delete('/:id', requestId, authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).user.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'Invalid shift note ID',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    await shiftNoteService.delete(id, userId);

    logger.info('Shift note deleted', { shift_note_id: id, user_id: userId, request_id: req.requestId });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
