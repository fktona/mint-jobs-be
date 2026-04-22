import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Follow } from './entities/follow.entity';

@Injectable()
export class FollowService {
  private readonly logger = new Logger(FollowService.name);

  constructor(
    @InjectRepository(Follow)
    private readonly repo: Repository<Follow>,
  ) {}

  async follow(followerId: string, followingWallet: string): Promise<{ followed: true }> {
    try {
      await this.repo.insert({ followerId, followingWallet });
    } catch (err: any) {
      // Unique constraint violation — already following, treat as idempotent
      if (err?.code === '23505') {
        return { followed: true };
      }
      throw err;
    }
    return { followed: true };
  }

  async unfollow(followerId: string, followingWallet: string): Promise<{ unfollowed: true }> {
    await this.repo.delete({ followerId, followingWallet });
    return { unfollowed: true };
  }

  async isFollowing(followerId: string, followingWallet: string): Promise<{ following: boolean }> {
    const exists = await this.repo.exists({ where: { followerId, followingWallet } });
    return { following: exists };
  }
}
