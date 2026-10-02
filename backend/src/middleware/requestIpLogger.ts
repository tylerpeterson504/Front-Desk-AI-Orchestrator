/**
 * Request IP logging middleware for security audit trail.
 * Logs client IP addresses for all requests to enable security monitoring.
 */

import type { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';
import { config } from '../config';

/**
 * Extracts the real client IP address from the request,
 * taking into account reverse proxies and forwarding headers.
 */
function getClientIp(req: Request): string {
  // Check for X-Forwarded-For header (common with reverse proxies)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, the first is the original client
    return forwardedFor.split(',')[0].trim();
  }

  // Check for X-Real-IP header
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp) {
    return realIp;
  }

  // Fall back to req.ip (set by Express with trust proxy)
  // req.ip is normalized to IPv4
  return req.ip || req.connection.remoteAddress || 'unknown';
}

/**
 * Request IP logging middleware.
 * Logs the client IP address for security auditing purposes.
 * Respects LOG_IP_ADDRESS configuration option.
 */
export function requestIpLogger(req: Request, res: Response, next: NextFunction): void {
  // Check if IP logging is enabled (default: enabled)
  const isEnabled = config.LOG_IP_ADDRESS !== 'false';
  
  if (!isEnabled) {
    return next();
  }

  try {
    const clientIp = getClientIp(req);
    const requestId = req.requestId || 'unknown';
    
    // Log at debug level to avoid cluttering production logs
    // Security team can filter for these
    logger.debug('Request IP logged', {
      request_id: requestId,
      client_ip: clientIp,
      path: req.path,
      method: req.method,
      user_agent: req.headers['user-agent']
    });

    // Attach IP to request for use by other middleware/route handlers
    // This is useful for audit logging
    (req as Request & { clientIp?: string }).clientIp = clientIp;

    // Add IP to response headers for client-side logging (if needed)
    // Note: This could expose IP to client, so disabled by default
    // res.set('X-Request-IP', clientIp);
  } catch (error) {
    // If IP extraction fails, log the error but don't block the request
    logger.error('Failed to log request IP', {
      request_id: req.requestId,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  next();
}

/**
 * Creates an IP-based rate limiter for sensitive endpoints.
 * Useful for preventing brute-force attacks from a single IP.
 */
export function createIpRateLimiter(maxRequests: number, windowMs: number) {
  const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();

  return function (req: Request, res: Response, next: NextFunction): void {
    const clientIp = getClientIp(req);
    const now = Date.now();

    const ipData = ipRequestCounts.get(clientIp);

    if (!ipData || now >= ipData.resetTime) {
      // First request or window expired
      ipRequestCounts.set(clientIp, { count: 1, resetTime: now + windowMs });
      return next();
    }

    // Increment count
    ipData.count++;

    if (ipData.count > maxRequests) {
      logger.warn('IP rate limit exceeded', {
        client_ip: clientIp,
        path: req.path,
        count: ipData.count
      });
      res.status(429).json({
        error: 'Too many requests from this IP address',
        code: 'IP_RATE_LIMIT_EXCEEDED',
        requestId: req.requestId
      });
      return;
    }

    next();
  };
}

export { getClientIp };
