import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('properties')
@Index(['name'])
export class Property {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column()
  user_id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  address: string | null;

  @Column({ nullable: true })
  checkout_time: string | null;

  @Column({ nullable: true })
  wifi_ssid: string | null;

  @Column({ nullable: true })
  wifi_password: string | null;

  @Column({ nullable: true, type: 'text' })
  tone_guidelines: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
