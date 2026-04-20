import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';

export enum MilestoneStatus {
  PENDING = 'pending',     // created, not yet funded on-chain
  FUNDED = 'funded',       // client funded the PDA
  LOCKED = 'locked',       // freelancer hired, funds locked by authority
  RELEASED = 'released',   // funds sent to freelancer
  REFUNDED = 'refunded',   // funds returned to client
}

@Index('idx_milestone_job_id', ['jobId'])
@Entity('milestones')
export class Milestone extends BaseEntity {
  /** Parent job this milestone belongs to */
  @Column({ name: 'job_id', type: 'varchar', length: 255 })
  jobId: string;

  @Column({ name: 'client_id', type: 'varchar', length: 255, nullable: true })
  clientId: string | null;

  @Column({ name: 'freelancer_id', type: 'varchar', length: 255, nullable: true })
  freelancerId: string | null;

  @Column({ name: 'client_wallet', type: 'varchar', length: 255, nullable: true })
  clientWallet: string | null;

  @Column({ name: 'freelancer_wallet', type: 'varchar', length: 255, nullable: true })
  freelancerWallet: string | null;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  /** Display order within the job (1-based) */
  @Column({ name: 'order', type: 'int' })
  order: number;

  /** Fixed amount set at creation. Stored as string to avoid JS bigint precision loss */
  @Column({ name: 'amount_lamports', type: 'bigint' })
  amountLamports: string;

  /** Platform fee (2.5%) tracked for audit. Stored as string for bigint safety. */
  @Column({ name: 'platform_fee_lamports', type: 'bigint', default: '0' })
  platformFeeLamports: string;

  @Column({ name: 'status', type: 'enum', enum: MilestoneStatus, default: MilestoneStatus.PENDING })
  status: MilestoneStatus;

  /** Escrow state PDA (populated after funding) */
  @Column({ name: 'escrow_pda', type: 'varchar', length: 255, nullable: true })
  escrowPda: string | null;

  /** Vault PDA holding lamports (populated after funding) */
  @Column({ name: 'vault_pda', type: 'varchar', length: 255, nullable: true })
  vaultPda: string | null;

  @Column({ name: 'tx_signature', type: 'varchar', length: 255, nullable: true })
  txSignature: string | null;
}
