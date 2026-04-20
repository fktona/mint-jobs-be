import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { PrivyGuard, PrivyUser } from '@mintjobs/privy';
import { RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { ResponseUtil } from '@mintjobs/utils';

@ApiTags('chat')
@Controller('chat')
@UseGuards(PrivyGuard)
@ApiBearerAuth('JWT-auth')
export class ChatController {
  constructor(
    private readonly requestResponseService: RequestResponseService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Get all conversations for the authenticated user' })
  async getConversations(
    @PrivyUser('privyId') userId: string,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.CHAT_GET_CONVERSATIONS,
      { userId },
      MessagePattern.CHAT_GET_CONVERSATIONS_RESPONSE,
      QueueName.CHAT_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Conversations retrieved successfully');
  }

  @Get('messages')
  @ApiOperation({ summary: 'Get paginated messages for a conversation' })
  @ApiQuery({ name: 'conversationId', required: true, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMessages(
    @PrivyUser('privyId') userId: string,
    @Query('conversationId', ParseUUIDPipe) conversationId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 30,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.CHAT_GET_MESSAGES,
      { userId, conversationId, page: Number(page), limit: Number(limit) },
      MessagePattern.CHAT_GET_MESSAGES_RESPONSE,
      QueueName.CHAT_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Messages retrieved successfully');
  }

  @Post('messages')
  @ApiOperation({ summary: 'Send a message in a conversation' })
  async sendMessage(
    @PrivyUser('privyId') senderId: string,
    @Body('conversationId', ParseUUIDPipe) conversationId: string,
    @Body('content') content: string,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.CHAT_SEND_MESSAGE,
      { senderId, conversationId, content },
      MessagePattern.CHAT_SEND_MESSAGE_RESPONSE,
      QueueName.CHAT_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Message sent successfully');
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread message count across all conversations' })
  async getUnreadCount(
    @PrivyUser('privyId') userId: string,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.CHAT_UNREAD_COUNT,
      { userId },
      MessagePattern.CHAT_UNREAD_COUNT_RESPONSE,
      QueueName.CHAT_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Unread count retrieved successfully');
  }

  @Patch('messages/read')
  @ApiOperation({ summary: 'Mark all unread messages in a conversation as read' })
  @ApiQuery({ name: 'conversationId', required: true, type: String })
  async markRead(
    @PrivyUser('privyId') userId: string,
    @Query('conversationId', ParseUUIDPipe) conversationId: string,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.CHAT_MARK_READ,
      { userId, conversationId },
      MessagePattern.CHAT_MARK_READ_RESPONSE,
      QueueName.CHAT_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Messages marked as read');
  }
}
