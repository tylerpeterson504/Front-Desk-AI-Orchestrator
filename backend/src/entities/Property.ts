import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('properties')
@Index(['name'])
export class Property {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  checkout_time: string;

  @Column({ nullable: true })
  wifi_ssid: string;

  @Column({ nullable: true })
  wifi_password: string;

  @Column({ nullable: true, type: 'text' })
  tone_guidelines: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
