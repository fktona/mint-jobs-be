import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@mintjobs/config';
import { MessagingService } from './messaging.service';
import { PublisherService } from './publisher.service';
import { ConsumerService } from './consumer.service';
import { RequestResponseService } from './request-response.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    MessagingService,
    PublisherService,
    ConsumerService,
    RequestResponseService,
  ],
  exports: [
    MessagingService,
    PublisherService,
    ConsumerService,
    RequestResponseService,
  ],
})
export class MessagingModule {}
