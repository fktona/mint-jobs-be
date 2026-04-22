import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';

@Entity('defi_profiles')
export class DefiProfile extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId: string;

  @Column({ name: 'name', type: 'varchar', length: 255, nullable: true })
  name?: string;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl?: string;

  @Column({ name: 'bio', type: 'text', nullable: true })
  bio?: string;

  /** Creator's wallet address — used to count followers */
  @Column({ name: 'wallet_address', type: 'varchar', length: 255, nullable: true })
  walletAddress?: string;
}
