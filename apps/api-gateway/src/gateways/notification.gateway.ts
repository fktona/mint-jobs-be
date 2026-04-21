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

@WebSocketGateway({
  namespace: '/ws/notifications',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
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
    this.logger.log('Notification WebSocket gateway initialized on /notifications');
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

      client.data.userId = userId;
      await client.join(`user:${userId}`);

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      this.logger.log(`User ${userId} connected to notifications (socket ${client.id})`);
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
      this.logger.log(`User ${userId} disconnected from notifications (socket ${client.id})`);
    }
  }

  pushToUser(recipientId: string, notification: any): void {
    this.server.to(`user:${recipientId}`).emit('notification', notification);
  }

  pushUnreadCount(recipientId: string, count: number): void {
    this.server.to(`user:${recipientId}`).emit('notification:unread_count', { count });
  }
}
