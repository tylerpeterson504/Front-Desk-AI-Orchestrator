import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEscalations1759000000000 implements MigrationInterface {
  name = 'CreateEscalations1759000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS escalations (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL,
        created_by UUID NOT NULL,
        guest_name VARCHAR(255),
        room_number VARCHAR(50),
        reason TEXT NOT NULL,
        priority VARCHAR(20) NOT NULL DEFAULT 'normal'
          CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
        status VARCHAR(20) NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'assigned', 'resolved')),
        assigned_to UUID,
        resolved_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_escalations_property_id ON escalations(property_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_escalations_created_by ON escalations(created_by)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_escalations_assigned_to ON escalations(assigned_to)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS escalations`);
  }
}
