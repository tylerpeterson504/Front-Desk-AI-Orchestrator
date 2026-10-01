import { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairLegacySchema1790000000000 implements MigrationInterface {
  name = 'RepairLegacySchema1790000000000';

  /**
   * Repair columns missing on legacy databases that predate the initial
   * schema migration. Tables are checked first so a fresh database (where
   * CreateInitialTables already created every column) skips the repair
   * entirely instead of failing on a missing table.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    const repairs: Array<[string, string]> = [
      ['users', 'property_id INTEGER'],
      ['users', 'password_hash VARCHAR(255) DEFAULT \'\''],
      ['users', 'role VARCHAR(20) DEFAULT \'agent\''],
      ['templates', 'property_id INTEGER'],
      ['templates', 'is_global BOOLEAN DEFAULT false'],
      ['shift_notes', 'user_id UUID'],
      ['shift_notes', 'shift_date DATE DEFAULT CURRENT_DATE'],
      ['shift_notes', 'content TEXT'],
      ['audit_logs', 'resource VARCHAR(100)'],
      ['audit_logs', 'resource_id VARCHAR(255)'],
      ['audit_logs', 'metadata JSONB'],
      ['audit_logs', 'ip_address VARCHAR(45)'],
      ['audit_logs', 'user_agent VARCHAR(500)'],
      ['refresh_tokens', 'token VARCHAR(255)'],
      ['refresh_tokens', 'user_id UUID'],
      ['refresh_tokens', 'expires_at TIMESTAMP WITH TIME ZONE'],
      ['refresh_tokens', 'is_revoked BOOLEAN DEFAULT false']
    ];

    const tables = (await queryRunner.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    )) as Array<{ tablename: string }>;
    const known = new Set(tables.map(row => row.tablename));

    for (const [table, columnDef] of repairs) {
      if (!known.has(table)) continue;
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${columnDef}`);
    }
  }

  public async down(): Promise<void> {}
}
