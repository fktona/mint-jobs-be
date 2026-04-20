import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { QueueName } from '@mintjobs/constants';
import { BaseEvent } from '@mintjobs/types';
import { ConsumeMessage, Channel } from 'amqplib';

export type EventHandler = (event: BaseEvent) => Promise<void> | void;

@Injectable()
export class ConsumerService implements OnModuleInit {
  private readonly logger = new Logger(ConsumerService.name);
  private handlers: Map<string, EventHandler[]> = new Map();

  constructor(
    private messagingService: MessagingService,
  ) {}

  async onModuleInit() {
    // Consumer setup will be done per service
  }

  /**
   * Register an event handler
   */
  registerHandler(pattern: string, handler: EventHandler): void {
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, []);
    }
    this.handlers.get(pattern)!.push(handler);
  }

  /**
   * Subscribe to a queue and consume messages
   */
  async subscribe(
    queueName: QueueName,
    patterns: string[],
  ): Promise<void> {
    const channelWrapper = this.messagingService.getChannel();
    const exchange = this.messagingService.getExchange();

    // Use addSetup to ensure channel is ready before consuming
    // This ensures the setup runs when channel is ready and re-runs on reconnection
    await channelWrapper.addSetup(async (channel: Channel) => {
      // Assert queue
      await channel.assertQueue(queueName, {
        durable: true,
      });

      // Bind queue to exchange for each pattern
      for (const pattern of patterns) {
        await channel.bindQueue(queueName, exchange, pattern);
      }

      // Consume messages
      await channel.consume(
        queueName,
        async (msg: ConsumeMessage | null) => {
          if (!msg) {
            return;
          }

          try {
            const messageContent = JSON.parse(msg.content.toString());
            // Handle both BaseEvent and RequestMessage formats
            const event = {
              pattern: messageContent.pattern,
              data: messageContent.data || messageContent, // Support both formats
              timestamp: messageContent.timestamp,
              correlationId: messageContent.correlationId || msg.properties.correlationId,
              requestId: messageContent.requestId,
            };
            
            const handlers = this.handlers.get(event.pattern) || [];

            for (const handler of handlers) {
              await handler(event);
            }

            channel.ack(msg);
          } catch (error) {
            this.logger.error(
              `Error processing message from queue ${queueName}`,
              error,
            );
            channel.nack(msg, false, false); // Reject and don't requeue
          }
        },
        { noAck: false },
      );

      this.logger.log(
        `Subscribed to queue ${queueName} with patterns: ${patterns.join(', ')}`,
      );
    });
  }
}
