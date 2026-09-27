import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('properties')
@Index(['name'])
export class Property {
  @PrimaryGeneratedColumn('increment')
  id: number;

  // Nullable in the database: existing rows predate this column, so it cannot
  // be NOT NULL without a backfill. See the AddMissingEntityColumns migration.
  // Union/nullable columns need an explicit `type` for TypeORM.
  @Column({ type: 'varchar', nullable: true })
  user_id: string | null;

  @Column()
  name: string;

  // Nullable union columns need an explicit `type`; see the note in User.ts.
  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  checkout_time: string | null;

  @Column({ type: 'varchar', nullable: true })
  wifi_ssid: string | null;

  @Column({ type: 'varchar', nullable: true })
  wifi_password: string | null;

  @Column({ nullable: true, type: 'text' })
  tone_guidelines: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
