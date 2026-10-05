/**
 * Monitoring and Observability Middleware
 * Provides request tracing, structured logging, and Prometheus metrics
 */

import type { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

/**
 * Request metrics for Prometheus
 */
interface RequestMetrics {
  requestCount: number;
  requestErrors: number;
  requestDurationSum: number;
  requestDurationCount: number;
  bytesSent: number;
  bytesReceived: number;
}

/**
 * Per-route metrics
 */
const routeMetrics = new Map<string, RequestMetrics>();

/**
 * Global metrics
 */
const globalMetrics: RequestMetrics = {
  requestCount: 0,
  requestErrors: 0,
  requestDurationSum: 0,
  requestDurationCount: 0,
  bytesSent: 0,
  bytesReceived: 0
};

/**
 * Get or create metrics for a route
 */
function getRouteMetrics(routeKey: string): RequestMetrics {
  if (!routeMetrics.has(routeKey)) {
    routeMetrics.set(routeKey, {
      requestCount: 0,
      requestErrors: 0,
      requestDurationSum: 0,
      requestDurationCount: 0,
      bytesSent: 0,
      bytesReceived: 0
    });
  }
  return routeMetrics.get(routeKey)!;
}

/**
 * Get route key from request
 */
function getRouteKey(req: Request): string {
  // Group by HTTP method and path (without query parameters)
  return `${req.method}:${req.path}`;
}

/**
 * Request monitoring middleware
 * Tracks request counts, durations, errors, and sizes
 */
export function monitoringMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const routeKey = getRouteKey(req);
  const routeMetrics = getRouteMetrics(routeKey);

  // Track request start
  req.on('end', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    // Update global metrics
    globalMetrics.requestCount++;
    globalMetrics.requestDurationSum += duration;
    globalMetrics.requestDurationCount++;

    // Update route metrics
    routeMetrics.requestCount++;
    routeMetrics.requestDurationSum += duration;
    routeMetrics.requestDurationCount++;

    if (statusCode >= 400) {
      globalMetrics.requestErrors++;
      routeMetrics.requestErrors++;
    }

    // Track response size (approximate)
    if (res.getHeader('Content-Length')) {
      const contentLength = parseInt(res.getHeader('Content-Length') as string, 10);
      if (!isNaN(contentLength)) {
        globalMetrics.bytesSent += contentLength;
        routeMetrics.bytesSent += contentLength;
      }
    }

    // Structured logging
    const logData = {
      request_id: req.requestId,
      method: req.method,
      path: req.path,
      status: statusCode,
      duration_ms: duration,
      user_id: (req as Request & { auth?: { userId?: string } }).auth?.userId,
      client_ip: (req as Request & { clientIp?: string }).clientIp
    };

    // Log based on status code
    if (statusCode >= 500) {
      logger.error('Request error', logData);
    } else if (statusCode >= 400) {
      logger.warn('Request warning', logData);
    } else if (config.LOG_LEVEL === 'debug') {
      logger.debug('Request completed', logData);
    }
  });

  next();
}

/**
 * Get monitoring metrics
 */
