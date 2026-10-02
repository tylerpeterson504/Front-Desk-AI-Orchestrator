import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateResponseEvents1760000000000 implements MigrationInterface {
  name = 'CreateResponseEvents1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS response_events (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL,
        user_id UUID NOT NULL,
        conversation_hash VARCHAR(64) NOT NULL,
        first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL,
        replied_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_response_events_property_created ON response_events(property_id, created_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_response_events_user ON response_events(user_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS response_events`);
  }
}
