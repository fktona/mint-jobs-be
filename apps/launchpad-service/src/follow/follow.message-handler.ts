import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumerService, RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { FollowService } from './follow.service';

@Injectable()
export class FollowMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(FollowMessageHandler.name);

  constructor(
    private readonly consumerService: ConsumerService,
    private readonly requestResponseService: RequestResponseService,
    private readonly followService: FollowService,
  ) {}

  async onModuleInit() {
    await this.consumerService.subscribe(QueueName.LAUNCHPAD_QUEUE, [
      MessagePattern.FOLLOW,
      MessagePattern.UNFOLLOW,
      MessagePattern.FOLLOW_CHECK,
    ]);

    this.consumerService.registerHandler(MessagePattern.FOLLOW, this.handleFollow.bind(this));
    this.consumerService.registerHandler(MessagePattern.UNFOLLOW, this.handleUnfollow.bind(this));
    this.consumerService.registerHandler(MessagePattern.FOLLOW_CHECK, this.handleCheck.bind(this));

    this.logger.log('Follow message handlers registered');
  }

  private async handleFollow(event: any) {
    try {
      const { followerId, walletAddress } = event.data as any;
      const result = await this.followService.follow(followerId, walletAddress);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.FOLLOW_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling follow', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.FOLLOW_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to follow', statusCode: error.status || 500 },
      );
    }
  }

  private async handleUnfollow(event: any) {
    try {
      const { followerId, walletAddress } = event.data as any;
      const result = await this.followService.unfollow(followerId, walletAddress);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.UNFOLLOW_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling unfollow', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.UNFOLLOW_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to unfollow', statusCode: error.status || 500 },
      );
    }
  }

  private async handleCheck(event: any) {
    try {
      const { followerId, walletAddress } = event.data as any;
      const result = await this.followService.isFollowing(followerId, walletAddress);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.FOLLOW_CHECK_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error checking follow', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.FOLLOW_CHECK_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to check follow', statusCode: error.status || 500 },
      );
    }
  }
}
