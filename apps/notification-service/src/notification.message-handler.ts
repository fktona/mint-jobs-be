import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumerService, RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { NotificationType } from './entities/notification.entity';

@Injectable()
export class NotificationMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(NotificationMessageHandler.name);

  constructor(
    private readonly consumerService: ConsumerService,
    private readonly requestResponseService: RequestResponseService,
    private readonly notificationService: NotificationService,
    private readonly gateway: NotificationGateway,
  ) {}

  async onModuleInit() {
    // RPC patterns (read, mark-read, count)
    await this.consumerService.subscribe(QueueName.NOTIFICATION_QUEUE, [
      MessagePattern.NOTIFICATION_GET,
      MessagePattern.NOTIFICATION_MARK_READ,
      MessagePattern.NOTIFICATION_MARK_ALL_READ,
      MessagePattern.NOTIFICATION_UNREAD_COUNT,
    ]);

    // Fan-out domain events
    await this.consumerService.subscribe(QueueName.NOTIFICATION_QUEUE, [
      MessagePattern.PROPOSAL_HIRED,        // both parties signed → notify both
      MessagePattern.ESCROW_FUNDED,         // client funded → (no-op here, used by handler)
      MessagePattern.ESCROW_RELEASED,       // payment sent to freelancer
      MessagePattern.ESCROW_REFUNDED,       // funds returned to client
      MessagePattern.NOTIFICATION_SEND,     // generic send from any service
    ]);

    // RPC handlers
    this.consumerService.registerHandler(
      MessagePattern.NOTIFICATION_GET,
      this.handleGet.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.NOTIFICATION_MARK_READ,
      this.handleMarkRead.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.NOTIFICATION_MARK_ALL_READ,
      this.handleMarkAllRead.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.NOTIFICATION_UNREAD_COUNT,
      this.handleUnreadCount.bind(this),
    );

    // Domain event handlers
    this.consumerService.registerHandler(
      MessagePattern.PROPOSAL_HIRED,
      this.handleProposalHired.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.ESCROW_FUNDED,
      this.handleEscrowFunded.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.ESCROW_RELEASED,
      this.handleEscrowReleased.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.ESCROW_REFUNDED,
      this.handleEscrowRefunded.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.NOTIFICATION_SEND,
      this.handleGenericSend.bind(this),
    );

    this.logger.log('Notification message handlers registered');
  }

  // ─── RPC handlers ────────────────────────────────────────────────────────

  private async handleGet(event: any) {
    try {
      const { userId, page, limit } = event.data as any;
      const result = await this.notificationService.findForUser(userId, page, limit);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.NOTIFICATION_GET_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.NOTIFICATION_GET_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get notifications', statusCode: 500 },
      );
    }
  }

  private async handleMarkRead(event: any) {
    try {
      const { notificationId, userId } = event.data as any;
      await this.notificationService.markRead(notificationId, userId);

      const unread = await this.notificationService.unreadCount(userId);
      this.gateway.pushUnreadCount(userId, unread);

      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.NOTIFICATION_MARK_READ_RESPONSE,
        { success: true },
        true,
      );
    } catch (error) {
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.NOTIFICATION_MARK_READ_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to mark notification as read', statusCode: 500 },
      );
    }
  }

  private async handleMarkAllRead(event: any) {
    try {
      const { userId } = event.data as any;
      await this.notificationService.markAllRead(userId);
      this.gateway.pushUnreadCount(userId, 0);

      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.NOTIFICATION_MARK_ALL_READ_RESPONSE,
        { success: true },
        true,
      );
    } catch (error) {
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.NOTIFICATION_MARK_ALL_READ_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to mark all as read', statusCode: 500 },
      );
    }
  }

  private async handleUnreadCount(event: any) {
    try {
      const { userId } = event.data as any;
      const count = await this.notificationService.unreadCount(userId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.NOTIFICATION_UNREAD_COUNT_RESPONSE,
        { count },
        true,
      );
    } catch (error) {
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.NOTIFICATION_UNREAD_COUNT_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get unread count', statusCode: 500 },
      );
    }
  }

  // ─── Domain event handlers ────────────────────────────────────────────────

  /** Both parties signed → notify freelancer they're hired */
  private async handleProposalHired(event: any) {
    const { applicantId, jobId, jobTitle, clientId } = event.data ?? {};
    if (!applicantId) return;

    await Promise.all([
      // Notify freelancer
      this.send({
        recipientId: applicantId,
        type: NotificationType.PROPOSAL_HIRED,
        title: "You've been hired!",
        body: `Congratulations! You are now working on${jobTitle ? ` "${jobTitle}"` : ' a new job'}.`,
        metadata: { jobId, clientId },
      }),
      // Notify client
      clientId
        ? this.send({
            recipientId: clientId,
            type: NotificationType.PROPOSAL_HIRED,
            title: 'Freelancer accepted the offer',
            body: `Your freelancer has accepted the offer${jobTitle ? ` for "${jobTitle}"` : ''}.`,
            metadata: { jobId, applicantId },
          })
        : Promise.resolve(),
    ]);
  }

  /** Escrow funded → notify client (confirmation) */
  private async handleEscrowFunded(event: any) {
    const { clientId, jobId, amountLamports } = event.data ?? {};
    if (!clientId) return;
    const sol = amountLamports
      ? `${(Number(BigInt(String(amountLamports))) / 1_000_000_000).toFixed(2)} SOL`
      : 'Funds';
    await this.send({
      recipientId: clientId,
      type: NotificationType.ESCROW_FUNDED,
      title: 'Escrow funded',
      body: `${sol} have been securely placed in escrow.`,
      metadata: { jobId, amountLamports },
    });
  }

  /** Escrow released → notify freelancer */
  private async handleEscrowReleased(event: any) {
    const { freelancerId, jobId, amountLamports } = event.data ?? {};
    if (!freelancerId) return;
    const sol = amountLamports
      ? `${(Number(BigInt(String(amountLamports))) / 1_000_000_000).toFixed(2)} SOL`
      : 'Funds';
    await this.send({
      recipientId: freelancerId,
      type: NotificationType.ESCROW_RELEASED,
      title: 'Payment released!',
      body: `${sol} have been released to your wallet.`,
      metadata: { jobId, amountLamports },
    });
  }

  /** Escrow refunded → notify client */
  private async handleEscrowRefunded(event: any) {
    const { clientId, jobId, amountLamports } = event.data ?? {};
    if (!clientId) return;
    const sol = amountLamports
      ? `${(Number(BigInt(String(amountLamports))) / 1_000_000_000).toFixed(2)} SOL`
      : 'Funds';
    await this.send({
      recipientId: clientId,
      type: NotificationType.ESCROW_REFUNDED,
      title: 'Escrow refunded',
      body: `${sol} have been returned to your wallet.`,
      metadata: { jobId, amountLamports },
    });
  }

  /** Generic NOTIFICATION_SEND from any service */
  private async handleGenericSend(event: any) {
    const { recipientId, type, title, body, metadata } = event.data ?? {};
    if (!recipientId || !title) return;
    await this.send({
      recipientId,
      type: type ?? NotificationType.SYSTEM,
      title,
      body: body ?? '',
      metadata,
    });
  }

  // ─── Helper ───────────────────────────────────────────────────────────────

  private async send(dto: {
    recipientId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Record<string, any>;
  }) {
    try {
      const notification = await this.notificationService.create(dto);
      this.gateway.pushToUser(dto.recipientId, notification);

      const unread = await this.notificationService.unreadCount(dto.recipientId);
      this.gateway.pushUnreadCount(dto.recipientId, unread);
    } catch (err) {
      this.logger.error(`Failed to send notification to ${dto.recipientId}`, err);
    }
  }
}
