import { AuthorizationError, NotFoundError, ValidationError } from '../src/lib/errors';

const escRepo: any = {
  create: jest.fn(),
  save: jest.fn(),
  merge: jest.fn((e: any, p: any) => ({ ...e, ...p })),
  findOne: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(() => qb)
};
const qb: any = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
  getMany: jest.fn()
};
const propRepo: any = { findOne: jest.fn() };
const userRepo: any = { findOne: jest.fn() };

jest.mock('../src/config/database', () => ({
  getRepository: jest.fn((entity: any) =>
    entity.name === 'Property' ? propRepo : entity.name === 'User' ? userRepo : escRepo
  )
}));

// Imported dynamically: the service captures repositories as class fields at
// module load, so the mock repos above must be initialized first.
let escalationService: typeof import('../src/services/escalationService')['escalationService'];

beforeAll(async () => {
  ({ escalationService } = await import('../src/services/escalationService'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EscalationService', () => {
  describe('create', () => {
    it('rejects a missing property_id', async () => {
      await expect(escalationService.create({ reason: 'x' } as any, 'u1')).rejects.toThrow(ValidationError);
    });

    it('rejects an invalid priority', async () => {
      await expect(
        escalationService.create({ property_id: 1, reason: 'x', priority: 'mega' }, 'u1')
      ).rejects.toThrow(ValidationError);
    });

    it('rejects a property owned by someone else', async () => {
      propRepo.findOne.mockResolvedValue(null);
      await expect(
        escalationService.create({ property_id: 1, reason: 'Guest upset' }, 'u1')
      ).rejects.toThrow(AuthorizationError);
    });

    it('creates an open escalation for an owned property', async () => {
      propRepo.findOne.mockResolvedValue({ id: 1, user_id: 'u1' });
      escRepo.create.mockImplementation((data: any) => ({ ...data }));
      escRepo.save.mockImplementation(async (e: any) => ({ ...e, id: 7 }));

      const created = await escalationService.create(
        { property_id: 1, reason: 'Guest upset about room', guest_name: 'Ann', room_number: '204' },
        'u1'
      );

      expect(propRepo.findOne).toHaveBeenCalledWith({ where: { id: 1, user_id: 'u1' } });
      expect(created.status).toBe('open');
      expect(created.priority).toBe('normal');
      expect(created.id).toBe(7);
    });
  });

  describe('update', () => {
    it('throws NotFoundError when the escalation is not visible to the caller', async () => {
      qb.getOne.mockResolvedValue(null);
      await expect(escalationService.update(99, { status: 'resolved' }, 'u1')).rejects.toThrow(NotFoundError);
    });

    it('sets resolved_at when resolving', async () => {
      qb.getOne.mockResolvedValue({ id: 5, status: 'open', created_by: 'u1', assigned_to: null });
      escRepo.save.mockImplementation(async (e: any) => e);

      const updated = await escalationService.update(5, { status: 'resolved' }, 'u1');
      expect(updated.status).toBe('resolved');
      expect(updated.resolved_at).toBeInstanceOf(Date);
    });

    it('marks an open escalation assigned when assigning a user', async () => {
      qb.getOne.mockResolvedValue({ id: 5, status: 'open', created_by: 'u1', assigned_to: null, property_id: 3 });
      escRepo.save.mockImplementation(async (e: any) => e);
      userRepo.findOne.mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111' });
      propRepo.findOne.mockResolvedValue({ id: 3 });

      const updated = await escalationService.update(5, { assigned_to: '11111111-1111-1111-1111-111111111111' }, 'u1');
      expect(updated.status).toBe('assigned');
      expect(updated.assigned_to).toBe('11111111-1111-1111-1111-111111111111');
    });
    it('rejects a non-UUID assignee', async () => {
      qb.getOne.mockResolvedValue({ id: 5, status: 'open', created_by: 'u1', assigned_to: null });
      await expect(escalationService.update(5, { assigned_to: 'u2' }, 'u1')).rejects.toThrow(ValidationError);
    });
    it('rejects an assignee that does not exist', async () => {
      qb.getOne.mockResolvedValue({ id: 5, status: 'open', created_by: 'u1', assigned_to: null });
      userRepo.findOne.mockResolvedValue(null);
      await expect(escalationService.update(5, { assigned_to: '11111111-1111-1111-1111-111111111111' }, 'u1')).rejects.toThrow(ValidationError);
    });

    it('rejects an invalid status', async () => {
      qb.getOne.mockResolvedValue({ id: 5, status: 'open', created_by: 'u1' });
      await expect(escalationService.update(5, { status: 'zapped' }, 'u1')).rejects.toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('throws NotFoundError when the caller is not the creator', async () => {
      escRepo.findOne.mockResolvedValue(null);
      await expect(escalationService.delete(5, 'u1')).rejects.toThrow(NotFoundError);
    });

    it('deletes an escalation created by the caller', async () => {
      escRepo.findOne.mockResolvedValue({ id: 5, created_by: 'u1' });
      await escalationService.delete(5, 'u1');
      expect(escRepo.delete).toHaveBeenCalledWith(5);
    });
  });

  describe('getAll', () => {
    it('rejects an invalid status filter', async () => {
      await expect(escalationService.getAll('u1', { status: 'bogus' })).rejects.toThrow(ValidationError);
    });

    it('returns rows via the visibility query', async () => {
      qb.getMany.mockResolvedValue([{ id: 1 }]);
      const rows = await escalationService.getAll('u1');
      expect(qb.where).toHaveBeenCalledWith('(e.created_by = :userId OR e.assigned_to = :userId)', { userId: 'u1' });
      expect(rows).toEqual([{ id: 1 }]);
    });
  });
});
