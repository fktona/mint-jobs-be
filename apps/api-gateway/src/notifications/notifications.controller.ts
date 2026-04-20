import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
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

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(PrivyGuard)
@ApiBearerAuth('JWT-auth')
export class NotificationsController {
  constructor(
    private readonly requestResponseService: RequestResponseService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated notifications for the current user' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getNotifications(
    @PrivyUser('privyId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.NOTIFICATION_GET,
      { userId, page, limit },
      MessagePattern.NOTIFICATION_GET_RESPONSE,
      QueueName.NOTIFICATION_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Notifications retrieved successfully');
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count for the current user' })
  async getUnreadCount(
    @PrivyUser('privyId') userId: string,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.NOTIFICATION_UNREAD_COUNT,
      { userId },
      MessagePattern.NOTIFICATION_UNREAD_COUNT_RESPONSE,
      QueueName.NOTIFICATION_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Unread count retrieved successfully');
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  async markRead(
    @PrivyUser('privyId') userId: string,
    @Param('id', ParseUUIDPipe) notificationId: string,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.NOTIFICATION_MARK_READ,
      { userId, notificationId },
      MessagePattern.NOTIFICATION_MARK_READ_RESPONSE,
      QueueName.NOTIFICATION_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Notification marked as read');
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(
    @PrivyUser('privyId') userId: string,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.NOTIFICATION_MARK_ALL_READ,
      { userId },
      MessagePattern.NOTIFICATION_MARK_ALL_READ_RESPONSE,
      QueueName.NOTIFICATION_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'All notifications marked as read');
  }
}
