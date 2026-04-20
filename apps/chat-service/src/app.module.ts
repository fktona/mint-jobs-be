import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@mintjobs/config';
import { LoggerModule } from '@mintjobs/logger';
import { DatabaseModule } from '@mintjobs/database';
import { MessagingModule } from '@mintjobs/messaging';
import { PrivyModule } from '@mintjobs/privy';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatMessageHandler } from './chat.message-handler';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    MessagingModule,
    PrivyModule,
    TypeOrmModule.forFeature([Conversation, Message]),
  ],
  providers: [ChatGateway, ChatService, ChatMessageHandler],
})
export class AppModule {}
