import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { Property } from './Property';

@Entity('property_groups')
@Index(['name'])
@Index(['user_id'])
export class PropertyGroup {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column()
  user_id: string;

  @Column()
  name: string;

  @Column({ nullable: true, length: 500 })
  description: string | null;

  @Column({ type: 'jsonb', nullable: true })
  settings: {
    default_branding?: {
      logo_url?: string;
      primary_color?: string;
      secondary_color?: string;
    };
    default_settings?: {
      tone_guidelines?: string;
      checkout_time?: string;
      checkin_time?: string;
    };
  } | null;

  @Column({ default: true })
  is_active: boolean;

  @Column({ nullable: true, length: 20 })
  region: string | null;

  @OneToMany(() => Property, (property) => property.group)
  properties: Property[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}