import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FreelancerProfile } from './entities/freelancer-profile.entity';
import { FreelancerProfileService } from './freelancer-profile.service';
import { FreelancerProfileMessageHandler } from './freelancer-profile.message-handler';

@Module({
  imports: [TypeOrmModule.forFeature([FreelancerProfile])],
  providers: [FreelancerProfileService, FreelancerProfileMessageHandler],
  exports: [FreelancerProfileService],
})
export class FreelancerProfileModule {}
