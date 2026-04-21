import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumerService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { ChatGateway } from './chat.gateway';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class GatewayPushHandler implements OnModuleInit {
  private readonly logger = new Logger(GatewayPushHandler.name);

  constructor(
    private readonly consumerService: ConsumerService,
    private readonly chatGateway: ChatGateway,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async onModuleInit() {
    await this.consumerService.subscribe(QueueName.GATEWAY_QUEUE, [
      MessagePattern.GATEWAY_PUSH_CHAT_MESSAGE,
      MessagePattern.GATEWAY_PUSH_CHAT_READ,
      MessagePattern.GATEWAY_PUSH_CHAT_CONVERSATION_CREATED,
      MessagePattern.GATEWAY_PUSH_CHAT_UNREAD_COUNT,
      MessagePattern.GATEWAY_PUSH_NOTIFICATION,
      MessagePattern.GATEWAY_PUSH_NOTIFICATION_UNREAD_COUNT,
    ]);

    this.consumerService.registerHandler(
      MessagePattern.GATEWAY_PUSH_CHAT_MESSAGE,
      (event: any) => {
        const { clientId, freelancerId, conversationId, message } = event.data ?? {};
        this.chatGateway.pushMessage(clientId, freelancerId, conversationId, message);
      },
    );

    this.consumerService.registerHandler(
      MessagePattern.GATEWAY_PUSH_CHAT_READ,
      (event: any) => {
        const { clientId, freelancerId, conversationId, readBy } = event.data ?? {};
        this.chatGateway.pushRead(clientId, freelancerId, conversationId, readBy);
      },
    );

    this.consumerService.registerHandler(
      MessagePattern.GATEWAY_PUSH_CHAT_CONVERSATION_CREATED,
      (event: any) => {
        const { conversation } = event.data ?? {};
        this.chatGateway.pushConversationCreated(conversation);
      },
    );

    this.consumerService.registerHandler(
      MessagePattern.GATEWAY_PUSH_CHAT_UNREAD_COUNT,
      (event: any) => {
        const { userId, count } = event.data ?? {};
        this.chatGateway.pushUnreadCount(userId, count);
      },
    );

    this.consumerService.registerHandler(
      MessagePattern.GATEWAY_PUSH_NOTIFICATION,
      (event: any) => {
        const { recipientId, notification } = event.data ?? {};
        this.notificationGateway.pushToUser(recipientId, notification);
      },
    );

    this.consumerService.registerHandler(
      MessagePattern.GATEWAY_PUSH_NOTIFICATION_UNREAD_COUNT,
      (event: any) => {
        const { userId, count } = event.data ?? {};
        this.notificationGateway.pushUnreadCount(userId, count);
      },
    );

    this.logger.log('Gateway push handlers registered');
  }
}
