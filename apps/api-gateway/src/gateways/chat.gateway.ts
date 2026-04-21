import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrivyService } from '@mintjobs/privy';
import { RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { v4 as uuidv4 } from 'uuid';

@WebSocketGateway({
  namespace: '/ws/chat',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  /** userId → Set of socket IDs (supports multiple tabs/devices) */
  private userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly privyService: PrivyService,
    private readonly requestResponseService: RequestResponseService,
  ) {}

  afterInit() {
    this.logger.log('Chat WebSocket gateway initialized on /chat');
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

      this.logger.log(`User ${userId} connected to chat (socket ${client.id})`);
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
      this.logger.log(`User ${userId} disconnected from chat (socket ${client.id})`);
    }
  }

  // ─── Inbound events (client → server) ────────────────────────────────────

  @SubscribeMessage('chat:send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId: string; content: string },
  ) {
    const senderId = client.data?.userId as string | undefined;
    if (!senderId) return { success: false, error: 'Not authenticated' };

    const { conversationId, content } = payload ?? {};
    if (!conversationId || !content?.trim()) {
      return { success: false, error: 'conversationId and content are required' };
    }

    try {
      const data = await this.requestResponseService.request(
        MessagePattern.CHAT_SEND_MESSAGE,
        { senderId, conversationId, content: content.trim() },
        MessagePattern.CHAT_SEND_MESSAGE_RESPONSE,
        QueueName.CHAT_QUEUE,
        uuidv4(),
      );
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to send message' };
    }
  }

  @SubscribeMessage('chat:mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId: string },
  ) {
    const userId = client.data?.userId as string | undefined;
    if (!userId) return { success: false, error: 'Not authenticated' };

    const { conversationId } = payload ?? {};
    if (!conversationId) {
      return { success: false, error: 'conversationId is required' };
    }

    try {
      const data = await this.requestResponseService.request(
        MessagePattern.CHAT_MARK_READ,
        { userId, conversationId },
        MessagePattern.CHAT_MARK_READ_RESPONSE,
        QueueName.CHAT_QUEUE,
        uuidv4(),
      );
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to mark as read' };
    }
  }

  // ─── Outbound push helpers (called by chat-service message handler) ───────

  pushMessage(clientId: string, freelancerId: string, conversationId: string, message: any): void {
    const payload = { conversationId, message };
    this.server.to(`user:${clientId}`).emit('chat:message', payload);
    if (freelancerId !== clientId) {
      this.server.to(`user:${freelancerId}`).emit('chat:message', payload);
    }
  }

  pushRead(clientId: string, freelancerId: string, conversationId: string, readBy: string): void {
    const payload = { conversationId, readBy };
    this.server.to(`user:${clientId}`).emit('chat:read', payload);
    if (freelancerId !== clientId) {
      this.server.to(`user:${freelancerId}`).emit('chat:read', payload);
    }
  }

  pushConversationCreated(conversation: any): void {
    const payload = { conversation };
    this.server.to(`user:${conversation.clientId}`).emit('chat:conversation_created', payload);
    this.server.to(`user:${conversation.freelancerId}`).emit('chat:conversation_created', payload);
  }

  pushUnreadCount(userId: string, count: number): void {
    this.server.to(`user:${userId}`).emit('chat:unread_count', { count });
  }
}
