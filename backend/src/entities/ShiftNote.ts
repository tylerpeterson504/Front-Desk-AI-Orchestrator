import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Property } from './Property';
import { User } from './User';

@Entity('shift_notes')
@Index(['property_id', 'shift_date'])
@Index(['user_id', 'shift_date'])
export class ShiftNote {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column()
  property_id: number;

  @Column()
  user_id: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'date' })
  shift_date: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  shift_type: string | null; // 'morning', 'afternoon', 'evening', 'night'

  @Column({ type: 'time', nullable: true })
  start_time: string | null;

  @Column({ type: 'time', nullable: true })
  end_time: string | null;

  @Column({ default: false })
  is_complete: boolean;

  @Column({ type: 'jsonb', nullable: true })
  tasks: Array<{
    id: string;
    description: string;
    completed: boolean;
    completed_at?: string;
    assigned_to?: string;
  }> | null;

  @Column({ type: 'jsonb', nullable: true })
  handover_checklist: Array<{
    id: string;
    item: string;
    completed: boolean;
    completed_at?: string;
    notes?: string;
  }> | null;

  @Column({ type: 'text', nullable: true })
  handover_notes: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  status: string | null; // 'draft', 'in_progress', 'completed', 'handed_over'

  @Column({ type: 'numeric', nullable: true })
  performance_score: number | null; // 1-5 rating

  @Column({ type: 'text', nullable: true })
  performance_notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  handed_over_to: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  handed_over_at: Date | null;

  @ManyToOne(() => Property, (property) => property.id)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
