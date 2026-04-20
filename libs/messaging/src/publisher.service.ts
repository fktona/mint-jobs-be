import { Injectable, Logger } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagePattern } from '@mintjobs/constants';
import { BaseEvent } from '@mintjobs/types';

@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name);

  constructor(private messagingService: MessagingService) {}

  /**
   * Publish an event to RabbitMQ
   */
  async publish<T extends Record<string, unknown>>(
    pattern: MessagePattern,
    data: T,
    routingKey?: string,
  ): Promise<void> {
    try {
      const channel = this.messagingService.getChannel();
      const exchange = this.messagingService.getExchange();

      const event: BaseEvent = {
        pattern,
        data,
        timestamp: new Date(),
      };

      const message = Buffer.from(JSON.stringify(event));
      const key = routingKey || pattern;

      channel.publish(exchange, key, message, {
        persistent: true,
        timestamp: Date.now(),
      });

      this.logger.debug(`Published event: ${pattern}`, { pattern, data });
    } catch (error) {
      this.logger.error(`Failed to publish event: ${pattern}`, error);
      throw error;
    }
  }

  /**
   * Publish with correlation ID for distributed tracing
   */
  async publishWithCorrelation<T extends Record<string, unknown>>(
    pattern: MessagePattern,
    data: T,
    correlationId: string,
    routingKey?: string,
  ): Promise<void> {
    try {
      const channel = this.messagingService.getChannel();
      const exchange = this.messagingService.getExchange();

      const event: BaseEvent = {
        pattern,
        data,
        timestamp: new Date(),
        correlationId,
      };

      const message = Buffer.from(JSON.stringify(event));
      const key = routingKey || pattern;

      channel.publish(exchange, key, message, {
        persistent: true,
        timestamp: Date.now(),
        correlationId,
      });

      this.logger.debug(`Published event with correlation: ${pattern}`, {
        pattern,
        correlationId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to publish event with correlation: ${pattern}`,
        error,
      );
      throw error;
    }
  }
}
