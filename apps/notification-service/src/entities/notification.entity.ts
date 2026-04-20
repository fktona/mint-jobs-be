import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';

export enum NotificationType {
  // Proposal-related
  PROPOSAL_RECEIVED = 'proposal.received',      // client: got a new application
  PROPOSAL_ACCEPTED = 'proposal.accepted',      // freelancer: client offered them the job
  PROPOSAL_HIRED = 'proposal.hired',            // freelancer: officially hired
  PROPOSAL_STATUS_CHANGED = 'proposal.status.changed',

  // Job-related
  JOB_CREATED = 'job.created',
  JOB_UPDATED = 'job.updated',

  // Escrow / payment
  ESCROW_FUNDED = 'escrow.funded',
  ESCROW_LOCKED = 'escrow.locked',
  ESCROW_RELEASED = 'escrow.released',
  ESCROW_REFUNDED = 'escrow.refunded',

  // Contract
  CONTRACT_CREATED = 'contract.created',
  CONTRACT_COMPLETED = 'contract.completed',

  // Chat
  CHAT_MESSAGE = 'chat.message',

  // System
  SYSTEM = 'system',
}

@Entity('notifications')
@Index(['recipientId', 'isRead'])
@Index(['recipientId', 'createdAt'])
export class Notification extends BaseEntity {
  /** Privy DID of the user who should receive this notification */
  @Column({ name: 'recipient_id', type: 'varchar', length: 255 })
  recipientId: string;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** Optional deep-link data for routing on the frontend */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;
}
