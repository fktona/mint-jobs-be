import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumerService, RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { TokenService } from './token.service';

@Injectable()
export class TokenMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(TokenMessageHandler.name);

  constructor(
    private readonly consumerService: ConsumerService,
    private readonly requestResponseService: RequestResponseService,
    private readonly tokenService: TokenService,
  ) {}

  async onModuleInit() {
    await this.consumerService.subscribe(QueueName.LAUNCHPAD_QUEUE, [
      MessagePattern.TOKEN_CREATE,
      MessagePattern.TOKEN_CONFIRM,
      MessagePattern.TOKEN_INITIATE,
      MessagePattern.TOKEN_GET_MY,
      MessagePattern.TOKEN_GET_ONE,
      MessagePattern.TOKEN_GET_ALL,
    ]);

    this.consumerService.registerHandler(MessagePattern.TOKEN_CREATE, this.handleCreate.bind(this));
    this.consumerService.registerHandler(MessagePattern.TOKEN_CONFIRM, this.handleConfirm.bind(this));
    this.consumerService.registerHandler(MessagePattern.TOKEN_INITIATE, this.handleInitiate.bind(this));
    this.consumerService.registerHandler(MessagePattern.TOKEN_GET_MY, this.handleGetMy.bind(this));
    this.consumerService.registerHandler(MessagePattern.TOKEN_GET_ONE, this.handleGetOne.bind(this));
    this.consumerService.registerHandler(MessagePattern.TOKEN_GET_ALL, this.handleGetAll.bind(this));

    this.logger.log('Token message handlers registered');
  }

  private async handleCreate(event: any) {
    try {
      const { userId, ...dto } = event.data as any;
      const result = await this.tokenService.create(userId, dto);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.TOKEN_CREATE_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling token create', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.TOKEN_CREATE_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to create token', statusCode: error.status || 500 },
      );
    }
  }

  private async handleConfirm(event: any) {
    try {
      const { userId, ...dto } = event.data as any;
      const result = await this.tokenService.confirmToken(userId, dto);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.TOKEN_CONFIRM_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling token confirm', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.TOKEN_CONFIRM_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to confirm token', statusCode: error.status || 500 },
      );
    }
  }

  private async handleInitiate(event: any) {
    try {
      const dto = event.data as any;
      const result = await this.tokenService.initiateToken(dto);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.TOKEN_INITIATE_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling token initiate', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.TOKEN_INITIATE_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to initiate token creation', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGetMy(event: any) {
    try {
      const { userId, ...filter } = event.data as any;
      const result = await this.tokenService.findMy(userId, filter);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.TOKEN_GET_MY_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get my tokens', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.TOKEN_GET_MY_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get tokens', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGetAll(event: any) {
    try {
      const filter = event.data as any;
      const result = await this.tokenService.findAll(filter);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.TOKEN_GET_ALL_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get all tokens', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.TOKEN_GET_ALL_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get tokens', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGetOne(event: any) {
    try {
      const { id, userId } = event.data as any;
      const result = await this.tokenService.findOne(id, userId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.TOKEN_GET_ONE_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get one token', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.TOKEN_GET_ONE_RESPONSE,
        null,
        false,
        { message: error.message || 'Token not found', statusCode: error.status || 404 },
      );
    }
  }
}
