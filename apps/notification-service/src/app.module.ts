import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@mintjobs/config';
import { LoggerModule } from '@mintjobs/logger';
import { DatabaseModule } from '@mintjobs/database';
import { MessagingModule } from '@mintjobs/messaging';
import { PrivyModule } from '@mintjobs/privy';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { NotificationMessageHandler } from './notification.message-handler';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    MessagingModule,
    PrivyModule,
    TypeOrmModule.forFeature([Notification]),
  ],
  providers: [NotificationService, NotificationGateway, NotificationMessageHandler],
})
export class AppModule {}
