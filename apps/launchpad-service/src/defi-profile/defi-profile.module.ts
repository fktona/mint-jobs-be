import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@mintjobs/config';
import { DefiProfile } from './entities/defi-profile.entity';
import { Follow } from '../follow/entities/follow.entity';
import { DefiProfileService } from './defi-profile.service';
import { DefiProfileMessageHandler } from './defi-profile.message-handler';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([DefiProfile, Follow])],
  providers: [DefiProfileService, DefiProfileMessageHandler],
})
export class DefiProfileModule {}
