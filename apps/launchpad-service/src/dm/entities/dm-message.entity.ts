import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';

@Entity('dm_messages')
export class DmMessage extends BaseEntity {
  @Index()
  @Column({ name: 'sender_wallet', type: 'varchar', length: 255 })
  senderWallet: string;

  @Index()
  @Column({ name: 'recipient_wallet', type: 'varchar', length: 255 })
  recipientWallet: string;

  @Column({ name: 'content', type: 'text' })
  content: string;
}
