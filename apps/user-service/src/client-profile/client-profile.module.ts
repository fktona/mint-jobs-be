import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientProfile } from './entities/client-profile.entity';
import { ClientProfileService } from './client-profile.service';
import { ClientProfileMessageHandler } from './client-profile.message-handler';

@Module({
  imports: [TypeOrmModule.forFeature([ClientProfile])],
  providers: [ClientProfileService, ClientProfileMessageHandler],
  exports: [ClientProfileService],
})
export class ClientProfileModule {}
