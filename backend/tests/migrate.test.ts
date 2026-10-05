import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

// Exercise the exact entry point used by npm/CI in a fresh process, including
// ts-node and migration discovery. Only the database connection is replaced.
describe('migration CLI', () => {
  const backendDir = path.resolve(__dirname, '..');
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = mkdtempSync(path.join(tmpdir(), 'migration-cli-'));
    writeFileSync(
      path.join(fixtureDir, 'database.cjs'),
      `
      const { DataSource } = require(${JSON.stringify(require.resolve('typeorm'))});
      const { appendFileSync } = require('fs');
      const record = (event) => appendFileSync(process.env.MIGRATION_EVENTS, JSON.stringify(event) + '\\n');
      // Capture crashes before the logger's exception handlers can swallow
      // them into a file and exit silently.
      const crash = (kind) => (err) => {
        try {
          record({ event: kind, message: String((err && err.stack) || err) });
        } catch {}
        process.exit(1);
      };
      process.on('uncaughtException', crash('uncaughtException'));
      process.on('unhandledRejection', crash('unhandledRejection'));
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

  function run(
    scenario = 'success',
    databaseEnv: NodeJS.ProcessEnv = {
      DATABASE_URL: 'postgresql://test:test@localhost/test?sslmode=require',
    }
  ) {
    const eventsFile = path.join(fixtureDir, 'events.jsonl');
    const result = spawnSync(
      process.execPath,
      ['--require', path.join(fixtureDir, 'database.cjs'), 'db/migrate.js'],
      {
        cwd: backendDir,
        // Deliberately exclude JWT_SECRET and other application settings.
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'test',
          // Config validation still requires JWT_SECRET even for migrations;
          // supply a dummy so the CLI env stays minimal but valid.
          JWT_SECRET: 'migration-cli-test-secret-0123456789abcdef',
          DOTENV_CONFIG_QUIET: 'true',
          MIGRATION_EVENTS: eventsFile,
          MIGRATION_SCENARIO: scenario,
          ...databaseEnv,
        },
        encoding: 'utf8',
        timeout: 15000,
      }
    );
    expect(result.error).toBeUndefined();
    // Surface the child's own output when it dies before initializing: an
    // ENOENT below means the CLI crashed at startup, and without this its
    // stderr (the actual cause) is swallowed.
    let eventsRaw: string;
    try {
      eventsRaw = readFileSync(eventsFile, 'utf8');
    } catch {
      const detail = [
        `migrate CLI exited with status ${result.status} without recording events`,
        `stdout:\n${result.stdout}`,
        `stderr:\n${result.stderr}`,
      ];
      const exLog = path.join(backendDir, 'logs', 'exceptions.log');
      if (existsSync(exLog)) {
        detail.push(`exceptions.log:\n${readFileSync(exLog, 'utf8')}`);
      }
      throw new Error(detail.join('\n'));
    }
    const events = eventsRaw
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const crash = events.find((event) => /uncaught|unhandled/.test(event.event));
    if (crash) {
      throw new Error(
        `migrate CLI crashed before initializing (${crash.event}):\n${crash.message}\n` +
          `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );
    }
    return { ...result, events };
  }

  it('runs TypeORM migrations with only DATABASE_URL and closes the connection', () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.events.map((event) => event.event)).toEqual(['initialize', 'migrate', 'destroy']);
    expect(result.events[0].options.url).toBe(
      'postgresql://test:test@localhost/test?sslmode=require'
    );
    expect(result.events[0].options.synchronize).toBe(false);
    // The migration set is owned by main and grows over time (CreateEscalations,
    // CreateResponseEvents arrived via the #337/#343 merges); assert the full
    // known set without depending on TypeORM's glob load order.
    expect(result.events[1].names).toHaveLength(4);
    expect(result.events[1].names).toEqual(
      expect.arrayContaining([
        'CreateInitialTables1700000000000',
        'CreateEscalations1759000000000',
        'CreateResponseEvents1760000000000',
        'RepairLegacySchema1790000000000',
      ])
    );
    expect(result.stdout).toContain('Successfully ran 4 migration(s)');
  });

  it('retains support for individual database settings', () => {
    const result = run('success', {
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_USER: 'test',
      DB_PASSWORD: 'test',
      DB_NAME: 'test',
    });
    expect(result.status).toBe(0);
    expect(result.events[0].options).toMatchObject({
      host: 'localhost',
      port: 5433,
      username: 'test',
      password: 'test',
      database: 'test',
    });
  });

  it('succeeds when no migrations are pending', () => {
    const result = run('empty');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No new migrations to run');
    expect(result.events[result.events.length - 1].event).toBe('destroy');
  });

  it('preserves connection failures without trying to destroy an uninitialized connection', () => {
    const result = run('connect-error');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('test connection failure');
    expect(result.events.map((event) => event.event)).toEqual(['initialize']);
  });

  it('fails and closes the connection when a migration fails', () => {
    const result = run('migration-error');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('test migration failure');
    expect(result.events.map((event) => event.event)).toEqual(['initialize', 'migrate', 'destroy']);
  });
});
