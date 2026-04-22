import { Module } from '@nestjs/common';
import { ConfigModule } from '@mintjobs/config';
import { LoggerModule } from '@mintjobs/logger';
import { DatabaseModule } from '@mintjobs/database';
import { MessagingModule } from '@mintjobs/messaging';
import { TokenModule } from './token/token.module';
import { DefiProfileModule } from './defi-profile/defi-profile.module';
import { FollowModule } from './follow/follow.module';
import { CommunityModule } from './community/community.module';
import { DmModule } from './dm/dm.module';
import { LaunchpadChatGateway } from './launchpad-chat.gateway';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    MessagingModule,
    TokenModule,
    DefiProfileModule,
    FollowModule,
    CommunityModule,
    DmModule,
  ],
  controllers: [],
  providers: [LaunchpadChatGateway],
})
export class AppModule {}
