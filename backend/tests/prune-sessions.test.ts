import 'reflect-metadata';
import { Client } from 'pg';

describe('pruning database configuration', () => {
  function connection(config: Record<string, unknown>) {
    jest.resetModules();
    jest.doMock('../src/config/index', () => ({ getDatabaseConfig: () => config }));
    const { pruneDataSource } = require('../db/prune-sessions');
    const options = pruneDataSource.options;
    const client = new Client(options.url
      ? { connectionString: options.url, ssl: options.ssl }
      : { host: options.host, ssl: options.ssl });
    return { options, ssl: (client as unknown as { connectionParameters: { ssl: unknown } }).connectionParameters.ssl };
  }

  afterEach(() => {
    jest.dontMock('../src/config/index');
  });

  it.each(['test', 'production'])('verifies TLS for manual remote settings in %s', (environment) => {
    process.env.NODE_ENV = environment;
    const { options, ssl } = connection({ host: 'db.example.com', port: 5432 });
    expect(options.entities).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'RefreshToken' }), expect.objectContaining({ name: 'User' })]));
    expect(ssl).toEqual(expect.objectContaining({ rejectUnauthorized: true }));
  });

  it.each(['disable', 'no-verify', 'require', 'prefer'])('ignores URL sslmode=%s that overrides verified TLS', (mode) => {
    const { options, ssl } = connection({ connectionString: `postgresql://user:pass@db.example.com/db?sslmode=${mode}&uselibpqcompat=true` });
    expect(options.url).not.toContain('sslmode');
    expect(ssl).toEqual(expect.objectContaining({ rejectUnauthorized: true }));
  });

  it('allows local development without TLS', () => {
    expect(connection({ host: 'localhost' }).ssl).toBe(false);
  });
});
