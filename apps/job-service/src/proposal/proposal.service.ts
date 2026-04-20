import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Proposal, ProposalStatus } from './entities/proposal.entity';
import { Job } from '../entities/job.entity';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalStatusDto } from './dto/update-proposal-status.dto';
import { FilterProposalDto } from './dto/filter-proposal.dto';
import { PaginatedResponse } from '@mintjobs/types';

export const DAILY_PROPOSAL_LIMIT = Number(process.env.DAILY_PROPOSAL_LIMIT ?? 5);

@Injectable()
export class ProposalService {
  constructor(
    @InjectRepository(Proposal)
    private readonly proposalRepository: Repository<Proposal>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
  ) {}

  async create(
    applicantId: string,
    dto: CreateProposalDto,
  ): Promise<{ proposal: Proposal; dailyLimit: number; proposalsUsedToday: number; proposalsRemainingToday: number }> {
    // Job existence check
    const job = await this.jobRepository.findOne({
      where: { id: dto.jobId },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (!job.isActive) throw new BadRequestException('Job is no longer accepting proposals');

    // Duplicate check
    const duplicate = await this.proposalRepository
      .createQueryBuilder('p')
      .where('p.applicant_id = :applicantId AND p.job_id = :jobId', {
        applicantId,
        jobId: dto.jobId,
      })
      .getOne();
    if (duplicate) {
      throw new ConflictException('You have already applied for this job');
    }

    // Daily limit check
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const todayCount = await this.proposalRepository.count({
      where: { applicantId, createdAt: MoreThanOrEqual(dayStart) },
    });
    if (todayCount >= DAILY_PROPOSAL_LIMIT) {
      throw new BadRequestException(
        `Daily proposal limit of ${DAILY_PROPOSAL_LIMIT} reached`,
      );
    }

    const proposal = await this.proposalRepository.save(
      this.proposalRepository.create({
        applicantId,
        job: { id: dto.jobId },
        links: dto.links,
        resumeUrl: dto.resumeUrl,
        coverLetter: dto.coverLetter,
      }),
    );

    const usedToday = todayCount + 1;
    return {
      proposal,
      dailyLimit: DAILY_PROPOSAL_LIMIT,
      proposalsUsedToday: usedToday,
      proposalsRemainingToday: DAILY_PROPOSAL_LIMIT - usedToday,
    };
  }

  async findMyProposals(
    applicantId: string,
    filter: FilterProposalDto,
  ): Promise<PaginatedResponse<Proposal>> {
    const { page = 1, limit = 20, status } = filter;

    const qb = this.proposalRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.job', 'job')
      .where('p.applicant_id = :applicantId', { applicantId })
      .orderBy('p.createdAt', 'DESC');

    if (status) qb.andWhere('p.status = :status', { status });

    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async countByJob(jobId: string): Promise<{ total: number; byStatus: Record<string, number> }> {
    const rows = await this.proposalRepository.manager.query(
      `SELECT status, COUNT(*) AS count FROM proposals WHERE job_id = $1::uuid GROUP BY status`,
      [jobId],
    );
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      byStatus[row.status] = Number(row.count);
      total += Number(row.count);
    }
    return { total, byStatus };
  }

  async findByJob(
    jobId: string,
    filter: FilterProposalDto,
  ): Promise<PaginatedResponse<Proposal>> {
    const { page = 1, limit = 20, status } = filter;

    const qb = this.proposalRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.job', 'job')
      .where('p.job_id = :jobId', { jobId })
      .orderBy('p.createdAt', 'DESC');

    if (status) qb.andWhere('p.status = :status', { status });

    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findByClient(
    clientId: string,
    filter: FilterProposalDto,
  ): Promise<PaginatedResponse<Proposal>> {
    const { page = 1, limit = 20, status } = filter;

    const qb = this.proposalRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.job', 'job')
      .where('job.user_id = :clientId', { clientId })
      .orderBy('p.createdAt', 'DESC');

    if (status) qb.andWhere('p.status = :status', { status });

    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findById(proposalId: string): Promise<Proposal> {
    const proposal = await this.proposalRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.job', 'job')
      .where('p.id = :proposalId', { proposalId })
      .getOne();
    if (!proposal) throw new NotFoundException('Proposal not found');
    return proposal;
  }

  async updateStatus(
    proposalId: string,
    callerId: string,
    dto: UpdateProposalStatusDto,
  ): Promise<Proposal> {
    const proposal = await this.proposalRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.job', 'job')
      .where('p.id = :proposalId', { proposalId })
      .getOne();
    if (!proposal) throw new NotFoundException('Proposal not found');

    const isClient = proposal.job.userId === callerId;
    const isApplicant = proposal.applicantId === callerId;

    if (!isClient && !isApplicant) {
      throw new ForbiddenException('You are not authorized to update this proposal');
    }

    if (proposal.status === ProposalStatus.REJECTED) {
      throw new BadRequestException('This proposal has already been rejected and cannot be updated');
    }

    if (proposal.status === ProposalStatus.HIRED || proposal.status === ProposalStatus.AWAITING_ACCEPTANCE) {
      // Only the applicant can act after a hire — and only to decline
      if (!isApplicant) {
        throw new ForbiddenException('This proposal has been hired and can no longer be updated by the client');
      }
      if (dto.status !== ProposalStatus.REJECTED) {
        throw new BadRequestException('You can only decline (reject) a hire offer');
      }
    } else {
      // Pre-hire: only the client can act
      if (!isClient) {
        throw new ForbiddenException('Only the job creator can update proposal status');
      }
    }

    // When client sets status to HIRED, transition to AWAITING_ACCEPTANCE
    if (dto.status === ProposalStatus.HIRED) {
      if (!dto.clientWallet || !dto.clientSignature) {
        throw new BadRequestException('clientWallet and clientSignature are required when hiring');
      }
      proposal.status = ProposalStatus.AWAITING_ACCEPTANCE;
      proposal.clientWallet = dto.clientWallet;
      proposal.clientSignature = dto.clientSignature;
    } else {
      proposal.status = dto.status;
    }

    return this.proposalRepository.save(proposal);
  }

  async acceptProposal(
    proposalId: string,
    applicantId: string,
    freelancerWallet: string,
    freelancerSignature: string,
  ): Promise<Proposal> {
    const proposal = await this.proposalRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.job', 'job')
      .where('p.id = :proposalId', { proposalId })
      .getOne();
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.applicantId !== applicantId) {
      throw new ForbiddenException('Only the applicant can accept this proposal');
    }
    if (proposal.status !== ProposalStatus.AWAITING_ACCEPTANCE) {
      throw new BadRequestException(
        `Proposal is not awaiting acceptance (current status: ${proposal.status})`,
      );
    }

    proposal.status = ProposalStatus.HIRED;
    proposal.freelancerWallet = freelancerWallet;
    proposal.freelancerSignature = freelancerSignature;
    return this.proposalRepository.save(proposal);
  }

  async getFreelancerStats(applicantId: string): Promise<{
    totalProposals: number;
    pendingProposals: number;
    shortlistedProposals: number;
    awaitingAcceptanceProposals: number;
    hiredProposals: number;
    rejectedProposals: number;
    proposalsUsedToday: number;
    proposalsRemainingToday: number;
    dailyLimit: number;
  }> {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const result = await this.proposalRepository.manager.query(
      `
      SELECT
        COUNT(*) AS "totalProposals",
        COUNT(*) FILTER (WHERE status = 'pending') AS "pendingProposals",
        COUNT(*) FILTER (WHERE status = 'shortlisted') AS "shortlistedProposals",
        COUNT(*) FILTER (WHERE status = 'awaiting_acceptance') AS "awaitingAcceptanceProposals",
        COUNT(*) FILTER (WHERE status = 'hired') AS "hiredProposals",
        COUNT(*) FILTER (WHERE status = 'rejected') AS "rejectedProposals",
        COUNT(*) FILTER (WHERE created_at >= $2) AS "proposalsUsedToday"
      FROM proposals
      WHERE applicant_id = $1
      `,
      [applicantId, dayStart],
    );

    const row = result[0];
    const usedToday = Number(row.proposalsUsedToday);

    return {
      totalProposals: Number(row.totalProposals),
      pendingProposals: Number(row.pendingProposals),
      shortlistedProposals: Number(row.shortlistedProposals),
      awaitingAcceptanceProposals: Number(row.awaitingAcceptanceProposals),
      hiredProposals: Number(row.hiredProposals),
      rejectedProposals: Number(row.rejectedProposals),
      proposalsUsedToday: usedToday,
      proposalsRemainingToday: Math.max(0, DAILY_PROPOSAL_LIMIT - usedToday),
      dailyLimit: DAILY_PROPOSAL_LIMIT,
    };
  }
}
