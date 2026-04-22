import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';

@Entity('tokens')
export class Token extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId: string; // Privy DID

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'symbol', type: 'varchar', length: 50 })
  symbol: string;

  /** Contract address (mint address on Solana) */
  @Column({ name: 'ca', type: 'varchar', length: 255 })
  ca: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl?: string;

  /** On-chain tx signature confirming the token was created */
  @Column({ name: 'tx_signature', type: 'varchar', length: 255, nullable: true })
  txSignature?: string;

  /** Whether the on-chain transaction has been verified and confirmed */
  @Column({ name: 'confirmed', type: 'boolean', default: false })
  confirmed: boolean;
}
