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

  @ManyToOne(() => Property, (property) => property.id)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