export function getMetrics(): {
  global: RequestMetrics & { avgDuration: number };
  routes: Record<string, RequestMetrics & { avgDuration: number }>;
} {
  const result: ReturnType<typeof getMetrics> = {
    global: {
      ...globalMetrics,
      avgDuration: globalMetrics.requestDurationCount > 0
        ? globalMetrics.requestDurationSum / globalMetrics.requestDurationCount
        : 0
    },
    routes: {}
  };

  for (const [routeKey, metrics] of routeMetrics.entries()) {
    result.routes[routeKey] = {
      ...metrics,
      avgDuration: metrics.requestDurationCount > 0
        ? metrics.requestDurationSum / metrics.requestDurationCount
        : 0
    };
  }

  return result;
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics(): void {
  globalMetrics.requestCount = 0;
  globalMetrics.requestErrors = 0;
  globalMetrics.requestDurationSum = 0;
  globalMetrics.requestDurationCount = 0;
  globalMetrics.bytesSent = 0;
  globalMetrics.bytesReceived = 0;
  routeMetrics.clear();
}

/**
 * Prometheus metrics endpoint handler
 */
export function prometheusMetricsHandler(req: Request, res: Response): void {
  const metrics = getMetrics();
  
  const prometheusOutput = `# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total ${metrics.global.requestCount}

# HELP http_request_errors_total Total number of HTTP request errors
# TYPE http_request_errors_total counter
http_request_errors_total ${metrics.global.requestErrors}

# HELP http_request_duration_seconds Total request duration in seconds
# TYPE http_request_duration_seconds summary
http_request_duration_seconds_sum ${metrics.global.requestDurationSum / 1000}
http_request_duration_seconds_count ${metrics.global.requestDurationCount}

# HELP http_request_duration_seconds_avg Average request duration in seconds
# TYPE http_request_duration_seconds_avg gauge
http_request_duration_seconds_avg ${metrics.global.avgDuration / 1000}

# HELP http_bytes_sent_total Total bytes sent in responses
# TYPE http_bytes_sent_total counter
http_bytes_sent_total ${metrics.global.bytesSent}

# HELP http_requests_by_route_total Total requests by route
# TYPE http_requests_by_route_total counter
${Array.from(routeMetrics.entries()).map(([routeKey, routeMetric]) =>
  `http_requests_by_route_total{route="${routeKey}"} ${routeMetric.requestCount}`
).join('\n')}

# HELP http_errors_by_route_total Total errors by route
# TYPE http_errors_by_route_total counter
${Array.from(routeMetrics.entries()).map(([routeKey, routeMetric]) =>
  `http_errors_by_route_total{route="${routeKey}"} ${routeMetric.requestErrors}`
).join('\n')}

# HELP http_duration_by_route_seconds_avg Average duration by route in seconds
# TYPE http_duration_by_route_seconds_avg gauge
${Array.from(routeMetrics.entries()).map(([routeKey, routeMetric]) =>
  `http_duration_by_route_seconds_avg{route="${routeKey}"} ${routeMetric.requestDurationSum / Math.max(routeMetric.requestDurationCount, 1) / 1000}`
).join('\n')}`;

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(prometheusOutput);
}

/**
 * Request tracing middleware
 * Adds correlation ID and tracing headers
 */
export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Generate correlation ID if not present
  let correlationId = req.headers['x-correlation-id'] as string || 
                    req.headers['x-request-id'] as string ||
                    req.requestId;
  
  // Ensure we have a correlation ID
  if (!correlationId) {
    correlationId = uuidv4();
  }
  
  // Set correlation ID on response
  res.set('X-Correlation-ID', correlationId);
  res.set('X-Request-ID', req.requestId);

  // Store correlation ID on request for logging
  (req as Request & { correlationId?: string }).correlationId = correlationId;

  next();
}

/**
 * Structured logging middleware
 * Ensures all logs have consistent structure
 */
export function structuredLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Store original logger methods
  const originalInfo = logger.info;
  const originalError = logger.error;
  const originalWarn = logger.warn;
  const originalDebug = logger.debug;
  
  // Context to add to all logs
  const context = {
    request_id: req.requestId,
    correlation_id: (req as Request & { correlationId?: string }).correlationId,
    session_id: req.headers['x-session-id']
  };
  
  // Override logger methods temporarily to include context
  type ContextualLogMethod = (message: string, meta?: Record<string, unknown>) => void;
  logger.info = function (message: string, meta: Record<string, unknown> = {}) {
    (originalInfo as unknown as ContextualLogMethod)(message, { ...context, ...meta });
  } as unknown as typeof logger.info;
  logger.error = function (message: string, meta: Record<string, unknown> = {}) {
    (originalError as unknown as ContextualLogMethod)(message, { ...context, ...meta });
  } as unknown as typeof logger.error;
  logger.warn = function (message: string, meta: Record<string, unknown> = {}) {
    (originalWarn as unknown as ContextualLogMethod)(message, { ...context, ...meta });
  } as unknown as typeof logger.warn;
  logger.debug = function (message: string, meta: Record<string, unknown> = {}) {
    (originalDebug as unknown as ContextualLogMethod)(message, { ...context, ...meta });
  } as unknown as typeof logger.debug;

  // Restore on response finish
  res.on('finish', () => {
    logger.info = originalInfo;
    logger.error = originalError;
    logger.warn = originalWarn;
    logger.debug = originalDebug;
  });

  next();
}

export default monitoringMiddleware;
