import crypto from 'crypto';
import { getRepository } from '../src/config/database';
import { RefreshTokenService } from '../src/services/refreshTokenService';
import { createMockRepository, createMockUser } from './utils';

jest.mock('../src/config/database', () => ({
  getRepository: jest.fn()
}));

const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

describe('RefreshTokenService', () => {
  let repository: ReturnType<typeof createMockRepository>;
  let service: RefreshTokenService;

  beforeEach(() => {
    repository = createMockRepository();
    repository.create.mockImplementation((data: object) => ({ id: 7, ...data }));
    repository.save.mockImplementation(async (entity: object) => entity);
    (getRepository as jest.Mock).mockReturnValue(repository);
    service = new RefreshTokenService();
  });

  it('stores only a digest of an issued token and returns the raw token', async () => {
    const session = await service.issueSession(createMockUser({ id: 'user-1' }));

    const stored = repository.save.mock.calls[0][0];
    expect(stored.token).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.token).toBe(digest(session.token));
    expect(session.token).not.toBe(stored.token);
    expect(session).toMatchObject({ id: 7, user_id: 'user-1' });
  });

  it('validates a session using the raw token returned at issue time', async () => {
    const issued = await service.issueSession(createMockUser({ id: 'user-1' }));
    const stored = repository.save.mock.calls[0][0];
    repository.findOne.mockImplementation(async ({ where }: any) =>
      where.token === stored.token ? stored : null
    );

    const session = await service.validateSession(issued.token);

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { token: digest(issued.token), is_revoked: false }
    });
    expect(session).toMatchObject({ id: 7, user_id: 'user-1', token: issued.token });
  });

  it('limits a session to the grace window without extending it', async () => {
    const before = Date.now();

    await service.shortenSession(7, 60 * 1000);

    const [criteria, values] = repository.update.mock.calls[0];
    expect(criteria.id).toBe(7);
    expect(criteria.expires_at.type).toBe('moreThan');
    expect(values.expires_at.getTime()).toBeGreaterThanOrEqual(before + 60 * 1000);
    expect(values.expires_at.getTime()).toBeLessThanOrEqual(Date.now() + 60 * 1000);
  });

  it('revokes a session by the digest of the presented token', async () => {
    await service.revokeSessionByToken('presented-token');

    expect(repository.update).toHaveBeenCalledWith(
      { token: digest('presented-token') },
      { is_revoked: true }
    );
  });

  it('deletes sessions whose expiry has passed', async () => {
    repository.delete.mockResolvedValue({ affected: 2 });

    await expect(service.cleanupExpired()).resolves.toBe(2);

    const criteria = repository.delete.mock.calls[0][0];
    expect(criteria.expires_at.type).toBe('lessThan');
  });
});
