import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumerService, RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { DefiProfileService } from './defi-profile.service';

@Injectable()
export class DefiProfileMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(DefiProfileMessageHandler.name);

  constructor(
    private readonly consumerService: ConsumerService,
    private readonly requestResponseService: RequestResponseService,
    private readonly defiProfileService: DefiProfileService,
  ) {}

  async onModuleInit() {
    await this.consumerService.subscribe(QueueName.LAUNCHPAD_QUEUE, [
      MessagePattern.DEFI_PROFILE_UPSERT,
      MessagePattern.DEFI_PROFILE_GET,
    ]);

    this.consumerService.registerHandler(
      MessagePattern.DEFI_PROFILE_UPSERT,
      this.handleUpsert.bind(this),
    );
    this.consumerService.registerHandler(
      MessagePattern.DEFI_PROFILE_GET,
      this.handleGet.bind(this),
    );

    this.logger.log('DefiProfile message handlers registered');
  }

  private async handleUpsert(event: any) {
    try {
      const { userId, ...dto } = event.data as any;
      const result = await this.defiProfileService.upsert(userId, dto);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.DEFI_PROFILE_UPSERT_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error upserting defi profile', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.DEFI_PROFILE_UPSERT_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to upsert defi profile', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGet(event: any) {
    try {
      const { userId } = event.data as any;
      const result = await this.defiProfileService.findOne(userId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.DEFI_PROFILE_GET_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error getting defi profile', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.DEFI_PROFILE_GET_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get defi profile', statusCode: error.status || 500 },
      );
    }
  }
}
