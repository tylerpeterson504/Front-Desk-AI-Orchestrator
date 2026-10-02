import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Property } from './Property';

@Entity('templates')
export class Template {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column()
  user_id: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ nullable: true })
  property_id: number;

  @Column({ nullable: true, length: 100 })
  category: string | null;

  @Column({ nullable: true, type: 'text', array: true })
  tags: string[] | null;

  @Column({ default: false })
  is_global: boolean;

  @Column({ default: true })
  is_active: boolean;

  @Column({ default: 1 })
  version: number;

  @Column({ nullable: true, type: 'varchar', length: 50 })
  status: string | null; // 'draft', 'pending_approval', 'approved', 'archived'

  @Column({ nullable: true, type: 'uuid' })
  created_by: string | null;

  @Column({ nullable: true, type: 'uuid' })
  approved_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approved_at: Date | null;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({ default: 0 })
  usage_count: number;

  @ManyToOne(() => Property, (property) => property.id)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
