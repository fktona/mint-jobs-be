import { Module } from '@nestjs/common';
import { ConfigModule } from '@mintjobs/config';
import { LoggerModule } from '@mintjobs/logger';
import { DatabaseModule } from '@mintjobs/database';
import { MessagingModule } from '@mintjobs/messaging';
import { EscrowModule } from './escrow.module';

@Module({
  imports: [ConfigModule, LoggerModule, DatabaseModule, MessagingModule, EscrowModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
