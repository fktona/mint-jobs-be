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

  /**
   * Tracks which (queue, pattern) bindings have already been registered via
   * addSetup. addSetup callbacks re-run on every reconnect — without this
   * guard a new channel.consume() call would be issued each time, creating
   * duplicate consumers.
   */
  private registeredQueues = new Set<string>();

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
   * Subscribe to a queue and consume messages.
   *
   * Safe to call multiple times for the same queue with additional patterns —
   * new bindings are added but a second channel.consume() is never registered.
   */
  async subscribe(
    queueName: QueueName,
    patterns: string[],
  ): Promise<void> {
    const channelWrapper = this.messagingService.getChannel();
    const exchange = this.messagingService.getExchange();

    const isFirstSetup = !this.registeredQueues.has(queueName);
    this.registeredQueues.add(queueName);

    await channelWrapper.addSetup(async (channel: Channel) => {
      // Assert queue — route rejected messages to the dead-letter exchange
      await channel.assertQueue(queueName, {
        durable: true,
        arguments: { 'x-dead-letter-exchange': 'mintjobs.dlx' },
      });

      // Bind queue to exchange for each pattern
      for (const pattern of patterns) {
        await channel.bindQueue(queueName, exchange, pattern);
      }

      // Only register a single consumer per queue — re-running addSetup on
      // reconnect re-asserts and re-binds (idempotent) but must NOT call
      // channel.consume() again or RabbitMQ will create a second consumer tag.
      if (isFirstSetup) {
        await channel.consume(
          queueName,
          async (msg: ConsumeMessage | null) => {
            if (!msg) {
              return;
            }

            try {
              const messageContent = JSON.parse(msg.content.toString());
              const event = {
                pattern: messageContent.pattern,
                data: messageContent.data || messageContent,
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
              channel.nack(msg, false, false);
            }
          },
          { noAck: false },
        );
      }

      this.logger.log(
        `${isFirstSetup ? 'Subscribed to' : 'Added bindings on'} queue ${queueName} with patterns: ${patterns.join(', ')}`,
      );
    });
  }
}
