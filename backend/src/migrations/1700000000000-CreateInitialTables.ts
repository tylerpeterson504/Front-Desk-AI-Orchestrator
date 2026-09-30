import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInitialTables1700000000000 implements MigrationInterface {
  name = 'CreateInitialTables1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role VARCHAR(20) DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
        property_id INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        checkout_time VARCHAR(50),
        wifi_ssid VARCHAR(255),
        wifi_password VARCHAR(255),
        tone_guidelines TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        property_id INTEGER,
        is_global BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shift_notes (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL,
        user_id UUID NOT NULL,
        content TEXT NOT NULL,
        shift_date DATE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id UUID,
        action VARCHAR(100) NOT NULL,
        resource VARCHAR(100) NOT NULL,
        resource_id VARCHAR(255),
        metadata JSONB,
        ip_address VARCHAR(45),
        user_agent VARCHAR(500),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        token VARCHAR(255) NOT NULL,
        user_id UUID NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        is_revoked BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create indexes
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_templates_property_id ON templates(property_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_shift_notes_property_id ON shift_notes(property_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_shift_notes_user_id ON shift_notes(user_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS shift_notes`);
    await queryRunner.query(`DROP TABLE IF EXISTS templates`);
    await queryRunner.query(`DROP TABLE IF EXISTS properties`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
