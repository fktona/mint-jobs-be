import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumerService, RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { ClientProfileService } from './client-profile.service';

@Injectable()
export class ClientProfileMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(ClientProfileMessageHandler.name);

  constructor(
    private readonly consumerService: ConsumerService,
    private readonly requestResponseService: RequestResponseService,
    private readonly clientProfileService: ClientProfileService,
  ) {}

  async onModuleInit() {
    await this.consumerService.subscribe(QueueName.CLIENT_PROFILE_QUEUE, [
      MessagePattern.CLIENT_PROFILE_CREATE,
      MessagePattern.CLIENT_PROFILE_UPDATE,
      MessagePattern.CLIENT_PROFILE_GET_ME,
      MessagePattern.CLIENT_PROFILE_GET_BY_USER,
    ]);

    this.consumerService.registerHandler(
      MessagePattern.CLIENT_PROFILE_CREATE,
      this.handleCreate.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.CLIENT_PROFILE_UPDATE,
      this.handleUpdate.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.CLIENT_PROFILE_GET_ME,
      this.handleGetMe.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.CLIENT_PROFILE_GET_BY_USER,
      this.handleGetByUser.bind(this),
    );

    this.logger.log('Client profile message handlers registered');
  }

  private async handleCreate(event: any) {
    try {
      const { userId, ...dto } = event.data as any;
      const profile = await this.clientProfileService.create(userId, dto);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CLIENT_PROFILE_CREATE_RESPONSE,
        profile,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling client profile create', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CLIENT_PROFILE_CREATE_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to create client profile', statusCode: error.status || 500 },
      );
    }
  }

  private async handleUpdate(event: any) {
    try {
      const { userId, ...dto } = event.data as any;
      const profile = await this.clientProfileService.update(userId, dto);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CLIENT_PROFILE_UPDATE_RESPONSE,
        profile,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling client profile update', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CLIENT_PROFILE_UPDATE_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to update client profile', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGetMe(event: any) {
    try {
      const { userId } = event.data as any;
      const profile = await this.clientProfileService.findByUserId(userId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CLIENT_PROFILE_GET_ME_RESPONSE,
        profile,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling client profile get me', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CLIENT_PROFILE_GET_ME_RESPONSE,
        null,
        false,
        { message: error.message || 'Client profile not found', statusCode: error.status || 404 },
      );
    }
  }

  private async handleGetByUser(event: any) {
    try {
      const { userId } = event.data as any;
      const profile = await this.clientProfileService.findByUserId(userId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CLIENT_PROFILE_GET_BY_USER_RESPONSE,
        profile,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling client profile get by user', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.CLIENT_PROFILE_GET_BY_USER_RESPONSE,
        null,
        false,
        { message: error.message || 'Client profile not found', statusCode: error.status || 404 },
      );
    }
  }
}
