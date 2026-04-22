import { Injectable } from '@nestjs/common';
import { CommunityService } from './community.service';
import { DmService } from '../dm/dm.service';

export interface ConversationItem {
  type: 'dm' | 'community';
  lastMessage: string;
  lastAt: string; // ISO string

  // dm fields
  otherWallet?: string;

  // community fields
  ca?: string;
  name?: string;
  symbol?: string;
  logoUrl?: string | null;
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly communityService: CommunityService,
    private readonly dmService: DmService,
  ) {}

  async getConversations(walletAddress: string): Promise<ConversationItem[]> {
    const [dmThreads, communityThreads] = await Promise.all([
      this.dmService.getDmThreads(walletAddress),
      this.communityService.getCommunityThreads(walletAddress),
    ]);

    const dms: ConversationItem[] = dmThreads.map((t) => ({
      type: 'dm',
      otherWallet: t.otherWallet,
      lastMessage: t.lastMessage,
      lastAt: t.lastAt.toISOString(),
    }));

    const communities: ConversationItem[] = communityThreads.map((t) => ({
      type: 'community',
      ca: t.community.ca,
      name: t.community.name,
      symbol: t.community.symbol,
      logoUrl: t.community.logoUrl,
      lastMessage: t.lastMessage,
      lastAt: t.lastAt.toISOString(),
    }));

    return [...dms, ...communities].sort(
      (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
    );
  }
}
