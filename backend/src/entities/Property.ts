import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { PropertyGroup } from './PropertyGroup';

@Entity('properties')
@Index(['name'])
@Index(['user_id'])
@Index(['group_id'])
export class Property {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column()
  user_id: string;

  @Column()
  name: string;

  @Column({ nullable: true, length: 100 })
  display_name: string | null;

  @Column({ nullable: true, length: 10 })
  code: string | null;

  @Column({ nullable: true })
  group_id: number | null;

  @Column({ nullable: true })
  address: string | null;

  @Column({ nullable: true })
  city: string | null;

  @Column({ nullable: true, length: 20 })
  region: string | null;

  @Column({ nullable: true, length: 10 })
  timezone: string | null;

  @Column({ nullable: true, length: 10 })
  currency: string | null;

  @Column({ nullable: true })
  checkout_time: string | null;

  @Column({ nullable: true })
  checkin_time: string | null;

  @Column({ nullable: true })
  wifi_ssid: string | null;

  @Column({ nullable: true })
  wifi_password: string | null;

  @Column({ nullable: true, type: 'text' })
  tone_guidelines: string | null;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'jsonb', nullable: true })
  branding: {
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
    font_family?: string;
    custom_css?: string;
  } | null;

  @Column({ type: 'jsonb', nullable: true })
  settings: {
    default_tone?: string;
    auto_assign_escalations?: boolean;
    default_shift_duration?: number;
    enable_handover_checklist?: boolean;
    notification_settings?: {
      email?: boolean;
      sms?: boolean;
      push?: boolean;
    };
  } | null;

  @Column({ type: 'jsonb', nullable: true })
  dashboard_widgets: Array<{
    id: string;
    type: string; // 'metrics', 'chart', 'list', 'custom'
    title: string;
    position: { row: number; col: number; sizeX: number; sizeY: number };
    config: Record<string, unknown>;
    is_visible: boolean;
  }> | null;

  @Column({ type: 'jsonb', nullable: true })
  performance_metrics: {
    last_30_days?: {
      avg_response_time?: number;
      guest_satisfaction?: number;
      escalation_rate?: number;
      task_completion_rate?: number;
    };
    all_time?: {
      total_shifts?: number;
      total_escalations?: number;
      total_guests?: number;
    };
  } | null;

  @Column({ type: 'numeric', nullable: true })
  star_rating: number | null;

  @Column({ nullable: true, length: 500 })
  description: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  website_url: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone_number: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  email: string | null;

  @Column({ type: 'jsonb', nullable: true })
  social_media: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
  } | null;

  @ManyToOne(() => PropertyGroup, (group) => group.id)
  @JoinColumn({ name: 'group_id' })
  group: PropertyGroup | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
