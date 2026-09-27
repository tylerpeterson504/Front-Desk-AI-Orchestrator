// @ts-nocheck
import express, { NextFunction, Request, Response } from 'express';
import { responseCache, clearAllCache, getCacheStats } from '../src/middleware/cache';
import request from 'supertest';

describe('Response Cache Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    clearAllCache();
    app = express();
    app.use(responseCache(1)); // 1 second TTL for fast tests

    let callCount = 0;
    app.get('/data', (req: Request, res: Response) => {
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
    const res1 = await request(app).get('/data');
    expect(res1.status).toBe(200);
    expect(res1.headers['x-cache']).toBe('MISS');
    expect(res1.body.count).toBe(1);

    const res2 = await request(app).get('/data');
    expect(res2.status).toBe(200);
    expect(res2.headers['x-cache']).toBe('HIT');
    expect(res2.body.count).toBe(1); // Same count - served from cache
  });

  it('keeps protected API cache hits authenticated and isolated per user', async () => {
    app.get(
      '/api/private-data',
      (req: Request, res: Response, next: NextFunction) => {
        const authorization = req.header('Authorization');
        const userId = authorization?.startsWith('Bearer ')
          ? authorization.slice(7)
          : undefined;

        if (!userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        req.auth = { userId, email: `${userId}@example.com`, role: 'agent' };
        next();
      },
      responseCache(1),
      (req: Request, res: Response) => res.json({ userId: req.auth!.userId })
    );

    const userAFirst = await request(app)
      .get('/api/private-data')
      .set('Authorization', 'Bearer user-a');
    expect(userAFirst.status).toBe(200);
    expect(userAFirst.headers['x-cache']).toBe('MISS');
    expect(userAFirst.body).toEqual({ userId: 'user-a' });

    const userB = await request(app)
      .get('/api/private-data')
      .set('Authorization', 'Bearer user-b');
    expect(userB.status).toBe(200);
    expect(userB.headers['x-cache']).toBe('MISS');
    expect(userB.body).toEqual({ userId: 'user-b' });

    const unauthenticated = await request(app).get('/api/private-data');
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers['x-cache']).toBeUndefined();
    expect(unauthenticated.body).toEqual({ error: 'Authentication required' });

    const userAAgain = await request(app)
      .get('/api/private-data')
      .set('Authorization', 'Bearer user-a');
    expect(userAAgain.status).toBe(200);
    expect(userAAgain.headers['x-cache']).toBe('HIT');
    expect(userAAgain.body).toEqual({ userId: 'user-a' });
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
    await request(app).get('/data');

    // Wait for TTL to expire (1s + buffer)
    await new Promise(resolve => setTimeout(resolve, 1200));

    const res2 = await request(app).get('/data');
    expect(res2.headers['x-cache']).toBe('MISS');
    expect(res2.body.count).toBe(2); // Fresh response
  });

  it('respects no-cache header', async () => {
    await request(app).get('/data');

    const res2 = await request(app).get('/data').set('Cache-Control', 'no-cache');
    expect(res2.headers['x-cache']).toBeUndefined();
    expect(res2.body.count).toBe(2);
  });

  it('does not cache unauthenticated API responses before route auth runs', async () => {
    let callCount = 0;
    app.get('/api/unprotected-test', (_req: Request, res: Response) => {
      callCount++;
      res.json({ count: callCount });
    });

    const res1 = await request(app).get('/api/unprotected-test');
    const res2 = await request(app).get('/api/unprotected-test');

    expect(res1.headers['x-cache']).toBeUndefined();
    expect(res2.headers['x-cache']).toBeUndefined();
    expect(res1.body.count).toBe(1);
    expect(res2.body.count).toBe(2);
  });

  it('tracks cache size', async () => {
    expect(getCacheStats().size).toBe(0);
    await request(app).get('/data');
    expect(getCacheStats().size).toBe(1);
  });
});
