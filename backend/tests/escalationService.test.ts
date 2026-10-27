import { AuthorizationError, NotFoundError, ValidationError } from '../src/lib/errors';

const escRepo: any = {
  create: jest.fn(),
  save: jest.fn(),
  merge: jest.fn((e: any, p: any) => ({ ...e, ...p })),
  findOne: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(() => qb),
};
const qb: any = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
  getMany: jest.fn(),
};
const propRepo: any = { findOne: jest.fn() };
const userRepo: any = { findOne: jest.fn() };

jest.mock('../src/config/database', () => ({
  getRepository: jest.fn((entity: any) =>
    entity.name === 'Property' ? propRepo : entity.name === 'User' ? userRepo : escRepo
  ),
}));

// Imported dynamically: the service captures repositories as class fields at
// module load, so the mock repos above must be initialized first.
let escalationService: (typeof import('../src/services/escalationService.js'))['escalationService'];

beforeAll(async () => {
  ({ escalationService } = await import('../src/services/escalationService.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EscalationService', () => {
  describe('create', () => {
    it('rejects a missing property_id', async () => {
      await expect(escalationService.create({ reason: 'x' } as any, 'u1')).rejects.toThrow(
        ValidationError
      );
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
      await expect(escalationService.update(99, { status: 'resolved' }, 'u1')).rejects.toThrow(
        NotFoundError
      );
    });

    it('sets resolved_at when resolving', async () => {
      qb.getOne.mockResolvedValue({ id: 5, status: 'open', created_by: 'u1', assigned_to: null });
      escRepo.save.mockImplementation(async (e: any) => e);

      const updated = await escalationService.update(5, { status: 'resolved' }, 'u1');
      expect(updated.status).toBe('resolved');
      expect(updated.resolved_at).toBeInstanceOf(Date);
    });

    it('marks an open escalation assigned when assigning a user', async () => {
      qb.getOne.mockResolvedValue({
        id: 5,
        status: 'open',
        created_by: 'u1',
        assigned_to: null,
        property_id: 3,
      });
      escRepo.save.mockImplementation(async (e: any) => e);
      userRepo.findOne.mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111' });
      propRepo.findOne.mockResolvedValue({ id: 3 });

      const updated = await escalationService.update(
        5,
        { assigned_to: '11111111-1111-1111-1111-111111111111' },
        'u1'
      );
      expect(updated.status).toBe('assigned');
      expect(updated.assigned_to).toBe('11111111-1111-1111-1111-111111111111');
      expect(propRepo.findOne).toHaveBeenCalledWith({
        where: { id: 3, user_id: '11111111-1111-1111-1111-111111111111' },
      });
    });
    it("rejects an assignee who cannot access the escalation's property", async () => {
      qb.getOne.mockResolvedValue({
        id: 5,
        status: 'open',
        created_by: 'u1',
        assigned_to: null,
        property_id: 3,
      });
      escRepo.save.mockImplementation(async (e: any) => e);
      userRepo.findOne.mockResolvedValue({ id: '22222222-2222-2222-2222-222222222222' });
      propRepo.findOne.mockResolvedValue(null);
      await expect(
        escalationService.update(5, { assigned_to: '22222222-2222-2222-2222-222222222222' }, 'u1')
      ).rejects.toThrow(ValidationError);
    });
    it('rejects a non-UUID assignee', async () => {
      qb.getOne.mockResolvedValue({ id: 5, status: 'open', created_by: 'u1', assigned_to: null });
      await expect(escalationService.update(5, { assigned_to: 'u2' }, 'u1')).rejects.toThrow(
        ValidationError
      );
    });
    it('rejects an assignee that does not exist', async () => {
      qb.getOne.mockResolvedValue({ id: 5, status: 'open', created_by: 'u1', assigned_to: null });
      userRepo.findOne.mockResolvedValue(null);
      await expect(
        escalationService.update(5, { assigned_to: '11111111-1111-1111-1111-111111111111' }, 'u1')
      ).rejects.toThrow(ValidationError);
    });

    it('rejects an invalid status', async () => {
      qb.getOne.mockResolvedValue({ id: 5, status: 'open', created_by: 'u1' });
      await expect(escalationService.update(5, { status: 'zapped' }, 'u1')).rejects.toThrow(
        ValidationError
      );
    });

    describe('status transitions', () => {
      const allowed: Array<[string, string]> = [
        ['open', 'in_progress'],
        ['open', 'resolved'],
        ['in_progress', 'open'],
        ['in_progress', 'resolved'],
        ['resolved', 'open'],
      ];
      const rejected: Array<[string, string]> = [
        ['open', 'escalated'],
        ['open', 'assigned'],
        ['in_progress', 'assigned'],
        ['in_progress', 'escalated'],
        ['resolved', 'in_progress'],
        ['resolved', 'escalated'],
        ['assigned', 'in_progress'],
        ['escalated', 'open'],
      ];

      it.each(allowed)('allows %s to %s', async (from, to) => {
        qb.getOne.mockResolvedValue({ id: 5, status: from, created_by: 'u1', assigned_to: null });
        escRepo.save.mockImplementation(async (e: any) => e);

        const updated = await escalationService.update(5, { status: to }, 'u1');
        expect(updated.status).toBe(to);
      });

      it.each(rejected)('rejects %s to %s with a validation error', async (from, to) => {
        qb.getOne.mockResolvedValue({ id: 5, status: from, created_by: 'u1', assigned_to: null });

        await expect(escalationService.update(5, { status: to }, 'u1')).rejects.toThrow(
          ValidationError
        );
        expect(escRepo.save).not.toHaveBeenCalled();
      });

      it('treats a repeated status as a no-op', async () => {
        const resolvedAt = new Date('2026-01-01T00:00:00Z');
        qb.getOne.mockResolvedValue({
          id: 5,
          status: 'resolved',
          created_by: 'u1',
          assigned_to: null,
          resolved_at: resolvedAt,
          resolved_by: 'u0',
        });
        escRepo.save.mockImplementation(async (e: any) => e);

        const updated = await escalationService.update(5, { status: 'resolved' }, 'u1');
        expect(updated.resolved_at).toBe(resolvedAt);
        expect(updated.resolved_by).toBe('u0');
      });
    });

    describe('audit fields', () => {
      const ASSIGNEE = '11111111-1111-1111-1111-111111111111';

      it('records the resolving user and time when resolving', async () => {
        qb.getOne.mockResolvedValue({
          id: 5,
          status: 'in_progress',
          created_by: 'u1',
          assigned_to: null,
          resolved_by: null,
          resolved_at: null,
        });
        escRepo.save.mockImplementation(async (e: any) => e);
        const before = Date.now();

        const updated = await escalationService.update(5, { status: 'resolved' }, 'u1');
        expect(updated.resolved_by).toBe('u1');
        expect((updated.resolved_at as Date).getTime()).toBeGreaterThanOrEqual(before);
      });

      it('clears the resolution fields when a resolved escalation is reopened', async () => {
        qb.getOne.mockResolvedValue({
          id: 5,
          status: 'resolved',
          created_by: 'u1',
          assigned_to: null,
          resolved_by: 'u0',
          resolved_at: new Date(),
        });
        escRepo.save.mockImplementation(async (e: any) => e);

        const updated = await escalationService.update(5, { status: 'open' }, 'u1');
        expect(updated.status).toBe('open');
        expect(updated.resolved_by).toBeNull();
        expect(updated.resolved_at).toBeNull();
      });

      it('records the assigning user and time when assigning', async () => {
        qb.getOne.mockResolvedValue({
          id: 5,
          status: 'open',
          created_by: 'u1',
          assigned_to: null,
          property_id: 3,
          assigned_by: null,
          assigned_at: null,
        });
        escRepo.save.mockImplementation(async (e: any) => e);
        userRepo.findOne.mockResolvedValue({ id: ASSIGNEE });
        propRepo.findOne.mockResolvedValue({ id: 3 });

        const updated = await escalationService.update(5, { assigned_to: ASSIGNEE }, 'u1');
        expect(updated.assigned_by).toBe('u1');
        expect(updated.assigned_at).toBeInstanceOf(Date);
      });

      it('clears the assignment fields when unassigning', async () => {
        qb.getOne.mockResolvedValue({
          id: 5,
          status: 'assigned',
          created_by: 'u1',
          assigned_to: ASSIGNEE,
          property_id: 3,
          assigned_by: 'u1',
          assigned_at: new Date(),
        });
        escRepo.save.mockImplementation(async (e: any) => e);

        const updated = await escalationService.update(5, { assigned_to: null }, 'u1');
        expect(updated.assigned_to).toBeNull();
        expect(updated.assigned_by).toBeNull();
        expect(updated.assigned_at).toBeNull();
        expect(updated.status).toBe('open');
      });

      it('rejects reassigning a resolved escalation', async () => {
        qb.getOne.mockResolvedValue({
          id: 5,
          status: 'resolved',
          created_by: 'u1',
          assigned_to: null,
          property_id: 3,
        });
        userRepo.findOne.mockResolvedValue({ id: ASSIGNEE });
        propRepo.findOne.mockResolvedValue({ id: 3 });

        await expect(escalationService.update(5, { assigned_to: ASSIGNEE }, 'u1')).rejects.toThrow(
          ValidationError
        );
        expect(escRepo.save).not.toHaveBeenCalled();
      });
    });

    describe('persisted fields', () => {
      it('stores category, resolution notes, and SLA minutes', async () => {
        qb.getOne.mockResolvedValue({ id: 5, status: 'open', created_by: 'u1', assigned_to: null });
        escRepo.save.mockImplementation(async (e: any) => e);

        const updated = await escalationService.update(
          5,
          { category: 'maintenance', resolution_notes: '  Replaced the valve  ', sla_minutes: 120 },
          'u1'
        );
        expect(updated.category).toBe('maintenance');
        expect(updated.resolution_notes).toBe('Replaced the valve');
        expect(updated.sla_minutes).toBe(120);
      });

      it('rejects an unknown category', async () => {
        qb.getOne.mockResolvedValue({ id: 5, status: 'open', created_by: 'u1', assigned_to: null });

        await expect(escalationService.update(5, { category: 'weather' }, 'u1')).rejects.toThrow(
          ValidationError
        );
      });

      it('rejects a negative SLA', async () => {
        qb.getOne.mockResolvedValue({ id: 5, status: 'open', created_by: 'u1', assigned_to: null });

        await expect(escalationService.update(5, { sla_minutes: -5 }, 'u1')).rejects.toThrow(
          ValidationError
        );
      });
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
      await expect(escalationService.getAll('u1', { status: 'bogus' })).rejects.toThrow(
        ValidationError
      );
    });

    it('returns rows via the visibility query', async () => {
      qb.getMany.mockResolvedValue([{ id: 1 }]);
      const rows = await escalationService.getAll('u1');
      expect(qb.where).toHaveBeenCalledWith('(e.created_by = :userId OR e.assigned_to = :userId)', {
        userId: 'u1',
      });
      expect(rows).toEqual([{ id: 1 }]);
    });

    it('applies a default limit of 100 and no offset', async () => {
      qb.getMany.mockResolvedValue([]);
      await escalationService.getAll('u1');
      expect(qb.take).toHaveBeenCalledWith(100);
      expect(qb.skip).toHaveBeenCalledWith(0);
    });

    it('passes the requested limit and offset through', async () => {
      qb.getMany.mockResolvedValue([]);
      await escalationService.getAll('u1', { limit: '25', offset: '50' });
      expect(qb.take).toHaveBeenCalledWith(25);
      expect(qb.skip).toHaveBeenCalledWith(50);
    });

    it('caps the limit at 500', async () => {
      qb.getMany.mockResolvedValue([]);
      await escalationService.getAll('u1', { limit: '5000' });
      expect(qb.take).toHaveBeenCalledWith(500);
    });

    it.each([['0'], ['-1'], ['abc'], ['2.5']])('rejects a limit of %s', async (limit) => {
      await expect(escalationService.getAll('u1', { limit })).rejects.toThrow(ValidationError);
    });

    it('rejects a negative offset', async () => {
      await expect(escalationService.getAll('u1', { offset: '-3' })).rejects.toThrow(
        ValidationError
      );
    });
  });
});
