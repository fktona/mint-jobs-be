import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';
import { Message } from './message.entity';

@Entity('conversations')
@Index('UQ_conversation_client_freelancer', ['clientId', 'freelancerId'], { unique: true })
export class Conversation extends BaseEntity {
  @Column({ name: 'client_id', type: 'varchar', length: 255 })
  clientId: string; // Privy DID

  @Column({ name: 'freelancer_id', type: 'varchar', length: 255 })
  freelancerId: string; // Privy DID

  /** Optional job ID — populated when conversation is auto-created on hire */
  @Column({ name: 'job_id', type: 'varchar', length: 255, nullable: true })
  jobId?: string;

  @Column({ name: 'proposal_id', type: 'varchar', length: 255, nullable: true })
  proposalId?: string;

  @OneToMany(() => Message, (msg) => msg.conversation, { cascade: false })
  messages: Message[];
}
