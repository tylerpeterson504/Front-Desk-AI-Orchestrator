// @ts-nocheck
import express, { Request, Response } from 'express';
import { responseCache, clearCache, getCacheSize } from '../src/middleware/cache';
import request from 'supertest';

describe('Response Cache Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    clearCache();
    app = express();
    app.use(responseCache(1)); // 1 second TTL for fast tests

    let callCount = 0;
    app.get('/api/data', (req: Request, res: Response) => {
      callCount++;
      res.json({ count: callCount, data: 'test' });
    });

    app.get('/api/auth/login', (req: Request, res: Response) => {
      res.json({ token: 'should-not-cache' });
    });

    app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });
  });

  it('caches GET responses and serves from cache on second request', async () => {
    const res1 = await request(app).get('/api/data');
    expect(res1.status).toBe(200);
    expect(res1.headers['x-cache']).toBe('MISS');
    expect(res1.body.count).toBe(1);

    const res2 = await request(app).get('/api/data');
    expect(res2.status).toBe(200);
    expect(res2.headers['x-cache']).toBe('HIT');
    expect(res2.body.count).toBe(1); // Same count - served from cache
  });

  it('does not cache auth endpoints', async () => {
    const res1 = await request(app).get('/api/auth/login');
    expect(res1.headers['x-cache']).toBeUndefined();
  });

  it('does not cache health checks', async () => {
    const res1 = await request(app).get('/health');
    expect(res1.headers['x-cache']).toBeUndefined();
  });

  it('expires cached entries after TTL', async () => {
    await request(app).get('/api/data');

    // Wait for TTL to expire (1s + buffer)
    await new Promise(resolve => setTimeout(resolve, 1200));

    const res2 = await request(app).get('/api/data');
    expect(res2.headers['x-cache']).toBe('MISS');
    expect(res2.body.count).toBe(2); // Fresh response
  });

  it('respects no-cache header', async () => {
    await request(app).get('/api/data');

    const res2 = await request(app).get('/api/data').set('Cache-Control', 'no-cache');
    expect(res2.headers['x-cache']).toBeUndefined();
    expect(res2.body.count).toBe(2);
  });

  it('tracks cache size', async () => {
    expect(getCacheSize()).toBe(0);
    await request(app).get('/api/data');
    expect(getCacheSize()).toBe(1);
  });
});
