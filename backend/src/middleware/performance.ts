/**
 * Performance monitoring middleware.
 * Logs slow requests (> threshold) and adds Server-Timing header.
 */

import type { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

const SLOW_REQUEST_THRESHOLD_MS = 500;

export function performanceMonitor(thresholdMs: number = SLOW_REQUEST_THRESHOLD_MS) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();

    res.on("finish", () => {
      const elapsedNs = process.hrtime.bigint() - start;
      const elapsedMs = Number(elapsedNs) / 1e6;
      res.set("Server-Timing", `app;dur=${elapsedMs.toFixed(1)}`);

      if (elapsedMs > thresholdMs) {
        logger.warn("Slow request detected", {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Math.round(elapsedMs),
          requestId: (req as any).requestId,
        });
      }
    });

    next();
  };
}

/** Track database query performance. Call around queries to log slow ones. */
export function trackQueryTime<T>(
  label: string,
  thresholdMs: number,
  queryFn: () => Promise<T>
): Promise<T> {
  const start = process.hrtime.bigint();
  return queryFn().finally(() => {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (elapsedMs > thresholdMs) {
      logger.warn("Slow database query", {
        label,
        durationMs: Math.round(elapsedMs),
      });
    }
  });
}
