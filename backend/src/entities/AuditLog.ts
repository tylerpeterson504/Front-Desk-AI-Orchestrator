import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('audit_logs')
@Index(['user_id'])
@Index(['action'])
@Index(['resource'])
@Index(['created_at'])
export class AuditLog {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ nullable: true })
  user_id!: string | null;

  @Column()
  action!: string;

  @Column()
  resource!: string;

  @Column({ nullable: true })
  resource_id!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ nullable: true })
  ip_address!: string | null;

  @Column({ nullable: true, length: 500 })
  user_agent!: string | null;

  @Column({ nullable: true })
  property_id!: number | null;

  @CreateDateColumn()
  created_at!: Date;
}
