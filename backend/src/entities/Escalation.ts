import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Property } from './Property';
import { User } from './User';

export const ESCALATION_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type EscalationPriority = typeof ESCALATION_PRIORITIES[number];

export const ESCALATION_STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'escalated'] as const;
export type EscalationStatus = typeof ESCALATION_STATUSES[number];

export const ESCALATION_CATEGORIES = ['guest_complaint', 'maintenance', 'housekeeping', 'billing', 'security', 'technical', 'other'] as const;
export type EscalationCategory = typeof ESCALATION_CATEGORIES[number];

@Entity('escalations')
export class Escalation {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column()
  property_id: number;

  @Column({ type: 'uuid' })
  created_by: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  guest_name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  room_number: string | null;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'varchar', length: 20, default: 'normal' })
  priority: string;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  assigned_to: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  subcategory: string | null;

  @Column({ type: 'uuid', nullable: true })
  assigned_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  assigned_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  started_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolved_at: Date | null;

  @Column({ type: 'numeric', nullable: true })
  sla_minutes: number | null;

  @Column({ type: 'text', nullable: true })
  resolution_notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  resolved_by: string | null;

  @Column({ type: 'jsonb', nullable: true })
  resolution_template: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  escalated_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  escalated_by: string | null;

  @Column({ type: 'text', nullable: true })
  escalation_notes: string | null;

  @ManyToOne(() => Property, (property) => property.id)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'assigned_to' })
  assignedTo: User | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
