import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';
import { Message } from './message.entity';

@Entity('conversations')
export class Conversation extends BaseEntity {
  @Column({ name: 'client_id', type: 'varchar', length: 255 })
  clientId: string; // Privy DID

  @Column({ name: 'freelancer_id', type: 'varchar', length: 255 })
  freelancerId: string; // Privy DID

  /** Optional context link — populated when conversation is auto-created on hire */
  @Column({ name: 'job_id', type: 'varchar', length: 255, nullable: true })
  jobId?: string;

  @Column({ name: 'proposal_id', type: 'varchar', length: 255, nullable: true })
  proposalId?: string;

  @OneToMany(() => Message, (msg) => msg.conversation, { cascade: false })
  messages: Message[];
}
