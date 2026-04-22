import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Community } from './entities/community.entity';
import { CommunityMessage } from './entities/community-message.entity';

@Injectable()
export class CommunityService {
  constructor(
    @InjectRepository(Community)
    private readonly communityRepo: Repository<Community>,
    @InjectRepository(CommunityMessage)
    private readonly messageRepo: Repository<CommunityMessage>,
  ) {}

  /** Get or create community. Requires name+symbol+logoUrl on first create. */
  async getOrCreate(params: {
    ca: string;
    name?: string;
    symbol?: string;
    logoUrl?: string;
  }): Promise<Community> {
    const existing = await this.communityRepo.findOne({ where: { ca: params.ca } });
    if (existing) return existing;

    const community = this.communityRepo.create({
      ca: params.ca,
      name: params.name ?? params.ca,
      symbol: params.symbol ?? '',
      logoUrl: params.logoUrl,
    });
    return this.communityRepo.save(community);
  }

  async findByCa(ca: string): Promise<Community | null> {
    return this.communityRepo.findOne({ where: { ca } });
  }

  async saveMessage(ca: string, senderWallet: string, content: string): Promise<CommunityMessage> {
    const msg = this.messageRepo.create({ ca, senderWallet, content });
    return this.messageRepo.save(msg);
  }

  async getMessages(ca: string, limit = 50): Promise<CommunityMessage[]> {
    return this.messageRepo.find({
      where: { ca },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Returns all communities a wallet has posted in,
   * with the last message and community metadata.
   */
  async getCommunityThreads(walletAddress: string): Promise<
    { community: Community; lastMessage: string; lastAt: Date }[]
  > {
    const rows = await this.messageRepo
      .createQueryBuilder('cm')
      .select([
        'cm.ca AS ca',
        'cm.content AS "lastMessage"',
        'cm.created_at AS "lastAt"',
        'ROW_NUMBER() OVER (PARTITION BY cm.ca ORDER BY cm.created_at DESC) AS rn',
      ])
      .where('cm.sender_wallet = :w', { w: walletAddress })
      .getRawMany();

    const latest = rows.filter((r) => r.rn === '1' || r.rn === 1);
    if (!latest.length) return [];

    const cas = latest.map((r) => r.ca);
    const communities = await this.communityRepo
      .createQueryBuilder('c')
      .where('c.ca IN (:...cas)', { cas })
      .getMany();

    const communityMap = new Map(communities.map((c) => [c.ca, c]));

    return latest
      .map((r) => ({
        community: communityMap.get(r.ca)!,
        lastMessage: r.lastMessage,
        lastAt: new Date(r.lastAt),
      }))
      .filter((r) => r.community);
  }
}
