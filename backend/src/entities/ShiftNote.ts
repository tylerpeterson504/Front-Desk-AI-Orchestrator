import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Property } from './Property';
import { User } from './User';

@Entity('shift_notes')
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
