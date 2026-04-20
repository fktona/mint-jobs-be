import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';

export enum ContractStatus {
  GENERATING = 'generating',
  GENERATED = 'generated',
  FAILED = 'failed',
  TERMINATED = 'terminated',
  COMPLETED = 'completed',
}

export enum ContractProgress {
  ACTIVE = 'active',
  TERMINATED = 'terminated',
  COMPLETED = 'completed',
}

export function deriveProgress(status: ContractStatus): ContractProgress {
  if (status === ContractStatus.TERMINATED) return ContractProgress.TERMINATED;
  if (status === ContractStatus.COMPLETED) return ContractProgress.COMPLETED;
  return ContractProgress.ACTIVE;
}

@Entity('contracts')
export class Contract extends BaseEntity {
  @Column({ name: 'proposal_id', type: 'varchar', unique: true })
  proposalId: string;

  @Column({ name: 'job_id', type: 'varchar' })
  jobId: string;

  @Column({ name: 'client_id', type: 'varchar' })
  clientId: string;

  @Column({ name: 'applicant_id', type: 'varchar' })
  applicantId: string;

  @Column({ name: 'contract_url', type: 'varchar', length: 1000, nullable: true })
  contractUrl?: string;

  @Column({ name: 'termination_url', type: 'varchar', length: 1000, nullable: true })
  terminationUrl?: string;

  @Column({ name: 'completion_url', type: 'varchar', length: 1000, nullable: true })
  completionUrl?: string;

  @Column({ name: 'terminated_at', type: 'timestamptz', nullable: true })
  terminatedAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ name: 'terminated_by', type: 'varchar', nullable: true })
  terminatedBy?: string;

  @Column({ name: 'termination_reason', type: 'text', nullable: true })
  terminationReason?: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ContractStatus,
    default: ContractStatus.GENERATING,
  })
  status: ContractStatus;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string;

  // ─── IPFS / On-chain fields ──────────────────────────────────────────────

  @Column({ name: 'ipfs_pdf_url', type: 'varchar', length: 500, nullable: true })
  ipfsPdfUrl?: string;

  @Column({ name: 'ipfs_pdf_cid', type: 'varchar', length: 100, nullable: true })
  ipfsPdfCid?: string;

  @Column({ name: 'ipfs_metadata_url', type: 'varchar', length: 500, nullable: true })
  ipfsMetadataUrl?: string;

  @Column({ name: 'ipfs_metadata_cid', type: 'varchar', length: 100, nullable: true })
  ipfsMetadataCid?: string;

  /** Hex-encoded SHA-256 of the contract PDF bytes */
  @Column({ name: 'pdf_hash', type: 'varchar', length: 64, nullable: true })
  pdfHash?: string;

  @Column({ name: 'onchain_tx_signature', type: 'varchar', length: 255, nullable: true })
  onchainTxSignature?: string;

  @Column({ name: 'contract_pda', type: 'varchar', length: 255, nullable: true })
  contractPda?: string;

  @Column({ name: 'client_wallet', type: 'varchar', length: 255, nullable: true })
  clientWallet?: string;

  @Column({ name: 'freelancer_wallet', type: 'varchar', length: 255, nullable: true })
  freelancerWallet?: string;

  // ─── Completion cert IPFS / On-chain ─────────────────────────────────────

  @Column({ name: 'completion_ipfs_pdf_url', type: 'varchar', length: 500, nullable: true })
  completionIpfsPdfUrl?: string;

  @Column({ name: 'completion_ipfs_pdf_cid', type: 'varchar', length: 100, nullable: true })
  completionIpfsPdfCid?: string;

  @Column({ name: 'completion_ipfs_metadata_url', type: 'varchar', length: 500, nullable: true })
  completionIpfsMetadataUrl?: string;

  @Column({ name: 'completion_pdf_hash', type: 'varchar', length: 64, nullable: true })
  completionPdfHash?: string;

  @Column({ name: 'completion_onchain_tx_signature', type: 'varchar', length: 255, nullable: true })
  completionOnchainTxSignature?: string;
}
