import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('response_events')
@Index(['property_id', 'created_at'])
export class ResponseEvent {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column()
  property_id: number;

  @Column({ type: 'uuid' })
  user_id: string;

  // Client-computed stable hash of the conversation. No guest PII is stored.
  @Column({ type: 'varchar', length: 64 })
  conversation_hash: string;

  @Column({ type: 'timestamptz' })
  first_seen_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  replied_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
