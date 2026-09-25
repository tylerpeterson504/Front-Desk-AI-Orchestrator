import { analyticsService } from '../src/services/analyticsService';
import { AuthorizationError, ValidationError } from '../src/lib/errors';

jest.mock('../src/config/database', () => {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn()
  };
  const eventRepo: any = {
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => qb)
  };
  const propRepo: any = { find: jest.fn(), findOne: jest.fn() };
  return {
    getRepository: jest.fn((entity: any) =>
      entity?.name === 'Property' ? propRepo : eventRepo
    ),
    __mocks: { eventRepo, propRepo, qb }
  };
});

const { eventRepo, propRepo, qb } = jest.requireMock('../src/config/database').__mocks;

beforeEach(() => {
  jest.clearAllMocks();
});

const validEvent = {
  property_id: 1,
  conversation_hash: 'c1',
  first_seen_at: '2026-09-25T10:00:00Z',
  replied_at: '2026-09-25T10:02:00Z'
};

describe('AnalyticsService.record', () => {
  it('rejects an empty batch', async () => {
    await expect(analyticsService.record([], 'u1')).rejects.toThrow(ValidationError);
  });

  it('rejects events for a property owned by someone else', async () => {
    propRepo.find.mockResolvedValue([]);
    await expect(analyticsService.record([validEvent], 'u1')).rejects.toThrow(AuthorizationError);
  });

  it('rejects a malformed date', async () => {
    propRepo.find.mockResolvedValue([{ id: 1, user_id: 'u1' }]);
    await expect(
      analyticsService.record([{ ...validEvent, first_seen_at: 'nope' }], 'u1')
    ).rejects.toThrow(ValidationError);
  });

  it('saves rows for owned properties and returns the count', async () => {
    propRepo.find.mockResolvedValue([{ id: 1, user_id: 'u1' }]);
    const n = await analyticsService.record([validEvent], 'u1');
    expect(eventRepo.save).toHaveBeenCalledTimes(1);
    expect(n).toBe(1);
  });
});

describe('AnalyticsService.responseTimes', () => {
  it('rejects a missing property_id', async () => {
    await expect(analyticsService.responseTimes(NaN, 'u1')).rejects.toThrow(ValidationError);
  });

  it('rejects a foreign property', async () => {
    propRepo.findOne.mockResolvedValue(null);
    await expect(analyticsService.responseTimes(1, 'u1')).rejects.toThrow(AuthorizationError);
  });

  it('computes median/avg/p95 from replied events', async () => {
    propRepo.findOne.mockResolvedValue({ id: 1, user_id: 'u1' });
    // 60s, 120s, 600s → median 120, avg 260, p95 600
    qb.getMany.mockResolvedValue(
      [60, 120, 600].map((s, i) => ({
        first_seen_at: new Date('2026-09-25T10:00:00Z'),
        replied_at: new Date(new Date('2026-09-25T10:00:00Z').getTime() + s * 1000),
        id: i
      }))
    );

    const summary = await analyticsService.responseTimes(1, 'u1', 30);
    expect(summary.count).toBe(3);
    expect(summary.median_seconds).toBe(120);
    expect(summary.avg_seconds).toBe(260);
    expect(summary.p95_seconds).toBe(600);
  });

  it('returns nulls when no replied events exist', async () => {
    propRepo.findOne.mockResolvedValue({ id: 1, user_id: 'u1' });
    qb.getMany.mockResolvedValue([]);

    const summary = await analyticsService.responseTimes(1, 'u1', 30);
    expect(summary.count).toBe(0);
    expect(summary.median_seconds).toBeNull();
  });
});
