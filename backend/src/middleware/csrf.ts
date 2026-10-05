/**
 * CSRF (Cross-Site Request Forgery) protection middleware.
 * Implements Double Submit Cookie pattern for stateless CSRF protection.
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';
import { config } from '../config';

/**
 * CSRF Configuration
 */
interface CsrfConfig {
  enabled: boolean;
  cookieName: string;
  headerName: string;
  tokenLength: number;
  sameSite: 'strict' | 'lax' | 'none';
  secure: boolean;
  httpOnly: boolean;
}

const defaultCsrfConfig: CsrfConfig = {
  enabled: config.CSRF_ENABLED === 'true',
  cookieName: config.CSRF_COOKIE_NAME || '_csrf',
  headerName: config.CSRF_HEADER_NAME || 'x-csrf-token',
  tokenLength: 32,
  sameSite: 'strict',
  secure: config.NODE_ENV === 'production',
  httpOnly: true
};

/**
 * Generates a cryptographically random CSRF token
 */
function generateCsrfToken(): string {
  return crypto.randomBytes(defaultCsrfConfig.tokenLength).toString('base64url');
}

/**
 * Validates that the CSRF token from the header matches the cookie
 */
function validateCsrfToken(req: Request): boolean {
  const cookieToken = req.cookies?.[defaultCsrfConfig.cookieName];
  const headerToken = req.headers[defaultCsrfConfig.headerName] as string | undefined;

  if (!cookieToken || !headerToken) {
    return false;
  }

  // Use constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(cookieToken),
      Buffer.from(headerToken)
    );
  } catch {
    // Buffers are of different lengths
    return false;
  }
}

/**
 * CSRF middleware using Double Submit Cookie pattern.
 * 
 * How it works:
 * 1. On GET requests (or safe methods), sets a CSRF token in a cookie
 * 2. On state-changing requests (POST, PUT, PATCH, DELETE), validates that
 *    the X-CSRF-Token header matches the cookie value
 * 3. If validation fails, returns 403 Forbidden
 * 
 * This approach is stateless and works without server-side session storage.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Check if CSRF protection is enabled
  if (!defaultCsrfConfig.enabled) {
    return next();
  }

  // Skip CSRF for safe methods (GET, HEAD, OPTIONS)
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    // For GET requests, ensure the client has a CSRF token
    // This is especially important for the initial page load
    if (!req.cookies?.[defaultCsrfConfig.cookieName]) {
      const token = generateCsrfToken();
      res.cookie(defaultCsrfConfig.cookieName, token, {
        httpOnly: defaultCsrfConfig.httpOnly,
        secure: defaultCsrfConfig.secure,
        sameSite: defaultCsrfConfig.sameSite,
        maxAge: 86400000 // 24 hours
      });
    }
    return next();
  }

  // For state-changing methods, validate the CSRF token
  if (!validateCsrfToken(req)) {
    logger.warn('CSRF validation failed', {
      request_id: req.requestId,
      path: req.path,
      method: req.method
    });

    // Clear the cookie to prevent replay attacks
    res.clearCookie(defaultCsrfConfig.cookieName);

    res.status(403).json({
      error: 'CSRF validation failed',
      code: 'CSRF_INVALID',
      requestId: req.requestId
    });
    return;
  }

  // Token is valid, proceed
  next();
}

/**
 * Creates a new CSRF token and sets it in a cookie.
 * Use this for endpoints that need to issue a new token (e.g., after login).
 */
export function setCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (!defaultCsrfConfig.enabled) {
    return next();
  }

  const token = generateCsrfToken();
  res.cookie(defaultCsrfConfig.cookieName, token, {
    httpOnly: defaultCsrfConfig.httpOnly,
    secure: defaultCsrfConfig.secure,
    sameSite: defaultCsrfConfig.sameSite,
    maxAge: 86400000 // 24 hours
  });

  // Also attach to response for easy access
  res.locals = res.locals || {};
  (res.locals as { csrfToken?: string }).csrfToken = token;

  next();
}

/**
 * Gets the current CSRF configuration
 */
export function getCsrfConfig(): CsrfConfig {
  return defaultCsrfConfig;
}

/**
 * Updates CSRF configuration from environment variables
 */
export function configureCsrf(options: Partial<CsrfConfig>): void {
  Object.assign(defaultCsrfConfig, options);
}

export default csrfProtection;
