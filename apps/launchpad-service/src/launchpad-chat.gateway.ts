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
import { CORS_ORIGINS } from '@mintjobs/constants';
import { CommunityService } from './community/community.service';
import { DmService } from './dm/dm.service';

@WebSocketGateway({
  namespace: '/ws/launchpad',
  cors: { origin: CORS_ORIGINS, credentials: true },
  transports: ['websocket', 'polling'],
})
export class LaunchpadChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LaunchpadChatGateway.name);

  constructor(
    private readonly communityService: CommunityService,
    private readonly dmService: DmService,
  ) {}

  afterInit() {
    this.logger.log('Launchpad chat gateway initialized on /ws/launchpad');
  }

  handleConnection(client: Socket) {
    // No auth required — wallet address is passed per-event
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ─── Community chat ──────────────────────────────────────────────────────

  /**
   * Join a community room. Creates the community if it does not exist.
   * Payload: { ca, name?, symbol?, logoUrl? }
   * name/symbol/logoUrl are only needed on first join (community creation).
   * Returns recent message history.
   */
  @SubscribeMessage('community:join')
  async handleJoinCommunity(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { ca: string; name?: string; symbol?: string; logoUrl?: string },
  ) {
    const { ca, name, symbol, logoUrl } = payload ?? {};
    if (!ca?.trim()) return { success: false, error: 'ca is required' };

    try {
      const community = await this.communityService.getOrCreate({ ca, name, symbol, logoUrl });
      await client.join(`community:${ca}`);

      const history = await this.communityService.getMessages(ca, 50);

      this.logger.log(`Client ${client.id} joined community ${ca}`);
      return { success: true, community, history: history.reverse() };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to join community' };
    }
  }

  /**
   * Send a message to a community room.
   * Payload: { ca, senderWallet, content }
   * No auth — any wallet can send.
   */
  @SubscribeMessage('community:message')
  async handleCommunityMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { ca: string; senderWallet: string; content: string },
  ) {
    const { ca, senderWallet, content } = payload ?? {};
    if (!ca?.trim()) return { success: false, error: 'ca is required' };
    if (!senderWallet?.trim()) return { success: false, error: 'senderWallet is required' };
    if (!content?.trim()) return { success: false, error: 'content is required' };
    if (content.length > 2_000) return { success: false, error: 'Message too long (max 2000 chars)' };

    try {
      const message = await this.communityService.saveMessage(ca, senderWallet, content.trim());

      // Broadcast to everyone in the room including sender
      this.server.to(`community:${ca}`).emit('community:message', { ca, message });

      return { success: true, message };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to send message' };
    }
  }

  /**
   * Leave a community room.
   * Payload: { ca }
   */
  @SubscribeMessage('community:leave')
  async handleLeaveCommunity(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { ca: string },
  ) {
    const { ca } = payload ?? {};
    if (!ca?.trim()) return { success: false, error: 'ca is required' };

    await client.leave(`community:${ca}`);
    this.logger.log(`Client ${client.id} left community ${ca}`);
    return { success: true };
  }

  // ─── Direct messages ────────────────────────────────────────────────────

  /**
   * Send a DM to another wallet.
   * Payload: { senderWallet, recipientWallet, content }
   * Recipient receives it if they are connected and have called dm:listen.
   */
  @SubscribeMessage('dm:send')
  async handleDmSend(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { senderWallet: string; recipientWallet: string; content: string },
  ) {
    const { senderWallet, recipientWallet, content } = payload ?? {};
    if (!senderWallet?.trim()) return { success: false, error: 'senderWallet is required' };
    if (!recipientWallet?.trim()) return { success: false, error: 'recipientWallet is required' };
    if (!content?.trim()) return { success: false, error: 'content is required' };
    if (content.length > 2_000) return { success: false, error: 'Message too long (max 2000 chars)' };

    try {
      const message = await this.dmService.saveMessage(senderWallet, recipientWallet, content.trim());

      // Push to recipient's wallet room if they are online
      this.server.to(`wallet:${recipientWallet}`).emit('dm:message', { message });
      // Also echo back to sender's other sessions
      this.server.to(`wallet:${senderWallet}`).emit('dm:message', { message });

      return { success: true, message };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to send DM' };
    }
  }

  /**
   * Register this socket to receive DMs for a wallet.
   * Payload: { walletAddress }
   * Call this after connecting so DMs can be pushed to you.
   */
  @SubscribeMessage('dm:listen')
  async handleDmListen(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { walletAddress: string },
  ) {
    const { walletAddress } = payload ?? {};
    if (!walletAddress?.trim()) return { success: false, error: 'walletAddress is required' };

    await client.join(`wallet:${walletAddress}`);
    this.logger.log(`Client ${client.id} listening for DMs on wallet ${walletAddress}`);
    return { success: true };
  }

  /**
   * Get DM history between two wallets.
   * Payload: { walletA, walletB, limit? }
   */
  @SubscribeMessage('dm:history')
  async handleDmHistory(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: { walletA: string; walletB: string; limit?: number },
  ) {
    const { walletA, walletB, limit } = payload ?? {};
    if (!walletA?.trim() || !walletB?.trim()) {
      return { success: false, error: 'walletA and walletB are required' };
    }

    try {
      const messages = await this.dmService.getHistory(walletA, walletB, limit ?? 50);
      return { success: true, messages: messages.reverse() };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to get DM history' };
    }
  }
}
