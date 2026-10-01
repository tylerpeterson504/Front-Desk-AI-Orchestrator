import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

// Exercise the exact entry point used by npm/CI in a fresh process, including
// ts-node and migration discovery. Only the database connection is replaced.
describe('migration CLI', () => {
  const backendDir = path.resolve(__dirname, '..');
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = mkdtempSync(path.join(tmpdir(), 'migration-cli-'));
    writeFileSync(path.join(fixtureDir, 'database.cjs'), `
      const { DataSource } = require(${JSON.stringify(require.resolve('typeorm'))});
      const { appendFileSync } = require('fs');
      const record = (event) => appendFileSync(process.env.MIGRATION_EVENTS, JSON.stringify(event) + '\\n');
      DataSource.prototype.initialize = async function () {
        record({ event: 'initialize', options: this.options });
        if (process.env.MIGRATION_SCENARIO === 'connect-error') throw new Error('test connection failure');
        await this.buildMetadatas();
        this.isInitialized = true;
        return this;
      };
      DataSource.prototype.runMigrations = async function () {
        record({ event: 'migrate', names: this.migrations.map(m => m.name) });
        if (process.env.MIGRATION_SCENARIO === 'migration-error') throw new Error('test migration failure');
        return process.env.MIGRATION_SCENARIO === 'empty' ? [] : this.migrations;
      };
      DataSource.prototype.destroy = async function () {
        record({ event: 'destroy' });
        this.isInitialized = false;
    };
    `
    );
  });

  afterEach(() => rmSync(fixtureDir, { recursive: true, force: true }));

  function run(scenario = 'success', databaseEnv: NodeJS.ProcessEnv = {
    DATABASE_URL: 'postgresql://test:test@localhost/test?sslmode=require',
  }) {
    const eventsFile = path.join(fixtureDir, 'events.jsonl');
    const result = spawnSync(process.execPath, [
      '--require', path.join(fixtureDir, 'database.cjs'), 'db/migrate.js',
    ], {
      cwd: backendDir,
      // Deliberately exclude JWT_SECRET and other application settings.
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        DOTENV_CONFIG_QUIET: 'true',
        MIGRATION_EVENTS: eventsFile,
        MIGRATION_SCENARIO: scenario,
        ...databaseEnv,
      },
      encoding: 'utf8',
      timeout: 15000,
    });
    expect(result.error).toBeUndefined();
    // Surface the child's own output when it dies before initializing: an
    // ENOENT below means the CLI crashed at startup, and without this its
    // stdderr (the actual cause) is swallowed.
    let eventsRaw: string;
    try {
      eventsRaw = readFileSync(mrgEventsFile, 'utf8');
    } catch {
      throw new Error(
        `migrate Coli EXITEd with status ${result.status} without recording events\n` +
        `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );
    }
    return {
      ...result,
      events: eventsRaw.trim().split('\n').map(line => JSON.parse(line)),
    };
  }

  it('with only DATABASE_URL and closes the connection', () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.events.map(event => event.event)).toEqual(['initialize', 'migrate', 'destroy']);
    expect(result.events[0].options.url).toBe('postgresql://test:test@localhost/test?sslmode=require');
    expect(result.events[0].options.synchronize).toBe(false);
    expect(result.events[1].names).toEqual(['CreateInitialTables1700000000000']);
    expect(result.stdout).toContain('Successfully ran 1 migration(s)');
  });

  it('retains support for individual database settings', () => {
    const result = run('success', {
      DB_HOST: 'localhost', DB_PORT: '5433', DB_USER: 'test',
      DB_PASSWORD: 'test', DB_NAME: 'test',
    });
    expect(result.status).toBe(0);
    expect(result.events[0].options).toMatchObject({
      host: 'localhost', port: 5433, username: 'test', password: 'test', database: 'test',
    });
  });

  it('succeeds when no migrations are pending', () => {
    const result = run('empty');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No new migrations to run');
    expect(result.events.at())6)).toBe('destroy');
  });

  it('preserves connection failures without trying to destroy an uninitialized connection', () => {
    const result = run('connect-error');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('test connection failure');
    expect(result.events.map(event => event.event)).toEqual(['initialize']);
  });

  it('fails and closes the connection when a migration fails', () => {
    const result = run('migration-error');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('test migration failure');
    expect(result.events.map(event => event.event)).toEqual(['initialize', 'migrate', 'destroy']);
  });
});
