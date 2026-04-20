import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumerService, RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { FreelancerProfileService } from './freelancer-profile.service';

@Injectable()
export class FreelancerProfileMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(FreelancerProfileMessageHandler.name);

  constructor(
    private readonly consumerService: ConsumerService,
    private readonly requestResponseService: RequestResponseService,
    private readonly freelancerProfileService: FreelancerProfileService,
  ) {}

  async onModuleInit() {
    await this.consumerService.subscribe(QueueName.FREELANCER_PROFILE_QUEUE, [
      MessagePattern.FREELANCER_PROFILE_CREATE,
      MessagePattern.FREELANCER_PROFILE_UPDATE,
      MessagePattern.FREELANCER_PROFILE_GET_ME,
      MessagePattern.FREELANCER_PROFILE_GET_BY_USER,
      MessagePattern.FREELANCER_PROFILE_GET_BATCH,
    ]);

    this.consumerService.registerHandler(
      MessagePattern.FREELANCER_PROFILE_CREATE,
      this.handleCreate.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.FREELANCER_PROFILE_UPDATE,
      this.handleUpdate.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.FREELANCER_PROFILE_GET_ME,
      this.handleGetMe.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.FREELANCER_PROFILE_GET_BY_USER,
      this.handleGetByUser.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.FREELANCER_PROFILE_GET_BATCH,
      this.handleGetBatch.bind(this),
    );

    this.logger.log('Freelancer profile message handlers registered');
  }

  private async handleCreate(event: any) {
    try {
      const { userId, ...dto } = event.data as any;
      const profile = await this.freelancerProfileService.create(userId, dto);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.FREELANCER_PROFILE_CREATE_RESPONSE,
        profile,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling freelancer profile create', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.FREELANCER_PROFILE_CREATE_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to create profile', statusCode: error.status || 500 },
      );
    }
  }

  private async handleUpdate(event: any) {
    try {
      const { userId, ...dto } = event.data as any;
      const profile = await this.freelancerProfileService.update(userId, dto);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.FREELANCER_PROFILE_UPDATE_RESPONSE,
        profile,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling freelancer profile update', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.FREELANCER_PROFILE_UPDATE_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to update profile', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGetMe(event: any) {
    try {
      const { userId } = event.data as any;
      const profile = await this.freelancerProfileService.findByUserId(userId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.FREELANCER_PROFILE_GET_ME_RESPONSE,
        profile,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling freelancer profile get me', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.FREELANCER_PROFILE_GET_ME_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get profile', statusCode: error.status || 404 },
      );
    }
  }

  private async handleGetByUser(event: any) {
    try {
      const { userId } = event.data as any;
      const profile = await this.freelancerProfileService.findByUserId(userId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.FREELANCER_PROFILE_GET_BY_USER_RESPONSE,
        profile,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling freelancer profile get by user', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.FREELANCER_PROFILE_GET_BY_USER_RESPONSE,
        null,
        false,
        { message: error.message || 'Profile not found', statusCode: error.status || 404 },
      );
    }
  }

  private async handleGetBatch(event: any) {
    try {
      const { userIds } = event.data as any;
      const profiles = await this.freelancerProfileService.findByUserIds(userIds);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.FREELANCER_PROFILE_GET_BATCH_RESPONSE,
        profiles,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling freelancer profile batch get', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.FREELANCER_PROFILE_GET_BATCH_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get profiles', statusCode: error.status || 500 },
      );
    }
  }
}
