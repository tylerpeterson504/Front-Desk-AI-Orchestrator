import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the ownership/relationship columns the entities and services depend on,
 * but which the initial tables migration never created:
 *
 *   properties.user_id   - ownership scope; propertyService and copilotService
 *                          filter every property query by it.
 *   audit_logs.property_id - relation to the property an entry refers to, and
 *                          the join column on the AuditLog -> Property relation.
 *   templates.user_id / category / tags - ownership scope and the filter
 *                          fields templateService queries.
 *
 * This migration is already recorded as applied on existing databases, so
 * re-adding the file does not re-run it there. It exists in source control so
 * that a fresh database created from scratch gets the same schema.
 *
 * All statements are idempotent so it is safe against partially-provisioned
 * databases too.
 */
export class AddMissingEntityColumns1700000001000 implements MigrationInterface {
  name = 'AddMissingEntityColumns1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // properties.user_id (VARCHAR to match the entity's explicit type)
    await queryRunner.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS user_id VARCHAR`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id)`);

    // audit_logs.property_id (INT to match the entity's explicit type)
    await queryRunner.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS property_id INTEGER`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_property_id ON audit_logs(property_id)`);

    // templates ownership and filter columns
    await queryRunner.query(`ALTER TABLE templates ADD COLUMN IF NOT EXISTS user_id VARCHAR`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id)`);
    await queryRunner.query(`ALTER TABLE templates ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);
    await queryRunner.query(`ALTER TABLE templates ADD COLUMN IF NOT EXISTS tags TEXT[]`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_templates_user_id`);
    await queryRunner.query(`ALTER TABLE templates DROP COLUMN IF EXISTS tags`);
    await queryRunner.query(`ALTER TABLE templates DROP COLUMN IF EXISTS category`);
    await queryRunner.query(`ALTER TABLE templates DROP COLUMN IF EXISTS user_id`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_logs_property_id`);
    await queryRunner.query(`ALTER TABLE audit_logs DROP COLUMN IF EXISTS property_id`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_properties_user_id`);
    await queryRunner.query(`ALTER TABLE properties DROP COLUMN IF EXISTS user_id`);
  }
}
