import { Brackets } from 'typeorm';

// Records the where-conditions a query builder receives, rendering nested
// Brackets as parenthesized groups the way TypeORM nests them in SQL.
class ConditionRecorder {
  private clauses: string[] = [];

  where(condition: unknown): this {
    return this.add('', condition);
  }

  andWhere(condition: unknown): this {
    return this.add('AND', condition);
  }

  orWhere(condition: unknown): this {
    return this.add('OR', condition);
  }

  toString(): string {
    return this.clauses.join(' ');
  }

  private add(operator: string, condition: unknown): this {
    const text = condition instanceof Brackets ? `(${renderGroup(condition)})` : String(condition);
    this.clauses.push(operator ? `${operator} ${text}` : text);
    return this;
  }
}

function renderGroup(group: Brackets): string {
  const nested = new ConditionRecorder();
  (group as unknown as { whereFactory: (qb: ConditionRecorder) => void }).whereFactory(nested);
  return nested.toString();
}

let conditions: ConditionRecorder;

const qb: any = {
  where: jest.fn((condition: unknown) => {
    conditions.where(condition);
    return qb;
  }),
  andWhere: jest.fn((condition: unknown) => {
    conditions.andWhere(condition);
    return qb;
  }),
  orWhere: jest.fn((condition: unknown) => {
    conditions.orWhere(condition);
    return qb;
  }),
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
  conditions = new ConditionRecorder();
});

const SHARED_GROUP =
  "(template.user_id = :userId OR (template.is_global = true AND template.status = 'approved' AND template.is_active = true))";

describe('TemplateService.search visibility', () => {
  it('limits results to the caller when shared templates are not requested', async () => {
    await templateService.search('u1');

    expect(conditions.toString()).toBe('(template.user_id = :userId) AND template.is_active = :is_active');
    expect(qb.orWhere).not.toHaveBeenCalled();
  });

  it('groups own and approved active global templates in one condition when shared templates are requested', async () => {
    await templateService.search('u1', { include_shared: true });

    expect(conditions.toString()).toBe(`${SHARED_GROUP} AND template.is_active = :is_active`);
    expect(qb.orWhere).not.toHaveBeenCalled();
  });

  it('applies category, status, search, tags, and is_active filters to the combined set', async () => {
    await templateService.search('u1', {
      include_shared: true,
      category: 'greeting',
      status: 'approved',
      tags: ['wifi'],
      search: 'hello',
      is_active: false,
    });

    expect(conditions.toString()).toBe(
      `${SHARED_GROUP} AND template.is_active = :is_active AND template.category = :category AND template.status = :status ` +
        'AND (template.name ILIKE :search OR template.content ILIKE :search OR template.description ILIKE :search) ' +
        'AND :tag = ANY(template.tags)'
    );
  });

  it('keeps the property filter outside the visibility group', async () => {
    await templateService.search('u1', { include_shared: true, property_id: 5 });

    expect(conditions.toString()).toBe(
      `${SHARED_GROUP} AND template.is_active = :is_active ` +
        'AND (template.property_id = :property_id OR template.is_global = true)'
    );
  });
});
