import { AuthorizationError } from '../src/lib/errors';

const templateRepo: any = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
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
  templateRepo.create.mockImplementation((data: any) => ({ ...data }));
  templateRepo.save.mockImplementation(async (entity: any) => entity);
});

function ownedTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    name: 'Greeting',
    content: 'Welcome to the hotel.',
    category: 'greeting',
    tags: [],
    description: null,
    user_id: 'u-owner',
    property_id: null,
    is_global: false,
    is_active: true,
    version: 1,
    status: 'draft',
    approved_by: null,
    approved_at: null,
    ...overrides,
  };
}

const updateBody = { name: 'Greeting', content: 'Welcome to the hotel!' };

describe('TemplateService.approveTemplate', () => {
  it('rejects approval from a non-admin before loading the template', async () => {
    await expect(
      templateService.approveTemplate(7, 'approve', 'u-agent', false)
    ).rejects.toThrow(AuthorizationError);
    expect(templateRepo.findOne).not.toHaveBeenCalled();
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('lets an admin approve a template', async () => {
    templateRepo.findOne.mockResolvedValue(ownedTemplate());

    const result = await templateService.approveTemplate(7, 'approve', 'u-admin', true);

    expect(result.status).toBe('approved');
    expect(result.approved_by).toBe('u-admin');
    expect(templateRepo.save).toHaveBeenCalledTimes(1);
  });
});

describe('TemplateService.update ownership', () => {
  it('lets the owner update their template', async () => {
    templateRepo.findOne.mockResolvedValue(ownedTemplate());

    await templateService.update(7, updateBody, 'u-owner', false);

    expect(templateRepo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects an update to a template owned by someone else', async () => {
    templateRepo.findOne.mockResolvedValue(ownedTemplate());

    await expect(templateService.update(7, updateBody, 'u-other', false)).rejects.toThrow(
      AuthorizationError
    );
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('lets an admin update a template owned by someone else', async () => {
    templateRepo.findOne.mockResolvedValue(ownedTemplate());

    await templateService.update(7, updateBody, 'u-admin', true);

    expect(templateRepo.save).toHaveBeenCalledTimes(1);
  });

  it('ignores a client-supplied status and forces is_global off for non-admins', async () => {
    templateRepo.findOne.mockResolvedValue(ownedTemplate({ status: 'draft', is_global: true }));

    await templateService.update(
      7,
      { ...updateBody, status: 'approved', is_global: true },
      'u-owner',
      false
    );

    const saved = templateRepo.save.mock.calls[0][0];
    expect(saved.status).toBe('draft');
    expect(saved.is_global).toBe(false);
  });

  it('applies status and is_global on update for admins', async () => {
    templateRepo.findOne.mockResolvedValue(ownedTemplate());

    await templateService.update(
      7,
      { ...updateBody, status: 'approved', is_global: true },
      'u-admin',
      true
    );

    const saved = templateRepo.save.mock.calls[0][0];
    expect(saved.status).toBe('approved');
    expect(saved.is_global).toBe(true);
  });
});

describe('TemplateService.delete ownership', () => {
  it('rejects deleting a template owned by someone else', async () => {
    templateRepo.findOne.mockResolvedValue(ownedTemplate());

    await expect(templateService.delete(7, 'u-other', false)).rejects.toThrow(AuthorizationError);
    expect(templateRepo.remove).not.toHaveBeenCalled();
  });

  it('lets the owner delete their template', async () => {
    const template = ownedTemplate();
    templateRepo.findOne.mockResolvedValue(template);

    await templateService.delete(7, 'u-owner', false);

    expect(templateRepo.remove).toHaveBeenCalledWith(template);
  });
});

describe('TemplateService.create status and is_global', () => {
  it('keeps the default status and forces is_global off for non-admins', async () => {
    await templateService.create(
      { ...updateBody, status: 'pending_approval', is_global: true },
      'u-agent',
      false
    );

    const created = templateRepo.create.mock.calls[0][0];
    expect(created.status).toBe('approved');
    expect(created.is_global).toBe(false);
  });

  it('applies client-supplied status and is_global for admins', async () => {
    await templateService.create(
      { ...updateBody, status: 'pending_approval', is_global: true },
      'u-admin',
      true
    );

    const created = templateRepo.create.mock.calls[0][0];
    expect(created.status).toBe('pending_approval');
    expect(created.is_global).toBe(true);
  });
});
