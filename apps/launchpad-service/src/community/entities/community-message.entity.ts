import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';

@Entity('community_messages')
export class CommunityMessage extends BaseEntity {
  @Index()
  @Column({ name: 'ca', type: 'varchar', length: 255 })
  ca: string; // community token ca

  /** Wallet address of the sender (no auth required) */
  @Column({ name: 'sender_wallet', type: 'varchar', length: 255 })
  senderWallet: string;

  @Column({ name: 'content', type: 'text' })
  content: string;
}
