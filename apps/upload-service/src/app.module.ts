import { Module } from '@nestjs/common';
import { ConfigModule } from '@mintjobs/config';
import { LoggerModule } from '@mintjobs/logger';
import { PrivyModule } from '@mintjobs/privy';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    PrivyModule,
    UploadModule,
  ],
})
export class AppModule {}
