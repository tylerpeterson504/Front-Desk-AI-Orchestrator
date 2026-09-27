import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('users')
@Index(['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  password_hash!: string;

  // Union types (string | null, 'admin' | 'agent') emit Object as the
  // reflected design:type, so TypeORM cannot infer a column type from them.
  // These columns must declare `type` explicitly.
  @Column({ type: 'varchar', nullable: true })
  name: string | null = null;

  @Column({ type: 'varchar', default: 'agent' })
  role: 'admin' | 'agent' = 'agent';

  @Column({ type: 'int', nullable: true })
  property_id: number | null = null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
