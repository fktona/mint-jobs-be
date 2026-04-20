import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message, MessageType } from './entities/message.entity';
import { ChatGateway } from './chat.gateway';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
  ) {}

  // ─── Conversations ───────────────────────────────────────────────────────

  /**
   * Find an existing conversation between two parties, or create one.
   * If newly created, a system message is inserted and both parties are
   * notified via Socket.IO.
   */
  async findOrCreateConversation(
    clientId: string,
    freelancerId: string,
    jobId?: string,
    proposalId?: string,
  ): Promise<{ conversation: Conversation; created: boolean }> {
    const existing = await this.conversationRepo.findOne({
      where: { clientId, freelancerId },
    });

    if (existing) {
      return { conversation: existing, created: false };
    }

    const conversation = this.conversationRepo.create({
      clientId,
      freelancerId,
      jobId,
      proposalId,
    });
    await this.conversationRepo.save(conversation);

    // Welcome system message
    await this.insertSystemMessage(
      conversation,
      `You have been connected! You can now start chatting.`,
    );

    // Notify both parties in real time
    this.gateway.pushConversationCreated(conversation);

    this.logger.log(
      `Created conversation ${conversation.id} between client ${clientId} and freelancer ${freelancerId}`,
    );

    return { conversation, created: true };
  }

  /**
   * Return all conversations for a user (as either client or freelancer),
   * with the most recent message previewed.
   */
  async getConversations(userId: string) {
    const conversations = await this.conversationRepo
      .createQueryBuilder('c')
      .where('c.client_id = :userId OR c.freelancer_id = :userId', { userId })
      .andWhere('c.deleted_at IS NULL')
      .orderBy('c.updated_at', 'DESC')
      .getMany();

    if (conversations.length === 0) {
      return [];
    }

    const ids = conversations.map((c) => c.id);

    // Fetch latest message per conversation
    const latestMessages = await this.messageRepo
      .createQueryBuilder('m')
      .where('m.conversation_id IN (:...ids)', { ids })
      .andWhere(
        `m.created_at = (
          SELECT MAX(m2.created_at) FROM messages m2
          WHERE m2.conversation_id = m.conversation_id
          AND m2.deleted_at IS NULL
        )`,
      )
      .andWhere('m.deleted_at IS NULL')
      .getMany();

    const latestByConv = new Map(
      latestMessages.map((m) => [m.conversationId, m]),
    );

    return conversations.map((conv) => ({
      ...conv,
      latestMessage: latestByConv.get(conv.id) ?? null,
    }));
  }

  // ─── Messages ────────────────────────────────────────────────────────────

  async sendMessage(
    senderId: string,
    conversationId: string,
    content: string,
  ): Promise<Message> {
    const conversation = await this.getConversationForUser(
      conversationId,
      senderId,
    );

    const message = this.messageRepo.create({
      conversation,
      senderId,
      content,
      type: MessageType.TEXT,
    });

    const saved = await this.messageRepo.save(message);

    // Push message to both participants in real time
    this.gateway.pushMessage(
      conversation.clientId,
      conversation.freelancerId,
      conversationId,
      saved,
    );

    // Push updated unread count to the recipient only
    const recipientId =
      senderId === conversation.clientId
        ? conversation.freelancerId
        : conversation.clientId;
    const recipientUnread = await this.unreadCount(recipientId);
    this.gateway.pushUnreadCount(recipientId, recipientUnread);

    return saved;
  }

  async getMessages(
    userId: string,
    conversationId: string,
    page: number = 1,
    limit: number = 30,
  ) {
    await this.getConversationForUser(conversationId, userId);

    const [messages, total] = await this.messageRepo.findAndCount({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: messages.reverse(), // chronological order for the client
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async markRead(userId: string, conversationId: string): Promise<void> {
    const conversation = await this.getConversationForUser(
      conversationId,
      userId,
    );

    await this.messageRepo
      .createQueryBuilder()
      .update(Message)
      .set({ isRead: true })
      .where('conversation_id = :conversationId', { conversationId })
      .andWhere('sender_id != :userId', { userId })
      .andWhere('is_read = false')
      .execute();

    // Notify both sides so the sender sees the read receipt
    this.gateway.pushRead(
      conversation.clientId,
      conversation.freelancerId,
      conversationId,
      userId,
    );

    // Push updated total unread count to the reader
    const count = await this.unreadCount(userId);
    this.gateway.pushUnreadCount(userId, count);
  }

  /** Total unread messages across ALL conversations for a user */
  async unreadCount(userId: string): Promise<number> {
    return this.messageRepo
      .createQueryBuilder('m')
      .innerJoin(
        'conversations',
        'c',
        'c.id = m.conversation_id AND (c.client_id = :userId OR c.freelancer_id = :userId)',
        { userId },
      )
      .where('m.sender_id != :userId', { userId })
      .andWhere('m.is_read = false')
      .andWhere('m.deleted_at IS NULL')
      .andWhere('c.deleted_at IS NULL')
      .getCount();
  }

  // ─── Hire event handler ───────────────────────────────────────────────────

  /**
   * Called when a freelancer is hired (PROPOSAL_HIRED event).
   * Creates a conversation if one does not exist and sends system messages.
   */
  async handleHired(
    clientId: string,
    freelancerId: string,
    jobId: string,
    proposalId: string,
    jobTitle: string,
  ): Promise<void> {
    const { conversation } = await this.findOrCreateConversation(
      clientId,
      freelancerId,
      jobId,
      proposalId,
    );

    // Always drop a job-specific congratulations message
    const congrats = await this.insertSystemMessage(
      conversation,
      `Congratulations! You are now working together on "${jobTitle}".`,
    );

    // Push the system message to both parties in real time
    this.gateway.pushMessage(
      conversation.clientId,
      conversation.freelancerId,
      conversation.id,
      congrats,
    );

    this.logger.log(
      `PROPOSAL_HIRED: ensured conversation for client=${clientId} freelancer=${freelancerId} job=${jobId}`,
    );
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getConversationForUser(
    conversationId: string,
    userId: string,
  ): Promise<Conversation> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (
      conversation.clientId !== userId &&
      conversation.freelancerId !== userId
    ) {
      throw new ForbiddenException('Access denied to this conversation');
    }

    return conversation;
  }

  private async insertSystemMessage(
    conversation: Conversation,
    content: string,
  ): Promise<Message> {
    const msg = this.messageRepo.create({
      conversation,
      senderId: '',
      content,
      type: MessageType.SYSTEM,
      isRead: false,
    });
    return this.messageRepo.save(msg);
  }
}
