import request from 'supertest';
import express from 'express';
import { getRepository } from '../src/config/database';
import { AuditLogService } from '../src/services/auditLogService';
import { auditLogService } from '../src/services/auditLogService';
import auditLogsRouter from '../src/routes/auditLogs';

jest.mock('../src/config/database', () => ({ getRepository: jest.fn() }));
jest.mock('../src/config/auth', () => ({
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { userId: 'user-1', role: 'agent' };
    next();
  }
}));
jest.mock('../src/middleware/errorHandler', () => ({
  requestId: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
}));

describe('audit log pagination', () => {
  it('counts all matching records rather than just the returned page', async () => {
    const query = {
      leftJoinAndSelect: jest.fn(), where: jest.fn(), orderBy: jest.fn(),
      limit: jest.fn(), offset: jest.fn(), getManyAndCount: jest.fn()
    };
    for (const method of ['leftJoinAndSelect', 'where', 'orderBy', 'limit', 'offset'] as const) {
      query[method].mockReturnValue(query);
    }
    query.getManyAndCount.mockResolvedValue([[{ id: 1, property: { name: 'Hotel' } }], 23]);
    (getRepository as jest.Mock).mockReturnValue({ createQueryBuilder: () => query });

    const result = await new AuditLogService().getAll('user-1', { limit: 1, offset: 1 });
    expect(query.offset).toHaveBeenCalledWith(1);
    expect(result).toEqual({ data: [{ id: 1, property: { name: 'Hotel' }, property_name: 'Hotel' }], total: 23 });
  });

  it('returns counted pages while keeping unpaged callers on the array response', async () => {
    const page = { data: [{ id: 1 }], total: 23 };
    jest.spyOn(auditLogService, 'getAll').mockResolvedValue(page as any);
    const app = express().use('/api/audit-logs', auditLogsRouter);

    const paged = await request(app).get('/api/audit-logs?page=2&limit=1').expect(200);
    expect(paged.body).toEqual(page);
    expect(auditLogService.getAll).toHaveBeenCalledWith('user-1', { limit: 1, offset: 1 });
    const legacy = await request(app).get('/api/audit-logs').expect(200);
    expect(legacy.body).toEqual(page.data);
    const legacyOffset = await request(app).get('/api/audit-logs?offset=2').expect(200);
    expect(legacyOffset.body).toEqual(page.data);
    expect(auditLogService.getAll).toHaveBeenLastCalledWith('user-1', { limit: 100, offset: 2 });
  });

  it.each(['page=', 'page=%20%20', 'page=1&page=2', 'page[]=1', 'page[foo]=1'])(
    'rejects invalid page query %s', async (query) => {
      const getAll = jest.spyOn(auditLogService, 'getAll');
      getAll.mockClear();
      const app = express().use('/api/audit-logs', auditLogsRouter);

      const response = await request(app).get(`/api/audit-logs?${query}`).expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(getAll).not.toHaveBeenCalled();
    }
  );
});
