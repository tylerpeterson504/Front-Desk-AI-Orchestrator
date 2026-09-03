import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('users')
@Index(['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  password_hash!: string;

  @Column({ nullable: true })
  name!: string;

  @Column({ default: 'agent' })
  role: 'admin' | 'agent' = 'agent';

  @Column({ nullable: true })
  property_id: number | null = null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
