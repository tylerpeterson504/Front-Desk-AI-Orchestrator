import { AuthorizationError, ValidationError } from '../src/lib/errors';

const eventRepo: any = {
  create: jest.fn((d: any) => ({ ...d })),
  save: jest.fn(),
  createQueryBuilder: jest.fn(() => qb),
};
const qb: any = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
  getRawOne: jest.fn(),
};
const propRepo: any = { find: jest.fn(), findOne: jest.fn() };

jest.mock('../src/config/database', () => ({
  getRepository: jest.fn((entity: any) => (entity.name === 'Property' ? propRepo : eventRepo)),
}));

// Imported dynamically: the service captures repositories as class fields at
// module load, so the mock repos above must be initialized first.
let analyticsService: (typeof import('../src/services/analyticsService'))['analyticsService'];

beforeAll(async () => {
  ({ analyticsService } = await import('../src/services/analyticsService'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

const validEvent = {
  property_id: 1,
  conversation_hash: 'c1',
  first_seen_at: '2026-09-25T10:00:00Z',
  replied_at: '2026-09-25T10:02:00Z',
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

  it('computes median/avg/p95 from replied events in the database', async () => {
    propRepo.findOne.mockResolvedValue({ id: 1, user_id: 'u1' });
    // Aggregates for 60s, 120s, 600s: median 120, avg 260, p95 600
    qb.getRawOne.mockResolvedValue({ count: '3', avg: 260, median: 120, p95: 600 });
    const summary = await analyticsService.responseTimes(1, 'u1', 30);
    expect(summary).toEqual({
      property_id: 1,
      days: 30,
      count: 3,
      median_seconds: 120,
      avg_seconds: 260,
      p95_seconds: 600,
    });
    expect(qb.getMany).not.toHaveBeenCalled();
  });

  it('rounds fractional aggregates to whole seconds', async () => {
    propRepo.findOne.mockResolvedValue({ id: 1, user_id: 'u1' });
    qb.getRawOne.mockResolvedValue({ count: '2', avg: 259.6, median: 119.4, p95: 200.5 });
    const summary = await analyticsService.responseTimes(1, 'u1', 30);
    expect(summary.avg_seconds).toBe(260);
    expect(summary.median_seconds).toBe(119);
    expect(summary.p95_seconds).toBe(201);
  });

  it('returns nulls when no replied events exist', async () => {
    propRepo.findOne.mockResolvedValue({ id: 1, user_id: 'u1' });
    qb.getRawOne.mockResolvedValue({ count: '0', avg: null, median: null, p95: null });
    const summary = await analyticsService.responseTimes(1, 'u1', 30);
    expect(summary.count).toBe(0);
    expect(summary.median_seconds).toBeNull();
    expect(summary.avg_seconds).toBeNull();
    expect(summary.p95_seconds).toBeNull();
  });
});
