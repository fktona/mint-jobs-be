import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FreelancerProfile } from './entities/freelancer-profile.entity';
import { CreateFreelancerProfileDto } from './dto/create-freelancer-profile.dto';
import { UpdateFreelancerProfileDto } from './dto/update-freelancer-profile.dto';

@Injectable()
export class FreelancerProfileService {
  constructor(
    @InjectRepository(FreelancerProfile)
    private readonly profileRepository: Repository<FreelancerProfile>,
  ) {}

  async create(
    userId: string,
    dto: CreateFreelancerProfileDto,
  ): Promise<FreelancerProfile> {
    const existing = await this.profileRepository.findOne({ where: { userId } });
    if (existing) {
      throw new ConflictException('Freelancer profile already exists for this user');
    }

    const profile = this.profileRepository.create({ userId, ...dto });
    return this.profileRepository.save(profile);
  }

  async update(
    userId: string,
    dto: UpdateFreelancerProfileDto,
  ): Promise<FreelancerProfile> {
    const profile = await this.profileRepository.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Freelancer profile not found');
    }

    Object.assign(profile, dto);
    return this.profileRepository.save(profile);
  }

  async findByUserId(userId: string): Promise<FreelancerProfile> {
    const profile = await this.profileRepository.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Freelancer profile not found');
    }
    return profile;
  }

  async findByUserIds(userIds: string[]): Promise<FreelancerProfile[]> {
    if (!userIds.length) return [];
    return this.profileRepository
      .createQueryBuilder('fp')
      .where('fp.user_id IN (:...userIds)', { userIds })
      .getMany();
  }
}
