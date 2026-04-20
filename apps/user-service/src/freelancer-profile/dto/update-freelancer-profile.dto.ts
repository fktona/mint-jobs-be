import { PartialType } from '@nestjs/swagger';
import { CreateFreelancerProfileDto } from './create-freelancer-profile.dto';

export class UpdateFreelancerProfileDto extends PartialType(
  CreateFreelancerProfileDto,
) {}
