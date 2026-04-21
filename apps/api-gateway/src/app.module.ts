import { Module } from '@nestjs/common';
import { ConfigModule } from '@mintjobs/config';
import { LoggerModule } from '@mintjobs/logger';
import { MessagingModule } from '@mintjobs/messaging';
import { PrivyModule } from '@mintjobs/privy';
import { UsersController } from './users/users.controller';
import { JobsController } from './jobs/jobs.controller';
import { FreelancerProfileController } from './freelancer-profile/freelancer-profile.controller';
import { ProposalsController } from './proposals/proposals.controller';
import { ClientProfileController } from './client-profile/client-profile.controller';
import { AuthController } from './auth/auth.controller';
import { ContractsController } from './contracts/contracts.controller';
import { EscrowController, MilestoneController, PlatformFeeController } from './escrow/escrow.controller';
import { ChatController } from './chat/chat.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { ChatGateway } from './gateways/chat.gateway';
import { NotificationGateway } from './gateways/notification.gateway';
import { GatewayPushHandler } from './gateways/gateway-push.handler';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    MessagingModule,
    PrivyModule,
  ],
  controllers: [UsersController, JobsController, FreelancerProfileController, ProposalsController, ClientProfileController, AuthController, ContractsController, EscrowController, MilestoneController, PlatformFeeController, ChatController, NotificationsController],
  providers: [ChatGateway, NotificationGateway, GatewayPushHandler],
})
export class AppModule {}
