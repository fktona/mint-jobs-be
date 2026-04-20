import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumerService, RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { ChatService } from './chat.service';

@Injectable()
export class ChatMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(ChatMessageHandler.name);

  constructor(
    private readonly consumerService: ConsumerService,
    private readonly requestResponseService: RequestResponseService,
    private readonly chatService: ChatService,
  ) {}

  async onModuleInit() {
    // RPC patterns
    await this.consumerService.subscribe(QueueName.CHAT_QUEUE, [
      MessagePattern.CHAT_SEND_MESSAGE,
      MessagePattern.CHAT_GET_CONVERSATIONS,
      MessagePattern.CHAT_GET_MESSAGES,
      MessagePattern.CHAT_MARK_READ,
      MessagePattern.CHAT_UNREAD_COUNT,
    ]);

    // Fan-out: receive PROPOSAL_HIRED just like escrow-service does
    await this.consumerService.subscribe(QueueName.CHAT_QUEUE, [
      MessagePattern.PROPOSAL_HIRED,
    ]);

    this.consumerService.registerHandler(
      MessagePattern.CHAT_SEND_MESSAGE,
      this.handleSendMessage.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.CHAT_GET_CONVERSATIONS,
      this.handleGetConversations.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.CHAT_GET_MESSAGES,
      this.handleGetMessages.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.CHAT_MARK_READ,
      this.handleMarkRead.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.CHAT_UNREAD_COUNT,
      this.handleUnreadCount.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.PROPOSAL_HIRED,
      this.handleHiredInit.bind(this),
    );

    this.logger.log('Chat message handlers registered');
  }

  private async handleSendMessage(event: any) {
    try {
      const { senderId, conversationId, content } = event.data as any;
      const message = await this.chatService.sendMessage(
        senderId,
        conversationId,
        content,
      );
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CHAT_SEND_MESSAGE_RESPONSE,
        message,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling send message', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CHAT_SEND_MESSAGE_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to send message', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGetConversations(event: any) {
    try {
      const { userId } = event.data as any;
      const conversations = await this.chatService.getConversations(userId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CHAT_GET_CONVERSATIONS_RESPONSE,
        conversations,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get conversations', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CHAT_GET_CONVERSATIONS_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get conversations', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGetMessages(event: any) {
    try {
      const { userId, conversationId, page, limit } = event.data as any;
      const result = await this.chatService.getMessages(
        userId,
        conversationId,
        page,
        limit,
      );
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CHAT_GET_MESSAGES_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get messages', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CHAT_GET_MESSAGES_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get messages', statusCode: error.status || 500 },
      );
    }
  }

  private async handleMarkRead(event: any) {
    try {
      const { userId, conversationId } = event.data as any;
      await this.chatService.markRead(userId, conversationId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CHAT_MARK_READ_RESPONSE,
        { success: true },
        true,
      );
    } catch (error) {
      this.logger.error('Error handling mark read', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CHAT_MARK_READ_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to mark messages as read', statusCode: error.status || 500 },
      );
    }
  }

  private async handleUnreadCount(event: any) {
    try {
      const { userId } = event.data as any;
      const count = await this.chatService.unreadCount(userId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CHAT_UNREAD_COUNT_RESPONSE,
        { count },
        true,
      );
    } catch (error) {
      this.logger.error('Error handling unread count', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CHAT_UNREAD_COUNT_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get unread count', statusCode: 500 },
      );
    }
  }

  /** Fire-and-forget — no RPC response needed */
  private async handleHiredInit(event: any): Promise<void> {
    const { clientId, freelancerId, jobId, proposalId, jobTitle } =
      event.data ?? {};
    if (!clientId || !freelancerId) {
      this.logger.warn('PROPOSAL_HIRED missing clientId or freelancerId', event.data);
      return;
    }
    try {
      await this.chatService.handleHired(
        clientId,
        freelancerId,
        jobId ?? null,
        proposalId ?? null,
        jobTitle ?? 'this job',
      );
    } catch (err) {
      this.logger.error('Error handling PROPOSAL_HIRED in chat service', err);
    }
  }
}
