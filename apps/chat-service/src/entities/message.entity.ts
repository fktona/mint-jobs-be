import { Entity, Column, ManyToOne, JoinColumn, RelationId } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';
import { Conversation } from './conversation.entity';

export enum MessageType {
  TEXT = 'text',
  SYSTEM = 'system',
}

@Entity('messages')
export class Message extends BaseEntity {
  @ManyToOne(() => Conversation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @RelationId((m: Message) => m.conversation)
  conversationId: string;

  /** Privy DID of the sender; empty string for system messages */
  @Column({ name: 'sender_id', type: 'varchar', length: 255 })
  senderId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.TEXT,
  })
  type: MessageType;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;
}
