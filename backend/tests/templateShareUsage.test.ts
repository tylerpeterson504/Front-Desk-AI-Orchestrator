import { Brackets } from 'typeorm';
import { AuthorizationError } from '../src/lib/errors';

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

let updateConditions: ConditionRecorder;

const updateQb: any = {
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  where: jest.fn((condition: unknown) => {
    updateConditions.where(condition);
    return updateQb;
  }),
  andWhere: jest.fn((condition: unknown) => {
    updateConditions.andWhere(condition);
    return updateQb;
  }),
  execute: jest.fn().mockResolvedValue({ affected: 1 }),
};

const templateRepo: any = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(() => updateQb),
};
const propertyRepo: any = { findOne: jest.fn() };

jest.mock('../src/config/database', () => ({
  getRepository: jest.fn((entity: any) => (entity.name === 'Property' ? propertyRepo : templateRepo)),
}));

// Loaded lazily: the service captures repositories as class fields at
// module load, so the mock repos above must be initialized first.
let templateService: (typeof import('../src/services/templateService'))['templateService'];

beforeAll(() => {
  ({ templateService } = require('../src/services/templateService'));
});

beforeEach(() => {
  jest.clearAllMocks();
  updateConditions = new ConditionRecorder();
  templateRepo.create.mockImplementation((data: any) => ({ ...data }));
  templateRepo.save.mockImplementation(async (entity: any) => entity);
});

function ownedTemplate() {
  return {
    id: 7,
    name: 'Greeting',
    content: 'Welcome to the hotel.',
    category: 'greeting',
    tags: [],
    description: null,
    user_id: 'u1',
    property_id: 3,
    is_global: false,
    is_active: true,
    version: 1,
    status: 'approved',
  };
}

describe('TemplateService.shareWithProperty', () => {
  it('rejects sharing into a property the caller does not own', async () => {
    templateRepo.findOne.mockResolvedValue(ownedTemplate());
    propertyRepo.findOne.mockResolvedValue(null);

    await expect(templateService.shareWithProperty(7, 9, 'u1')).rejects.toThrow(AuthorizationError);
    expect(propertyRepo.findOne).toHaveBeenCalledWith({ where: { id: 9, user_id: 'u1' } });
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('creates the shared copy for a property the caller owns', async () => {
    templateRepo.findOne.mockResolvedValue(ownedTemplate());
    propertyRepo.findOne.mockResolvedValue({ id: 9, user_id: 'u1' });

    const shared = await templateService.shareWithProperty(7, 9, 'u1');

    expect(shared.property_id).toBe(9);
    expect(shared.user_id).toBe('u1');
    expect(templateRepo.save).toHaveBeenCalledTimes(1);
  });
});

describe('TemplateService.incrementUsageCount', () => {
  it('limits the usage increment to templates the caller can see', async () => {
    await templateService.incrementUsageCount(7, 'u1');

    expect(updateConditions.toString()).toBe(
      "id = :templateId AND (user_id = :userId OR (is_global = true AND status = 'approved' AND is_active = true))"
    );
    expect(updateQb.execute).toHaveBeenCalledTimes(1);
  });
});
