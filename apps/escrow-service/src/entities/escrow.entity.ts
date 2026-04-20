import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';

export enum EscrowStatus {
  FUNDED = 'funded',
  LOCKED = 'locked',
  RELEASED = 'released',
  REFUNDED = 'refunded',
}

@Entity('escrows')
export class Escrow extends BaseEntity {
  @Column({ name: 'job_id', type: 'varchar', length: 255, unique: true })
  jobId: string;

  @Column({ name: 'client_id', type: 'varchar', length: 255 })
  clientId: string;

  @Column({ name: 'freelancer_id', type: 'varchar', length: 255, nullable: true })
  freelancerId: string | null;

  @Column({ name: 'client_wallet', type: 'varchar', length: 255 })
  clientWallet: string;

  @Column({ name: 'freelancer_wallet', type: 'varchar', length: 255, nullable: true })
  freelancerWallet: string | null;

  @Column({ name: 'escrow_pda', type: 'varchar', length: 255 })
  escrowPda: string;

  @Column({ name: 'vault_pda', type: 'varchar', length: 255 })
  vaultPda: string;

  /** Stored as string to avoid JS bigint precision loss */
  @Column({ name: 'amount_lamports', type: 'bigint' })
  amountLamports: string;

  /** Platform fee (2.5%) tracked for audit. Stored as string for bigint safety. */
  @Column({ name: 'platform_fee_lamports', type: 'bigint', default: '0' })
  platformFeeLamports: string;

  @Column({ name: 'status', type: 'enum', enum: EscrowStatus, default: EscrowStatus.FUNDED })
  status: EscrowStatus;

  @Column({ name: 'tx_signature', type: 'varchar', length: 255, nullable: true })
  txSignature: string | null;
}
