const qb: any = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue([]),
};
const templateRepo: any = {
  createQueryBuilder: jest.fn(() => qb),
};

jest.mock('../src/config/database', () => ({
  getRepository: jest.fn(() => templateRepo),
}));

// Loaded lazily: the service captures repositories as class fields at
// module load, so the mock repos above must be initialized first.
let templateService: (typeof import('../src/services/templateService'))['templateService'];

beforeAll(() => {
  ({ templateService } = require('../src/services/templateService'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TemplateService.search sort options', () => {
  it('orders by an allowed column in the requested direction', async () => {
    await templateService.search('u1', { sort_by: 'created_at', sort_order: 'DESC' });
    expect(qb.orderBy).toHaveBeenCalledWith('template.created_at', 'DESC');
  });

  it('accepts sort directions in any letter case', async () => {
    await templateService.search('u1', { sort_by: 'updated_at', sort_order: 'desc' });
    expect(qb.orderBy).toHaveBeenLastCalledWith('template.updated_at', 'DESC');

    await templateService.search('u1', { sort_by: 'updated_at', sort_order: 'asc' });
    expect(qb.orderBy).toHaveBeenLastCalledWith('template.updated_at', 'ASC');
  });

  it('rejects sort columns outside the allowlist and falls back to name ascending', async () => {
    await templateService.search('u1', { sort_by: 'user_id' as any, sort_order: 'DESC' });
    expect(qb.orderBy).toHaveBeenLastCalledWith('template.name', 'ASC');

    await templateService.search('u1', { sort_by: 'not_a_column' as any, sort_order: 'DESC' });
    expect(qb.orderBy).toHaveBeenLastCalledWith('template.name', 'ASC');
  });

  it('uses ascending order when the direction is neither ASC nor DESC', async () => {
    await templateService.search('u1', { sort_by: 'category', sort_order: 'sideways' as any });
    expect(qb.orderBy).toHaveBeenLastCalledWith('template.category', 'ASC');
  });

  it('defaults to name ascending when no sort is given', async () => {
    await templateService.search('u1');
    expect(qb.orderBy).toHaveBeenLastCalledWith('template.name', 'ASC');
  });
});
