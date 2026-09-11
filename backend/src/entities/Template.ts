import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Property } from './Property';

@Entity('templates')
export class Template {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column()
  name: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ nullable: true })
  property_id: number;

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
