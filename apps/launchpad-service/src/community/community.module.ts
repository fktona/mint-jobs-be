import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Community } from './entities/community.entity';
import { CommunityMessage } from './entities/community-message.entity';
import { DmMessage } from '../dm/entities/dm-message.entity';
import { CommunityService } from './community.service';
import { ConversationsService } from './conversations.service';
import { ConversationsMessageHandler } from './conversations.message-handler';
import { DmService } from '../dm/dm.service';

@Module({
  imports: [TypeOrmModule.forFeature([Community, CommunityMessage, DmMessage])],
  providers: [CommunityService, DmService, ConversationsService, ConversationsMessageHandler],
  exports: [CommunityService],
})
export class CommunityModule {}
