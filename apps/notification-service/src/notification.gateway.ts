import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrivyService } from '@mintjobs/privy';
import { CORS_ORIGINS } from '@mintjobs/constants';
import { Notification } from './entities/notification.entity';

@WebSocketGateway({
  cors: {
    origin: CORS_ORIGINS,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  /** userId → Set of socket IDs */
  private userSockets = new Map<string, Set<string>>();

  constructor(private readonly privyService: PrivyService) {}

  afterInit() {
    this.logger.log('Notification WebSocket gateway initialized');
  }

  async handleConnection(client: Socket) {
    const token =
      (client.handshake.query?.token as string) ||
      client.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      this.logger.warn(`Client ${client.id} connected without token — disconnecting`);
      client.disconnect(true);
      return;
    }

    try {
      const claims = await this.privyService.verifyAccessToken(token);
      const userId = claims.userId;

      // Attach userId to socket data for later reference
      client.data.userId = userId;

      // Join personal room
      await client.join(`user:${userId}`);

      // Track socket
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      this.logger.log(`User ${userId} connected (socket ${client.id})`);
    } catch {
      this.logger.warn(`Client ${client.id} failed auth — disconnecting`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId as string | undefined;
    if (userId) {
      this.userSockets.get(userId)?.delete(client.id);
      if (this.userSockets.get(userId)?.size === 0) {
        this.userSockets.delete(userId);
      }
      this.logger.log(`User ${userId} disconnected (socket ${client.id})`);
    }
  }

  /**
   * Push a saved notification to the recipient in real time.
   * Safe to call even if the user is offline — no-op if no socket found.
   */
  pushToUser(recipientId: string, notification: Notification): void {
    this.server.to(`user:${recipientId}`).emit('notification', notification);
  }

  /**
   * Push an unread-count update to a user.
   */
  pushUnreadCount(recipientId: string, count: number): void {
    this.server.to(`user:${recipientId}`).emit('notification:unread_count', { count });
  }
}
