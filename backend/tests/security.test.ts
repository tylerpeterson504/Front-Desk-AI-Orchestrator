import { sanitizeInput } from '../src/middleware/security';

describe('sanitizeInput', () => {
  it('caps top-level array fields at 100 entries', () => {
    const req: any = { body: { tags: Array.from({ length: 150 }, (_, i) => `tag ${i}`) } };
    const next = jest.fn();

    sanitizeInput(req, {} as any, next);

    expect(req.body.tags).toHaveLength(100);
    expect(req.body.tags[0]).toBe('tag 0');
    expect(req.body.tags[99]).toBe('tag 99');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('leaves short top-level arrays unchanged', () => {
    const req: any = { body: { tags: ['a', 'b'] } };

    sanitizeInput(req, {} as any, jest.fn());

    expect(req.body.tags).toEqual(['a', 'b']);
  });
});
