import { Controller, Get, Query, Req, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { ResponseUtil } from '@mintjobs/utils';

@ApiTags('launchpad')
@Controller('launchpad')
export class PublicLaunchpadController {
  constructor(private readonly requestResponseService: RequestResponseService) {}

  @Get('tokens/public')
  @ApiOperation({
    summary: 'Get all confirmed tokens (public, no auth)',
    description: 'Paginated list of all confirmed tokens.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Max 100' })
  async getAllTokens(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Req() req?: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.TOKEN_GET_ALL,
      { page, limit },
      MessagePattern.TOKEN_GET_ALL_RESPONSE,
      QueueName.LAUNCHPAD_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Tokens retrieved successfully');
  }

  @Get('conversations')
  @ApiOperation({
    summary: 'Get conversation list for a wallet (public, no auth)',
    description:
      'Returns all DM threads and community chats a wallet has participated in, ' +
      'merged and sorted by most recent activity.',
  })
  @ApiQuery({ name: 'walletAddress', required: true, description: 'Base58 wallet address' })
  async getConversations(
    @Query('walletAddress') walletAddress: string,
    @Req() req: Request,
  ) {
    if (!walletAddress?.trim()) {
      throw new BadRequestException('walletAddress is required');
    }
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.LAUNCHPAD_CONVERSATIONS,
      { walletAddress },
      MessagePattern.LAUNCHPAD_CONVERSATIONS_RESPONSE,
      QueueName.LAUNCHPAD_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Conversations retrieved successfully');
  }
}
