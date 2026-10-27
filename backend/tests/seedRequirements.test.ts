import { assertSeedingAllowed, requireSeedPasswords } from '../db/seed-requirements';

describe('assertSeedingAllowed', () => {
  it('allows seeding outside production', () => {
    expect(() => assertSeedingAllowed({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertSeedingAllowed({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertSeedingAllowed({})).not.toThrow();
  });

  it('refuses to seed when NODE_ENV is production', () => {
    expect(() => assertSeedingAllowed({ NODE_ENV: 'production' })).toThrow(
      'Seeding is disabled when NODE_ENV is production'
    );
  });
});

describe('requireSeedPasswords', () => {
  it('returns both seed passwords when they are set', () => {
    expect(
      requireSeedPasswords({
        SEED_ADMIN_PASSWORD: 'admin-example-value',
        SEED_AGENT_PASSWORD: 'agent-example-value'
      })
    ).toEqual({
      adminPassword: 'admin-example-value',
      agentPassword: 'agent-example-value'
    });
  });

  it('throws when SEED_ADMIN_PASSWORD is missing', () => {
    expect(() => requireSeedPasswords({ SEED_AGENT_PASSWORD: 'agent-example-value' })).toThrow(
      'SEED_ADMIN_PASSWORD must be set to seed users'
    );
  });

  it('throws when SEED_AGENT_PASSWORD is empty', () => {
    expect(() =>
      requireSeedPasswords({
        SEED_ADMIN_PASSWORD: 'admin-example-value',
        SEED_AGENT_PASSWORD: ''
      })
    ).toThrow('SEED_AGENT_PASSWORD must be set to seed users');
  });
});
