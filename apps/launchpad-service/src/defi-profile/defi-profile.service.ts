import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DefiProfile } from './entities/defi-profile.entity';
import { Follow } from '../follow/entities/follow.entity';
import { UpsertDefiProfileDto } from './dto/defi-profile.dto';

export interface DefiProfileWithCounts extends DefiProfile {
  followingCount: number;
  followersCount: number;
}

@Injectable()
export class DefiProfileService {
  private readonly logger = new Logger(DefiProfileService.name);

  constructor(
    @InjectRepository(DefiProfile)
    private readonly repo: Repository<DefiProfile>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
  ) {}

  async upsert(userId: string, dto: UpsertDefiProfileDto): Promise<DefiProfileWithCounts> {
    await this.repo.upsert(
      { userId, ...dto },
      { conflictPaths: ['userId'], skipUpdateIfNoValuesChanged: true },
    );
    return this.findOne(userId) as Promise<DefiProfileWithCounts>;
  }

  async findOne(userId: string): Promise<DefiProfileWithCounts | null> {
    const profile = await this.repo.findOne({ where: { userId } });
    if (!profile) return null;

    const [followingCount, followersCount] = await Promise.all([
      // how many wallets this user is following
      this.followRepo.count({ where: { followerId: userId } }),
      // how many users follow this wallet (if wallet address is stored)
      profile.walletAddress
        ? this.followRepo.count({ where: { followingWallet: profile.walletAddress } })
        : Promise.resolve(0),
    ]);

    return { ...profile, followingCount, followersCount };
  }
}
