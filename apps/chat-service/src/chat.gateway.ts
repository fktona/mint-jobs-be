import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrivyService } from '@mintjobs/privy';
import { ChatService } from './chat.service';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';

interface SendMessagePayload {
  conversationId: string;
  content: string;
}

interface MarkReadPayload {
  conversationId: string;
}

@WebSocketGateway({
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
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
  ) {}

  afterInit() {
    this.logger.log('Chat WebSocket gateway initialized');
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

      // Join personal room
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

  /**
   * Send a message via socket.
   * Client emits:  socket.emit('chat:send_message', { conversationId, content }, ack)
   * Server acks:   { success: true, message: <saved message> }  |  { success: false, error: string }
   */
  @SubscribeMessage('chat:send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SendMessagePayload,
  ) {
    const senderId = client.data?.userId as string | undefined;

    if (!senderId) {
      return { success: false, error: 'Not authenticated' };
    }

    const { conversationId, content } = payload ?? {};

    if (!conversationId || !content?.trim()) {
      return { success: false, error: 'conversationId and content are required' };
    }

    try {
      // chatService.sendMessage already saves to DB and calls pushMessage()
      const message = await this.chatService.sendMessage(
        senderId,
        conversationId,
        content.trim(),
      );
      return { success: true, message };
    } catch (err) {
      this.logger.error(`chat:send_message error for user ${senderId}`, err);
      return { success: false, error: err.message ?? 'Failed to send message' };
    }
  }

  /**
   * Mark all messages in a conversation as read via socket.
   * Client emits:  socket.emit('chat:mark_read', { conversationId }, ack)
   * Server acks:   { success: true }  |  { success: false, error: string }
   */
  @SubscribeMessage('chat:mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MarkReadPayload,
  ) {
    const userId = client.data?.userId as string | undefined;

    if (!userId) {
      return { success: false, error: 'Not authenticated' };
    }

    const { conversationId } = payload ?? {};

    if (!conversationId) {
      return { success: false, error: 'conversationId is required' };
    }

    try {
      // chatService.markRead already updates DB and calls pushRead()
      await this.chatService.markRead(userId, conversationId);
      return { success: true };
    } catch (err) {
      this.logger.error(`chat:mark_read error for user ${userId}`, err);
      return { success: false, error: err.message ?? 'Failed to mark as read' };
    }
  }

  // ─── Outbound emit helpers (server → client) ──────────────────────────────

  /**
   * Push a new message to both participants.
   * Called by ChatService after every successful message save.
   */
  pushMessage(
    clientId: string,
    freelancerId: string,
    conversationId: string,
    message: Message,
  ): void {
    const payload = { conversationId, message };
    this.server.to(`user:${clientId}`).emit('chat:message', payload);
    if (freelancerId !== clientId) {
      this.server.to(`user:${freelancerId}`).emit('chat:message', payload);
    }
  }

  /**
   * Notify both participants that messages were read.
   */
  pushRead(
    clientId: string,
    freelancerId: string,
    conversationId: string,
    readBy: string,
  ): void {
    const payload = { conversationId, readBy };
    this.server.to(`user:${clientId}`).emit('chat:read', payload);
    if (freelancerId !== clientId) {
      this.server.to(`user:${freelancerId}`).emit('chat:read', payload);
    }
  }

  /**
   * Notify both participants that a new conversation was created.
   */
  pushConversationCreated(conversation: Conversation): void {
    const payload = { conversation };
    this.server.to(`user:${conversation.clientId}`).emit('chat:conversation_created', payload);
    this.server.to(`user:${conversation.freelancerId}`).emit('chat:conversation_created', payload);
  }

  /**
   * Push the total unread message count to a specific user.
   * Called after a new message arrives (recipient) or after markRead (reader).
   */
  pushUnreadCount(userId: string, count: number): void {
    this.server.to(`user:${userId}`).emit('chat:unread_count', { count });
  }
}
