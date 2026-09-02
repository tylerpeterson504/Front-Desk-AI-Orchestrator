/**
 * Additional security middleware for the Front Desk AI Orchestrator API.
 * Complements helmet() with application-specific protections.
 */

import type { Request, Response, NextFunction } from 'express';

/** Strips dangerous HTML patterns from string fields in the request body. */
const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /javascript:/gi,
];

export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === "object") {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === "string") {
        let sanitized = req.body[key];
        for (const pattern of DANGEROUS_PATTERNS) {
          sanitized = sanitized.replace(pattern, '');
        }
        req.body[key] = sanitized;
      }
    }
  }
  next();
}

export function additionalSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
}
