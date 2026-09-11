/**
 * Response caching middleware for the Front Desk AI Orchestrator API.
 * Provides caching for idempotent GET requests to reduce database load.
 */

import type { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

/**
 * In-memory cache store
 * Simple key-value store with TTL support
 */
interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Cache configuration
 */
export interface CacheOptions {
  /** Time to live in seconds */
  ttl?: number;
  /** Cache key prefix */
  prefix?: string;
  /** Whether to cache only successful responses */
  onlySuccess?: boolean;
  /** Maximum cache size */
  maxSize?: number;
}

const DEFAULT_TTL = 60; // 60 seconds
const DEFAULT_MAX_SIZE = 1000; // Maximum number of cache entries

/**
 * Generate cache key from request
 */
function generateCacheKey(req: Request, prefix: string = ''): string {
  // Use method, path, and query parameters for cache key
  // Don't include headers or body as they may contain sensitive data
  const keyParts = [
    req.method,
    req.path,
    req.query ? JSON.stringify(req.query) : ''
  ];
  
  // Add authentication context if available
  if ((req as any).user?.userId) {
    keyParts.push((req as any).user.userId);
  }
  
  return `${prefix}:${keyParts.join(':')}`;
}

/**
 * Check if a cache entry is expired
 */
function isExpired(entry: CacheEntry): boolean {
  return Date.now() > entry.expiresAt;
}

/**
 * Clean up expired entries periodically
 */
function cleanupExpired() {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  for (const [key, entry] of cache.entries()) {
    if (isExpired(entry)) {
      keysToDelete.push(key);
    }
  }
  
  for (const key of keysToDelete) {
    cache.delete(key);
  }
  
  // Log cleanup
  if (keysToDelete.length > 0) {
    logger.debug('Cache cleanup', { removed: keysToDelete.length, remaining: cache.size });
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpired, 5 * 60 * 1000);

// Run cleanup on startup
cleanupExpired();

/**
 * Create caching middleware
 */
export function responseCache(ttl: number = DEFAULT_TTL, options: CacheOptions = {}) {
  const effectiveTtl = options.ttl || ttl;
  const prefix = options.prefix || 'cache';
  const onlySuccess = options.onlySuccess !== false;
  const maxSize = options.maxSize || DEFAULT_MAX_SIZE;
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }
    
    // Don't cache if explicitly disabled
    if (req.headers['x-no-cache'] === 'true') {
      return next();
    }
    
    const cacheKey = generateCacheKey(req, prefix);
    
    // Check if we have a cached response
    const cached = cache.get(cacheKey);
    if (cached && !isExpired(cached)) {
      logger.debug('Cache hit', { key: cacheKey });
      
      // Return cached response
      res.set('X-Cache', 'HIT');
      return res.status(200).json(cached.data);
    }
    
    // Enforce max cache size
    if (cache.size >= maxSize) {
      // Delete oldest entry
      const oldestKey = cache.keys().next().value;
      if (oldestKey) {
        cache.delete(oldestKey);
        logger.debug('Cache eviction', { evicted: oldestKey });
      }
    }
    
    // Override res.json to cache the response
    const originalJson = res.json;
    res.json = function (data: unknown) {
      // Only cache successful responses if configured
      if (!onlySuccess || (res.statusCode >= 200 && res.statusCode < 300)) {
        cache.set(cacheKey, {
          data,
          expiresAt: Date.now() + effectiveTtl * 1000
        });
        logger.debug('Cache set', { key: cacheKey, ttl: effectiveTtl });
        res.set('X-Cache', 'MISS');
      } else {
        res.set('X-Cache', 'BYPASS');
      }
      
      originalJson.call(res, data);
    };
    
    next();
  };
}

/**
 * Clear cache for a specific key
 */
export function clearCacheKey(key: string): boolean {
  return cache.delete(key);
}

/**
 * Clear cache for a specific pattern
 */
export function clearCachePattern(pattern: RegExp): number {
  let count = 0;
  const keysToDelete: string[] = [];
  
  for (const key of cache.keys()) {
    if (pattern.test(key)) {
      keysToDelete.push(key);
    }
  }
  
  for (const key of keysToDelete) {
    cache.delete(key);
    count++;
  }
  
  return count;
}

/**
 * Clear all cache entries
 */
export function clearAllCache(): number {
  const size = cache.size;
  cache.clear();
  return size;
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  let expiredCount = 0;
  const now = Date.now();
  
  for (const entry of cache.values()) {
    if (isExpired(entry)) {
      expiredCount++;
    }
  }
  
  return {
    size: cache.size,
    expiredCount,
    activeCount: cache.size - expiredCount
  };
}

/**
 * Cache middleware that caches based on user and request
 * Useful for user-specific data
 */
export function userResponseCache(ttl: number = DEFAULT_TTL) {
  return responseCache(ttl, { prefix: 'user-cache' });
}

/**
 * Cache middleware for public data (not user-specific)
 */
export function publicResponseCache(ttl: number = DEFAULT_TTL * 5) {
  return responseCache(ttl, { 
    prefix: 'public-cache',
    onlySuccess: true,
    maxSize: DEFAULT_MAX_SIZE * 2
  });
}

/**
 * ETag-based caching for conditional requests
 */
export function etagCache() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only for GET requests
    if (req.method !== 'GET') {
      return next();
    }
    
    // Skip if no ETag header
    const etag = req.headers['if-none-match'];
    if (!etag) {
      return next();
    }
    
    // Generate ETag based on request
    const cacheKey = generateCacheKey(req, 'etag');
    const cached = cache.get(cacheKey);
    
    if (cached && !isExpired(cached) && cached.data === etag) {
      res.set('ETag', etag);
      return res.status(304).end();
    }
    
    // Store ETag for future requests
    const originalJson = res.json;
    res.json = function (data: unknown) {
      const responseEtag = generateETag(data);
      cache.set(cacheKey, {
        data: responseEtag,
        expiresAt: Date.now() + DEFAULT_TTL * 1000
      });
      res.set('ETag', responseEtag);
      originalJson.call(res, data);
    };
    
    next();
  };
}

/**
 * Generate ETag from data
 */
function generateETag(data: unknown): string {
  try {
    const str = JSON.stringify(data);
    // Simple hash function for ETag
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `"${Math.abs(hash).toString(16)}"`;
  } catch {
    return `"${Date.now().toString(16)}"`;
  }
}
