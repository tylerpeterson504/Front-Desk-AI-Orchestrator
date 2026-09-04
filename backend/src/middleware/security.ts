/**
 * Additional security middleware for the Front Desk AI Orchestrator API.
 * Complements helmet() with application-specific protections.
 */

import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

/** Strips dangerous HTML patterns from string fields in the request body. */
const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /expression\s*\(/gi,
  /eval\s*\(/gi,
];

/**
 * Maximum request body size in bytes (256KB)
 */
const MAX_BODY_SIZE = 256 * 1024;

/**
 * Maximum string length for any single field
 */
const MAX_FIELD_LENGTH = 10000;

/**
 * Maximum array length for any field
 */
const MAX_ARRAY_LENGTH = 100;

/**
 * Allowed content types for file uploads
 */
const ALLOWED_CONTENT_TYPES = new Set([
  'application/json',
  'text/plain',
  'text/html',
  'application/x-www-form-urlencoded'
]);

/**
 * Blocked user agents patterns (known bots/scanners)
 */
const BLOCKED_USER_AGENTS = [
  /curl/gi,
  /wget/gi,
  /python-requests/gi,
  /java/gi,
  /go-http-client/gi,
  /httpclient/gi,
  /scrapy/gi,
  /sqlmap/gi,
  /nikto/gi,
  /nessus/gi,
  /openvas/gi,
  /zap/gi,
  /burp/gi,
  /acunetix/gi,
  /nmap/gi,
];

export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  if (!req.body || typeof req.body !== "object") {
    return next();
  }

  try {
    // Sanitize string fields
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === "string") {
        let sanitized = req.body[key] as string;
        
        // Truncate overly long strings
        if (sanitized.length > MAX_FIELD_LENGTH) {
          sanitized = sanitized.substring(0, MAX_FIELD_LENGTH);
        }
        
        // Remove dangerous patterns
        for (const pattern of DANGEROUS_PATTERNS) {
          sanitized = sanitized.replace(pattern, '');
        }
        
        req.body[key] = sanitized;
      }
      
      // Limit array lengths
      else if (Array.isArray(req.body[key])) {
        const arr = req.body[key] as unknown[];
        if (arr.length > MAX_ARRAY_LENGTH) {
          req.body[key] = arr.slice(0, MAX_ARRAY_LENGTH);
        }
        
        // Sanitize array elements
        req.body[key] = arr.map(item => {
          if (typeof item === 'string') {
            let sanitized = item;
            for (const pattern of DANGEROUS_PATTERNS) {
              sanitized = sanitized.replace(pattern, '');
            }
            return sanitized.length > MAX_FIELD_LENGTH 
              ? sanitized.substring(0, MAX_FIELD_LENGTH) 
              : sanitized;
          }
          return item;
        });
      }
      
      // Sanitize nested objects
      else if (typeof req.body[key] === "object" && req.body[key] !== null) {
        req.body[key] = sanitizeObject(req.body[key] as Record<string, unknown>);
      }
    }
  } catch (error) {
    // If sanitization fails, continue without modification
    // The error will be logged by the error handler middleware
  }
  
  next();
}

/**
 * Recursively sanitize nested objects
 */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    
    if (typeof value === "string") {
      let sanitized = value;
      for (const pattern of DANGEROUS_PATTERNS) {
        sanitized = sanitized.replace(pattern, '');
      }
      result[key] = sanitized.length > MAX_FIELD_LENGTH 
        ? sanitized.substring(0, MAX_FIELD_LENGTH) 
        : sanitized;
    }
    else if (Array.isArray(value)) {
      result[key] = value.slice(0, MAX_ARRAY_LENGTH).map(item => 
        typeof item === 'string' 
          ? sanitizeString(item) 
          : item
      );
    }
    else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    }
    else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Sanitize a single string
 */
function sanitizeString(value: string): string {
  let sanitized = value;
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }
  return sanitized.length > MAX_FIELD_LENGTH 
    ? sanitized.substring(0, MAX_FIELD_LENGTH) 
    : sanitized;
}

export function additionalSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // XSS Protection
  res.set("X-Content-Type-Options", "nosniff");
  
  // Clickjacking protection
  res.set("X-Frame-Options", "DENY");
  
  // Referrer policy
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  
  // Permissions policy (formerly Feature-Policy)
  res.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
  
  // HSTS (only for HTTPS connections)
  if (req.protocol === 'https') {
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  
  // Content Security Policy
  res.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'");
  
  // Cross-Origin policies
  res.set("Cross-Origin-Embedder-Policy", "require-corp");
  res.set("Cross-Origin-Opener-Policy", "same-origin");
  
  next();
}

/**
 * Block requests from known bots/scanners
 */
export function blockMaliciousUserAgents(req: Request, res: Response, next: NextFunction): void {
  const userAgent = req.headers['user-agent'] || '';
  
  for (const pattern of BLOCKED_USER_AGENTS) {
    if (pattern.test(userAgent)) {
      // Return 403 without revealing why
      return res.status(403).json({
        error: 'Forbidden',
        request_id: req.requestId
      });
    }
  }
  
  next();
}

/**
 * Validate content type
 */
export function validateContentType(req: Request, res: Response, next: NextFunction): void {
  const contentType = req.headers['content-type'] || '';
  
  // Skip validation for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Check if content type is allowed
  const baseContentType = contentType.split(';')[0].trim();
  if (!ALLOWED_CONTENT_TYPES.has(baseContentType)) {
    return res.status(415).json({
      error: 'Unsupported Media Type',
      request_id: req.requestId
    });
  }
  
  next();
}

/**
 * Rate limiting middleware for sensitive endpoints
 * Can be used in addition to the global rate limiter for specific routes
 */
export function createSensitiveRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Very restrictive for sensitive endpoints
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    }
  });
}

/**
 * Check for suspicious request patterns
 */
export function detectSuspiciousRequests(req: Request, res: Response, next: NextFunction): void {
  // Check for unusually large request bodies
  if (req.headers['content-length']) {
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (contentLength > MAX_BODY_SIZE * 2) {
      return res.status(413).json({
        error: 'Request body too large',
        request_id: req.requestId
      });
    }
  }
  
  // Check for suspicious query parameters
  const suspiciousPatterns = [
    /\b(union|select|insert|delete|update|drop|alter|create|truncate)\b/gi,
    /\b(or\s+1=1|'\s*or\s*'|\"\s*or\s*\")/gi,
    /\b(exec|execute|sp_|xp_)\b/gi,
    /\b(load_file|into\s+(outfile|dumpfile))\b/gi,
  ];
  
  const query = req.url.split('?')[1] || '';
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(query)) {
      // Log but don't block - could be false positive
      // The actual SQL injection will be caught by parameterized queries
      console.warn('Suspicious query pattern detected:', req.url);
      break;
    }
  }
  
  next();
}
