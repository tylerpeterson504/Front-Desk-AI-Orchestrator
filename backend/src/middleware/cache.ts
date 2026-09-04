/**
 * Simple in-memory response cache for idempotent GET endpoints.
 * Uses a Map keyed by method:url:userId with per-entry TTL.
 * Designed for single-instance backend, read-heavy reference data.
 */

import type { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  body: unknown;
  statusCode: number;
  cachedAt: number;
  expiresAt: number;
}

const DEFAULT_TTL_SECONDS = 60;
const MAX_ENTRIES = 500;
const store = new Map<string, CacheEntry>();

function cacheKey(req: Request): string | null {
  if (req.method !== 'GET') return null;
  if (req.path.startsWith('/api/auth')) return null;
  if (req.path.startsWith('/health')) return null;
  if (req.get('Cache-Control') === 'no-cache') return null;
  const userId = (req as any).user?.userId || 'anonymous';
  return `${req.method}:${req.originalUrl}:${userId}`;
}

function evictExpired(): void {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
  if (store.size > MAX_ENTRIES) {
    const sorted = [...store.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    for (const [key] of sorted.slice(0, store.size - MAX_ENTRIES)) {
      store.delete(key);
    }
  }
}

export function responseCache(ttlSeconds: number = DEFAULT_TTL_SECONDS) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = cacheKey(req);
    if (!key) return next();

    const entry = store.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      res.set('X-Cache', 'HIT');
      res.set('X-Cache-Age', `${Math.floor((Date.now() - entry.cachedAt) / 1000)}s`);
      res.status(entry.statusCode).json(entry.body);
      return;
    }

    res.set('X-Cache', 'MISS');
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown): Response {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        store.set(key, {
          body,
          statusCode: res.statusCode,
          cachedAt: Date.now(),
          expiresAt: Date.now() + ttlSeconds * 1000,
        });
        evictExpired();
      }
      return originalJson(body);
    };
    next();
  };
}

export function clearCache(): void {
  store.clear();
}
export function getCacheSize(): number {
  return store.size;
}
