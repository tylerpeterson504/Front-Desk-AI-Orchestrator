import express from 'express';
import { userService } from '../services/userService';
import { authService } from '../services/authService';
import { requestId } from '../middleware/errorHandler';
import { requireAuth, requireAdmin } from '../middleware/requireAuth';
import { config } from '../config';
import { getMode, assertRegistrationAllowed } from '../config/registration';
import { isValidEmail } from '../lib/validateEmail';
import logger from '../lib/logger';

const router = express.Router();

const MIN_PASSWORD_LENGTH = 12;

// Every endpoint that hands out credentials returns the same shape, so clients
// have one code path for login, register and refresh.
router.post('/register', requestId, async (req, res, next) => {
  try {
    assertRegistrationAllowed(req);

    const { email, password, name } = req.body || {};

    if (!email || !password || !name) {
      return res.status(400).json({
        error: 'Email, password, and name are required',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    if (typeof email !== 'string' || !isValidEmail(email.trim())) {
      return res.status(400).json({
        error: 'A valid email address is required',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        error: 'A name is required',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const response = await authService.register(
      { email, password, name },
      req.requestId
    );

    logger.info('user registered', { user_id: response.user.id, role: response.user.role, request_id: req.requestId });

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

// Login
router.post('/login', requestId, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const response = await authService.login(
      { email, password },
      req.requestId
    );

    logger.info('user logged in', { user_id: response.user.id, request_id: req.requestId });

    res.json(response);
  } catch (err) {
    next(err);
  }
});

// Refresh token
router.post('/refresh', requestId, async (req, res, next) => {
  try {
    const { refresh_token } = req.body || {};

    if (!refresh_token) {
      return res.status(400).json({
        error: 'Refresh token is required',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const tokens = await authService.refresh(refresh_token, req.requestId);

    res.json({
      token: tokens.token,
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      refresh_expires_at: tokens.refreshExpiresAt
    });
  } catch (err) {
    next(err);
  }
});

// Logout
router.post('/logout', requestId, async (req, res, next) => {
  try {
    const { refresh_token } = req.body || {};

    if (refresh_token) {
      await authService.logout(refresh_token, req.requestId);
    }

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// Logout everywhere
router.post('/logout-all', requestId, requireAuth, async (req, res, next) => {
  try {
    await authService.logoutEverywhere(req.auth!.userId, req.requestId);

    res.json({ message: 'Logged out everywhere successfully' });
  } catch (err) {
    next(err);
  }
});

// Get current user
router.get('/me', requestId, requireAuth, async (req, res, next) => {
  try {
    const user = await userService.findById(req.auth!.userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'NOT_FOUND',
        requestId: req.requestId
      });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      property_id: user.property_id
    });
  } catch (err) {
    next(err);
  }
});

// Get registration mode
router.get('/registration-mode', requestId, (req, res) => {
  res.json({ mode: getMode() });
});

// Staff directory for assignment pickers. Minimal fields only —
// no password hashes, property ids, or timestamps leak.
router.get('/users', requestId, requireAuth, async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();
    res.json(
      users.map((u: { id: string; name: string | null; email: string; role: string }) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role
      }))
    );
  } catch (err) {
    next(err);
  }
});

// Set user role (admin only)
router.patch('/users/:id/role', requestId, requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !['admin', 'agent'].includes(role)) {
      return res.status(400).json({
        error: 'Invalid role',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId
      });
    }

    const user = await userService.setUserRole(id, role as 'admin' | 'agent');

    logger.info('user role updated', {
      user_id: user.id,
      new_role: user.role,
      updated_by: req.auth!.userId,
      request_id: req.requestId
    });

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    });
  } catch (err) {
    next(err);
  }
});

export default router;