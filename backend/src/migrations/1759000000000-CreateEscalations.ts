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
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT fk_escalations_property FOREIGN KEY (property_id)
          REFERENCES properties(id) ON DELETE CASCADE
      )
    `);
    // The users FKs are added separately: legacy databases migrated with the
    // old SQL scripts have users.id as INTEGER, which cannot reference UUID
    // columns. Add them only when the id types actually match.
    const [{ uuid_ids }] = await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = 'users'::regclass AND a.attname = 'id' AND format_type(a.atttypid, a.atttypmod) = 'uuid') AS uuid_ids`
    );
    if (uuid_ids) {
      const [{ constraint_exists }] = await queryRunner.query(
        `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_escalations_creator') AS constraint_exists`
      );
      if (!constraint_exists) {
        await queryRunner.query(`ALTER TABLE escalations ADD CONSTRAINT fk_escalations_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE`);
      }
      const [{ assignee_constraint_exists }] = await queryRunner.query(
        `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_escalations_assignee') AS assignee_constraint_exists`
      );
      if (!assignee_constraint_exists) {
        await queryRunner.query(`ALTER TABLE escalations ADD CONSTRAINT fk_escalations_assignee FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL`);
      }
    }
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_escalations_property_id ON escalations(property_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_escalations_created_by ON escalations(created_by)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_escalations_assigned_to ON escalations(assigned_to)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS escalations`);
  }
}
