import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Or } from 'typeorm';
import { DmMessage } from './entities/dm-message.entity';

@Injectable()
export class DmService {
  constructor(
    @InjectRepository(DmMessage)
    private readonly repo: Repository<DmMessage>,
  ) {}

  async saveMessage(
    senderWallet: string,
    recipientWallet: string,
    content: string,
  ): Promise<DmMessage> {
    const msg = this.repo.create({ senderWallet, recipientWallet, content });
    return this.repo.save(msg);
  }

  async getHistory(walletA: string, walletB: string, limit = 50): Promise<DmMessage[]> {
    return this.repo
      .createQueryBuilder('dm')
      .where(
        '(dm.sender_wallet = :a AND dm.recipient_wallet = :b) OR (dm.sender_wallet = :b AND dm.recipient_wallet = :a)',
        { a: walletA, b: walletB },
      )
      .orderBy('dm.created_at', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Returns one row per unique conversation partner for a given wallet,
   * including the last message and timestamp.
   */
  async getDmThreads(walletAddress: string): Promise<
    { otherWallet: string; lastMessage: string; lastAt: Date }[]
  > {
    // Get the latest message per unique (sender,recipient) pair involving this wallet
    const rows = await this.repo
      .createQueryBuilder('dm')
      .select([
        'CASE WHEN dm.sender_wallet = :w THEN dm.recipient_wallet ELSE dm.sender_wallet END AS "otherWallet"',
        'dm.content AS "lastMessage"',
        'dm.created_at AS "lastAt"',
        'ROW_NUMBER() OVER (PARTITION BY CASE WHEN dm.sender_wallet = :w THEN dm.recipient_wallet ELSE dm.sender_wallet END ORDER BY dm.created_at DESC) AS rn',
      ])
      .where('dm.sender_wallet = :w OR dm.recipient_wallet = :w', { w: walletAddress })
      .getRawMany();

    return rows
      .filter((r) => r.rn === '1' || r.rn === 1)
      .map((r) => ({
        otherWallet: r.otherWallet,
        lastMessage: r.lastMessage,
        lastAt: new Date(r.lastAt),
      }));
  }
}
