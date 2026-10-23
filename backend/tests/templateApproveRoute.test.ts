import express from 'express';
import request from 'supertest';
import templatesRouter from '../src/routes/templates';

const mockApproveTemplate = jest.fn();

jest.mock('../src/services/templateService', () => ({
  templateService: {
    approveTemplate: (...args: unknown[]) => mockApproveTemplate(...args),
  },
}));

jest.mock('../src/services/authService', () => ({
  authService: {
    getCurrentUser: (token: string) => {
      if (token === 'admin-token') {
        return { userId: 'u-admin', email: 'admin@example.com', role: 'admin' };
      }
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

describe('POST /api/templates/:id/approve', () => {
  beforeEach(() => {
    mockApproveTemplate.mockReset();
  });

  it('returns 403 to a non-admin without calling the service', async () => {
    const res = await request(app)
      .post('/api/templates/7/approve')
      .set('Authorization', 'Bearer agent-token')
      .send({ action: 'approve' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTHORIZATION_ERROR');
    expect(mockApproveTemplate).not.toHaveBeenCalled();
  });

  it('passes an admin caller through to the service', async () => {
    mockApproveTemplate.mockResolvedValue({ id: 7, status: 'approved' });

    const res = await request(app)
      .post('/api/templates/7/approve')
      .set('Authorization', 'Bearer admin-token')
      .send({ action: 'approve' });

    expect(res.status).toBe(200);
    expect(mockApproveTemplate).toHaveBeenCalledWith(7, 'approve', 'u-admin', true, undefined);
  });
});
