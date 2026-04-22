import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';

@Entity('follows')
@Index('UQ_follow_follower_following', ['followerId', 'followingWallet'], { unique: true })
export class Follow extends BaseEntity {
  @Index()
  @Column({ name: 'follower_id', type: 'varchar', length: 255 })
  followerId: string; // Privy DID of the user who follows

  @Column({ name: 'following_wallet', type: 'varchar', length: 255 })
  followingWallet: string; // wallet address of the user being followed
}
