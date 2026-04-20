import { Module } from '@nestjs/common';
import { ConfigModule } from '@mintjobs/config';
import { LoggerModule } from '@mintjobs/logger';
import { DatabaseModule } from '@mintjobs/database';
import { MessagingModule } from '@mintjobs/messaging';
import { AuthModule } from '@mintjobs/auth';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    MessagingModule,
    AuthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
