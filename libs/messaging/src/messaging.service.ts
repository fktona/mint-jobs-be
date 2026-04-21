import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@mintjobs/config';
import { Channel } from 'amqplib';
import { connect as connectManager, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';

@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private connectionManager: AmqpConnectionManager;
  private channel: ChannelWrapper;
  private reconnectAttempts = 0;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    const config = this.configService.rabbitmq;

    try {
      this.connectionManager = connectManager([config.url], {
        reconnectTimeInSeconds: config.reconnectDelay / 1000,
      });

      this.connectionManager.on('connect', () => {
        this.logger.log('Connected to RabbitMQ');
        this.reconnectAttempts = 0;
      });

      this.connectionManager.on('disconnect', (err: Error) => {
        this.logger.warn('Disconnected from RabbitMQ', err);
      });

      // Create channel wrapper
      this.channel = this.connectionManager.createChannel({
        setup: async (channel: Channel) => {
          // Set prefetch count
          await channel.prefetch(config.prefetchCount);
          // Assert main exchange
          await channel.assertExchange(config.exchange, 'topic', { durable: true });
          // Assert dead-letter exchange + queue so failed messages are retained
          await channel.assertExchange('mintjobs.dlx', 'fanout', { durable: true });
          await channel.assertQueue('mintjobs.dlq', { durable: true });
          await channel.bindQueue('mintjobs.dlq', 'mintjobs.dlx', '#');
          this.logger.log('RabbitMQ exchange asserted and prefetch set');
        },
      });

      this.logger.log('RabbitMQ messaging service initialized');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ', error);
      this.reconnectAttempts++;

      if (this.reconnectAttempts < config.maxReconnectAttempts) {
        setTimeout(() => this.connect(), config.reconnectDelay);
      } else {
        throw new Error('Max reconnection attempts reached');
      }
    }
  }

  private async disconnect(): Promise<void> {
    try {
      if (this.channel && typeof (this.channel as any).close === 'function') {
        await (this.channel as any).close();
      }
      if (this.connectionManager) {
        await this.connectionManager.close();
      }
      this.logger.log('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error('Error disconnecting from RabbitMQ', error);
    }
  }

  getChannel(): ChannelWrapper {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }
    return this.channel;
  }

  getExchange(): string {
    return this.configService.rabbitmq.exchange;
  }
}
