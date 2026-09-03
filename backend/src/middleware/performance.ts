/**
 * Performance monitoring middleware for the Front Desk AI Orchestrator API.
 * Tracks request timing, slow endpoints, and performance metrics.
 */

import type { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

/**
 * Threshold in milliseconds for logging slow requests
 */
const SLOW_REQUEST_THRESHOLD = 1000; // 1 second

/**
 * Threshold in milliseconds for logging very slow requests (warning)
 */
const VERY_SLOW_REQUEST_THRESHOLD = 5000; // 5 seconds

/**
 * Maximum response time to track (to avoid memory issues)
 */
const MAX_RESPONSE_TIME = 30000; // 30 seconds

/**
 * Track request start time
 */
export function performanceMonitor() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    const startDate = new Date();
    
    // Store start time on request for use in later middleware
    (req as any)._startTime = start;
    (req as any)._startDate = startDate;
    
    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function (...args: Parameters<Response['end']>) {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      
      // Calculate response time in milliseconds
      const responseTime = Math.min(durationMs, MAX_RESPONSE_TIME);
      
      // Add response time header
      res.set('X-Response-Time', `${responseTime.toFixed(2)}ms`);
      
      // Log slow requests
      if (responseTime >= VERY_SLOW_REQUEST_THRESHOLD) {
        logger.warn('Very slow request', {
          method: req.method,
          path: req.originalUrl,
          durationMs: responseTime.toFixed(2),
          userId: (req as any).user?.userId,
          requestId: req.requestId
        });
      } else if (responseTime >= SLOW_REQUEST_THRESHOLD) {
        logger.info('Slow request', {
          method: req.method,
          path: req.originalUrl,
          durationMs: responseTime.toFixed(2),
          userId: (req as any).user?.userId,
          requestId: req.requestId
        });
      }
      
      // Log performance metrics for monitoring
      logger.debug('Request completed', {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: responseTime.toFixed(2),
        userId: (req as any).user?.userId,
        requestId: req.requestId
      });
      
      // Call original end
      originalEnd.apply(res, args);
    };
    
    next();
  };
}

/**
 * Track memory usage for requests
 * Note: Only works in Node.js environments with process.memoryUsage()
 */
export function memoryMonitor(req: Request, res: Response, next: NextFunction) {
  const startMemory = process.memoryUsage();
  
  const originalEnd = res.end;
  res.end = function (...args: Parameters<Response['end']>) {
    const endMemory = process.memoryUsage();
    
    // Calculate memory delta
    const heapDelta = endMemory.heapUsed - startMemory.heapUsed;
    const heapDeltaMb = heapDelta / 1024 / 1024;
    
    // Log memory usage for large deltas
    if (heapDeltaMb > 10) { // More than 10MB
      logger.warn('High memory usage', {
        method: req.method,
        path: req.originalUrl,
        heapDeltaMb: heapDeltaMb.toFixed(2),
        heapUsedMb: (endMemory.heapUsed / 1024 / 1024).toFixed(2),
        requestId: req.requestId
      });
    }
    
    // Add memory usage header (approximate)
    res.set('X-Memory-Usage', `${Math.round(endMemory.heapUsed / 1024 / 1024)}MB`);
    
    originalEnd.apply(res, args);
  };
  
  next();
}

/**
 * Track request counts and rates per endpoint
 * Simple in-memory tracking for development/monitoring
 */
const requestStats = new Map<string, {
  count: number;
  totalTime: number;
  minTime: number;
  maxTime: number;
  lastRequest: Date;
}>();

/**
 * Get request statistics for monitoring
 */
export function getRequestStats() {
  const stats: Record<string, {
    count: number;
    avgTime: number;
    minTime: number;
    maxTime: number;
    requestsPerMinute: number;
  }> = {};
  
  const now = Date.now();
  const ONE_MINUTE = 60 * 1000;
  
  for (const [key, value] of requestStats.entries()) {
    const timeSinceLast = now - value.lastRequest.getTime();
    const rpm = timeSinceLast < ONE_MINUTE ? 1 : 0;
    
    stats[key] = {
      count: value.count,
      avgTime: value.count > 0 ? value.totalTime / value.count : 0,
      minTime: value.minTime,
      maxTime: value.maxTime,
      requestsPerMinute: rpm
    };
  }
  
  return stats;
}

/**
 * Reset request statistics (useful for testing)
 */
export function resetRequestStats() {
  requestStats.clear();
}

/**
 * Enhanced performance monitoring with endpoint-specific tracking
 */
export function enhancedPerformanceMonitor() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    const endpointKey = `${req.method}:${req.path}`;
    
    const originalEnd = res.end;
    res.end = function (...args: Parameters<Response['end']>) {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      
      // Update endpoint statistics
      if (!requestStats.has(endpointKey)) {
        requestStats.set(endpointKey, {
          count: 0,
          totalTime: 0,
          minTime: durationMs,
          maxTime: durationMs,
          lastRequest: new Date()
        });
      }
      
      const stats = requestStats.get(endpointKey)!;
      stats.count++;
      stats.totalTime += durationMs;
      stats.minTime = Math.min(stats.minTime, durationMs);
      stats.maxTime = Math.max(stats.maxTime, durationMs);
      stats.lastRequest = new Date();
      
      // Add performance headers
      res.set('X-Response-Time', `${durationMs.toFixed(2)}ms`);
      
      // Log slow endpoints
      if (durationMs >= SLOW_REQUEST_THRESHOLD) {
        logger.warn('Slow endpoint detected', {
          endpoint: endpointKey,
          durationMs: durationMs.toFixed(2),
          count: stats.count,
          avgTime: (stats.totalTime / stats.count).toFixed(2),
          requestId: req.requestId
        });
      }
      
      originalEnd.apply(res, args);
    };
    
    next();
  };
}

/**
 * Middleware to track concurrent request counts
 * Useful for detecting potential DoS attacks or resource exhaustion
 */
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 1000;

export function trackConcurrentRequests(req: Request, res: Response, next: NextFunction) {
  activeRequests++;
  
  // Log if approaching limit
  if (activeRequests % 100 === 0) {
    logger.info('Active requests', { count: activeRequests });
  }
  
  // Check if we're approaching the limit
  if (activeRequests > MAX_CONCURRENT_REQUESTS * 0.8) {
    logger.warn('High concurrent request count', { count: activeRequests });
  }
  
  // Reject if we exceed the limit
  if (activeRequests > MAX_CONCURRENT_REQUESTS) {
    activeRequests--;
    return res.status(503).json({
      error: 'Service temporarily unavailable - too many concurrent requests',
      request_id: req.requestId
    });
  }
  
  // Decrement counter when response finishes
  const originalEnd = res.end;
  res.end = function (...args: Parameters<Response['end']>) {
    activeRequests--;
    originalEnd.apply(res, args);
  };
  
  next();
}

/**
 * Get current active request count (for monitoring)
 */
export function getActiveRequestCount() {
  return activeRequests;
}
