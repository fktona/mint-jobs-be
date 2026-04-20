import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumerService } from '@mintjobs/messaging';
import { RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { JobsService } from '../jobs.service';

@Injectable()
export class JobsMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(JobsMessageHandler.name);

  constructor(
    private consumerService: ConsumerService,
    private requestResponseService: RequestResponseService,
    private jobsService: JobsService,
  ) {}

  async onModuleInit() {
    // Subscribe to job request queue FIRST (like user service)
    await this.consumerService.subscribe(QueueName.JOB_QUEUE, [
      MessagePattern.JOB_GET_ALL,
      MessagePattern.JOB_GET_ONE,
      MessagePattern.JOB_CREATE,
      MessagePattern.JOB_GET_MY_JOBS,
      MessagePattern.JOB_UPDATE,
      MessagePattern.JOB_UPDATE_STATUS,
      MessagePattern.JOB_SAVE_DRAFT,
      MessagePattern.JOB_GET_DRAFTS,
      MessagePattern.JOB_BOOKMARK,
      MessagePattern.JOB_UNBOOKMARK,
      MessagePattern.JOB_GET_BOOKMARKS,
      MessagePattern.JOB_SET_ACTIVE,
      MessagePattern.JOB_COMPLETED,
      MessagePattern.JOB_GET_CLIENT_STATS,
    ]);

    // Register handlers AFTER subscribing (like user service)
    this.consumerService.registerHandler(
      MessagePattern.JOB_GET_ALL,
      this.handleGetAll.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.JOB_GET_ONE,
      this.handleGetOne.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.JOB_CREATE,
      this.handleCreate.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.JOB_GET_MY_JOBS,
      this.handleGetMyJobs.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.JOB_UPDATE,
      this.handleUpdate.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.JOB_UPDATE_STATUS,
      this.handleUpdateStatus.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.JOB_SAVE_DRAFT,
      this.handleSaveDraft.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.JOB_GET_DRAFTS,
      this.handleGetDrafts.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.JOB_BOOKMARK,
      this.handleBookmark.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.JOB_UNBOOKMARK,
      this.handleUnbookmark.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.JOB_GET_BOOKMARKS,
      this.handleGetBookmarks.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.JOB_SET_ACTIVE,
      this.handleSetActive.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.JOB_COMPLETED,
      this.handleJobCompleted.bind(this),
    );

    this.consumerService.registerHandler(
      MessagePattern.JOB_GET_CLIENT_STATS,
      this.handleGetClientStats.bind(this),
    );

    this.logger.log('Job message handlers registered');
  }

  private async handleGetAll(event: any) {
    try {
      const requestMessage = event.data as any;
      const requestId = event.requestId;
      const filters = requestMessage;

      const jobs = await this.jobsService.findAll(filters);

      await this.requestResponseService.respond(
        requestId,
        MessagePattern.JOB_GET_ALL_RESPONSE,
        jobs,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get all jobs', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_GET_ALL_RESPONSE,
        null,
        false,
        {
          message: error.message || 'Failed to get jobs',
          statusCode: error.statusCode || 500,
        },
      );
    }
  }

  private async handleGetOne(event: any) {
    try {
      const requestMessage = event.data as any;
      const requestId = event.requestId;
      const { id } = requestMessage;

      const job = await this.jobsService.findOne(id);

      await this.requestResponseService.respond(
        requestId,
        MessagePattern.JOB_GET_ONE_RESPONSE,
        job,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get one job', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_GET_ONE_RESPONSE,
        null,
        false,
        {
          message: error.message || 'Failed to get job',
          statusCode: error.statusCode || 500,
        },
      );
    }
  }

  private async handleCreate(event: any) {
    try {
      const requestMessage = event.data as any;
      const requestId = event.requestId;
      const { userId, ...createJobDto } = requestMessage;

      const job = await this.jobsService.create(userId, createJobDto);

      await this.requestResponseService.respond(
        requestId,
        MessagePattern.JOB_CREATE_RESPONSE,
        job,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling create job', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_CREATE_RESPONSE,
        null,
        false,
        {
          message: error.message || 'Failed to create job',
          statusCode: error.statusCode || 500,
        },
      );
    }
  }

  private async handleGetMyJobs(event: any) {
    try {
      const requestMessage = event.data as any;
      const requestId = event.requestId;
      const { userId, ...filters } = requestMessage;

      const jobs = await this.jobsService.findMyJobs(userId, filters);

      await this.requestResponseService.respond(
        requestId,
        MessagePattern.JOB_GET_MY_JOBS_RESPONSE,
        jobs,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get my jobs', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_GET_MY_JOBS_RESPONSE,
        null,
        false,
        {
          message: error.message || 'Failed to get my jobs',
          statusCode: error.statusCode || 500,
        },
      );
    }
  }

  private async handleUpdate(event: any) {
    try {
      const requestMessage = event.data as any;
      const requestId = event.requestId;
      const { id, userId, ...updateJobDto } = requestMessage;

      const job = await this.jobsService.update(id, userId, updateJobDto);

      await this.requestResponseService.respond(
        requestId,
        MessagePattern.JOB_UPDATE_RESPONSE,
        job,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling update job', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_UPDATE_RESPONSE,
        null,
        false,
        {
          message: error.message || 'Failed to update job',
          statusCode: error.statusCode || 500,
        },
      );
    }
  }

  private async handleUpdateStatus(event: any) {
    try {
      const requestMessage = event.data as any;
      const requestId = event.requestId;
      const { id, userId, isActive } = requestMessage;

      const job = await this.jobsService.updateStatus(id, userId, { isActive });

      await this.requestResponseService.respond(
        requestId,
        MessagePattern.JOB_UPDATE_STATUS_RESPONSE,
        job,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling update job status', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_UPDATE_STATUS_RESPONSE,
        null,
        false,
        {
          message: error.message || 'Failed to update job status',
          statusCode: error.statusCode || 500,
        },
      );
    }
  }

  private async handleSaveDraft(event: any) {
    try {
      const requestMessage = event.data as any;
      const requestId = event.requestId;
      const { userId, draftId, ...saveDraftDto } = requestMessage;

      const draft = await this.jobsService.saveDraft(userId, draftId, saveDraftDto);

      await this.requestResponseService.respond(
        requestId,
        MessagePattern.JOB_SAVE_DRAFT_RESPONSE,
        draft,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling save draft', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_SAVE_DRAFT_RESPONSE,
        null,
        false,
        {
          message: error.message || 'Failed to save draft',
          statusCode: error.statusCode || 500,
        },
      );
    }
  }

  private async handleGetDrafts(event: any) {
    try {
      const requestMessage = event.data as any;
      const requestId = event.requestId;
      const { userId, ...filters } = requestMessage;

      const drafts = await this.jobsService.getDrafts(userId, filters);

      await this.requestResponseService.respond(
        requestId,
        MessagePattern.JOB_GET_DRAFTS_RESPONSE,
        drafts,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get drafts', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_GET_DRAFTS_RESPONSE,
        null,
        false,
        {
          message: error.message || 'Failed to get drafts',
          statusCode: error.statusCode || 500,
        },
      );
    }
  }

  private async handleBookmark(event: any) {
    try {
      const { userId, jobId } = event.data as any;
      const result = await this.jobsService.bookmarkJob(userId, jobId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_BOOKMARK_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling bookmark job', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_BOOKMARK_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to save job', statusCode: error.status || 500 },
      );
    }
  }

  private async handleUnbookmark(event: any) {
    try {
      const { userId, jobId } = event.data as any;
      await this.jobsService.unbookmarkJob(userId, jobId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_UNBOOKMARK_RESPONSE,
        { success: true },
        true,
      );
    } catch (error) {
      this.logger.error('Error handling unbookmark job', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_UNBOOKMARK_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to unsave job', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGetBookmarks(event: any) {
    try {
      const { userId, ...filters } = event.data as any;
      const result = await this.jobsService.getBookmarkedJobs(userId, filters);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_GET_BOOKMARKS_RESPONSE,
        result,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get bookmarks', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_GET_BOOKMARKS_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get saved jobs', statusCode: error.status || 500 },
      );
    }
  }

  private async handleGetClientStats(event: any) {
    try {
      const { userId } = event.data as any;
      const stats = await this.jobsService.getClientStats(userId);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_GET_CLIENT_STATS_RESPONSE,
        stats,
        true,
      );
    } catch (error) {
      this.logger.error('Error handling get client stats', error);
      await this.requestResponseService.respond(
        event.requestId,
        MessagePattern.JOB_GET_CLIENT_STATS_RESPONSE,
        null,
        false,
        { message: error.message || 'Failed to get client stats', statusCode: error.status || 500 },
      );
    }
  }

  /** Fire-and-forget: escrow released → deactivate job, mark as completed */
  private async handleJobCompleted(event: any): Promise<void> {
    const { jobId } = event.data as any;
    if (!jobId) {
      this.logger.warn('JOB_COMPLETED missing jobId', event.data);
      return;
    }
    try {
      await this.jobsService.setActive(jobId, false);
      this.logger.log(`Job ${jobId} deactivated after completion`);
    } catch (err) {
      this.logger.error(`Failed to deactivate job ${jobId} on completion`, err);
    }
  }

  /** Fire-and-forget: escrow funded → activate job; escrow refunded → deactivate job */
  private async handleSetActive(event: any): Promise<void> {
    const { jobId, isActive } = event.data as any;
    if (!jobId || typeof isActive !== 'boolean') {
      this.logger.warn('JOB_SET_ACTIVE missing jobId or isActive', event.data);
      return;
    }
    try {
      await this.jobsService.setActive(jobId, isActive);
      this.logger.log(`Job ${jobId} isActive set to ${isActive}`);
    } catch (err) {
      this.logger.error(`Failed to set job ${jobId} active=${isActive}`, err);
    }
  }
}
