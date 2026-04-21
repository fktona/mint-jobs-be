import { Injectable, Logger, OnModuleInit, HttpException } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { RequestMessage, ResponseMessage } from '@mintjobs/types';
import { v4 as uuidv4 } from 'uuid';
import { ConsumeMessage } from 'amqplib';

interface PendingRequest {
  resolve: (value: ResponseMessage) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

@Injectable()
export class RequestResponseService implements OnModuleInit {
  private readonly logger = new Logger(RequestResponseService.name);
  private pendingRequests = new Map<string, PendingRequest>();
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private responseQueueSubscribed = false;
  private subscriptionPromise: Promise<void> | null = null;
  /** Per-instance queue name — unique suffix prevents response-stealing between scaled gateway replicas */
  private readonly instanceQueueName = `gateway.response.queue.${uuidv4()}`;

  constructor(private messagingService: MessagingService) {}

  async onModuleInit() {
    // Don't subscribe here - only subscribe when first request() is called
    // This way only API Gateway subscribes, not other services
  }

  /**
   * Send a request and wait for response (RPC pattern)
   */
  async request<TRequest = Record<string, unknown>, TResponse = unknown>(
    pattern: MessagePattern,
    data: TRequest,
    responsePattern: MessagePattern,
    queueName: QueueName,
    correlationId?: string,
    timeout: number = this.REQUEST_TIMEOUT,
  ): Promise<TResponse> {
    // Subscribe to response queue on first request (lazy initialization)
    // This ensures only API Gateway subscribes, not other services
    if (!this.responseQueueSubscribed) {
      if (!this.subscriptionPromise) {
        this.subscriptionPromise = this.subscribeToResponses();
      }
      await this.subscriptionPromise;
      this.responseQueueSubscribed = true;
    }

    const requestId = uuidv4();
    const request: RequestMessage<TRequest> = {
      pattern,
      data,
      requestId,
      correlationId,
      timestamp: new Date(),
    };

    return new Promise<TResponse>((resolve, reject) => {
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request timeout for pattern: ${pattern}`));
        }
      }, timeout);

      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve: (response: ResponseMessage) => {
          clearTimeout(timeoutHandle);
          this.pendingRequests.delete(requestId);
          if (response.success) {
            resolve(response.data as TResponse);
          } else {
            const statusCode = response.error?.statusCode || 500;
            const message = response.error?.message || 'Request failed';
            reject(new HttpException(message, statusCode));
          }
        },
        reject: (error: Error) => {
          clearTimeout(timeoutHandle);
          this.pendingRequests.delete(requestId);
          reject(error);
        },
        timeoutHandle,
      });

      // Publish request
      try {
        const channel = this.messagingService.getChannel();
        const exchange = this.messagingService.getExchange();
        const message = Buffer.from(JSON.stringify(request));

        channel.publish(exchange, pattern, message, {
          persistent: true,
          timestamp: Date.now(),
          correlationId: correlationId || requestId,
          replyTo: this.instanceQueueName,
          messageId: requestId,
        });

        this.logger.debug(`Sent request: ${pattern}`, { requestId, pattern });
      } catch (error) {
        this.logger.error(`Failed to publish request: ${pattern}`, error);
        this.pendingRequests.delete(requestId);
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  /**
   * Send a response back to the gateway
   */
  async respond(
    requestId: string,
    responsePattern: MessagePattern,
    data: unknown,
    success: boolean = true,
    error?: { message: string; code?: string; statusCode?: number },
  ): Promise<void> {
    const response: ResponseMessage = {
      pattern: responsePattern,
      requestId,
      success,
      data: success ? data : undefined,
      error: success ? undefined : error,
      timestamp: new Date(),
    };

    try {
      const channel = this.messagingService.getChannel();
      const exchange = this.messagingService.getExchange();
      const message = Buffer.from(JSON.stringify(response));

      channel.publish(exchange, responsePattern, message, {
        persistent: true,
        timestamp: Date.now(),
        correlationId: requestId,
        messageId: `${requestId}.response`,
      });

      this.logger.debug(`Sent response: ${responsePattern}`, { requestId });
    } catch (error) {
      this.logger.error(`Failed to send response: ${responsePattern}`, error);
      throw error;
    }
  }

  /**
   * Subscribe to response messages
   */
  private async subscribeToResponses(): Promise<void> {
    try {
      const channelWrapper = this.messagingService.getChannel();
      const exchange = this.messagingService.getExchange();
      const responseQueue = this.instanceQueueName;

      // autoDelete: true — queue is deleted when this process disconnects,
      // preventing orphaned queues from accumulating after restarts.
      // exclusive: false — lets amqp-connection-manager reconnect to it.
      await channelWrapper.assertQueue(responseQueue, {
        durable: false,
        autoDelete: true,
        exclusive: false,
      });

      // Bind to all response patterns
      const responsePatterns = [
        MessagePattern.USER_GET_AUTH_METHODS_RESPONSE,
        MessagePattern.USER_GET_ME_RESPONSE,
        MessagePattern.USER_GET_ME_WALLET_RESPONSE,
        MessagePattern.USER_GET_ALL_RESPONSE,
        MessagePattern.JOB_GET_ALL_RESPONSE,
        MessagePattern.JOB_GET_ONE_RESPONSE,
        MessagePattern.JOB_CREATE_RESPONSE,
        MessagePattern.JOB_GET_MY_JOBS_RESPONSE,
        MessagePattern.JOB_UPDATE_RESPONSE,
        MessagePattern.JOB_UPDATE_STATUS_RESPONSE,
        MessagePattern.JOB_SAVE_DRAFT_RESPONSE,
        MessagePattern.JOB_GET_DRAFTS_RESPONSE,
        MessagePattern.JOB_BOOKMARK_RESPONSE,
        MessagePattern.JOB_UNBOOKMARK_RESPONSE,
        MessagePattern.JOB_GET_BOOKMARKS_RESPONSE,
        MessagePattern.JOB_GET_CLIENT_STATS_RESPONSE,
        MessagePattern.PROPOSAL_CREATE_RESPONSE,
        MessagePattern.PROPOSAL_GET_MY_RESPONSE,
        MessagePattern.PROPOSAL_GET_BY_JOB_RESPONSE,
        MessagePattern.PROPOSAL_GET_ONE_RESPONSE,
        MessagePattern.PROPOSAL_GET_BY_CLIENT_RESPONSE,
        MessagePattern.PROPOSAL_UPDATE_STATUS_RESPONSE,
        MessagePattern.PROPOSAL_GET_FREELANCER_STATS_RESPONSE,
        MessagePattern.PROPOSAL_COUNT_BY_JOB_RESPONSE,
        MessagePattern.FREELANCER_PROFILE_CREATE_RESPONSE,
        MessagePattern.FREELANCER_PROFILE_UPDATE_RESPONSE,
        MessagePattern.FREELANCER_PROFILE_GET_ME_RESPONSE,
        MessagePattern.FREELANCER_PROFILE_GET_BY_USER_RESPONSE,
        MessagePattern.FREELANCER_PROFILE_GET_BATCH_RESPONSE,
        MessagePattern.CLIENT_PROFILE_CREATE_RESPONSE,
        MessagePattern.CLIENT_PROFILE_UPDATE_RESPONSE,
        MessagePattern.CLIENT_PROFILE_GET_ME_RESPONSE,
        MessagePattern.CLIENT_PROFILE_GET_BY_USER_RESPONSE,
        MessagePattern.CONTRACT_GET_BY_PROPOSAL_RESPONSE,
        MessagePattern.CONTRACT_GET_ONE_RESPONSE,
        MessagePattern.CONTRACT_GET_MY_RESPONSE,
        MessagePattern.ESCROW_FUND_RESPONSE,
        MessagePattern.ESCROW_TOPUP_RESPONSE,
        MessagePattern.ESCROW_WITHDRAW_RESPONSE,
        MessagePattern.ESCROW_RELEASE_RESPONSE,
        MessagePattern.ESCROW_REFUND_RESPONSE,
        MessagePattern.ESCROW_GET_RESPONSE,
        MessagePattern.ESCROW_CONFIRM_RESPONSE,
        MessagePattern.MILESTONE_CREATE_RESPONSE,
        MessagePattern.MILESTONE_GET_BY_JOB_RESPONSE,
        MessagePattern.MILESTONE_GET_ONE_RESPONSE,
        MessagePattern.ESCROW_MILESTONE_FUND_RESPONSE,
        MessagePattern.ESCROW_MILESTONE_WITHDRAW_RESPONSE,
        MessagePattern.ESCROW_MILESTONE_RELEASE_RESPONSE,
        MessagePattern.ESCROW_MILESTONE_REFUND_RESPONSE,
        MessagePattern.ESCROW_MILESTONE_CONFIRM_RESPONSE,
        MessagePattern.ESCROW_MILESTONE_TOPUP_RESPONSE,
        MessagePattern.ESCROW_WITHDRAW_FEES_RESPONSE,
        MessagePattern.ESCROW_GET_FEE_BALANCE_RESPONSE,
        MessagePattern.PROPOSAL_ACCEPT_RESPONSE,
        MessagePattern.ONCHAIN_CONTRACT_CREATE_RESPONSE,
        MessagePattern.ONCHAIN_CONTRACT_GET_RESPONSE,
        MessagePattern.ONCHAIN_CONTRACT_COMPLETE_RESPONSE,
        MessagePattern.CHAT_SEND_MESSAGE_RESPONSE,
        MessagePattern.CHAT_GET_CONVERSATIONS_RESPONSE,
        MessagePattern.CHAT_GET_MESSAGES_RESPONSE,
        MessagePattern.CHAT_MARK_READ_RESPONSE,
        MessagePattern.CHAT_UNREAD_COUNT_RESPONSE,
        MessagePattern.NOTIFICATION_GET_RESPONSE,
        MessagePattern.NOTIFICATION_MARK_READ_RESPONSE,
        MessagePattern.NOTIFICATION_MARK_ALL_READ_RESPONSE,
        MessagePattern.NOTIFICATION_UNREAD_COUNT_RESPONSE,
      ];

      for (const pattern of responsePatterns) {
        await channelWrapper.bindQueue(responseQueue, exchange, pattern);
      }

      // Consume responses - capture channelWrapper for ack
      const channelForAck = channelWrapper;
      await channelWrapper.consume(
        responseQueue,
        async (msg: ConsumeMessage | null) => {
          if (!msg) {
            return;
          }

          try {
            const response: ResponseMessage = JSON.parse(
              msg.content.toString(),
            );
            const pending = this.pendingRequests.get(response.requestId);

            if (pending) {
              pending.resolve(response);
              this.pendingRequests.delete(response.requestId);
            } else {
              this.logger.warn(
                `Received response for unknown request: ${response.requestId}`,
              );
            }

            await channelForAck.ack(msg);
          } catch (error) {
            this.logger.error('Error processing response message', error);
            await channelForAck.nack(msg, false, false);
          }
        },
        { noAck: false },
      );

      this.logger.log('Subscribed to response queue');
    } catch (error) {
      this.logger.error('Failed to subscribe to response queue', error);
      throw error;
    }
  }
}
