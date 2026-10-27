import { errorHandler } from '../src/middleware/errorHandler';
import { NotFoundError } from '../src/lib/errors';

jest.mock('../src/lib/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

function mockResponse() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.set = jest.fn(() => res);
  return res;
}

const req: any = { requestId: 'req-1', path: '/api/test', method: 'GET' };

describe('errorHandler', () => {
  it.each([
    ['an application error', new NotFoundError('Escalation', 1), 404],
    ['an invalid token', Object.assign(new Error('jwt malformed'), { name: 'JsonWebTokenError' }), 401],
    ['an expired token', Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }), 401],
    ['a validation error', Object.assign(new Error('bad input'), { name: 'ValidationError', details: [] }), 400],
    ['an unexpected error', new Error('boom'), 500],
  ])('sends a single response for %s', (_label, err, status) => {
    const res = mockResponse();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledTimes(1);
  });
});
