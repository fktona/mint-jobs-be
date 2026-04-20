import { Entity, Column, Index, ManyToOne, JoinColumn, RelationId } from 'typeorm';
import { BaseEntity } from '@mintjobs/database';
import { Job } from '../../entities/job.entity';

export enum ProposalStatus {
  PENDING = 'pending',
  SHORTLISTED = 'shortlisted',
  AWAITING_ACCEPTANCE = 'awaiting_acceptance',
  HIRED = 'hired',
  REJECTED = 'rejected',
}


@Entity('proposals')
@Index('IDX_proposal_unique_applicant_job', ['applicantId', 'job'], { unique: true })
export class Proposal extends BaseEntity {
  @ManyToOne(() => Job, { eager: false, nullable: false })
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @RelationId((p: Proposal) => p.job)
  jobId: string;

  @Column({ type: 'varchar', length: 255 })
  applicantId: string;

  @Column({ type: 'text', array: true, default: '{}' })
  links: string[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  resumeUrl?: string;

  @Column({ type: 'text', nullable: true })
  coverLetter?: string;

  @Column({
    type: 'enum',
    enum: ProposalStatus,
    default: ProposalStatus.PENDING,
  })
  status: ProposalStatus;

  @Column({ name: 'client_wallet', type: 'varchar', length: 255, nullable: true })
  clientWallet?: string;

  @Column({ name: 'client_signature', type: 'text', nullable: true })
  clientSignature?: string;

  @Column({ name: 'freelancer_wallet', type: 'varchar', length: 255, nullable: true })
  freelancerWallet?: string;

  @Column({ name: 'freelancer_signature', type: 'text', nullable: true })
  freelancerSignature?: string;
}
