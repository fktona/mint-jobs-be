import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@mintjobs/config';
import { LoggerModule } from '@mintjobs/logger';
import { DatabaseModule } from '@mintjobs/database';
import { MessagingModule } from '@mintjobs/messaging';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './notification.service';
import { NotificationMessageHandler } from './notification.message-handler';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    MessagingModule,
    TypeOrmModule.forFeature([Notification]),
  ],
  providers: [NotificationService, NotificationMessageHandler],
})
export class AppModule {}
