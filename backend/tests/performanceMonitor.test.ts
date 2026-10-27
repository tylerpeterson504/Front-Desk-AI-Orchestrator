import { performanceMonitor } from '../src/middleware/performance';

jest.mock('../src/lib/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

describe('performanceMonitor', () => {
  it('finishes a streamed response whose headers were already sent', () => {
    const endSpy = jest.fn();
    const res: any = { headersSent: true, end: endSpy };
    res.set = jest.fn(() => {
      if (res.headersSent) throw new Error('Cannot set headers after they are sent to the client');
      return res;
    });
    const req: any = { method: 'GET', originalUrl: '/app.js' };

    performanceMonitor()(req, res, jest.fn());

    expect(() => res.end()).not.toThrow();
    expect(res.set).not.toHaveBeenCalled();
    expect(endSpy).toHaveBeenCalledTimes(1);
  });

  it('sets the response time header when headers are not yet sent', () => {
    const endSpy = jest.fn();
    const res: any = { headersSent: false, end: endSpy };
    res.set = jest.fn(() => res);
    const req: any = { method: 'GET', originalUrl: '/api/test' };

    performanceMonitor()(req, res, jest.fn());
    res.end();

    expect(res.set).toHaveBeenCalledWith('X-Response-Time', expect.stringMatching(/ms$/));
    expect(endSpy).toHaveBeenCalledTimes(1);
  });
});
