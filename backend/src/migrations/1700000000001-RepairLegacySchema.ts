import { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairLegacySchema1700000000001 implements MigrationInterface {
  name = 'RepairLegacySchema1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS property_id INTEGER`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'agent'`);
    await queryRunner.query(`ALTER TABLE templates ADD COLUMN IF NOT EXISTS property_id INTEGER`);
    await queryRunner.query(`ALTER TABLE templates ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false`);
    await queryRunner.query(`ALTER TABLE shift_notes ADD COLUMN IF NOT EXISTS user_id UUID`);
    await queryRunner.query(`ALTER TABLE shift_notes ADD COLUMN IF NOT EXISTS shift_date DATE DEFAULT CURRENT_DATE`);
    await queryRunner.query(`ALTER TABLE shift_notes ADD COLUMN IF NOT EXISTS content TEXT`);
    await queryRunner.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource VARCHAR(100)`);
    await queryRunner.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_id VARCHAR(255)`);
    await queryRunner.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB`);
    await queryRunner.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45)`);
    await queryRunner.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500)`);
    await queryRunner.query(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS token VARCHAR(255)`);
    await queryRunner.query(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_id UUID`);
    await queryRunner.query(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT false`);
  }

  public async down(): Promise<void> {}
}
