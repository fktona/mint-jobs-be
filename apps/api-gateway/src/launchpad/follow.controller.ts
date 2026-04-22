import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PrivyGuard, PrivyUser } from '@mintjobs/privy';
import { RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { ResponseUtil } from '@mintjobs/utils';
import { FollowDto } from './dto/follow.dto';

@ApiTags('launchpad')
@Controller('launchpad/follow')
@UseGuards(PrivyGuard)
@ApiBearerAuth('JWT-auth')
export class FollowController {
  constructor(private readonly requestResponseService: RequestResponseService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Follow a user by wallet address' })
  async follow(
    @PrivyUser('privyId') followerId: string,
    @Body() dto: FollowDto,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.FOLLOW,
      { followerId, walletAddress: dto.walletAddress },
      MessagePattern.FOLLOW_RESPONSE,
      QueueName.LAUNCHPAD_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Followed successfully');
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unfollow a user by wallet address' })
  async unfollow(
    @PrivyUser('privyId') followerId: string,
    @Body() dto: FollowDto,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.UNFOLLOW,
      { followerId, walletAddress: dto.walletAddress },
      MessagePattern.UNFOLLOW_RESPONSE,
      QueueName.LAUNCHPAD_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Unfollowed successfully');
  }

  @Get('check')
  @ApiOperation({ summary: 'Check if you are following a wallet address' })
  @ApiQuery({ name: 'walletAddress', description: 'Wallet address to check' })
  async checkFollow(
    @PrivyUser('privyId') followerId: string,
    @Query('walletAddress') walletAddress: string,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.FOLLOW_CHECK,
      { followerId, walletAddress },
      MessagePattern.FOLLOW_CHECK_RESPONSE,
      QueueName.LAUNCHPAD_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Follow status retrieved');
  }
}
