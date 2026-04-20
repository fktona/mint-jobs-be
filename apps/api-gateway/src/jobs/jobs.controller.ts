import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RequestResponseService } from '@mintjobs/messaging';
import { MessagePattern, QueueName } from '@mintjobs/constants';
import { ResponseUtil } from '@mintjobs/utils';
import { PrivyGuard, PrivyUser } from '@mintjobs/privy';
import {
  CreateJobDto,
  UpdateJobDto,
  UpdateJobStatusDto,
  FilterJobDto,
  SaveDraftDto,
  FilterDraftDto,
} from './dto/job.dto';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly requestResponseService: RequestResponseService,
  ) {}

  @Post()
  @UseGuards(PrivyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create a new job',
    description: 'Creates a new job posting. Initial status will be active: false',
  })
  async createJob(
    @PrivyUser('privyId') privyId: string,
    @Body() createJobDto: CreateJobDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.JOB_CREATE,
      {
        userId: privyId,
        ...createJobDto,
      },
      MessagePattern.JOB_CREATE_RESPONSE,
      QueueName.JOB_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Job created successfully');
  }

  @Get('category')
  @ApiOperation({
    summary: 'Get all job categories',
    description: 'Returns a list of all available job categories',
  })
  async getJobCategories(@Req() request: Request) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.JOB_GET_ALL,
      {},
      MessagePattern.JOB_GET_ALL_RESPONSE,
      QueueName.JOB_QUEUE,
      correlationId,
    );
    // Extract unique categories from jobs
    const response = data as any;
    const categories = Array.from(
      new Set(
        (response?.data || []).map((job: any) => job.category).filter(Boolean),
      ),
    );
    return ResponseUtil.success(categories, 'Job categories retrieved successfully');
  }

  @Get('category/:id')
  @ApiOperation({
    summary: 'Get a single job category by ID',
    description: 'Returns details of a specific job category',
  })
  @ApiParam({ name: 'id', description: 'Category name' })
  async getOneJobCategory(@Param('id') id: string, @Req() request: Request) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.JOB_GET_ALL,
      { category: id },
      MessagePattern.JOB_GET_ALL_RESPONSE,
      QueueName.JOB_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Job category retrieved successfully');
  }

  @Get()
  @ApiOperation({
    summary: 'Get all jobs (public)',
    description: 'Returns a paginated list of all jobs with optional filters',
  })
  async getAllJobs(@Query() filterDto: FilterJobDto, @Req() request: Request) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.JOB_GET_ALL,
      filterDto,
      MessagePattern.JOB_GET_ALL_RESPONSE,
      QueueName.JOB_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Jobs retrieved successfully');
  }

  @Get('me/stats')
  @UseGuards(PrivyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get client dashboard stats',
    description: 'Returns total jobs, active jobs, completed jobs, draft count, pending proposals, and total proposals for the authenticated client.',
  })
  async getClientStats(
    @PrivyUser('privyId') privyId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.JOB_GET_CLIENT_STATS,
      { userId: privyId },
      MessagePattern.JOB_GET_CLIENT_STATS_RESPONSE,
      QueueName.JOB_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Client stats retrieved successfully');
  }

  @Get('me')
  @UseGuards(PrivyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get my jobs',
    description: 'Returns a paginated list of jobs created by the authenticated user',
  })
  async getMyJobs(
    @PrivyUser('privyId') privyId: string,
    @Query() filterDto: FilterJobDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.JOB_GET_MY_JOBS,
      {
        userId: privyId,
        ...filterDto,
      },
      MessagePattern.JOB_GET_MY_JOBS_RESPONSE,
      QueueName.JOB_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'My jobs retrieved successfully');
  }

  /** Must be before @Get(':id') or paths like /jobs/draft are parsed as UUID job IDs. */
  @Get(['draft', 'drafts'])
  @UseGuards(PrivyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get my drafts',
    description:
      'Returns a paginated list of draft jobs created by the authenticated user. Use /jobs/drafts or /jobs/draft.',
  })
  async getDrafts(
    @PrivyUser('privyId') privyId: string,
    @Query() filterDto: FilterDraftDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.JOB_GET_DRAFTS,
      {
        userId: privyId,
        ...filterDto,
      },
      MessagePattern.JOB_GET_DRAFTS_RESPONSE,
      QueueName.JOB_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Drafts retrieved successfully');
  }

  /** Must be before @Get(':id') or /jobs/saved is parsed as a UUID job ID. */
  @Get('saved')
  @UseGuards(PrivyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get my saved jobs',
    description: 'Returns all jobs bookmarked by the authenticated user, paginated, newest first.',
  })
  async getSavedJobs(
    @PrivyUser('privyId') privyId: string,
    @Query() filterDto: FilterJobDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.JOB_GET_BOOKMARKS,
      { userId: privyId, ...filterDto },
      MessagePattern.JOB_GET_BOOKMARKS_RESPONSE,
      QueueName.JOB_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Saved jobs retrieved successfully');
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single job by ID',
    description: 'Returns details of a specific job',
  })
  @ApiParam({ name: 'id', description: 'Job ID' })
  async getOneJob(@Param('id') id: string, @Req() request: Request) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.JOB_GET_ONE,
      { id },
      MessagePattern.JOB_GET_ONE_RESPONSE,
      QueueName.JOB_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Job retrieved successfully');
  }

  @Patch(':id')
  @UseGuards(PrivyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update my job',
    description: 'Updates a job. Only the job owner can update their own jobs',
  })
  @ApiParam({ name: 'id', description: 'Job ID' })
  async updateJob(
    @Param('id') id: string,
    @PrivyUser('privyId') privyId: string,
    @Body() updateJobDto: UpdateJobDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.JOB_UPDATE,
      {
        id,
        userId: privyId,
        ...updateJobDto,
      },
      MessagePattern.JOB_UPDATE_RESPONSE,
      QueueName.JOB_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Job updated successfully');
  }

  @Patch(':id/status')
  @UseGuards(PrivyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update job status',
    description: 'Updates the active status of a job. Only the job owner can update status',
  })
  @ApiParam({ name: 'id', description: 'Job ID' })
  async updateJobStatus(
    @Param('id') id: string,
    @PrivyUser('privyId') privyId: string,
    @Body() updateStatusDto: UpdateJobStatusDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.JOB_UPDATE_STATUS,
      {
        id,
        userId: privyId,
        isActive: updateStatusDto.isActive,
      },
      MessagePattern.JOB_UPDATE_STATUS_RESPONSE,
      QueueName.JOB_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Job status updated successfully');
  }

  @Post('draft')
  @UseGuards(PrivyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Save job as draft',
    description: 'Saves a job as draft. Creates a new draft if draftId is not provided, otherwise updates existing draft',
  })
  @ApiQuery({ name: 'draftId', required: false, description: 'Draft ID to update (optional)' })
  async saveDraft(
    @Query('draftId') draftId: string | undefined,
    @PrivyUser('privyId') privyId: string,
    @Body() saveDraftDto: SaveDraftDto,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.JOB_SAVE_DRAFT,
      {
        userId: privyId,
        draftId,
        ...saveDraftDto,
      },
      MessagePattern.JOB_SAVE_DRAFT_RESPONSE,
      QueueName.JOB_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Draft saved successfully');
  }

  // ─── Saved / Bookmarked jobs ───────────────────────────────────────────────

  @Post(':id/save')
  @UseGuards(PrivyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Save a job', description: 'Bookmarks a job for the authenticated user.' })
  @ApiParam({ name: 'id', description: 'Job ID' })
  async saveJob(
    @Param('id') jobId: string,
    @PrivyUser('privyId') privyId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    const data = await this.requestResponseService.request(
      MessagePattern.JOB_BOOKMARK,
      { userId: privyId, jobId },
      MessagePattern.JOB_BOOKMARK_RESPONSE,
      QueueName.JOB_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(data, 'Job saved successfully');
  }

  @Delete(':id/save')
  @UseGuards(PrivyGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unsave a job', description: 'Removes a bookmarked job for the authenticated user.' })
  @ApiParam({ name: 'id', description: 'Job ID' })
  async unsaveJob(
    @Param('id') jobId: string,
    @PrivyUser('privyId') privyId: string,
    @Req() request: Request,
  ) {
    const correlationId = (request as any).correlationId;
    await this.requestResponseService.request(
      MessagePattern.JOB_UNBOOKMARK,
      { userId: privyId, jobId },
      MessagePattern.JOB_UNBOOKMARK_RESPONSE,
      QueueName.JOB_QUEUE,
      correlationId,
    );
    return ResponseUtil.success(null, 'Job unsaved successfully');
  }
}
