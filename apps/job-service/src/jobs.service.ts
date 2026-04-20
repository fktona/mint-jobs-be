import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { Job, PaymentType, ExperienceLevel } from './entities/job.entity';
import { SavedJob } from './entities/saved-job.entity';
import {
  CreateJobDto,
  UpdateJobDto,
  UpdateJobStatusDto,
  FilterJobDto,
  JobResponseDto,
  SaveDraftDto,
  FilterDraftDto,
  TimeWindow,
} from './dto/job.dto';
import { PaginatedResponse } from '@mintjobs/types';
import { createPaginatedResponse } from '@mintjobs/utils';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private jobsRepository: Repository<Job>,
    @InjectRepository(SavedJob)
    private savedJobRepository: Repository<SavedJob>,
  ) {}

  /**
   * Get all jobs with pagination and filters
   */
  async findAll(filterDto: FilterJobDto): Promise<PaginatedResponse<JobResponseDto>> {
    const { page = 1, limit = 20, ...filters } = filterDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.jobsRepository
      .createQueryBuilder('job')
      .where('job.deletedAt IS NULL');

    // Apply filters
    if (filters.category) {
      queryBuilder.andWhere('job.category = :category', { category: filters.category });
    }

    if (filters.experienceLevel) {
      queryBuilder.andWhere('job.experienceLevel = :experienceLevel', {
        experienceLevel: filters.experienceLevel,
      });
    }

    if (filters.location) {
      queryBuilder.andWhere('job.location = :location', { location: filters.location });
    }

    if (filters.minPay !== undefined) {
      queryBuilder.andWhere('job.payRangeMax >= :minPay', { minPay: filters.minPay });
    }

    if (filters.maxPay !== undefined) {
      queryBuilder.andWhere('job.payRangeMin <= :maxPay', { maxPay: filters.maxPay });
    }

    if (filters.paymentType) {
      queryBuilder.andWhere('job.paymentType = :paymentType', {
        paymentType: filters.paymentType,
      });
    }

    if (filters.languages && filters.languages.length > 0) {
      queryBuilder.andWhere('job.languages && :languages', { languages: filters.languages });
    }

    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('job.isActive = :isActive', { isActive: filters.isActive });
    }

    this.applyTimeWindow(queryBuilder, filters.timeWindow);

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination and ordering
    const jobs = await queryBuilder
      .orderBy('job.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    const data = jobs.map((job) => this.mapToResponseDto(job));

    return createPaginatedResponse(data, total, page, limit);
  }

  /**
   * Get a single job by ID
   */
  async findOne(id: string): Promise<JobResponseDto> {
    const job = await this.jobsRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    return this.mapToResponseDto(job);
  }

  /**
   * Get jobs by user ID
   */
  async findMyJobs(userId: string, filterDto: FilterJobDto): Promise<PaginatedResponse<JobResponseDto>> {
    const { page = 1, limit = 20, ...filters } = filterDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.jobsRepository
      .createQueryBuilder('job')
      .where('job.deletedAt IS NULL')
      .andWhere('job.userId = :userId', { userId });

    // Apply filters (same as findAll)
    if (filters.category) {
      queryBuilder.andWhere('job.category = :category', { category: filters.category });
    }

    if (filters.experienceLevel) {
      queryBuilder.andWhere('job.experienceLevel = :experienceLevel', {
        experienceLevel: filters.experienceLevel,
      });
    }

    if (filters.location) {
      queryBuilder.andWhere('job.location = :location', { location: filters.location });
    }

    if (filters.minPay !== undefined) {
      queryBuilder.andWhere('job.payRangeMax >= :minPay', { minPay: filters.minPay });
    }

    if (filters.maxPay !== undefined) {
      queryBuilder.andWhere('job.payRangeMin <= :maxPay', { maxPay: filters.maxPay });
    }

    if (filters.paymentType) {
      queryBuilder.andWhere('job.paymentType = :paymentType', {
        paymentType: filters.paymentType,
      });
    }

    if (filters.languages && filters.languages.length > 0) {
      queryBuilder.andWhere('job.languages && :languages', { languages: filters.languages });
    }

    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('job.isActive = :isActive', { isActive: filters.isActive });
    }

    this.applyTimeWindow(queryBuilder, filters.timeWindow);

    const total = await queryBuilder.getCount();

    const jobs = await queryBuilder
      .orderBy('job.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    const data = jobs.map((job) => this.mapToResponseDto(job));

    return createPaginatedResponse(data, total, page, limit);
  }

  /**
   * Map frontend expertise level to backend enum
   */
  private applyTimeWindow(qb: any, timeWindow?: TimeWindow): void {
    if (!timeWindow || timeWindow === TimeWindow.ALL) return;
    const days = timeWindow === TimeWindow.RECENT ? 3 : timeWindow === TimeWindow.WEEK ? 7 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    qb.andWhere('job.createdAt >= :since', { since });
  }

  private mapExpertiseLevel(frontendLevel: string): ExperienceLevel {
    const mapping: Record<string, ExperienceLevel> = {
      'beginner-level': ExperienceLevel.BEGINNER,
      'intermediate-level': ExperienceLevel.INTERMEDIATE,
      'expert-level': ExperienceLevel.EXPERT,
    };
    return mapping[frontendLevel] || ExperienceLevel.BEGINNER;
  }

  /**
   * Map frontend payment type to backend enum
   */
  private mapPaymentType(frontendType: string): PaymentType {
    const mapping: Record<string, PaymentType> = {
      'full-payment': PaymentType.FULL_PAYMENT,
      'milestone-payment': PaymentType.MILESTONE,
    };
    return mapping[frontendType] || PaymentType.FULL_PAYMENT;
  }

  /**
   * Calculate duration in days from start and end dates
   */
  private calculateDuration(startDate: Date, endDate: Date): number {
    const diffTime = endDate.getTime() - startDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Convert milestone with dueDate to milestone with duration
   */
  private convertMilestones(milestones: any[], startDate: Date): any[] {
    return milestones.map((milestone) => {
      const converted: any = {
        name: milestone.name,
        amount: typeof milestone.amount === 'string' ? parseFloat(milestone.amount) : milestone.amount,
        description: milestone.description,
      };

      // If dueDate is provided, calculate duration from startDate
      if (milestone.dueDate) {
        const dueDate = new Date(milestone.dueDate);
        converted.duration = this.calculateDuration(startDate, dueDate);
        converted.dueDate = milestone.dueDate; // Keep dueDate for reference
      } else if (milestone.duration) {
        converted.duration = milestone.duration;
      }

      return converted;
    });
  }

  /**
   * Create a new job
   */
  async create(userId: string, createJobDto: CreateJobDto): Promise<JobResponseDto> {
    // Validate milestones if payment type is milestone
    const paymentType = this.mapPaymentType(createJobDto.payment.type);
    if (paymentType === PaymentType.MILESTONE && (!createJobDto.payment.milestones || createJobDto.payment.milestones.length === 0)) {
      throw new BadRequestException('Milestones are required when payment type is milestone-payment');
    }

    const startDate = new Date(createJobDto.startDate);
    const endDate = new Date(createJobDto.endDate);

    // Calculate duration from start and end dates
    const duration = this.calculateDuration(startDate, endDate);

    // Convert milestones if present
    let milestones = null;
    if (createJobDto.payment.milestones && createJobDto.payment.milestones.length > 0) {
      milestones = this.convertMilestones(createJobDto.payment.milestones, startDate);
    }

    const job = this.jobsRepository.create({
      userId,
      title: createJobDto.jobTitle,
      description: createJobDto.jobDescription,
      category: createJobDto.category,
      skills: createJobDto.skills || [],
      startDate,
      endDate,
      duration,
      languages: createJobDto.languages || [],
      payRangeMin: createJobDto.payment.fromAmount,
      payRangeMax: createJobDto.payment.toAmount,
      payFromCurrency: createJobDto.payment.fromCurrency,
      payToCurrency: createJobDto.payment.toCurrency,
      paymentType,
      milestones,
      location: createJobDto.location || 'global',
      experienceLevel: this.mapExpertiseLevel(createJobDto.expertiseLevel),
      freelancersCount: createJobDto.freelancersCount || undefined,
      isActive: false, // inactive until escrow is funded
    });

    const savedJob = await this.jobsRepository.save(job);

    return this.mapToResponseDto(savedJob);
  }

  /**
   * Set job active/inactive — called by escrow events (no ownership check).
   */
  async getClientStats(userId: string): Promise<{
    totalJobs: number;
    activeJobs: number;
    inactiveJobs: number;
    completedJobs: number;
    draftJobs: number;
    pendingProposals: number;
    totalProposals: number;
  }> {
    const result = await this.jobsRepository.manager.query(
      `
      SELECT
        COUNT(DISTINCT j.id) FILTER (WHERE j.is_draft = false AND j.deleted_at IS NULL)
          AS "totalJobs",
        COUNT(DISTINCT j.id) FILTER (WHERE j.is_draft = false AND j.deleted_at IS NULL AND j.is_active = true)
          AS "activeJobs",
        COUNT(DISTINCT j.id) FILTER (WHERE j.is_draft = false AND j.deleted_at IS NULL AND j.is_active = false)
          AS "inactiveJobs",
        COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'completed')
          AS "completedJobs",
        COUNT(DISTINCT j.id) FILTER (WHERE j.is_draft = true AND j.deleted_at IS NULL)
          AS "draftJobs",
        COUNT(p.id) FILTER (WHERE p.status = 'pending')
          AS "pendingProposals",
        COUNT(p.id)
          AS "totalProposals"
      FROM jobs j
      LEFT JOIN proposals p ON p.job_id::text = j.id::text
      LEFT JOIN contracts c ON c.job_id::text = j.id::text
      WHERE j.user_id = $1::text
      `,
      [userId],
    );

    const row = result[0];
    return {
      totalJobs: Number(row.totalJobs),
      activeJobs: Number(row.activeJobs),
      inactiveJobs: Number(row.inactiveJobs),
      completedJobs: Number(row.completedJobs),
      draftJobs: Number(row.draftJobs),
      pendingProposals: Number(row.pendingProposals),
      totalProposals: Number(row.totalProposals),
    };
  }

  async setActive(jobId: string, isActive: boolean): Promise<void> {
    const job = await this.jobsRepository.findOne({
      where: { id: jobId, isDraft: false, deletedAt: IsNull() },
    });
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    job.isActive = isActive;
    await this.jobsRepository.save(job);
  }

  /**
   * Update a job
   */
  async update(id: string, userId: string, updateJobDto: UpdateJobDto): Promise<JobResponseDto> {
    const job = await this.jobsRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    // Check if user owns the job
    if (job.userId !== userId) {
      throw new ForbiddenException('You can only update your own jobs');
    }

    // Update fields
    if (updateJobDto.title !== undefined) job.title = updateJobDto.title;
    if (updateJobDto.description !== undefined) job.description = updateJobDto.description;
    if (updateJobDto.category !== undefined) job.category = updateJobDto.category;
    if (updateJobDto.startDate !== undefined) job.startDate = new Date(updateJobDto.startDate);
    if (updateJobDto.endDate !== undefined) job.endDate = new Date(updateJobDto.endDate);
    if (updateJobDto.duration !== undefined) job.duration = updateJobDto.duration;
    if (updateJobDto.languages !== undefined) job.languages = updateJobDto.languages;
    if (updateJobDto.skills !== undefined) job.skills = updateJobDto.skills;
    if (updateJobDto.freelancersCount !== undefined) {
      job.freelancersCount = updateJobDto.freelancersCount;
    }
    if (updateJobDto.payRangeMin !== undefined) job.payRangeMin = updateJobDto.payRangeMin;
    if (updateJobDto.payRangeMax !== undefined) job.payRangeMax = updateJobDto.payRangeMax;
    if (updateJobDto.paymentType !== undefined) job.paymentType = updateJobDto.paymentType;
    if (updateJobDto.milestones !== undefined) job.milestones = updateJobDto.milestones || null;
    if (updateJobDto.location !== undefined) job.location = updateJobDto.location;
    if (updateJobDto.experienceLevel !== undefined) job.experienceLevel = updateJobDto.experienceLevel;

    // Validate milestones if payment type is milestone
    if (job.paymentType === PaymentType.MILESTONE && (!job.milestones || job.milestones.length === 0)) {
      throw new Error('Milestones are required when payment type is milestone');
    }

    const updatedJob = await this.jobsRepository.save(job);

    return this.mapToResponseDto(updatedJob);
  }

  async updateStatus(id: string, userId: string, updateStatusDto: UpdateJobStatusDto): Promise<JobResponseDto> {
    const job = await this.jobsRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    if (job.userId !== userId) {
      throw new ForbiddenException('You can only update your own jobs');
    }

    job.isActive = updateStatusDto.isActive;
    const updatedJob = await this.jobsRepository.save(job);

    return this.mapToResponseDto(updatedJob);
  }
  async saveDraft(userId: string, draftId: string | undefined, saveDraftDto: SaveDraftDto): Promise<JobResponseDto> {
    let job: Job;

    if (draftId) {
      // Update existing draft
      const existingDraft = await this.jobsRepository.findOne({
        where: { id: draftId, userId, isDraft: true, deletedAt: IsNull() },
      });

      if (!existingDraft) {
        throw new NotFoundException(`Draft with ID ${draftId} not found`);
      }

      job = existingDraft;
    } else {
      // Create new draft
      job = this.jobsRepository.create({
        userId,
        isDraft: true,
        isActive: false,
      });
    }

    // Update draft fields (all optional)
    if (saveDraftDto.jobTitle !== undefined) job.title = saveDraftDto.jobTitle;
    if (saveDraftDto.jobDescription !== undefined) job.description = saveDraftDto.jobDescription;
    if (saveDraftDto.category !== undefined) job.category = saveDraftDto.category;
    if (saveDraftDto.skills !== undefined) job.skills = saveDraftDto.skills;
    if (saveDraftDto.languages !== undefined) job.languages = saveDraftDto.languages;
    if (saveDraftDto.startDate !== undefined) job.startDate = new Date(saveDraftDto.startDate);
    if (saveDraftDto.endDate !== undefined) job.endDate = new Date(saveDraftDto.endDate);
    if (saveDraftDto.location !== undefined) job.location = saveDraftDto.location;
    if (saveDraftDto.freelancersCount !== undefined) job.freelancersCount = saveDraftDto.freelancersCount;

    // Handle payment fields
    if (saveDraftDto.payment) {
      if (saveDraftDto.payment.fromAmount !== undefined) job.payRangeMin = saveDraftDto.payment.fromAmount;
      if (saveDraftDto.payment.toAmount !== undefined) job.payRangeMax = saveDraftDto.payment.toAmount;
      if (saveDraftDto.payment.fromCurrency !== undefined) job.payFromCurrency = saveDraftDto.payment.fromCurrency;
      if (saveDraftDto.payment.toCurrency !== undefined) job.payToCurrency = saveDraftDto.payment.toCurrency;
      if (saveDraftDto.payment.type) {
        job.paymentType = this.mapPaymentType(saveDraftDto.payment.type);
      }
      if (saveDraftDto.payment.milestones !== undefined) {
        if (saveDraftDto.payment.milestones.length > 0 && job.startDate) {
          job.milestones = this.convertMilestones(saveDraftDto.payment.milestones, job.startDate);
        } else {
          job.milestones = saveDraftDto.payment.milestones.map(m => ({
            name: m.name,
            amount: typeof m.amount === 'string' ? parseFloat(m.amount) : m.amount,
            description: m.description,
            duration: m.duration,
            dueDate: m.dueDate,
          }));
        }
      }
    }

    // Handle expertise level
    if (saveDraftDto.expertiseLevel !== undefined) {
      job.experienceLevel = this.mapExpertiseLevel(saveDraftDto.expertiseLevel);
    }

    // Calculate duration if both dates are present
    if (job.startDate && job.endDate) {
      job.duration = this.calculateDuration(job.startDate, job.endDate);
    }

    const savedDraft = await this.jobsRepository.save(job);

    return this.mapToResponseDto(savedDraft);
  }

  /**
   * Get all drafts for a user
   */
  async getDrafts(userId: string, filterDto: FilterDraftDto): Promise<PaginatedResponse<JobResponseDto>> {
    const { page = 1, limit = 20 } = filterDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.jobsRepository
      .createQueryBuilder('job')
      .where('job.deletedAt IS NULL')
      .andWhere('job.userId = :userId', { userId })
      .andWhere('job.isDraft = :isDraft', { isDraft: true });

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination and ordering
    const drafts = await queryBuilder
      .orderBy('job.updatedAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    const data = drafts.map((draft) => this.mapToResponseDto(draft));

    return createPaginatedResponse(data, total, page, limit);
  }

  // ─── Saved / Bookmarked jobs ──────────────────────────────────────────────

  async bookmarkJob(userId: string, jobId: string): Promise<{ savedJob: SavedJob; job: JobResponseDto }> {
    const job = await this.jobsRepository.findOne({ where: { id: jobId, deletedAt: IsNull() } });
    if (!job) throw new NotFoundException(`Job with ID ${jobId} not found`);

    const existing = await this.savedJobRepository.findOne({ where: { userId, jobId } });
    if (existing) throw new ConflictException('Job already saved');

    const savedJob = await this.savedJobRepository.save(
      this.savedJobRepository.create({ userId, jobId }),
    );

    return { savedJob, job: this.mapToResponseDto(job) };
  }

  async unbookmarkJob(userId: string, jobId: string): Promise<void> {
    const saved = await this.savedJobRepository.findOne({ where: { userId, jobId } });
    if (!saved) throw new NotFoundException('Saved job not found');
    await this.savedJobRepository.remove(saved);
  }

  async getBookmarkedJobs(userId: string, filterDto: FilterJobDto): Promise<PaginatedResponse<JobResponseDto>> {
    const { page = 1, limit = 20 } = filterDto;
    const skip = (page - 1) * limit;

    const [savedRecords, total] = await this.savedJobRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    if (!savedRecords.length) return createPaginatedResponse([], 0, page, limit);

    const jobIds = savedRecords.map((s) => s.jobId);
    const jobs = await this.jobsRepository.find({
      where: { id: In(jobIds), deletedAt: IsNull() },
    });
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    // Preserve saved order and skip orphaned jobIds (deleted jobs)
    const data = savedRecords
      .filter((s) => jobMap.has(s.jobId))
      .map((s) => this.mapToResponseDto(jobMap.get(s.jobId)!));

    return createPaginatedResponse(data, total, page, limit);
  }

  /**
   * Map entity to response DTO
   */
  private mapToResponseDto(job: Job): JobResponseDto {
    return {
      id: job.id,
      userId: job.userId,
      title: job.title,
      description: job.description,
      category: job.category,
      startDate: job.startDate,
      endDate: job.endDate,
      duration: job.duration,
      languages: job.languages,
      payRangeMin: Number(job.payRangeMin),
      payRangeMax: Number(job.payRangeMax),
      payFromCurrency: job.payFromCurrency ?? undefined,
      payToCurrency: job.payToCurrency ?? undefined,
      paymentType: job.paymentType,
      milestones: job.milestones,
      location: job.location,
      experienceLevel: job.experienceLevel,
      isActive: job.isActive,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
