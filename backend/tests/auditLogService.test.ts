jest.mock('../src/lib/logger', () => ({
  createRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

const auditRepo: any = { create: jest.fn(), save: jest.fn() };
const propertyRepo: any = {};

jest.mock('../src/config/database', () => ({
  getRepository: jest.fn((entity: any) => (entity.name === 'Property' ? propertyRepo : auditRepo)),
}));

// Imported dynamically: the service captures repositories as class fields at
// module load, so the mock repos above must be initialized first.
let auditLogService: (typeof import('../src/services/auditLogService.js'))['auditLogService'];

beforeAll(async () => {
  ({ auditLogService } = await import('../src/services/auditLogService.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  auditRepo.create.mockImplementation((data: any) => ({ ...data }));
  auditRepo.save.mockImplementation(async (e: any) => e);
});

describe('AuditLogService request-context handling', () => {
  it('stores ipAddress and userAgent when provided', async () => {
    await auditLogService.create(
      { action: 'wifi.reveal', resource: 'property', resource_id: '1' },
      'u1',
      { ipAddress: '203.0.113.10', userAgent: 'Mozilla/5.0' }
    );

    const created = auditRepo.create.mock.calls[0][0];
    expect(created.ip_address).toBe('203.0.113.10');
    expect(created.user_agent).toBe('Mozilla/5.0');
  });

  it('defaults context to null when absent (back-compat)', async () => {
    await auditLogService.create({ action: 'a', resource: 'b' }, 'u1');
    const created = auditRepo.create.mock.calls[0][0];
    expect(created.ip_address).toBeNull();
    expect(created.user_agent).toBeNull();
  });

  it('caps context lengths to the schema columns', async () => {
    const longIp = 'x'.repeat(60);
    const longUa = 'y'.repeat(600);
    await auditLogService.create({ action: 'a', resource: 'b' }, 'u1', {
      ipAddress: longIp,
      userAgent: longUa,
    });
    const created = auditRepo.create.mock.calls[0][0];
    expect(created.ip_address.length).toBeLessThanOrEqual(45);
    expect(created.user_agent.length).toBeLessThanOrEqual(500);
  });

  it('logAction forwards ip and user agent to create', async () => {
    await auditLogService.logAction('login', 'auth', 'u1', {
      ipAddress: '192.0.2.1',
      userAgent: 'Chrome',
    });
    const created = auditRepo.create.mock.calls[0][0];
    expect(created.ip_address).toBe('192.0.2.1');
    expect(created.user_agent).toBe('Chrome');
  });
});

describe('AuditLogService property attachment', () => {
  it('joins the property with explicit columns that exclude wifi_password and user_id', async () => {
    const qb: any = {
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    };
    auditRepo.createQueryBuilder = jest.fn(() => qb);

    await auditLogService.getAll('u1');

    expect(qb.leftJoin).toHaveBeenCalledWith('al.property', 'property');
    const selected: string[] = qb.addSelect.mock.calls[0][0];
    expect(selected).toEqual(expect.arrayContaining(['property.id', 'property.name', 'property.wifi_ssid']));
    expect(selected).not.toContain('property.wifi_password');
    expect(selected).not.toContain('property.user_id');
  });
});
