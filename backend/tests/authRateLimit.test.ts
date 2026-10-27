import request from 'supertest';
import app from '../src/index';

const CSRF_COOKIE = '_csrf';

async function loadCsrfToken(): Promise<string | undefined> {
  const res = await request(app).get('/api/auth/registration-mode');
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((value) => value.startsWith(`${CSRF_COOKIE}=`));
  return cookie?.split(';')[0].slice(CSRF_COOKIE.length + 1);
}

describe('auth rate limits', () => {
  let csrfToken: string | undefined;

  beforeAll(async () => {
    csrfToken = await loadCsrfToken();
  });

  function post(path: string, ip: string) {
    const req = request(app).post(path).set('X-Forwarded-For', ip).send({});
    return csrfToken
      ? req.set('Cookie', `${CSRF_COOKIE}=${csrfToken}`).set('X-CSRF-Token', csrfToken)
      : req;
  }

  function get(path: string, ip: string) {
    return request(app).get(path).set('X-Forwarded-For', ip);
  }

  it('limits login attempts once the login budget is spent', async () => {
    const ip = '198.51.100.10';
    for (let attempt = 0; attempt < 20; attempt++) {
      expect((await post('/api/auth/login', ip)).status).not.toBe(429);
    }
    expect((await post('/api/auth/login', ip)).status).toBe(429);
  });

  it('counts registration attempts against the login budget', async () => {
    const ip = '198.51.100.11';
    for (let attempt = 0; attempt < 20; attempt++) {
      expect((await post('/api/auth/register', ip)).status).not.toBe(429);
    }
    expect((await post('/api/auth/register', ip)).status).toBe(429);
  });

  it('does not count logout against the login budget', async () => {
    const ip = '198.51.100.12';
    for (let attempt = 0; attempt < 25; attempt++) {
      expect((await post('/api/auth/logout', ip)).status).toBe(200);
    }
  });

  it('does not count refresh against the login budget', async () => {
    const ip = '198.51.100.13';
    for (let attempt = 0; attempt < 25; attempt++) {
      expect((await post('/api/auth/refresh', ip)).status).toBe(400);
    }
  });

  it('does not count the current-user lookup against the login budget', async () => {
    const ip = '198.51.100.14';
    for (let attempt = 0; attempt < 25; attempt++) {
      expect((await get('/api/auth/me', ip)).status).toBe(401);
    }
  });
});
