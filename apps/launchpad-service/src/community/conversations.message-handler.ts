import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumerService, RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { ConversationsService } from './conversations.service';

@Injectable()
export class ConversationsMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(ConversationsMessageHandler.name);

  constructor(
    private readonly consumerService: ConsumerService,
    private readonly requestResponseService: RequestResponseService,
    private readonly conversationsService: ConversationsService,
  ) {}

  async onModuleInit() {
    await this.consumerService.subscribe(QueueName.LAUNCHPAD_QUEUE, [
      MessagePattern.LAUNCHPAD_CONVERSATIONS,
    ]);

    this.consumerService.registerHandler(
      MessagePattern.LAUNCHPAD_CONVERSATIONS,
      this.handleGetConversations.bind(this),
    );

    this.logger.log('Conversations message handler registered');
  }

  private async handleGetConversations(event: any) {
    try {
      const { walletAddress } = event.data as { walletAddress: string };
      const result = await this.conversationsService.getConversations(walletAddress);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.LAUNCHPAD_CONVERSATIONS_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error getting conversations', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.LAUNCHPAD_CONVERSATIONS_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get conversations', statusCode: error.status || 500 },
      );
    }
  }
}
