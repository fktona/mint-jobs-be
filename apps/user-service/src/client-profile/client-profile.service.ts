import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProfile } from './entities/client-profile.entity';
import { CreateClientProfileDto } from './dto/create-client-profile.dto';
import { UpdateClientProfileDto } from './dto/update-client-profile.dto';

@Injectable()
export class ClientProfileService {
  constructor(
    @InjectRepository(ClientProfile)
    private readonly profileRepository: Repository<ClientProfile>,
  ) {}

  async create(userId: string, dto: CreateClientProfileDto): Promise<ClientProfile> {
    const existing = await this.profileRepository.findOne({ where: { userId } });
    if (existing) {
      throw new ConflictException('Client profile already exists for this user');
    }
    const profile = this.profileRepository.create({ userId, ...dto });
    return this.profileRepository.save(profile);
  }

  async update(userId: string, dto: UpdateClientProfileDto): Promise<ClientProfile> {
    const profile = await this.profileRepository.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Client profile not found');
    }
    Object.assign(profile, dto);
    return this.profileRepository.save(profile);
  }

  async findByUserId(userId: string): Promise<ClientProfile> {
    const profile = await this.profileRepository.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Client profile not found');
    }
    return profile;
  }
}
