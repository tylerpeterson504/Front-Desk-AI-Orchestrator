import express from 'express';
import request from 'supertest';
import { config } from '../src/config';
import {
  getMetrics,
  monitoringMiddleware,
  requireMetricsToken,
  resetMetrics,
} from '../src/middleware/monitoring';

describe('request metrics route keys', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('keys matched requests by route pattern instead of concrete path', async () => {
    const app = express();
    app.use(monitoringMiddleware);
    app.get('/api/items/:id', (req, res) => {
      res.json({ id: req.params.id });
    });

    await request(app).get('/api/items/1').expect(200);
    await request(app).get('/api/items/2').expect(200);

    const { routes } = getMetrics();
    expect(Object.keys(routes)).toEqual(['GET:/api/items/:id']);
    expect(routes['GET:/api/items/:id'].requestCount).toBe(2);
  });

  it('buckets requests that match no route under one key', async () => {
    const app = express();
    app.use(monitoringMiddleware);
    app.get('/api/items/:id', (req, res) => {
      res.json({ id: req.params.id });
    });

    await request(app).get('/nope/1').expect(404);
    await request(app).get('/nope/2').expect(404);
    await request(app).post('/elsewhere').send({ a: 1 }).expect(404);

    const { routes } = getMetrics();
    expect(Object.keys(routes)).toEqual(['unmatched']);
    expect(routes.unmatched.requestCount).toBe(3);
  });

  it('keys router-mounted JSON requests by their full mount path and pattern', async () => {
    const app = express();
    app.use(monitoringMiddleware);
    app.use(express.json());
    const router = express.Router();
    router.post('/:id', (req, res) => {
      res.status(201).json({ ok: true });
    });
    app.use('/api/things', router);

    await request(app).post('/api/things/5').send({ name: 'x' }).expect(201);

    expect(Object.keys(getMetrics().routes)).toEqual(['POST:/api/things/:id']);
  });

  it('caps route keys at 200 and folds overflow into the other key', async () => {
    const app = express();
    app.use(monitoringMiddleware);
    for (let i = 0; i < 250; i++) {
      app.get(`/routes/${i}`, (req, res) => {
        res.end();
      });
    }

    for (let i = 0; i < 250; i++) {
      await request(app).get(`/routes/${i}`).expect(200);
    }

    const { routes } = getMetrics();
    expect(Object.keys(routes)).toHaveLength(200);
    expect(routes.other.requestCount).toBe(51);
  }, 30000);
});

describe('metrics endpoint access', () => {
  const originalNodeEnv = config.NODE_ENV;
  const originalToken = config.METRICS_TOKEN;
  const token = 'metrics-token-for-tests-0123456789';

  afterEach(() => {
    config.NODE_ENV = originalNodeEnv;
    config.METRICS_TOKEN = originalToken;
  });

  function metricsApp() {
    const app = express();
    app.get('/metrics', requireMetricsToken, (req, res) => {
      res.type('text/plain').send('metrics_body');
    });
    return app;
  }

  it('serves metrics without a token outside production', async () => {
    config.NODE_ENV = 'development';
    config.METRICS_TOKEN = undefined;

    await request(metricsApp()).get('/metrics').expect(200);
  });

  it('accepts the configured bearer token in production', async () => {
    config.NODE_ENV = 'production';
    config.METRICS_TOKEN = token;

    await request(metricsApp())
      .get('/metrics')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('rejects requests without the bearer token in production', async () => {
    config.NODE_ENV = 'production';
    config.METRICS_TOKEN = token;

    await request(metricsApp()).get('/metrics').expect(401);
    await request(metricsApp()).get('/metrics').set('Authorization', 'Bearer wrong-token').expect(401);
    await request(metricsApp()).get('/metrics').set('Authorization', token).expect(401);
  });

  it('responds 404 in production when no metrics token is configured', async () => {
    config.NODE_ENV = 'production';
    config.METRICS_TOKEN = undefined;

    await request(metricsApp()).get('/metrics').set('Authorization', `Bearer ${token}`).expect(404);
  });
});
