import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Property } from './Property';

@Entity('templates')
export class Template {
  @PrimaryGeneratedColumn('increment')
  id: number;

  // Nullable in the database for the same reason as Property.user_id; existing
  // rows predate the column. See the AddMissingEntityColumns migration.
  @Column({ type: 'varchar', nullable: true })
  user_id: string | null;

  @Column()
  name: string;

  @Column({ type: 'text' })
  content: string;

  // Nullable union columns need an explicit `type`; see the note in User.ts.
  @Column({ type: 'int', nullable: true })
  property_id: number;

  @Column({ type: 'varchar', nullable: true, length: 100 })
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
