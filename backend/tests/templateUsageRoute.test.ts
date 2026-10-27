import express from 'express';
import request from 'supertest';
import templatesRouter from '../src/routes/templates';

const mockIncrementUsageCount = jest.fn();

jest.mock('../src/services/templateService', () => ({
  templateService: {
    incrementUsageCount: (...args: unknown[]) => mockIncrementUsageCount(...args),
  },
}));

jest.mock('../src/services/authService', () => ({
  authService: {
    getCurrentUser: (token: string) => {
      if (token === 'agent-token') {
        return { userId: 'u-agent', email: 'agent@example.com', role: 'agent' };
      }
      throw new Error('invalid token');
    },
  },
}));

const app = express();
app.use(express.json());
app.use('/api/templates', templatesRouter);

describe('POST /api/templates/:id/increment-usage', () => {
  beforeEach(() => {
    mockIncrementUsageCount.mockReset();
  });

  it('passes the caller id to the service along with the template id', async () => {
    mockIncrementUsageCount.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/templates/7/increment-usage')
      .set('Authorization', 'Bearer agent-token');

    expect(res.status).toBe(204);
    expect(mockIncrementUsageCount).toHaveBeenCalledWith(7, 'u-agent');
  });
});
