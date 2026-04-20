import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumerService } from '@mintjobs/messaging';
import { RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { UsersService } from '../users.service';
import { PrivyService } from '@mintjobs/privy';

@Injectable()
export class UsersMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(UsersMessageHandler.name);

  constructor(
    private consumerService: ConsumerService,
    private requestResponseService: RequestResponseService,
    private usersService: UsersService,
    private privyService: PrivyService,
  ) {}

  async onModuleInit() {
    // Subscribe to user request queue
    await this.consumerService.subscribe(QueueName.USER_QUEUE, [
      MessagePattern.USER_GET_AUTH_METHODS,
      MessagePattern.USER_GET_ME,
      MessagePattern.USER_GET_ME_WALLET,
      MessagePattern.USER_GET_ALL,
    ]);

    // Register handlers
    this.consumerService.registerHandler(
      MessagePattern.USER_GET_AUTH_METHODS,
      this.handleGetAuthMethods.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.USER_GET_ME,
      this.handleGetMe.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.USER_GET_ME_WALLET,
      this.handleGetMeWallet.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.USER_GET_ALL,
      this.handleGetAll.bind(this),
    );

    this.logger.log('User message handlers registered');
  }

  private async handleGetAuthMethods(event: any) {
    try {
      const requestId = event.requestId;
      const methods = ['wallet', 'email', 'sms', 'google', 'twitter', 'discord'];
      
      await this.requestResponseService.respond(
        requestId,
        MessagePattern.USER_GET_AUTH_METHODS_RESPONSE,
        methods,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get auth methods', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.USER_GET_AUTH_METHODS_RESPONSE,
        null,
        false,
        {
          message: error.message || 'Failed to get auth methods',
          statusCode: 500,
        },
      );
    }
  }

  private async handleGetMe(event: any) {
    try {
      const requestMessage = event.data as any;
      const requestId = event.requestId;
      const { privyId, role, adminToken } = requestMessage;
      
      const user = await this.usersService.getOrCreateUserWithRole(
        privyId,
        role,
        adminToken,
      );

      const privyUserData = await this.privyService.getUser(privyId);

      await this.requestResponseService.respond(
        requestId,
        MessagePattern.USER_GET_ME_RESPONSE,
        {
          ...user,
          privyData: privyUserData,
        },
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get me', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.USER_GET_ME_RESPONSE,
        null,
        false,
        {
          message: error.message || 'Failed to get user',
          statusCode: error.statusCode || 500,
        },
      );
    }
  }

  private async handleGetMeWallet(event: any) {
    try {
      const requestMessage = event.data as any;
      const requestId = event.requestId;
      const { privyId } = requestMessage;
      
      const wallets = await this.privyService.getUserWallets(privyId);

      await this.requestResponseService.respond(
        requestId,
        MessagePattern.USER_GET_ME_WALLET_RESPONSE,
        wallets,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get me wallet', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.USER_GET_ME_WALLET_RESPONSE,
        null,
        false,
        {
          message: error.message || 'Failed to get user wallets',
          statusCode: 500,
        },
      );
    }
  }

  private async handleGetAll(event: any) {
    try {
      const requestMessage = event.data as any;
      const requestId = event.requestId;
      const filters = requestMessage;

      const users = await this.usersService.findAll(filters);

      await this.requestResponseService.respond(
        requestId,
        MessagePattern.USER_GET_ALL_RESPONSE,
        users,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get all users', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.USER_GET_ALL_RESPONSE,
        null,
        false,
        {
          message: error.message || 'Failed to get users',
          statusCode: error.statusCode || 500,
        },
      );
    }
  }
}
