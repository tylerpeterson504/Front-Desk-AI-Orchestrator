export interface SeedPasswords {
  adminPassword: string;
  agentPassword: string;
}

export function assertSeedingAllowed(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('Seeding is disabled when NODE_ENV is production');
  }
}

export function requireSeedPasswords(env: NodeJS.ProcessEnv): SeedPasswords {
  const adminPassword = env.SEED_ADMIN_PASSWORD;
  const agentPassword = env.SEED_AGENT_PASSWORD;
  if (!adminPassword) {
    throw new Error('SEED_ADMIN_PASSWORD must be set to seed users');
  }
  if (!agentPassword) {
    throw new Error('SEED_AGENT_PASSWORD must be set to seed users');
  }
  return { adminPassword, agentPassword };
}
