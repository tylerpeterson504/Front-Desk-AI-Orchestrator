/**
 * Response compression middleware for Front Desk AI Orchestrator.
 * Uses gzip and brotli compression to reduce response sizes.
 */

import compression from 'compression';
import type { Request, Response, NextFunction } from 'express';

/**
 * Compression options configuration
 */
const compressionOptions = {
  // Enable gzip compression
  level: 6, // Compression level (0-9, 6 is a good balance)
  threshold: 1024, // Only compress responses larger than 1KB
  filter: (req: Request, res: Response) => {
    // Don't compress if response already has Content-Encoding
    if (res.getHeader('Content-Encoding')) {
      return false;
    }
    // Compress all JSON responses
    if (res.getHeader('Content-Type')?.toString().includes('application/json')) {
      return true;
    }
    // Compress text responses
    const contentType = res.getHeader('Content-Type')?.toString() || '';
    return contentType.includes('text/');
  }
};

/**
 * Middleware that compresses responses using gzip or brotli
 * Based on Accept-Encoding header from client
 */
export const compressionMiddleware = compression(compressionOptions);

/**
 * Alternative: Brotli compression (if client supports it)
 * Note: Requires brotli package to be installed
 */
export function createBrotliCompression() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const shrinkRay = require('shrink-ray-current');
    return shrinkRay({
      filter: compressionOptions.filter,
      brotli: {
        quality: 11,
        threshold: compressionOptions.threshold
      }
    });
  } catch {
    // Fall back to gzip if brotli not available
    return compressionMiddleware;
  }
}

export default compressionMiddleware;
